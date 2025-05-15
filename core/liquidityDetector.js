/**
 * Liquidity detection and sniping module for the multi-chain trading bot
 * Monitors for new liquidity pairs and executes trades based on criteria
 */

const ethereum = require('../core/ethereum');
const config = require('../core/config');
const logger = require('../utils/logger');

class LiquidityDetector {
  constructor() {
    this.initialized = false;
    this.listeners = {};
    this.tokenWhitelist = new Set();
    this.tokenBlacklist = new Set();
    this.minLiquidityUSD = config.get('trading.ethereum.minLiquidityUSD', 50000);
    this.preferredDexes = config.get('trading.ethereum.preferredDexes', ['uniswap']);
  }

  /**
   * Initialize the liquidity detector
   * @returns {Promise<boolean>} Initialization success
   */
  async initialize() {
    try {
      // Ensure Ethereum module is initialized
      if (!ethereum.initialized) {
        logger.warn('Ethereum module not initialized, initializing now');
        const initialized = await ethereum.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize Ethereum module');
        }
      }

      // Set up listeners for new pairs
      if (this.preferredDexes.includes('uniswap')) {
        this.setupUniswapListener();
      }

      this.initialized = true;
      logger.info('Liquidity detector initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize liquidity detector', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Set up listener for new Uniswap pairs
   */
  setupUniswapListener() {
    try {
      logger.info('Setting up Uniswap pair listener');

      this.listeners.uniswap = ethereum.listenForNewPairs(async (pairData) => {
        try {
          // Log the new pair
          logger.info('New liquidity pair detected', {
            pairAddress: pairData.pairAddress,
            token0: `${pairData.token0.symbol} (${pairData.token0.address})`,
            token1: `${pairData.token1.symbol} (${pairData.token1.address})`,
            hasEth: pairData.hasEth
          });

          // Only process pairs with ETH
          if (!pairData.hasEth) {
            logger.debug('Skipping non-ETH pair', {
              pairAddress: pairData.pairAddress
            });
            return;
          }

          // Check liquidity threshold
          if (parseFloat(pairData.liquidity.liquidityUSD) < this.minLiquidityUSD) {
            logger.debug('Insufficient liquidity for sniping', {
              pairAddress: pairData.pairAddress,
              liquidity: pairData.liquidity.liquidityUSD,
              threshold: this.minLiquidityUSD
            });
            return;
          }

          // Determine which token is not ETH
          const nonEthToken = pairData.token0.address.toLowerCase() === ethereum.addresses.weth.toLowerCase()
            ? pairData.token1
            : pairData.token0;

          // Check if token is blacklisted
          if (this.tokenBlacklist.has(nonEthToken.address.toLowerCase())) {
            logger.debug('Token is blacklisted, skipping', {
              token: nonEthToken.address
            });
            return;
          }

          // Check if we're using a whitelist and if the token is whitelisted
          if (this.tokenWhitelist.size > 0 && !this.tokenWhitelist.has(nonEthToken.address.toLowerCase())) {
            logger.debug('Token not in whitelist, skipping', {
              token: nonEthToken.address
            });
            return;
          }

          // Analyze token for potential issues
          const tokenSafe = await this.analyzeToken(nonEthToken.address);
          if (!tokenSafe) {
            logger.warn('Token failed safety checks, skipping', {
              token: nonEthToken.address
            });
            return;
          }

          // Execute snipe if all checks pass
          await this.executeSnipe(ethereum.addresses.weth, nonEthToken.address);
        } catch (error) {
          logger.error('Error processing new pair', {
            pairAddress: pairData.pairAddress,
            error: error.message
          });
        }
      });

      logger.info('Uniswap pair listener set up successfully');
    } catch (error) {
      logger.error('Failed to set up Uniswap pair listener', {
        error: error.message
      });
    }
  }

  /**
   * Analyze token for potential issues (honeypot, scam, etc.)
   * @param {string} tokenAddress - Token address to analyze
   * @returns {Promise<boolean>} Whether the token is safe
   */
  async analyzeToken(tokenAddress) {
    try {
      logger.info('Analyzing token for safety', { tokenAddress });

      // Get token info
      const tokenInfo = await ethereum.getTokenInfo(tokenAddress);
      logger.debug('Token info retrieved', { tokenInfo });

      // Check for common red flags in token name/symbol
      const redFlagTerms = ['scam', 'ponzi', 'moon', 'elon', 'safe', 'gem', 'pump'];
      const nameSymbolLower = (tokenInfo.name + tokenInfo.symbol).toLowerCase();
      
      for (const term of redFlagTerms) {
        if (nameSymbolLower.includes(term)) {
          logger.warn('Token name/symbol contains suspicious term', {
            tokenAddress,
            term
          });
          // Don't immediately reject, just flag it
        }
      }

      // Check token contract for honeypot characteristics
      // This is a simplified check - in a real implementation, you would do more thorough analysis
      try {
        // Try to get token price - if this fails, it might be a honeypot
        const tokenPrice = await ethereum.getTokenPrice(tokenAddress);
        if (tokenPrice === '0') {
          logger.warn('Unable to determine token price, possible honeypot', {
            tokenAddress
          });
          return false;
        }

        // Check if we can sell the token (not implemented here)
        // In a real implementation, you would simulate a sell transaction
        
        logger.info('Token passed basic safety checks', { tokenAddress });
        return true;
      } catch (error) {
        logger.warn('Error during token safety analysis, considering unsafe', {
          tokenAddress,
          error: error.message
        });
        return false;
      }
    } catch (error) {
      logger.error('Failed to analyze token', {
        tokenAddress,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Execute a token snipe
   * @param {string} fromToken - Token to swap from (usually ETH/WETH)
   * @param {string} toToken - Token to swap to
   * @returns {Promise<Object>} Snipe result
   */
  async executeSnipe(fromToken, toToken) {
    try {
      logger.trading('Executing token snipe', {
        fromToken,
        toToken
      });

      // Get snipe amount from config
      const snipeAmountEth = config.get('trading.ethereum.snipeAmount', '0.1');
      
      // Check if trading is enabled
      const tradingEnabled = config.get('exchanges.ethereum.tradingEnabled', false);
      
      if (!tradingEnabled) {
        logger.security('Trading is disabled, simulating snipe', {
          fromToken,
          toToken,
          amount: snipeAmountEth
        });
        
        return {
          simulated: true,
          fromToken,
          toToken,
          amount: snipeAmountEth,
          timestamp: new Date().toISOString()
        };
      }

      // Execute the swap with a higher slippage tolerance for new tokens
      const slippagePercent = config.get('trading.ethereum.snipeSlippage', 10);
      const result = await ethereum.swapTokens(
        fromToken,
        toToken,
        snipeAmountEth,
        slippagePercent
      );

      logger.trading('Snipe executed successfully', {
        fromToken,
        toToken,
        amount: snipeAmountEth,
        txHash: result.transactionHash
      });

      // Set up take profit and stop loss for this position
      this.setupPositionManagement(toToken, snipeAmountEth);

      return {
        success: true,
        fromToken,
        toToken,
        amount: snipeAmountEth,
        txHash: result.transactionHash
      };
    } catch (error) {
      logger.error('Failed to execute snipe', {
        fromToken,
        toToken,
        error: error.message
      });
      
      return {
        success: false,
        fromToken,
        toToken,
        error: error.message
      };
    }
  }

  /**
   * Set up position management (take profit, stop loss)
   * @param {string} tokenAddress - Token address
   * @param {string} investmentAmount - Amount invested in ETH
   */
  setupPositionManagement(tokenAddress, investmentAmount) {
    try {
      logger.info('Setting up position management', {
        tokenAddress,
        investmentAmount
      });

      // Get take profit and stop loss percentages from config
      const takeProfitPercentage = config.get('trading.takeProfitPercentage', 10);
      const stopLossPercentage = config.get('trading.stopLossPercentage', 5);

      // Get current token price
      ethereum.getTokenPrice(tokenAddress).then(initialPrice => {
        // Calculate target prices
        const takeProfitPrice = parseFloat(initialPrice) * (1 + takeProfitPercentage / 100);
        const stopLossPrice = parseFloat(initialPrice) * (1 - stopLossPercentage / 100);

        logger.info('Position management set up', {
          tokenAddress,
          initialPrice,
          takeProfitPrice,
          stopLossPrice
        });

        // Set up monitoring interval
        const intervalId = setInterval(async () => {
          try {
            // Get current price
            const currentPrice = await ethereum.getTokenPrice(tokenAddress);
            
            logger.debug('Monitoring position', {
              tokenAddress,
              currentPrice,
              takeProfitPrice,
              stopLossPrice
            });

            // Check if take profit or stop loss hit
            if (parseFloat(currentPrice) >= takeProfitPrice) {
              logger.trading('Take profit triggered', {
                tokenAddress,
                currentPrice,
                takeProfitPrice
              });
              
              // Execute sell
              await this.sellPosition(tokenAddress);
              clearInterval(intervalId);
            } else if (parseFloat(currentPrice) <= stopLossPrice) {
              logger.trading('Stop loss triggered', {
                tokenAddress,
                currentPrice,
                stopLossPrice
              });
              
              // Execute sell
              await this.sellPosition(tokenAddress);
              clearInterval(intervalId);
            }
          } catch (error) {
            logger.error('Error monitoring position', {
              tokenAddress,
              error: error.message
            });
          }
        }, 30000); // Check every 30 seconds
      }).catch(error => {
        logger.error('Failed to get initial token price', {
          tokenAddress,
          error: error.message
        });
      });
    } catch (error) {
      logger.error('Failed to set up position management', {
        tokenAddress,
        error: error.message
      });
    }
  }

  /**
   * Sell a token position
   * @param {string} tokenAddress - Token address to sell
   * @returns {Promise<Object>} Sell result
   */
  async sellPosition(tokenAddress) {
    try {
      logger.trading('Selling token position', { tokenAddress });

      // Get token balance
      const balance = await ethereum.getTokenBalance(tokenAddress);
      
      if (parseFloat(balance) <= 0) {
        logger.warn('No token balance to sell', { tokenAddress });
        return {
          success: false,
          reason: 'No balance'
        };
      }

      // Sell 95% of the balance to account for potential fees
      const sellAmount = (parseFloat(balance) * 0.95).toString();
      
      // Execute the swap back to ETH
      const result = await ethereum.swapTokens(
        tokenAddress,
        ethereum.addresses.weth,
        sellAmount,
        5 // 5% slippage for selling
      );

      logger.trading('Position sold successfully', {
        tokenAddress,
        amount: sellAmount,
        txHash: result.transactionHash
      });

      return {
        success: true,
        tokenAddress,
        amount: sellAmount,
        txHash: result.transactionHash
      };
    } catch (error) {
      logger.error('Failed to sell position', {
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
   * Add tokens to whitelist
   * @param {Array<string>} tokens - Array of token addresses
   */
  addToWhitelist(tokens) {
    tokens.forEach(token => {
      this.tokenWhitelist.add(token.toLowerCase());
    });
    
    logger.info('Added tokens to whitelist', {
      tokens,
      whitelistSize: this.tokenWhitelist.size
    });
  }

  /**
   * Add tokens to blacklist
   * @param {Array<string>} tokens - Array of token addresses
   */
  addToBlacklist(tokens) {
    tokens.forEach(token => {
      this.tokenBlacklist.add(token.toLowerCase());
    });
    
    logger.info('Added tokens to blacklist', {
      tokens,
      blacklistSize: this.tokenBlacklist.size
    });
  }

  /**
   * Stop all listeners
   */
  stopListeners() {
    Object.values(this.listeners).forEach(listener => {
      if (listener && typeof listener.stop === 'function') {
        listener.stop();
      }
    });
    
    logger.info('Stopped all liquidity listeners');
  }
}

module.exports = new LiquidityDetector();
