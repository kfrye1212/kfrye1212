/**
 * Configuration management for the multi-chain trading bot
 * Handles loading environment variables and providing configuration values
 */

require('dotenv').config();

// Default configuration values
const defaultConfig = {
  // Server configuration
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  
  // Security settings
  security: {
    apiKeyRotationDays: 30,
    ipWhitelist: process.env.IP_WHITELIST ? process.env.IP_WHITELIST.split(',') : [],
    maxLoginAttempts: 5,
    sessionTimeoutMinutes: 30,
  },
  
  // Exchange API configurations
  exchanges: {
    kraken: {
      enabled: process.env.KRAKEN_ENABLED === 'true',
      apiKey: process.env.KRAKEN_API_KEY,
      apiSecret: process.env.KRAKEN_API_SECRET,
      tradingEnabled: process.env.KRAKEN_TRADING_ENABLED === 'true',
    },
    binance: {
      enabled: process.env.BINANCE_ENABLED === 'true',
      apiKey: process.env.BINANCE_API_KEY,
      apiSecret: process.env.BINANCE_API_SECRET,
      tradingEnabled: process.env.BINANCE_TRADING_ENABLED === 'true',
    },
    cryptoCom: {
      enabled: process.env.CRYPTO_COM_ENABLED === 'true',
      apiKey: process.env.CRYPTO_COM_API_KEY,
      apiSecret: process.env.CRYPTO_COM_API_SECRET,
      tradingEnabled: process.env.CRYPTO_COM_TRADING_ENABLED === 'true',
    },
    uphold: {
      enabled: process.env.UPHOLD_ENABLED === 'true',
      apiKey: process.env.UPHOLD_API_KEY,
      apiSecret: process.env.UPHOLD_API_SECRET,
      tradingEnabled: process.env.UPHOLD_TRADING_ENABLED === 'true',
    },
  },
  
  // Trading parameters
  trading: {
    // Default risk management settings
    maxPositionSize: process.env.MAX_POSITION_SIZE || 0.1, // 10% of available balance
    stopLossPercentage: process.env.STOP_LOSS_PERCENTAGE || 0.05, // 5% stop loss
    takeProfitPercentage: process.env.TAKE_PROFIT_PERCENTAGE || 0.1, // 10% take profit
    maxOpenPositions: process.env.MAX_OPEN_POSITIONS || 5,
    
    // Ethereum specific settings
    ethereum: {
      gasLimitMultiplier: process.env.ETH_GAS_LIMIT_MULTIPLIER || 1.2,
      maxGasPrice: process.env.ETH_MAX_GAS_PRICE || '100', // in gwei
      minLiquidityUSD: process.env.ETH_MIN_LIQUIDITY_USD || 50000,
      preferredDexes: process.env.ETH_PREFERRED_DEXES ? 
        process.env.ETH_PREFERRED_DEXES.split(',') : 
        ['uniswap', 'sushiswap'],
    },
  },
  
  // Monitoring and alerts
  monitoring: {
    logLevel: process.env.LOG_LEVEL || 'info',
    alertEmail: process.env.ALERT_EMAIL,
    performanceReportInterval: process.env.PERFORMANCE_REPORT_INTERVAL || 'daily',
  },
};

/**
 * Get configuration value by path
 * @param {string} path - Dot notation path to configuration value
 * @param {any} defaultValue - Default value if path not found
 * @returns {any} Configuration value
 */
function get(path, defaultValue) {
  const parts = path.split('.');
  let current = defaultConfig;
  
  for (const part of parts) {
    if (current[part] === undefined) {
      return defaultValue;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Validate critical configuration values
 * @returns {Array<string>} Array of validation errors
 */
function validate() {
  const errors = [];
  
  // Check if at least one exchange is enabled
  const anyExchangeEnabled = Object.values(defaultConfig.exchanges)
    .some(exchange => exchange.enabled);
  
  if (!anyExchangeEnabled) {
    errors.push('At least one exchange must be enabled');
  }
  
  // Check API keys for enabled exchanges
  Object.entries(defaultConfig.exchanges).forEach(([name, config]) => {
    if (config.enabled) {
      if (!config.apiKey) {
        errors.push(`API key for ${name} is required when enabled`);
      }
      if (!config.apiSecret) {
        errors.push(`API secret for ${name} is required when enabled`);
      }
    }
  });
  
  return errors;
}

module.exports = {
  get,
  validate,
  // Export the entire config for testing and debugging
  getAll: () => JSON.parse(JSON.stringify(defaultConfig)),
};
