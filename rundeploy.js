const ScalewayDeployer = require('./src/scalewaydeploy')
const log = require('./src/logging')

;(async () => {
  const deployer = new ScalewayDeployer()
  await deployer.deploy({
    master: {},
    sshKey: '/Users/dan/.ssh/id_rsa',
    worker: {
      desiredCount: 9
    },
    updateConstraints: {
      version: '<= 1.1.0',
      newerThan: new Date('2018-10-15T21:00:05.952426+00:00')
    }
  })
})().catch(e => {
  log.error(`Deploy error: ${e.stack}`)
  process.exit(1)
})