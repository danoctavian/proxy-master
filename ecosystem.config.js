module.exports = {
  apps : [{
    name      : 'proxy',
    script    : 'app.js',
    watch: true,
    // eg. 'master 1.2.3.4' for a master, where 1.2.3.4 is the private network IP
    // eg. 'proxy 2.3.4.5 4000 1.2.3.4' where 2.3.4.5 is the public IP of the proxy, 1.2.3.4 is the one above
    args: ''
  }]

};