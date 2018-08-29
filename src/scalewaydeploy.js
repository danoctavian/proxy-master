const axios = require('axios')
const fs = require('fs')
SSHClient = require('node-ssh')
const log = require('./logging')

const PROXY_MASTER_NAME = 'proxy-master'
const PROXY_WORKER_NAME = 'proxy-worker'
const UBUNTU_XENIAL_IMAGE = '67375eb1-f14d-4f02-bb42-6119cecbde51'

const setupScript = `
sudo apt-get -y install git curl python-software-properties ;
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash - ;
sudo apt-get -y install nodejs ;
rm -rf proxy-master ;
git clone https://github.com/danoctavian/proxy-master.git ;
cd proxy-master ;
`

const BASE_URL = 'https://cp-par1.scaleway.com'

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

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

  const serverRes = await axios.get(`${BASE_URL}/servers`, conf)
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

      let newServerRes = await axios.post(`${BASE_URL}/servers`, serverConf, conf)
      let newServer = newServerRes.data



      const powerOnRes = await axios.post(`${BASE_URL}/servers/${newServer.server.id}/action`, { action: 'poweron' }, conf)

      log.info(`Triggered power on for ${newServer.server.id}. polling..`)

      while (newServer.server.state !== 'running') {
        await sleep(1000)
        newServerRes = await axios.get(`${BASE_URL}/servers/${newServer.server.id}`, conf)
        newServer = newServerRes.data
      }

      log.info(`Server ${newServer.server.id} operational at public IP ${newServer.server.public_ip.address}. waiting for a bit..`)

      await sleep(3000)
      masterServer = newServer.server
    } else {
      masterServer = masterServers[0]
    }

    const ssh = new SSHClient()
    await ssh.connect({
      host: masterServer.public_ip.address,
      username: 'root',
      privateKey: config.sshKey
    })

    log.info(`SSH conn to ${masterServer.public_ip.address} ready. deploying setup script and then running it.`)
    await ssh.putFiles([{ local: './setup.sh', remote: '/root/setup.sh'}])

    const result = await ssh.exec('bash ./setup.sh')
    console.log(result)
  }
}

module.exports = deploy