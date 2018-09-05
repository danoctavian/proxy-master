const axios = require('axios')
const fs = require('fs')
SSHClient = require('node-ssh')
const log = require('./logging')

const PROXY_MASTER_NAME = 'proxy-master'
const PROXY_WORKER_NAME = 'proxy-worker'
const UBUNTU_XENIAL_IMAGE = '67375eb1-f14d-4f02-bb42-6119cecbde51'

const setupScript = `
sudo apt-get -y install git ;
sudo apt-get -y curl ;
sudo apt-get -y python-software-properties ;
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash - ;
sudo apt-get -y install nodejs ;
rm -rf proxy-master ;
git clone https://github.com/danoctavian/proxy-master.git ;
cd proxy-master ;
npm install
`

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

    if (config.master) {
      await this.deployMaster(masterServers)
    }

    if (config.worker) {
      await this.deployWorkers(workerServers, config.worker)
    }
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

    // const ssh = new SSHClient()
    // await ssh.connect({
    //   host: masterServer.public_ip.address,
    //   username: 'root',
    //   privateKey: config.sshKey
    // })
    //
    // log.info(`SSH conn to ${masterServer.public_ip.address} ready. deploying setup script and then running it.`)
    // await ssh.putFiles([{ local: './setup.sh', remote: '/root/setup.sh'}])
    //
    // const result = await ssh.exec('bash ./setup.sh')
    // console.log(result)
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
        log.error('There are more alive workers than desiredCount. Kill some manually.')
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
      newServerRes = await axios.get(`${BASE_URL}/servers/${newServer.server.id}`, this.conf)
      newServer = newServerRes.data
    }

    log.info(`Server ${newServer.server.id} operational at public IP ${newServer.server.public_ip.address}. waiting for a bit..`)

    await sleep(3000)

    return newServer
  }
}




module.exports = ScalewayDeployer