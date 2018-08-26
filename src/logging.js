const winston = require('winston')

const logger = winston.createLogger({
  format: winston.format.combine(winston.format.simple(), winston.format.timestamp()),
  transports: [
    new winston.transports.File({
      filename: `${__dirname}/app.log`,
      handleExceptions: true
    })
  ],
  exitOnError: false
})

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(winston.format.simple(), winston.format.timestamp()),
    level: 'debug',
    handleExceptions: true
  }))
} else {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(winston.format.simple(), winston.format.timestamp()),
    level: 'info',
    handleExceptions: true
  }))
}

module.exports = logger