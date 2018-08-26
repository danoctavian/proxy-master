const Master = require('./src/proxy/master')
const ProxyWorker = require('./src/proxy/worker')
const log = require('./src/logging')

;(async () => {
  const cmd = process.argv[2]

  if (cmd === 'master') {
    log.info('Starting up master node.')

    const config = {
      PUBLIC_IP: process.argv[3],
      PRIVATE_IP: process.argv[4],
      PUBLIC_PORT: 2000,
      PRIVATE_PORT: 3000
    }
    const proxyMaster = new Master(config)

    await proxyMaster.run()
  } else if (cmd === 'proxy') {
    log.info('Starting up proxy node.')

    const config = {
      PORT: process.argv[3]
    }

    const proxyWorker = new ProxyWorker(config)
    
    await proxyWorker.run()
  } else {
    log.error(`Unknown command ${cmd}. Exiting.`)
    process.exit(1)
  }
})().catch(e => {
  log.error(`Process error: ${e.stack}`)
})