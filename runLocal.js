const ProxyMaster = require('./src/proxy/master')
const ProxyWorker = require('./src/proxy/worker')
const log = require('./src/logging')

const MASTER_PORT = 3000
const PUBLIC_HTTP_PORT = 2000
const MASTER_HOST = 'localhost'

const WORKER_PORT = 4000

;(async () => {
  let config = {
    PRIVATE_HOST: process.argv[3],
    PUBLIC_PORT: PUBLIC_HTTP_PORT,
    PRIVATE_PORT: MASTER_PORT
  }
  const proxyMaster = new ProxyMaster(config)

  ;(async () => {
    try {
      await proxyMaster.run()
    } catch (e) {
      log.error(`FATAL: Proxy master failed with ${e.stack}`)
      process.exit(1)
    }
  })()

  log.info('Starting up proxy node.')

  config = {
    PUBLIC_HOST: 'localhost',
    PORT: WORKER_PORT,
    MASTER_HOST: MASTER_HOST,
    MASTER_PORT: MASTER_PORT
  }

  const proxyWorker = new ProxyWorker(config)

  await proxyWorker.run()

})().catch(e => {
  log.error(`FATAL: Run local error: ${e.stack}`)
  process.exit(1)
})