/**
 * Test configuration for the multi-chain trading bot
 * Sets up test environments for Ethereum, Bitcoin, and Solana
 */

require('dotenv').config();

// Test configuration values
module.exports = {
  // Server configuration
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  
  // Security settings
  security: {
    apiKeyRotationDays: 30,
    ipWhitelist: [],
    maxLoginAttempts: 5,
    sessionTimeoutMinutes: 30,
  },
  
  // Exchange API configurations
  exchanges: {
    kraken: {
      enabled: true,
      apiKey: process.env.TEST_KRAKEN_API_KEY || 'test-api-key',
      apiSecret: process.env.TEST_KRAKEN_API_SECRET || 'test-api-secret',
      tradingEnabled: false, // Disable actual trading in test environment
    },
    binance: {
      enabled: true,
      apiKey: process.env.TEST_BINANCE_API_KEY || 'test-api-key',
      apiSecret: process.env.TEST_BINANCE_API_SECRET || 'test-api-secret',
      tradingEnabled: false, // Disable actual trading in test environment
    },
  },
  
  // Trading parameters
  trading: {
    // Default risk management settings
    maxPositionSize: 0.01, // 1% of available balance
    stopLossPercentage: 0.05, // 5% stop loss
    takeProfitPercentage: 0.1, // 10% take profit
    maxOpenPositions: 3,
    
    // Ethereum specific settings
    ethereum: {
      gasLimitMultiplier: 1.2,
      maxGasPrice: '50', // in gwei
      minLiquidityUSD: 10000,
      preferredDexes: ['uniswap'],
      provider: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161', // Goerli testnet
      snipeAmount: '0.01',
      snipeSlippage: 5,
      tradingEnabled: false,
      maxTransactionAmount: '0.1',
      dailyLimit: '0.5',
    },
    
    // Bitcoin specific settings
    bitcoin: {
      maxFeeRate: 25, // sat/vB
      arbitrageEnabled: true,
      arbitrageAmount: '0.001',
      minArbitrageProfit: 0.5,
      tradingEnabled: false,
      maxTransactionAmount: '0.01',
      dailyLimit: '0.05',
    },
    
    // Solana specific settings
    solana: {
      maxPriorityFee: 0.000005,
      snipingEnabled: true,
      snipeAmount: '0.1',
      tradingEnabled: false,
      maxTransactionAmount: '1',
      dailyLimit: '5',
    },
  },
  
  // Monitoring and alerts
  monitoring: {
    logLevel: 'debug', // More verbose logging for testing
    alertEmail: process.env.ALERT_EMAIL || 'test@example.com',
    performanceReportInterval: 'hourly', // More frequent reporting for testing
  },
};
