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
    versionConstraint: '>= 1.0.0'
  })
})().catch(e => {
  log.error(`Deploy error: ${e.stack}`)
  process.exit(1)
})