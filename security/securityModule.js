/**
 * Security module for the multi-chain trading bot
 * Implements comprehensive security features to protect user funds and trading operations
 */

const crypto = require('crypto');
const config = require('../core/config');
const logger = require('../utils/logger');

class SecurityModule {
  constructor() {
    this.initialized = false;
    this.ipWhitelist = config.get('security.ipWhitelist', []);
    this.maxLoginAttempts = config.get('security.maxLoginAttempts', 5);
    this.loginAttempts = {};
    this.apiKeyRotationDays = config.get('security.apiKeyRotationDays', 30);
    this.lastApiKeyRotation = null;
    this.suspiciousActivities = [];
    this.transactionLimits = {
      ethereum: {
        maxTransactionAmount: config.get('trading.ethereum.maxTransactionAmount', '1'),
        dailyLimit: config.get('trading.ethereum.dailyLimit', '5')
      },
      bitcoin: {
        maxTransactionAmount: config.get('trading.bitcoin.maxTransactionAmount', '0.1'),
        dailyLimit: config.get('trading.bitcoin.dailyLimit', '0.5')
      },
      solana: {
        maxTransactionAmount: config.get('trading.solana.maxTransactionAmount', '20'),
        dailyLimit: config.get('trading.solana.dailyLimit', '100')
      }
    };
    this.dailyTransactions = {
      ethereum: { total: '0', count: 0, transactions: [] },
      bitcoin: { total: '0', count: 0, transactions: [] },
      solana: { total: '0', count: 0, transactions: [] }
    };
  }

  /**
   * Initialize the security module
   * @returns {Promise<boolean>} Initialization success
   */
  async initialize() {
    try {
      logger.info('Initializing security module');
      
      // Set up daily transaction reset
      this.setupDailyReset();
      
      // Set up API key rotation reminder
      this.setupApiKeyRotationCheck();
      
      this.initialized = true;
      logger.info('Security module initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize security module', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Set up daily transaction reset
   */
  setupDailyReset() {
    // Reset daily transaction counters at midnight
    const resetDaily = () => {
      const now = new Date();
      const night = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // tomorrow
        0, 0, 0 // midnight
      );
      const msToMidnight = night.getTime() - now.getTime();
      
      setTimeout(() => {
        this.resetDailyTransactions();
        resetDaily(); // Set up next day's reset
      }, msToMidnight);
    };
    
    resetDaily();
    logger.info('Daily transaction reset scheduled');
  }

  /**
   * Reset daily transaction counters
   */
  resetDailyTransactions() {
    this.dailyTransactions = {
      ethereum: { total: '0', count: 0, transactions: [] },
      bitcoin: { total: '0', count: 0, transactions: [] },
      solana: { total: '0', count: 0, transactions: [] }
    };
    
    logger.info('Daily transaction counters reset');
  }

  /**
   * Set up API key rotation check
   */
  setupApiKeyRotationCheck() {
    // Check if API keys need rotation
    const checkApiKeyRotation = () => {
      if (!this.lastApiKeyRotation) {
        // If no rotation recorded, set to now
        this.lastApiKeyRotation = new Date();
        logger.info('API key rotation timestamp initialized');
      } else {
        const now = new Date();
        const daysSinceRotation = Math.floor(
          (now - this.lastApiKeyRotation) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceRotation >= this.apiKeyRotationDays) {
          logger.security('API keys should be rotated', {
            daysSinceRotation,
            rotationRecommendedAfterDays: this.apiKeyRotationDays
          });
          
          // In a real implementation, you might send an alert to the user
        }
      }
      
      // Check again in 24 hours
      setTimeout(checkApiKeyRotation, 24 * 60 * 60 * 1000);
    };
    
    checkApiKeyRotation();
    logger.info('API key rotation check scheduled');
  }

  /**
   * Validate IP address against whitelist
   * @param {string} ipAddress - IP address to validate
   * @returns {boolean} Whether the IP is allowed
   */
  validateIpAddress(ipAddress) {
    // If whitelist is empty, allow all IPs
    if (this.ipWhitelist.length === 0) {
      return true;
    }
    
    const isAllowed = this.ipWhitelist.includes(ipAddress);
    
    if (!isAllowed) {
      logger.security('Access attempt from unauthorized IP', { ipAddress });
    }
    
    return isAllowed;
  }

  /**
   * Track login attempt
   * @param {string} username - Username
   * @param {string} ipAddress - IP address
   * @param {boolean} success - Whether the login was successful
   * @returns {boolean} Whether further login attempts are allowed
   */
  trackLoginAttempt(username, ipAddress, success) {
    const key = `${username}:${ipAddress}`;
    
    if (!this.loginAttempts[key]) {
      this.loginAttempts[key] = {
        count: 0,
        lastAttempt: new Date(),
        blocked: false
      };
    }
    
    const attempt = this.loginAttempts[key];
    
    // Reset count after 30 minutes
    const now = new Date();
    const timeSinceLastAttempt = now - attempt.lastAttempt;
    if (timeSinceLastAttempt > 30 * 60 * 1000) {
      attempt.count = 0;
      attempt.blocked = false;
    }
    
    attempt.lastAttempt = now;
    
    if (success) {
      // Reset count on successful login
      attempt.count = 0;
      attempt.blocked = false;
      return true;
    } else {
      // Increment count on failed login
      attempt.count++;
      
      if (attempt.count >= this.maxLoginAttempts) {
        attempt.blocked = true;
        logger.security('Account blocked due to too many failed login attempts', {
          username,
          ipAddress,
          attempts: attempt.count
        });
      }
      
      return !attempt.blocked;
    }
  }

  /**
   * Validate transaction against security limits
   * @param {string} chain - Chain name (ethereum, bitcoin, solana)
   * @param {string} amount - Transaction amount
   * @param {string} type - Transaction type (buy, sell, swap)
   * @returns {Object} Validation result
   */
  validateTransaction(chain, amount, type) {
    try {
      if (!this.initialized) {
        throw new Error('Security module not initialized');
      }
      
      if (!this.transactionLimits[chain]) {
        throw new Error(`Unknown chain: ${chain}`);
      }
      
      const limits = this.transactionLimits[chain];
      const daily = this.dailyTransactions[chain];
      
      // Check transaction amount limit
      if (parseFloat(amount) > parseFloat(limits.maxTransactionAmount)) {
        logger.security('Transaction exceeds maximum amount', {
          chain,
          amount,
          maxAmount: limits.maxTransactionAmount,
          type
        });
        
        return {
          valid: false,
          reason: 'Transaction amount exceeds maximum allowed'
        };
      }
      
      // Check daily limit
      const newTotal = parseFloat(daily.total) + parseFloat(amount);
      if (newTotal > parseFloat(limits.dailyLimit)) {
        logger.security('Transaction would exceed daily limit', {
          chain,
          amount,
          currentTotal: daily.total,
          newTotal: newTotal.toString(),
          dailyLimit: limits.dailyLimit,
          type
        });
        
        return {
          valid: false,
          reason: 'Transaction would exceed daily limit'
        };
      }
      
      // Transaction is valid, update daily counters
      daily.total = newTotal.toString();
      daily.count++;
      daily.transactions.push({
        amount,
        type,
        timestamp: new Date().toISOString()
      });
      
      logger.debug('Transaction validated', {
        chain,
        amount,
        type,
        dailyTotal: daily.total,
        dailyCount: daily.count
      });
      
      return {
        valid: true
      };
    } catch (error) {
      logger.error('Error validating transaction', {
        chain,
        amount,
        type,
        error: error.message
      });
      
      return {
        valid: false,
        reason: `Error: ${error.message}`
      };
    }
  }

  /**
   * Detect suspicious activity in trading patterns
   * @param {Array} transactions - Recent transactions to analyze
   * @returns {Array} Detected suspicious activities
   */
  detectSuspiciousActivity(transactions) {
    try {
      if (!this.initialized) {
        throw new Error('Security module not initialized');
      }
      
      const suspicious = [];
      
      // Check for rapid succession of transactions
      if (transactions.length >= 5) {
        const last5 = transactions.slice(-5);
        const timestamps = last5.map(tx => new Date(tx.timestamp).getTime());
        
        // Calculate time differences between consecutive transactions
        const timeDiffs = [];
        for (let i = 1; i < timestamps.length; i++) {
          timeDiffs.push(timestamps[i] - timestamps[i-1]);
        }
        
        // If average time difference is less than 10 seconds, flag as suspicious
        const avgTimeDiff = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;
        if (avgTimeDiff < 10000) {
          const activity = {
            type: 'rapid-transactions',
            transactions: last5,
            avgTimeDiffSeconds: avgTimeDiff / 1000,
            timestamp: new Date().toISOString()
          };
          
          suspicious.push(activity);
          this.suspiciousActivities.push(activity);
          
          logger.security('Detected suspicious activity: rapid transactions', {
            avgTimeDiffSeconds: avgTimeDiff / 1000,
            transactionCount: last5.length
          });
        }
      }
      
      // Check for unusual transaction amounts
      const amounts = transactions.map(tx => parseFloat(tx.amount));
      if (amounts.length > 0) {
        const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
        
        // Look for transactions that are 5x the average
        const unusualTransactions = transactions.filter(tx => 
          parseFloat(tx.amount) > avgAmount * 5
        );
        
        if (unusualTransactions.length > 0) {
          const activity = {
            type: 'unusual-amounts',
            transactions: unusualTransactions,
            avgAmount,
            timestamp: new Date().toISOString()
          };
          
          suspicious.push(activity);
          this.suspiciousActivities.push(activity);
          
          logger.security('Detected suspicious activity: unusual transaction amounts', {
            unusualTransactions: unusualTransactions.length,
            avgAmount
          });
        }
      }
      
      return suspicious;
    } catch (error) {
      logger.error('Error detecting suspicious activity', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Validate a token contract for security issues
   * @param {string} chain - Chain name (ethereum, solana)
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<Object>} Validation result
   */
  async validateTokenContract(chain, tokenAddress) {
    try {
      if (!this.initialized) {
        throw new Error('Security module not initialized');
      }
      
      logger.info('Validating token contract', {
        chain,
        tokenAddress
      });
      
      // In a real implementation, you would perform thorough contract analysis
      // For this prototype, we'll simulate the validation
      
      // Simulate token validation
      const validationResult = {
        valid: Math.random() > 0.2, // 80% chance of being valid
        issues: []
      };
      
      if (!validationResult.valid) {
        // Simulate potential issues
        const possibleIssues = [
          'Honeypot detection: Cannot sell tokens',
          'Ownership not renounced',
          'Hidden mint function',
          'Fee manipulation capability',
          'Blacklist function detected'
        ];
        
        // Add 1-3 random issues
        const issueCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < issueCount; i++) {
          const issueIndex = Math.floor(Math.random() * possibleIssues.length);
          validationResult.issues.push(possibleIssues[issueIndex]);
        }
        
        logger.security('Token contract validation failed', {
          chain,
          tokenAddress,
          issues: validationResult.issues
        });
      } else {
        logger.info('Token contract validation passed', {
          chain,
          tokenAddress
        });
      }
      
      return validationResult;
    } catch (error) {
      logger.error('Error validating token contract', {
        chain,
        tokenAddress,
        error: error.message
      });
      
      return {
        valid: false,
        issues: [`Error: ${error.message}`]
      };
    }
  }

  /**
   * Generate a secure hash of data
   * @param {string} data - Data to hash
   * @returns {string} Secure hash
   */
  generateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Encrypt sensitive data
   * @param {string} data - Data to encrypt
   * @param {string} key - Encryption key
   * @returns {string} Encrypted data
   */
  encryptData(data, key) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        crypto.createHash('sha256').update(key).digest(),
        iv
      );
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('Error encrypting data', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedData - Data to decrypt
   * @param {string} key - Encryption key
   * @returns {string} Decrypted data
   */
  decryptData(encryptedData, key) {
    try {
      const [ivHex, encrypted] = encryptedData.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        crypto.createHash('sha256').update(key).digest(),
        iv
      );
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Error decrypting data', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate API key permissions
   * @param {string} exchange - Exchange name
   * @param {Object} permissions - API key permissions
   * @returns {Object} Validation result
   */
  validateApiKeyPermissions(exchange, permissions) {
    try {
      if (!this.initialized) {
        throw new Error('Security module not initialized');
      }
      
      logger.info('Validating API key permissions', { exchange });
      
      // Check for withdrawal permission (should be disabled for security)
      if (permissions.withdrawal) {
        logger.security('API key has withdrawal permission, this is a security risk', {
          exchange
        });
        
        return {
          valid: false,
          reason: 'API key has withdrawal permission, which is a security risk'
        };
      }
      
      // Ensure trading permission is enabled if needed
      const tradingEnabled = config.get(`exchanges.${exchange}.tradingEnabled`, false);
      
      if (tradingEnabled && !permissions.trading) {
        logger.warn('Trading is enabled but API key lacks trading permission', {
          exchange
        });
        
        return {
          valid: false,
          reason: 'API key lacks trading permission'
        };
      }
      
      logger.info('API key permissions validated successfully', {
        exchange,
        permissions
      });
      
      return {
        valid: true,
        permissions
      };
    } catch (error) {
      logger.error('Error validating API key permissions', {
        exchange,
        error: error.message
      });
      
      return {
        valid: false,
        reason: `Error: ${error.message}`
      };
    }
  }

  /**
   * Get security status report
   * @returns {Object} Security status report
   */
  getSecurityReport() {
    return {
      initialized: this.initialized,
      ipWhitelistEnabled: this.ipWhitelist.length > 0,
      ipWhitelistCount: this.ipWhitelist.length,
      suspiciousActivitiesCount: this.suspiciousActivities.length,
      recentSuspiciousActivities: this.suspiciousActivities.slice(-5),
      transactionLimits: this.transactionLimits,
      dailyTransactions: {
        ethereum: {
          count: this.dailyTransactions.ethereum.count,
          total: this.dailyTransactions.ethereum.total
        },
        bitcoin: {
          count: this.dailyTransactions.bitcoin.count,
          total: this.dailyTransactions.bitcoin.total
        },
        solana: {
          count: this.dailyTransactions.solana.count,
          total: this.dailyTransactions.solana.total
        }
      },
      apiKeyRotationDays: this.apiKeyRotationDays,
      daysSinceLastRotation: this.lastApiKeyRotation ? 
        Math.floor((new Date() - this.lastApiKeyRotation) / (1000 * 60 * 60 * 24)) : 
        null
    };
  }
}

module.exports = new SecurityModule();
