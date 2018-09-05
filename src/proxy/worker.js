const AnyProxy = require('anyproxy')
const http = require('http')
const socketio = require('socket.io-client')
const log = require('../logging')

class ProxyWorker {

  constructor(config) {
    this.config = config
    this.options = {
      port: config.PORT,
      webInterface: {
        enable: true,
        webPort: 8002
      },
      throttle: 10000,
      forceProxyHttps: false,
      wsIntercept: false,
      silent: false
    }
    this.proxyServer = new AnyProxy.ProxyServer(this.options)
  }

  async run() {
    const config = this.config
    log.info(`listening on ${config.PORT} for proxy connections..`)
    this.proxyServer.start()
    const proxyServer = this.proxyServer
    await new Promise((resolve, reject) => {
      proxyServer.on('ready', () => resolve())
      proxyServer.on('error', (e) => reject(e))
    })
    proxyServer.on('error', (e) => {
      log.error(`Proxy failed with error ${e}`)
    })

    const socketIOMasterAddress = `http://${config.MASTER_HOST}:${config.MASTER_PORT}`
    log.info(`Connecting with socket.io to master at ${socketIOMasterAddress}`)

    this.socket = socketio(socketIOMasterAddress)
    const socket = this.socket

    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        resolve()
      })
      socket.on('error', () => {
        reject()
      })
    })

    log.info('Successfully connected. Notifying of proxy HOST')
    socket.send({host: config.PUBLIC_HOST})
  }
}

module.exports = ProxyWorker