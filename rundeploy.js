const deploy = require('./src/scalewaydeploy')
const log = require('./src/logging')

;(async () => {
  await deploy({master: {}, sshKey: '/Users/dan/.ssh/id_rsa'})
})().catch(e => {
  log.error(`Deploy error: ${e.stack}`)
})