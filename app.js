const Master = require('./src/proxy/master')
const ProxyWorker = require('./src/proxy/worker')
const log = require('./src/logging')


const MASTER_PORT = 3000

;(async () => {
  const cmd = process.argv[2]

  if (cmd === 'master') {
    log.info('Starting up master node.')

    const config = {
      PRIVATE_HOST: process.argv[3],
      PUBLIC_PORT: 2000,
      PRIVATE_PORT: MASTER_PORT
    }
    const proxyMaster = new Master(config)

    await proxyMaster.run()
  } else if (cmd === 'proxy') {
    log.info('Starting up proxy node.')

    const config = {
      PUBLIC_HOST: process.argv[3],
      PORT: process.argv[4],
      MASTER_HOST: process.argv[5],
      MASTER_PORT: MASTER_PORT
    }

    const proxyWorker = new ProxyWorker(config)

    await proxyWorker.run()
  } else {
    log.error(`Unknown command ${cmd}. Exiting.`)
    process.exit(1)
  }
})().catch(e => {
  log.error(`Fatal Process error: ${e.stack}. Exiting`)
  process.exit(1)
})