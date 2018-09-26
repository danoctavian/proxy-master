const AnyProxy = require('anyproxy')
const http = require('http')
const socketio = require('socket.io-client')
const log = require('../logging')
const utils = require('../utils')

const RECONNECT_RETRY_TIME = 3000

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

    await this.connectToMaster()
  }

  async connectToMaster() {
    const socketIOMasterAddress = `http://${this.config.MASTER_HOST}:${this.config.MASTER_PORT}`
    log.info(`Connecting with socket.io to master at ${socketIOMasterAddress}`)

    this.socket = socketio(socketIOMasterAddress)
    const socket = this.socket

    while (true) {
      await new Promise((resolve, reject) => {
        socket.on('connect', () => {
          resolve()
        })
        socket.on('error', (e) => {
          reject(e)
        })
      })

      log.info('Successfully connected. Notifying of proxy HOST')
      socket.send({host: this.config.PUBLIC_HOST})

      const disconnect = await new Promise((resolve, reject) => {
        socket.on('disconnect', () => {
          resolve()
        })
      })

      log.info(`Disconnect happened. Attempting reconnect.`)
    }

  }
}

module.exports = ProxyWorker