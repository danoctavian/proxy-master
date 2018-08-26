const httpProxy = require('http-proxy')
const http = require('http')
const socketio = require('socket.io-client')
const log = require('../logging')

class ProxyWorker {

  constructor(config) {
    this.config = config
    this.proxy = httpProxy.createProxyServer({})
    const proxy = this.proxy
    this.httpServer = http.createServer(function(req, res) {
      proxy.web(req, res, { target: req.url })
    })
  }

  async run() {
    const config = this.config
    log.info(`listening on ${config.PORT} for proxy connections..`)
    await new Promise((resolve, reject) => {
      this.httpServer
        .listen(config.PORT, () => resolve())
        .on('error', (e) => reject(e))
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