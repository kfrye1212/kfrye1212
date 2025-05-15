/**
 * Logger utility for the multi-chain trading bot
 * Provides consistent logging across all components
 */

const winston = require('winston');
const config = require('../core/config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${
      Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
    }`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.get('monitoring.logLevel', 'info'),
  format: logFormat,
  transports: [
    // Console transport for development
    new winston.transports.Console(),
    // File transport for persistent logs
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error',
      dirname: 'logs' 
    }),
    new winston.transports.File({ 
      filename: 'combined.log',
      dirname: 'logs' 
    })
  ]
});

// Create directory structure for logs if it doesn't exist
const fs = require('fs');
const path = require('path');
const logDir = path.join(process.cwd(), 'logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Add security context to logs
function addSecurityContext(message, context = {}) {
  return logger.warn(message, { 
    ...context, 
    securityEvent: true 
  });
}

// Add trading context to logs
function addTradingContext(message, context = {}) {
  return logger.info(message, { 
    ...context, 
    tradingEvent: true 
  });
}

module.exports = {
  debug: logger.debug.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  security: addSecurityContext,
  trading: addTradingContext
};
