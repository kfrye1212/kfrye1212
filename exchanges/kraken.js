/**
 * Kraken exchange adapter for the multi-chain trading bot
 * Handles all interactions with the Kraken API
 */

const KrakenClient = require('kraken-api');
const config = require('../core/config');
const logger = require('../utils/logger');

class KrakenExchange {
  constructor() {
    this.enabled = config.get('exchanges.kraken.enabled', false);
    
    if (!this.enabled) {
      logger.info('Kraken exchange adapter is disabled');
      return;
    }
    
    const apiKey = config.get('exchanges.kraken.apiKey');
    const apiSecret = config.get('exchanges.kraken.apiSecret');
    
    if (!apiKey || !apiSecret) {
      logger.error('Kraken API credentials not configured');
      this.enabled = false;
      return;
    }
    
    this.tradingEnabled = config.get('exchanges.kraken.tradingEnabled', false);
    this.client = new KrakenClient(apiKey, apiSecret);
    
    logger.info('Kraken exchange adapter initialized', {
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
        throw new Error('Kraken exchange adapter is not enabled');
      }
      
      const response = await this.client.api('Balance');
      logger.debug('Retrieved Kraken balance', { 
        currencies: Object.keys(response.result) 
      });
      
      return response.result;
    } catch (error) {
      logger.error('Failed to get Kraken balance', { error: error.message });
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
        throw new Error('Kraken exchange adapter is not enabled');
      }
      
      const response = await this.client.api('Ticker', { pair: symbol });
      logger.debug('Retrieved Kraken ticker', { symbol });
      
      return response.result[symbol];
    } catch (error) {
      logger.error('Failed to get Kraken ticker', { 
        symbol, 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Place a buy order
   * @param {string} symbol - Trading pair symbol
   * @param {string} type - Order type (market, limit)
   * @param {string} volume - Order volume
   * @param {string} [price] - Order price (for limit orders)
   * @returns {Promise<Object>} Order result
   */
  async buyOrder(symbol, type, volume, price = null) {
    try {
      if (!this.enabled) {
        throw new Error('Kraken exchange adapter is not enabled');
      }
      
      if (!this.tradingEnabled) {
        logger.security('Trading is disabled for Kraken, simulating buy order', {
          symbol,
          type,
          volume,
          price
        });
        
        return {
          simulated: true,
          symbol,
          type,
          volume,
          price,
          timestamp: new Date().toISOString()
        };
      }
      
      const params = {
        pair: symbol,
        type: 'buy',
        ordertype: type,
        volume
      };
      
      if (type === 'limit' && price) {
        params.price = price;
      }
      
      const response = await this.client.api('AddOrder', params);
      
      logger.trading('Placed Kraken buy order', {
        symbol,
        type,
        volume,
        price,
        orderId: response.result.txid
      });
      
      return {
        orderId: response.result.txid,
        symbol,
        type,
        side: 'buy',
        volume,
        price,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to place Kraken buy order', {
        symbol,
        type,
        volume,
        price,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Place a sell order
   * @param {string} symbol - Trading pair symbol
   * @param {string} type - Order type (market, limit)
   * @param {string} volume - Order volume
   * @param {string} [price] - Order price (for limit orders)
   * @returns {Promise<Object>} Order result
   */
  async sellOrder(symbol, type, volume, price = null) {
    try {
      if (!this.enabled) {
        throw new Error('Kraken exchange adapter is not enabled');
      }
      
      if (!this.tradingEnabled) {
        logger.security('Trading is disabled for Kraken, simulating sell order', {
          symbol,
          type,
          volume,
          price
        });
        
        return {
          simulated: true,
          symbol,
          type,
          volume,
          price,
          timestamp: new Date().toISOString()
        };
      }
      
      const params = {
        pair: symbol,
        type: 'sell',
        ordertype: type,
        volume
      };
      
      if (type === 'limit' && price) {
        params.price = price;
      }
      
      const response = await this.client.api('AddOrder', params);
      
      logger.trading('Placed Kraken sell order', {
        symbol,
        type,
        volume,
        price,
        orderId: response.result.txid
      });
      
      return {
        orderId: response.result.txid,
        symbol,
        type,
        side: 'sell',
        volume,
        price,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to place Kraken sell order', {
        symbol,
        type,
        volume,
        price,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get order status
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Order status
   */
  async getOrderStatus(orderId) {
    try {
      if (!this.enabled) {
        throw new Error('Kraken exchange adapter is not enabled');
      }
      
      const response = await this.client.api('QueryOrders', {
        txid: orderId
      });
      
      logger.debug('Retrieved Kraken order status', { orderId });
      
      return response.result[orderId];
    } catch (error) {
      logger.error('Failed to get Kraken order status', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Cancel an order
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelOrder(orderId) {
    try {
      if (!this.enabled) {
        throw new Error('Kraken exchange adapter is not enabled');
      }
      
      if (!this.tradingEnabled) {
        logger.security('Trading is disabled for Kraken, simulating cancel order', {
          orderId
        });
        
        return {
          simulated: true,
          orderId,
          timestamp: new Date().toISOString()
        };
      }
      
      const response = await this.client.api('CancelOrder', {
        txid: orderId
      });
      
      logger.trading('Cancelled Kraken order', { orderId });
      
      return {
        success: response.result.count > 0,
        orderId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to cancel Kraken order', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get open orders
   * @returns {Promise<Array>} List of open orders
   */
  async getOpenOrders() {
    try {
      if (!this.enabled) {
        throw new Error('Kraken exchange adapter is not enabled');
      }
      
      const response = await this.client.api('OpenOrders');
      
      logger.debug('Retrieved Kraken open orders', {
        count: Object.keys(response.result.open).length
      });
      
      return response.result.open;
    } catch (error) {
      logger.error('Failed to get Kraken open orders', {
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get trading pairs
   * @returns {Promise<Array>} List of trading pairs
   */
  async getTradingPairs() {
    try {
      if (!this.enabled) {
        throw new Error('Kraken exchange adapter is not enabled');
      }
      
      const response = await this.client.api('AssetPairs');
      
      logger.debug('Retrieved Kraken trading pairs', {
        count: Object.keys(response.result).length
      });
      
      return response.result;
    } catch (error) {
      logger.error('Failed to get Kraken trading pairs', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new KrakenExchange();
