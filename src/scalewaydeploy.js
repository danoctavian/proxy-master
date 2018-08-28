const axios = require('axios')
const fs = require('fs')
node_ssh = require('node-ssh')
const log = require('./logging')

const PROXY_MASTER_NAME = 'proxy-master'
const PROXY_WORKER_NAME = 'proxy-worker'
const UBUNTU_XENIAL_IMAGE = '67375eb1-f14d-4f02-bb42-6119cecbde51'

const setupScript = `
sudo apt-get install git curl python-software-properties ;
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash - ;
sudo apt-get install nodejs ;
rm -rf proxy-master ;
git clone https://github.com/danoctavian/proxy-master.git ;
cd proxy-master ;
`

async function deploy(config) {

  const configFile = await fs.readFileSync('scalewayconf.json')
  const authconfig = JSON.parse(configFile)

  const conf = {
    headers: {
      'X-Auth-Token': authconfig.secretKey,
      'Content-Type': 'application/json'
    }
  }

  const orgsRes = await axios.get('https://account.scaleway.com/organizations', conf)
  const orgs = orgsRes.data.organizations
  log.info(`Using org with id ${orgs[0].id}`)

  const serverRes = await axios.get('https://cp-par1.scaleway.com/servers', conf)
  const servers = serverRes.data.servers

  const masterServers = servers.filter(s => s.name.startsWith(PROXY_MASTER_NAME))
  const workerServers = servers.filter(s => s.name.startsWith(PROXY_WORKER_NAME))

  log.info(`Currently there are ${masterServers.length} master servers and ${workerServers.length} worker servers running.`)

  if (masterServers.length > 1) {
    throw new Error('Too many masters. Only 1 is required.')
  }

  if (config.master) {
    log.info('Redeploying master.')

    let masterServer = null
    if (masterServers.length === 0) {
      const randomName = `${PROXY_MASTER_NAME}-${Math.random().toString(36).substring(2)}`
      log.info(`No master machine present. Spawning master VPS first with name ${randomName}`)
      const serverConf = {
        "organization": orgs[0].id,
        "name": randomName,
        "image": UBUNTU_XENIAL_IMAGE,
        "commercial_type": "START1-XS",
        "tags": [
          PROXY_MASTER_NAME
        ],
        "enable_ipv6": false,
        "boot_type": "local"
      }

      const newServer = await axios.post('https://cp-par1.scaleway.com/servers', serverConf, conf)
      masterServer = newServer
    } else {
      masterServer = masterServers[0]
    }

    const ssh = new node_ssh()
    await ssh.connect({
      host: masterServer.public_ip.address,
      username: 'root',
      privateKey: config.sshKey
    })

    log.info(`SSH conn to ${masterServer.public_ip.address} ready.`)
    const result = await ssh.exec(setupScript)
    console.log(result)
  }
}

module.exports = deploy