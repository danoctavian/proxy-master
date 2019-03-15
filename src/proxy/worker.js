const AnyProxy = require('anyproxy')
const socketio = require('socket.io-client')
const express = require('express')
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

    this.publicApp = express()
    this.publicApp.get('/version', utils.wrapAPI(this.version.bind(this)))
  }

  async version(req, res) {
    res.json({'version': utils.getPackageVersion()})
  }

  async run() {
    const config = this.config

    log.info(`WORKER - Running http server at port ${config.PUBLIC_HTTP_PORT}`)
    await new Promise((resolve, reject) => {
      this.publicApp.listen(config.PUBLIC_HTTP_PORT, () => {
        resolve()
      }).on('error', (e) => reject(e))
    })

    log.info(`WORKER - listening on ${config.PORT} for proxy connections..`)
    this.proxyServer.start()
    const proxyServer = this.proxyServer
    await new Promise((resolve, reject) => {
      proxyServer.on('ready', () => resolve())
      proxyServer.on('error', (e) => reject(e))
    })
    proxyServer.on('error', (e) => {
      log.error(`Proxy failed with error ${e}`)
    })

    if (this.config.MASTER_HOST) {
      await this.connectToMaster()
    } else {
      log.warn(`No Master url specified. Running standalone.`)
    }
  }

  async connectToMaster() {
    const socketIOMasterAddress = `http://${this.config.MASTER_HOST}:${this.config.MASTER_PORT}`
    log.info(`WORKER - Connecting with socket.io to master at ${socketIOMasterAddress}`)

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

      log.info('WORKER - Successfully connected. Notifying of proxy HOST')
      socket.send({host: this.config.PUBLIC_HOST})

      const disconnect = await new Promise((resolve, reject) => {
        socket.on('disconnect', () => {
          resolve()
        })
      })

      log.info(`WORKER - Disconnect happened. Attempting reconnect.`)
    }

  }
}

module.exports = ProxyWorker