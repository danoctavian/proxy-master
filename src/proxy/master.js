const socketio = require('socket.io')
const express = require('express')
const utils = require('../utils')
const log = require('../logging')
const http = require('http')

class ProxySlave {

}

class ProxyMaster {
  constructor(config) {
    this.config = config
    this.publicApp = express()
    this.proxies = []
    this.publicApp.get('/proxies', utils.wrapAPI(this.getProxies.bind(this)))

    this.proxiesServer = http.createServer()
    this.proxiesApp = socketio(this.proxiesServer)
    this.proxiesApp.on('connection', this.handleProxyConn.bind(this))
  }

  async getProxies(req, res) {
    log.info(`Fetching request proxies. Currently available ${this.proxies}`)
    res.json(this.proxies)
  }

  async handleProxyConn(client) {
    log.info(`Received proxy connection from ${client}`)
  }

  async run() {
    await new Promise((resolve, reject) => {
      this.publicApp.listen(config.PUBLIC_PORT, config.PUBLIC_IP, () => {
        resolve()
      }).on('error', (e) => reject(e))
    })

    await new Promise((resolve, reject) => {
      this.proxiesServer.listen(config.PRIVATE_PORT, config.PRIVATE_IP, (err) => {
        resolve()
      }).on('error', (e) => reject(e))
    })

    await new Promise((resolve, reject) => {
      this.proxiesServer.listen(config.PRIVATE_PORT, config.PRIVATE_IP, (err) => {
        resolve()
      }).on('error', (e) => reject(e))
    })
  }
}

module.exports = ProxyMaster