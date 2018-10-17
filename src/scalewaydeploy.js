const axios = require('axios')
const fs = require('fs')
const SSHClient = require('node-ssh')
const log = require('./logging')
const semver = require('semver')

const PROXY_MASTER_NAME = 'proxy-master'
const PROXY_WORKER_NAME = 'proxy-worker'
const UBUNTU_XENIAL_IMAGE = '67375eb1-f14d-4f02-bb42-6119cecbde51'

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

const BASE_URL = 'https://cp-par1.scaleway.com'

class ScalewayDeployer {
  constructor() {

  }

  async deploy(config) {
    this.config = config
    const configFile = await fs.readFileSync('scalewayconf.json')
    const authconfig = JSON.parse(configFile)

    this.conf = {
      headers: {
        'X-Auth-Token': authconfig.secretKey,
        'Content-Type': 'application/json'
      }
    }
    const requestConf = this.conf

    const orgsRes = await axios.get('https://account.scaleway.com/organizations', requestConf)
    const orgs = orgsRes.data.organizations
    this.orgs = orgs
    log.info(`Using org with id ${orgs[0].id}`)

    const serverRes = await axios.get(`${BASE_URL}/servers`, requestConf)
    const servers = serverRes.data.servers

    const masterServers = servers.filter(s => s.name.startsWith(PROXY_MASTER_NAME))
    const workerServers = servers.filter(s => s.name.startsWith(PROXY_WORKER_NAME))

    log.info(`Currently there are ${masterServers.length} master servers and ${workerServers.length} worker servers running.`)

    if (masterServers.length > 1) {
      throw new Error('Too many masters. Only 1 is required.')
    }

    let masterServer = null

    if (config.master) {
      masterServer = await this.deployMaster(masterServers)
      await this.updateServers(masterServers, (id) => `echo ${id}`, config.updateConstraints)
    }

    if (config.worker) {
      await this.deployWorkers(workerServers, config.worker)
      await this.updateServers(workerServers,
        (id) => `proxy ${id}.pub.cloud.scaleway.com 4000 ${masterServer.id}.priv.cloud.scaleway.com`,
        config.updateConstraints)
    }
  }

  async updateServers(servers, getServerCommand, updateConstraints) {
    if (!updateConstraints || !updateConstraints.version || !updateConstraints.newerThan) {
      log.info(`No update constraints specified. No software updates will be performed.`)
      return
    }

    log.info(`Checking for necessary updates on ${servers.length} servers with update constraints ${JSON.stringify(updateConstraints)}`)

    const serversToBeUpdated = []
    for (let i = 0; i < servers.length; i++) {
      const server = servers[i]
      const ip = server.public_ip.address
      log.info(`Checking version for server ${servers[0].name} at ip ${ip}`)

      let versionResponse = null
      let skipVersionCheck = false
      try {
        versionResponse = await axios.get(`http://${ip}:2000/version`)
      } catch (e) {
        if (e.message.includes('404') || e.message.includes('ECONNREFUSED')) {
          log.warn(`server ${server.name} does not have endpoint /version. skipping version check.`)
          skipVersionCheck = true
        } else {
          log.error(`Failed to query server ${server.name} with ${e.stack}`)
          continue
        }
      }

      let satisfiesVersion = false
      if (skipVersionCheck) {
        satisfiesVersion = true
      } else {
        const version = versionResponse.data.version
        satisfiesVersion = semver.satisfies(version, updateConstraints.version)
        log.info(`Version for ${servers[0].name} is ${version} and satisfies ${updateConstraints.version} : ${satisfiesVersion}`)
      }

      const satisfiesNewerThan = new Date(server.modification_date) > updateConstraints.newerThan
      log.info(`mod date for ${servers[0].name} is ${server.modification_date} and satisfies ${updateConstraints.newerThan} : ${satisfiesNewerThan}`)

      if (satisfiesVersion && satisfiesNewerThan) {
        serversToBeUpdated.push(server)
      }
    }

    log.info(`Number of servers that need updates: ${serversToBeUpdated.length}. Starting updates concurrently.`)

    await Promise.all(serversToBeUpdated.map(async server =>  {
      try {
        const serverParams = getServerCommand(server.id)
        await this.applySoftwareUpdate(server, serverParams)
      } catch (e) {
        log.error(`Failed to update server ${server.name} ${e}`)
      }
    }))
  }

  async applySoftwareUpdate(server, serverParams) {
    log.info(`SSH ${server.name} - Updating server. Using params: ${serverParams}`)
    const ssh = new SSHClient()
    await ssh.connect({
      host: server.public_ip.address,
      username: 'root',
      privateKey: this.config.sshKey
    })

    log.info(`SSH ${server.name} - SSH conn to ${server.public_ip.address} ready. deploying setup script and then running it.`)
    await ssh.putFiles([{ local: './setup.sh', remote: '/root/setup.sh'}])

    const result = await ssh.exec(`bash ./setup.sh ${serverParams}`)
    log.info(`SSH ${server.name} - ${result}`)
  }

  async deployMaster(masterServers) {
    log.info('Attempting master redeploy.')

    let masterServer = null
    if (masterServers.length === 0) {
      log.info(`No master machine present. Spawning master VPS.`)
      const newServer = await this.setupNewVPS(PROXY_MASTER_NAME)
      masterServer = newServer.server
    } else {
      log.info(`Master already present.`)
      masterServer = masterServers[0]
    }

    return masterServer
  }

  async deployWorkers(workerServers, config) {
    if (!config.desiredCount) {
      log.info('no workers desired count specified. skipping deploy.')
      return
    }
    const extraWorkers = config.desiredCount - workerServers.length

    if (extraWorkers === 0) {
      log.info('No new machines need be created')
    } else if (extraWorkers > 0) {
      log.info(`New machines to be created: ${extraWorkers}`)
      const creationTasks = []
      for (let i = 0; i < extraWorkers; i++) {
        creationTasks.push((async () => {
          try {
            log.info(`Kicking off worker ${i}`)
            await this.setupNewVPS(PROXY_WORKER_NAME)
            log.info(`Finished with worker ${i}`)
          } catch (e) {
            log.error(`Failed launching worker ${i} with ${e.stack}`)
          }
        })())
      }

      await Promise.all(creationTasks)
    } else {
        log.error(`There are more alive workers (${workerServers.length}) than desiredCount (${config.desiredCount}). Kill some manually.`)
    }
  }

  async setupNewVPS(baseName) {
    const randomName = `${baseName}-${Math.random().toString(36).substring(2)}`
    const serverConf = {
      "organization": this.orgs[0].id,
      "name": randomName,
      "image": UBUNTU_XENIAL_IMAGE,
      "commercial_type": "START1-XS",
      "tags": [
        baseName
      ],
      "enable_ipv6": false,
      "boot_type": "local"
    }

    let newServerRes = await axios.post(`${BASE_URL}/servers`, serverConf, this.conf)
    let newServer = newServerRes.data

    const powerOnRes = await axios.post(`${BASE_URL}/servers/${newServer.server.id}/action`, { action: 'poweron' }, this.conf)

    log.info(`Triggered power on for ${newServer.server.id}. polling..`)

    while (newServer.server.state !== 'running') {
      await sleep(1000)
      try {
        newServerRes = await axios.get(`${BASE_URL}/servers/${newServer.server.id}`, this.conf)
        newServer = newServerRes.data
      } catch (e) {
        if (e.message.includes('ETIMEOUT')) {
          log.warn(`Polling ${newServer.server.id} timed out. reinitiating polling..`)
          continue
        } else {
          throw e
        }
      }
    }

    log.info(`Server ${newServer.server.id} operational at public IP ${newServer.server.public_ip.address}. waiting for a bit..`)

    await sleep(3000)

    return newServer
  }
}

module.exports = ScalewayDeployer