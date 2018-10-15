const socketio = require('socket.io')
const express = require('express')
const utils = require('../utils')
const log = require('../logging')
const http = require('http')

class ProxyWorkerConn {
  constructor(host, socketConn) {
    this.host = host
    this.socketConn = socketConn
  }
}

function remove(arr, item) {
  for (let i = arr.length; i--;) {
    if (arr[i] === item) {
      arr.splice(i, 1)
    }
  }
}

class ProxyMaster {
  constructor(config) {
    this.config = config
    this.publicApp = express()
    this.proxies = []
    this.publicApp.get('/proxies', utils.wrapAPI(this.getProxies.bind(this)))
    this.publicApp.get('/version', utils.wrapAPI(this.version.bind(this)))

    this.proxiesServer = http.createServer()
    this.proxiesApp = socketio(this.proxiesServer)
    this.proxiesApp.on('connection', this.handleProxyConn.bind(this))
  }

  async version(req, res) {
    res.json({'version': utils.getPackageVersion()})
  }

  async getProxies(req, res) {
    log.info(`Fetching request proxies. Currently available ${this.proxies}`)
    res.json(this.proxies.map(p => p.host))
  }

  async handleProxyConn(client) {
    log.info(`Received proxy connection from ${client}`)
    const firstMessage = await new Promise((resolve, reject) => {
      client.on('message', (event) => {
        resolve(event)
      })
    })

    log.info(`The first message is assigning host ${firstMessage.host}`)

    const newProxyConn = new ProxyWorkerConn(firstMessage.host, client)
    this.proxies.push(newProxyConn)

    await new Promise((resolve, reject) => {
      client.on('disconnect', () => {
        resolve()
      })
    })

    log.info(`Proxy with host ${firstMessage.host} disconnected. Removing.`)
    remove(this.proxies, newProxyConn)
  }

  async run() {

    const config = this.config
    log.info(`Running http server at port ${config.PUBLIC_PORT}`)
    await new Promise((resolve, reject) => {
      this.publicApp.listen(config.PUBLIC_PORT, () => {
        resolve()
      }).on('error', (e) => reject(e))
    })

    log.info(`Running socket io proxies server at port ${config.PRIVATE_HOST}:${config.PUBLIC_PORT}`)
    await new Promise((resolve, reject) => {
      this.proxiesServer.listen(config.PRIVATE_PORT, config.PRIVATE_HOST, (err) => {
        resolve()
      }).on('error', (e) => reject(e))
    })
  }
}

module.exports = ProxyMaster