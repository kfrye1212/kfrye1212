/**
 * Multi-chain liquidity detection and sniping module
 * Coordinates liquidity detection across Ethereum, Bitcoin, and Solana
 */

const ethereum = require('../core/ethereum');
const bitcoin = require('../core/bitcoin');
const solana = require('../core/solana');
const ethLiquidityDetector = require('../core/liquidityDetector');
const config = require('../core/config');
const logger = require('../utils/logger');

class MultiChainLiquidityDetector {
  constructor() {
    this.initialized = false;
    this.monitors = {};
    this.activeStrategies = {};
  }

  /**
   * Initialize the multi-chain liquidity detector
   * @returns {Promise<boolean>} Initialization success
   */
  async initialize() {
    try {
      logger.info('Initializing multi-chain liquidity detector');
      
      // Initialize chain modules if not already initialized
      const ethInitialized = ethereum.initialized || await ethereum.initialize();
      const btcInitialized = bitcoin.initialized || await bitcoin.initialize();
      const solInitialized = solana.initialized || await solana.initialize();
      
      if (!ethInitialized || !btcInitialized || !solInitialized) {
        throw new Error('Failed to initialize one or more chain modules');
      }
      
      // Initialize Ethereum liquidity detector
      await ethLiquidityDetector.initialize();
      
      // Set up monitors for each chain
      this.setupEthereumMonitor();
      this.setupBitcoinMonitor();
      this.setupSolanaMonitor();
      
      this.initialized = true;
      logger.info('Multi-chain liquidity detector initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize multi-chain liquidity detector', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Set up Ethereum liquidity monitor
   */
  setupEthereumMonitor() {
    try {
      logger.info('Setting up Ethereum liquidity monitor');
      
      // We're using the existing ethLiquidityDetector for Ethereum
      // Just need to register it in our monitors
      this.monitors.ethereum = {
        active: true,
        type: 'ethereum',
        stop: () => {
          ethLiquidityDetector.stopListeners();
          logger.info('Stopped Ethereum liquidity monitor');
        }
      };
      
      logger.info('Ethereum liquidity monitor set up successfully');
    } catch (error) {
      logger.error('Failed to set up Ethereum liquidity monitor', {
        error: error.message
      });
    }
  }

  /**
   * Set up Bitcoin liquidity monitor
   */
  setupBitcoinMonitor() {
    try {
      logger.info('Setting up Bitcoin liquidity monitor');
      
      // For Bitcoin, we'll monitor exchange activity rather than on-chain events
      // Set up interval to check for significant price movements or volume spikes
      const intervalId = setInterval(async () => {
        try {
          // Get current Bitcoin price from multiple exchanges
          const krakenPrice = await bitcoin.getBitcoinPrice('kraken');
          const binancePrice = await bitcoin.getBitcoinPrice('binance');
          
          // Calculate price difference percentage
          const priceDiff = Math.abs(parseFloat(krakenPrice) - parseFloat(binancePrice));
          const priceDiffPercent = (priceDiff / parseFloat(binancePrice)) * 100;
          
          logger.debug('Bitcoin price check', {
            krakenPrice,
            binancePrice,
            priceDiffPercent
          });
          
          // If price difference exceeds threshold, there might be a trading opportunity
          if (priceDiffPercent > 0.5) { // 0.5% threshold
            logger.trading('Bitcoin arbitrage opportunity detected', {
              krakenPrice,
              binancePrice,
              priceDiffPercent
            });
            
            // Execute arbitrage strategy if enabled
            if (config.get('trading.bitcoin.arbitrageEnabled', false)) {
              this.executeBitcoinArbitrage(krakenPrice, binancePrice);
            }
          }
        } catch (error) {
          logger.error('Error in Bitcoin monitor interval', {
            error: error.message
          });
        }
      }, 30000); // Check every 30 seconds
      
      this.monitors.bitcoin = {
        active: true,
        type: 'bitcoin',
        intervalId,
        stop: () => {
          clearInterval(intervalId);
          logger.info('Stopped Bitcoin liquidity monitor');
        }
      };
      
      logger.info('Bitcoin liquidity monitor set up successfully');
    } catch (error) {
      logger.error('Failed to set up Bitcoin liquidity monitor', {
        error: error.message
      });
    }
  }

  /**
   * Set up Solana liquidity monitor
   */
  setupSolanaMonitor() {
    try {
      logger.info('Setting up Solana liquidity monitor');
      
      // Set up monitor for new SPL tokens
      const tokenMonitor = solana.monitorNewTokens(async (tokenData) => {
        try {
          logger.info('New Solana token detected', {
            address: tokenData.address,
            symbol: tokenData.symbol,
            name: tokenData.name
          });
          
          // Analyze token for potential issues
          const tokenSafe = await this.analyzeSolanaToken(tokenData.address);
          
          if (!tokenSafe) {
            logger.warn('Solana token failed safety checks, skipping', {
              address: tokenData.address
            });
            return;
          }
          
          // Execute snipe if enabled
          if (config.get('trading.solana.snipingEnabled', false)) {
            await this.executeSolanaSnipe(tokenData.address);
          }
        } catch (error) {
          logger.error('Error processing new Solana token', {
            address: tokenData.address,
            error: error.message
          });
        }
      });
      
      this.monitors.solana = {
        active: true,
        type: 'solana',
        tokenMonitor,
        stop: () => {
          tokenMonitor.stop();
          logger.info('Stopped Solana liquidity monitor');
        }
      };
      
      logger.info('Solana liquidity monitor set up successfully');
    } catch (error) {
      logger.error('Failed to set up Solana liquidity monitor', {
        error: error.message
      });
    }
  }

  /**
   * Execute Bitcoin arbitrage strategy
   * @param {string} krakenPrice - Bitcoin price on Kraken
   * @param {string} binancePrice - Bitcoin price on Binance
   * @returns {Promise<Object>} Arbitrage result
   */
  async executeBitcoinArbitrage(krakenPrice, binancePrice) {
    try {
      logger.trading('Executing Bitcoin arbitrage strategy', {
        krakenPrice,
        binancePrice
      });
      
      // Determine which exchange to buy from and which to sell to
      const buyExchange = parseFloat(krakenPrice) < parseFloat(binancePrice) ? 'kraken' : 'binance';
      const sellExchange = buyExchange === 'kraken' ? 'binance' : 'kraken';
      
      const buyPrice = buyExchange === 'kraken' ? krakenPrice : binancePrice;
      const sellPrice = sellExchange === 'kraken' ? krakenPrice : binancePrice;
      
      // Calculate potential profit percentage
      const profitPercent = ((parseFloat(sellPrice) - parseFloat(buyPrice)) / parseFloat(buyPrice)) * 100;
      
      // Get trade amount from config
      const tradeAmount = config.get('trading.bitcoin.arbitrageAmount', '0.01');
      
      logger.trading('Bitcoin arbitrage details', {
        buyExchange,
        sellExchange,
        buyPrice,
        sellPrice,
        profitPercent,
        tradeAmount
      });
      
      // Check if profit exceeds minimum threshold after fees
      const minProfitPercent = config.get('trading.bitcoin.minArbitrageProfit', 0.5);
      
      if (profitPercent <= minProfitPercent) {
        logger.trading('Bitcoin arbitrage profit too low, skipping', {
          profitPercent,
          minProfitPercent
        });
        
        return {
          executed: false,
          reason: 'Profit too low',
          profitPercent,
          minProfitPercent
        };
      }
      
      // Execute buy order
      const buyResult = await bitcoin.executeTrade(
        buyExchange,
        'buy',
        tradeAmount
      );
      
      // Execute sell order
      const sellResult = await bitcoin.executeTrade(
        sellExchange,
        'sell',
        tradeAmount
      );
      
      const result = {
        executed: true,
        buyExchange,
        sellExchange,
        buyPrice,
        sellPrice,
        tradeAmount,
        profitPercent,
        buyResult,
        sellResult,
        timestamp: new Date().toISOString()
      };
      
      logger.trading('Bitcoin arbitrage executed successfully', result);
      
      return result;
    } catch (error) {
      logger.error('Failed to execute Bitcoin arbitrage', {
        krakenPrice,
        binancePrice,
        error: error.message
      });
      
      return {
        executed: false,
        reason: 'Error',
        error: error.message
      };
    }
  }

  /**
   * Analyze Solana token for potential issues
   * @param {string} tokenAddress - Token address to analyze
   * @returns {Promise<boolean>} Whether the token is safe
   */
  async analyzeSolanaToken(tokenAddress) {
    try {
      logger.info('Analyzing Solana token for safety', { tokenAddress });
      
      // Get token info
      const tokenInfo = await solana.getTokenInfo(tokenAddress);
      
      // In a real implementation, we would perform thorough analysis
      // For this prototype, we'll do some basic checks
      
      // Check for suspicious token name/symbol
      const redFlagTerms = ['scam', 'ponzi', 'moon', 'elon', 'safe', 'gem', 'pump'];
      const nameSymbolLower = (tokenInfo.name + tokenInfo.symbol).toLowerCase();
      
      for (const term of redFlagTerms) {
        if (nameSymbolLower.includes(term)) {
          logger.warn('Solana token name/symbol contains suspicious term', {
            tokenAddress,
            term
          });
          // Don't immediately reject, just flag it
        }
      }
      
      // For demonstration purposes, we'll consider most tokens safe
      // In a real implementation, you would do much more thorough analysis
      const isSafe = Math.random() > 0.2; // 80% chance of being considered safe
      
      logger.info('Solana token safety analysis result', {
        tokenAddress,
        isSafe
      });
      
      return isSafe;
    } catch (error) {
      logger.error('Failed to analyze Solana token', {
        tokenAddress,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Execute a Solana token snipe
   * @param {string} tokenAddress - Token address to snipe
   * @returns {Promise<Object>} Snipe result
   */
  async executeSolanaSnipe(tokenAddress) {
    try {
      logger.trading('Executing Solana token snipe', { tokenAddress });
      
      // Get snipe amount from config
      const snipeAmountSol = config.get('trading.solana.snipeAmount', '1');
      
      // Execute the swap
      const result = await solana.swapTokens(
        'SOL', // Native SOL
        tokenAddress,
        snipeAmountSol,
        5 // 5% slippage
      );
      
      logger.trading('Solana snipe executed successfully', {
        tokenAddress,
        amount: snipeAmountSol,
        result
      });
      
      // Set up position management
      this.setupSolanaPositionManagement(tokenAddress, snipeAmountSol);
      
      return {
        success: true,
        tokenAddress,
        amount: snipeAmountSol,
        result
      };
    } catch (error) {
      logger.error('Failed to execute Solana snipe', {
        tokenAddress,
        error: error.message
      });
      
      return {
        success: false,
        tokenAddress,
        error: error.message
      };
    }
  }

  /**
   * Set up position management for a Solana token
   * @param {string} tokenAddress - Token address
   * @param {string} investmentAmount - Amount invested in SOL
   */
  setupSolanaPositionManagement(tokenAddress, investmentAmount) {
    try {
      logger.info('Setting up Solana position management', {
        tokenAddress,
        investmentAmount
      });
      
      // Get take profit and stop loss percentages from config
      const takeProfitPercentage = config.get('trading.takeProfitPercentage', 10);
      const stopLossPercentage = config.get('trading.stopLossPercentage', 5);
      
      // Create a unique ID for this position
      const positionId = `sol-position-${Date.now()}`;
      
      // Store position in active strategies
      this.activeStrategies[positionId] = {
        type: 'solana-position',
        tokenAddress,
        investmentAmount,
        entryTimestamp: new Date().toISOString(),
        takeProfitPercentage,
        stopLossPercentage,
        status: 'active'
      };
      
      // Set up monitoring interval
      const intervalId = setInterval(async () => {
        try {
          // Check if position is still active
          if (!this.activeStrategies[positionId] || 
              this.activeStrategies[positionId].status !== 'active') {
            clearInterval(intervalId);
            return;
          }
          
          // Get current token balance
          const balance = await solana.getTokenBalance(tokenAddress);
          
          // If balance is zero or very small, position might have been closed elsewhere
          if (parseFloat(balance) < 0.001) {
            logger.info('Solana position appears to be closed (zero balance)', {
              positionId,
              tokenAddress
            });
            
            this.activeStrategies[positionId].status = 'closed';
            clearInterval(intervalId);
            return;
          }
          
          // In a real implementation, we would check the current value of the position
          // For this prototype, we'll simulate price movement
          const priceChangePercent = (Math.random() * 20) - 10; // -10% to +10%
          
          logger.debug('Monitoring Solana position', {
            positionId,
            tokenAddress,
            priceChangePercent
          });
          
          // Check if take profit or stop loss hit
          if (priceChangePercent >= takeProfitPercentage) {
            logger.trading('Solana take profit triggered', {
              positionId,
              tokenAddress,
              priceChangePercent,
              takeProfitPercentage
            });
            
            // Execute sell
            await this.closeSolanaPosition(positionId, tokenAddress, 'take-profit');
            clearInterval(intervalId);
          } else if (priceChangePercent <= -stopLossPercentage) {
            logger.trading('Solana stop loss triggered', {
              positionId,
              tokenAddress,
              priceChangePercent,
              stopLossPercentage
            });
            
            // Execute sell
            await this.closeSolanaPosition(positionId, tokenAddress, 'stop-loss');
            clearInterval(intervalId);
          }
        } catch (error) {
          logger.error('Error monitoring Solana position', {
            positionId,
            tokenAddress,
            error: error.message
          });
        }
      }, 30000); // Check every 30 seconds
      
      // Store interval ID in the position data
      this.activeStrategies[positionId].intervalId = intervalId;
      
      logger.info('Solana position management set up', {
        positionId,
        tokenAddress
      });
      
      return positionId;
    } catch (error) {
      logger.error('Failed to set up Solana position management', {
        tokenAddress,
        error: error.message
      });
    }
  }

  /**
   * Close a Solana token position
   * @param {string} positionId - Position ID
   * @param {string} tokenAddress - Token address
   * @param {string} reason - Reason for closing (take-profit, stop-loss, manual)
   * @returns {Promise<Object>} Close result
   */
  async closeSolanaPosition(positionId, tokenAddress, reason) {
    try {
      logger.trading('Closing Solana position', {
        positionId,
        tokenAddress,
        reason
      });
      
      // Get position data
      const position = this.activeStrategies[positionId];
      
      if (!position) {
        throw new Error(`Position ${positionId} not found`);
      }
      
      // Get token balance
      const balance = await solana.getTokenBalance(tokenAddress);
      
      if (parseFloat(balance) <= 0) {
        logger.warn('No token balance to sell', {
          positionId,
          tokenAddress
        });
        
        // Update position status
        position.status = 'closed';
        position.closeReason = reason;
        position.closeTimestamp = new Date().toISOString();
        
        return {
          success: false,
          reason: 'No balance',
          positionId,
          tokenAddress
        };
      }
      
      // Sell 95% of the balance to account for potential fees
      const sellAmount = (parseFloat(balance) * 0.95).toString();
      
      // Execute the swap back to SOL
      const result = await solana.swapTokens(
        tokenAddress,
        'SOL', // Native SOL
        sellAmount,
        5 // 5% slippage
      );
      
      // Update position status
      position.status = 'closed';
      position.closeReason = reason;
      position.closeTimestamp = new Date().toISOString();
      position.closeResult = result;
      
      logger.trading('Solana position closed successfully', {
        positionId,
        tokenAddress,
        reason,
        sellAmount,
        result
      });
      
      return {
        success: true,
        positionId,
        tokenAddress,
        reason,
        sellAmount,
        result
      };
    } catch (error) {
      logger.error('Failed to close Solana position', {
        positionId,
        tokenAddress,
        reason,
        error: error.message
      });
      
      return {
        success: false,
        positionId,
        tokenAddress,
        reason,
        error: error.message
      };
    }
  }

  /**
   * Stop all monitors
   */
  stopAllMonitors() {
    Object.values(this.monitors).forEach(monitor => {
      if (monitor && monitor.active && typeof monitor.stop === 'function') {
        monitor.stop();
      }
    });
    
    // Clear all position monitoring intervals
    Object.values(this.activeStrategies).forEach(strategy => {
      if (strategy.intervalId) {
        clearInterval(strategy.intervalId);
      }
    });
    
    logger.info('Stopped all liquidity monitors');
  }
}

module.exports = new MultiChainLiquidityDetector();
