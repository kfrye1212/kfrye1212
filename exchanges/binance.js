/**
 * Binance exchange adapter for the multi-chain trading bot
 * Handles all interactions with the Binance API
 */

const Binance = require('binance-api-node').default;
const config = require('../core/config');
const logger = require('../utils/logger');

class BinanceExchange {
  constructor() {
    this.enabled = config.get('exchanges.binance.enabled', false);
    
    if (!this.enabled) {
      logger.info('Binance exchange adapter is disabled');
      return;
    }
    
    const apiKey = config.get('exchanges.binance.apiKey');
    const apiSecret = config.get('exchanges.binance.apiSecret');
    
    if (!apiKey || !apiSecret) {
      logger.error('Binance API credentials not configured');
      this.enabled = false;
      return;
    }
    
    this.tradingEnabled = config.get('exchanges.binance.tradingEnabled', false);
    this.client = Binance({
      apiKey,
      apiSecret,
      // Use test mode if trading is disabled for additional safety
      useServerTime: true
    });
    
    logger.info('Binance exchange adapter initialized', {
      tradingEnabled: this.tradingEnabled
    });
  }
  
  /**
   * Get account balance
   * @returns {Promise<Object>} Account balances
   */
  async getBalance() {
    try {
      if (!this.enabled) {
        throw new Error('Binance exchange adapter is not enabled');
      }
      
      const accountInfo = await this.client.accountInfo();
      const balances = {};
      
      accountInfo.balances.forEach(balance => {
        if (parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0) {
          balances[balance.asset] = {
            free: balance.free,
            locked: balance.locked,
            total: (parseFloat(balance.free) + parseFloat(balance.locked)).toString()
          };
        }
      });
      
      logger.debug('Retrieved Binance balance', { 
        currencies: Object.keys(balances) 
      });
      
      return balances;
    } catch (error) {
      logger.error('Failed to get Binance balance', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Get ticker information for a symbol
   * @param {string} symbol - Trading pair symbol
   * @returns {Promise<Object>} Ticker information
   */
  async getTicker(symbol) {
    try {
      if (!this.enabled) {
        throw new Error('Binance exchange adapter is not enabled');
      }
      
      const ticker = await this.client.prices({ symbol });
      const bookTicker = await this.client.book({ symbol });
      
      const result = {
        symbol,
        price: ticker[symbol],
        bidPrice: bookTicker.bidPrice,
        bidQty: bookTicker.bidQty,
        askPrice: bookTicker.askPrice,
        askQty: bookTicker.askQty
      };
      
      logger.debug('Retrieved Binance ticker', { symbol });
      
      return result;
    } catch (error) {
      logger.error('Failed to get Binance ticker', { 
        symbol, 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Place a buy order
   * @param {string} symbol - Trading pair symbol
   * @param {string} type - Order type (MARKET, LIMIT)
   * @param {string} quantity - Order quantity
   * @param {string} [price] - Order price (for LIMIT orders)
   * @returns {Promise<Object>} Order result
   */
  async buyOrder(symbol, type, quantity, price = null) {
    try {
      if (!this.enabled) {
        throw new Error('Binance exchange adapter is not enabled');
      }
      
      if (!this.tradingEnabled) {
        logger.security('Trading is disabled for Binance, simulating buy order', {
          symbol,
          type,
          quantity,
          price
        });
        
        return {
          simulated: true,
          symbol,
          type,
          side: 'BUY',
          quantity,
          price,
          timestamp: Date.now()
        };
      }
      
      const orderOptions = {
        symbol,
        side: 'BUY',
        type,
        quantity
      };
      
      if (type === 'LIMIT' && price) {
        orderOptions.price = price;
        orderOptions.timeInForce = 'GTC'; // Good Till Cancelled
      }
      
      const response = await this.client.order(orderOptions);
      
      logger.trading('Placed Binance buy order', {
        symbol,
        type,
        quantity,
        price,
        orderId: response.orderId
      });
      
      return response;
    } catch (error) {
      logger.error('Failed to place Binance buy order', {
        symbol,
        type,
        quantity,
        price,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Place a sell order
   * @param {string} symbol - Trading pair symbol
   * @param {string} type - Order type (MARKET, LIMIT)
   * @param {string} quantity - Order quantity
   * @param {string} [price] - Order price (for LIMIT orders)
   * @returns {Promise<Object>} Order result
   */
  async sellOrder(symbol, type, quantity, price = null) {
    try {
      if (!this.enabled) {
        throw new Error('Binance exchange adapter is not enabled');
      }
      
      if (!this.tradingEnabled) {
        logger.security('Trading is disabled for Binance, simulating sell order', {
          symbol,
          type,
          quantity,
          price
        });
        
        return {
          simulated: true,
          symbol,
          type,
          side: 'SELL',
          quantity,
          price,
          timestamp: Date.now()
        };
      }
      
      const orderOptions = {
        symbol,
        side: 'SELL',
        type,
        quantity
      };
      
      if (type === 'LIMIT' && price) {
        orderOptions.price = price;
        orderOptions.timeInForce = 'GTC'; // Good Till Cancelled
      }
      
      const response = await this.client.order(orderOptions);
      
      logger.trading('Placed Binance sell order', {
        symbol,
        type,
        quantity,
        price,
        orderId: response.orderId
      });
      
      return response;
    } catch (error) {
      logger.error('Failed to place Binance sell order', {
        symbol,
        type,
        quantity,
        price,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get order status
   * @param {string} orderId - Order ID
   * @param {string} symbol - Trading pair symbol
   * @returns {Promise<Object>} Order status
   */
  async getOrderStatus(orderId, symbol) {
    try {
      if (!this.enabled) {
        throw new Error('Binance exchange adapter is not enabled');
      }
      
      const response = await this.client.getOrder({
        symbol,
        orderId
      });
      
      logger.debug('Retrieved Binance order status', { orderId, symbol });
      
      return response;
    } catch (error) {
      logger.error('Failed to get Binance order status', {
        orderId,
        symbol,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Cancel an order
   * @param {string} orderId - Order ID
   * @param {string} symbol - Trading pair symbol
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelOrder(orderId, symbol) {
    try {
      if (!this.enabled) {
        throw new Error('Binance exchange adapter is not enabled');
      }
      
      if (!this.tradingEnabled) {
        logger.security('Trading is disabled for Binance, simulating cancel order', {
          orderId,
          symbol
        });
        
        return {
          simulated: true,
          orderId,
          symbol,
          timestamp: Date.now()
        };
      }
      
      const response = await this.client.cancelOrder({
        symbol,
        orderId
      });
      
      logger.trading('Cancelled Binance order', { orderId, symbol });
      
      return response;
    } catch (error) {
      logger.error('Failed to cancel Binance order', {
        orderId,
        symbol,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get open orders
   * @param {string} [symbol] - Trading pair symbol (optional)
   * @returns {Promise<Array>} List of open orders
   */
  async getOpenOrders(symbol = null) {
    try {
      if (!this.enabled) {
        throw new Error('Binance exchange adapter is not enabled');
      }
      
      const options = symbol ? { symbol } : {};
      const orders = await this.client.openOrders(options);
      
      logger.debug('Retrieved Binance open orders', {
        count: orders.length,
        symbol
      });
      
      return orders;
    } catch (error) {
      logger.error('Failed to get Binance open orders', {
        symbol,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get exchange information including trading pairs
   * @returns {Promise<Object>} Exchange information
   */
  async getExchangeInfo() {
    try {
      if (!this.enabled) {
        throw new Error('Binance exchange adapter is not enabled');
      }
      
      const info = await this.client.exchangeInfo();
      
      logger.debug('Retrieved Binance exchange info', {
        symbolCount: info.symbols.length
      });
      
      return info;
    } catch (error) {
      logger.error('Failed to get Binance exchange info', {
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Set up websocket for price updates
   * @param {string} symbol - Trading pair symbol
   * @param {Function} callback - Callback function for price updates
   * @returns {Function} Function to close the websocket
   */
  watchPrice(symbol, callback) {
    if (!this.enabled) {
      logger.error('Binance exchange adapter is not enabled');
      return () => {};
    }
    
    logger.info('Setting up Binance price websocket', { symbol });
    
    const clean = this.client.ws.ticker(symbol, ticker => {
      callback({
        symbol: ticker.symbol,
        price: ticker.curDayClose,
        priceChange: ticker.priceChange,
        priceChangePercent: ticker.priceChangePercent,
        volume: ticker.volume,
        timestamp: ticker.eventTime
      });
    });
    
    return clean;
  }
}

module.exports = new BinanceExchange();
