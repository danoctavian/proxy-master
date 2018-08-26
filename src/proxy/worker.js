const httpProxy = require('http-proxy')
const http = require('http')

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
    this.httpServer.listen(this.config.PORT)
  }
}

module.exports = ProxyWorker