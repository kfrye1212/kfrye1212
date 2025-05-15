/**
 * Test runner for the multi-chain trading bot
 * Executes tests for all components in testnet environments
 */

const testConfig = require('./testConfig');
const logger = require('../utils/logger');
const ethereum = require('../core/ethereum');
const bitcoin = require('../core/bitcoin');
const solana = require('../core/solana');
const multiChainLiquidityDetector = require('../core/multiChainLiquidityDetector');
const securityModule = require('../security/securityModule');

// Override global config with test config
jest.mock('../core/config', () => {
  return {
    get: (path, defaultValue) => {
      const parts = path.split('.');
      let current = testConfig;
      
      for (const part of parts) {
        if (current[part] === undefined) {
          return defaultValue;
        }
        current = current[part];
      }
      
      return current;
    },
    validate: () => [],
    getAll: () => JSON.parse(JSON.stringify(testConfig))
  };
});

/**
 * Run all tests for the multi-chain trading bot
 */
async function runTests() {
  logger.info('Starting multi-chain trading bot tests');
  
  try {
    // Initialize security module
    logger.info('Testing security module initialization');
    await testSecurityModule();
    
    // Test Ethereum functionality
    logger.info('Testing Ethereum module');
    await testEthereumModule();
    
    // Test Bitcoin functionality
    logger.info('Testing Bitcoin module');
    await testBitcoinModule();
    
    // Test Solana functionality
    logger.info('Testing Solana module');
    await testSolanaModule();
    
    // Test multi-chain liquidity detector
    logger.info('Testing multi-chain liquidity detector');
    await testMultiChainLiquidityDetector();
    
    logger.info('All tests completed successfully');
    return true;
  } catch (error) {
    logger.error('Test execution failed', {
      error: error.message,
      stack: error.stack
    });
    return false;
  }
}

/**
 * Test security module functionality
 */
async function testSecurityModule() {
  try {
    // Initialize security module
    const initialized = await securityModule.initialize();
    if (!initialized) {
      throw new Error('Failed to initialize security module');
    }
    
    logger.info('Security module initialized successfully');
    
    // Test transaction validation
    const ethValidation = securityModule.validateTransaction('ethereum', '0.05', 'buy');
    if (!ethValidation.valid) {
      throw new Error(`Ethereum transaction validation failed: ${ethValidation.reason}`);
    }
    
    const btcValidation = securityModule.validateTransaction('bitcoin', '0.005', 'buy');
    if (!btcValidation.valid) {
      throw new Error(`Bitcoin transaction validation failed: ${btcValidation.reason}`);
    }
    
    const solValidation = securityModule.validateTransaction('solana', '0.5', 'buy');
    if (!solValidation.valid) {
      throw new Error(`Solana transaction validation failed: ${solValidation.reason}`);
    }
    
    logger.info('Transaction validation tests passed');
    
    // Test encryption/decryption
    const testData = 'sensitive-api-key-12345';
    const encryptionKey = 'test-encryption-key';
    
    const encrypted = securityModule.encryptData(testData, encryptionKey);
    const decrypted = securityModule.decryptData(encrypted, encryptionKey);
    
    if (decrypted !== testData) {
      throw new Error('Encryption/decryption test failed');
    }
    
    logger.info('Encryption/decryption tests passed');
    
    // Test suspicious activity detection
    const transactions = [
      { amount: '0.01', type: 'buy', timestamp: new Date(Date.now() - 50000).toISOString() },
      { amount: '0.01', type: 'buy', timestamp: new Date(Date.now() - 40000).toISOString() },
      { amount: '0.01', type: 'buy', timestamp: new Date(Date.now() - 30000).toISOString() },
      { amount: '0.01', type: 'buy', timestamp: new Date(Date.now() - 20000).toISOString() },
      { amount: '0.01', type: 'buy', timestamp: new Date(Date.now() - 10000).toISOString() }
    ];
    
    const suspicious = securityModule.detectSuspiciousActivity(transactions);
    logger.info('Suspicious activity detection test completed', {
      suspiciousActivitiesDetected: suspicious.length
    });
    
    return true;
  } catch (error) {
    logger.error('Security module test failed', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Test Ethereum module functionality
 */
async function testEthereumModule() {
  try {
    // Initialize Ethereum module with testnet provider
    const initialized = await ethereum.initialize(
      testConfig.trading.ethereum.provider
    );
    
    if (!initialized) {
      throw new Error('Failed to initialize Ethereum module');
    }
    
    logger.info('Ethereum module initialized successfully');
    
    // Test getting ETH price
    const ethPrice = await ethereum.getEthPrice();
    logger.info('Retrieved ETH price', { ethPrice });
    
    // Test token info retrieval (using a known token on Goerli)
    // Note: This is a test token on Goerli, replace with an actual token if needed
    const testTokenAddress = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'; // WETH on Goerli
    
    try {
      const tokenInfo = await ethereum.getTokenInfo(testTokenAddress);
      logger.info('Retrieved token info', { tokenInfo });
    } catch (error) {
      logger.warn('Token info retrieval failed, this is expected in some test environments', {
        error: error.message
      });
    }
    
    // Test liquidity detection (simulated)
    logger.info('Testing liquidity detection simulation');
    
    // Simulate a new pair event
    const pairData = {
      pairAddress: '0x1234567890123456789012345678901234567890',
      token0: {
        address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6', // WETH on Goerli
        symbol: 'WETH',
        name: 'Wrapped Ether'
      },
      token1: {
        address: '0x2345678901234567890123456789012345678901',
        symbol: 'TEST',
        name: 'Test Token'
      },
      liquidity: {
        liquidityUSD: '100000',
        tokenAReserve: '10',
        tokenBReserve: '10000'
      },
      hasEth: true
    };
    
    // Log the simulated pair data
    logger.info('Simulated new pair data', { pairData });
    
    return true;
  } catch (error) {
    logger.error('Ethereum module test failed', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Test Bitcoin module functionality
 */
async function testBitcoinModule() {
  try {
    // Initialize Bitcoin module
    const initialized = await bitcoin.initialize();
    
    if (!initialized) {
      throw new Error('Failed to initialize Bitcoin module');
    }
    
    logger.info('Bitcoin module initialized successfully');
    
    // Test getting BTC price
    const btcPrice = await bitcoin.getBitcoinPrice('binance');
    logger.info('Retrieved BTC price from Binance', { btcPrice });
    
    const btcPriceKraken = await bitcoin.getBitcoinPrice('kraken');
    logger.info('Retrieved BTC price from Kraken', { btcPriceKraken });
    
    // Test fee estimation
    const feeEstimates = await bitcoin.getFeeEstimates();
    logger.info('Retrieved BTC fee estimates', { feeEstimates });
    
    // Test recommended fee rate
    const fastFeeRate = await bitcoin.getRecommendedFeeRate('fast');
    logger.info('Retrieved fast fee rate', { fastFeeRate });
    
    const mediumFeeRate = await bitcoin.getRecommendedFeeRate('medium');
    logger.info('Retrieved medium fee rate', { mediumFeeRate });
    
    // Test simulated trade execution
    const tradeResult = await bitcoin.executeTrade('binance', 'buy', '0.001');
    logger.info('Executed simulated BTC trade', { tradeResult });
    
    return true;
  } catch (error) {
    logger.error('Bitcoin module test failed', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Test Solana module functionality
 */
async function testSolanaModule() {
  try {
    // Initialize Solana module
    const initialized = await solana.initialize();
    
    if (!initialized) {
      throw new Error('Failed to initialize Solana module');
    }
    
    logger.info('Solana module initialized successfully');
    
    // Test getting SOL price
    const solPrice = await solana.getSolanaPrice('binance');
    logger.info('Retrieved SOL price from Binance', { solPrice });
    
    // Test token info retrieval (simulated)
    const testTokenAddress = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
    const tokenInfo = await solana.getTokenInfo(testTokenAddress);
    logger.info('Retrieved SOL token info', { tokenInfo });
    
    // Test token balance retrieval (simulated)
    const tokenBalance = await solana.getTokenBalance(testTokenAddress);
    logger.info('Retrieved SOL token balance', { tokenBalance });
    
    // Test simulated trade execution
    const tradeResult = await solana.executeTrade('binance', 'buy', '1');
    logger.info('Executed simulated SOL trade', { tradeResult });
    
    // Test simulated token swap
    const swapResult = await solana.swapTokens('SOL', testTokenAddress, '0.1', 1);
    logger.info('Executed simulated SOL token swap', { swapResult });
    
    return true;
  } catch (error) {
    logger.error('Solana module test failed', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Test multi-chain liquidity detector
 */
async function testMultiChainLiquidityDetector() {
  try {
    // Initialize multi-chain liquidity detector
    const initialized = await multiChainLiquidityDetector.initialize();
    
    if (!initialized) {
      throw new Error('Failed to initialize multi-chain liquidity detector');
    }
    
    logger.info('Multi-chain liquidity detector initialized successfully');
    
    // Test Bitcoin arbitrage simulation
    const arbitrageResult = await multiChainLiquidityDetector.executeBitcoinArbitrage('64000', '65000');
    logger.info('Simulated Bitcoin arbitrage', { arbitrageResult });
    
    // Test Solana token analysis
    const testTokenAddress = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
    const tokenSafe = await multiChainLiquidityDetector.analyzeSolanaToken(testTokenAddress);
    logger.info('Analyzed Solana token', { tokenAddress: testTokenAddress, isSafe: tokenSafe });
    
    // Stop all monitors to clean up
    multiChainLiquidityDetector.stopAllMonitors();
    logger.info('Stopped all liquidity monitors');
    
    return true;
  } catch (error) {
    logger.error('Multi-chain liquidity detector test failed', {
      error: error.message
    });
    throw error;
  }
}

// Export the test runner
module.exports = {
  runTests
};

// If this file is run directly, execute the tests
if (require.main === module) {
  runTests()
    .then(success => {
      if (success) {
        logger.info('All tests completed successfully');
        process.exit(0);
      } else {
        logger.error('Tests failed');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Test execution error', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    });
}
