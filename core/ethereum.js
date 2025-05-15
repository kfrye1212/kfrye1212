/**
 * Ethereum module for the multi-chain trading bot
 * Handles Ethereum-specific functionality including token interactions
 */

const { ethers } = require('ethers');
const config = require('../core/config');
const logger = require('../utils/logger');

// Standard ERC20 ABI for token interactions
const ERC20_ABI = [
  // Read-only functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // Write functions
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

// Uniswap V2 Router ABI (partial, only what we need)
const UNISWAP_ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

// Uniswap V2 Factory ABI (partial)
const UNISWAP_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint)"
];

// Uniswap V2 Pair ABI (partial)
const UNISWAP_PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
];

// Common token addresses
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // Wrapped ETH on mainnet

class EthereumModule {
  constructor() {
    this.initialized = false;
    this.provider = null;
    this.wallet = null;
    this.uniswapRouter = null;
    this.uniswapFactory = null;
    
    // Contract addresses
    this.addresses = {
      uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2 Router
      uniswapFactory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // Uniswap V2 Factory
      weth: WETH_ADDRESS
    };
  }
  
  /**
   * Initialize the Ethereum module
   * @param {string} [providerUrl] - Ethereum provider URL (optional)
   * @param {string} [privateKey] - Private key for transactions (optional)
   * @returns {Promise<boolean>} Initialization success
   */
  async initialize(providerUrl = null, privateKey = null) {
    try {
      // Use provided provider URL or get from config
      const providerString = providerUrl || process.env.ETH_PROVIDER_URL;
      
      if (!providerString) {
        logger.error('Ethereum provider URL not configured');
        return false;
      }
      
      // Create provider
      this.provider = new ethers.providers.JsonRpcProvider(providerString);
      
      // Test provider connection
      const network = await this.provider.getNetwork();
      logger.info('Connected to Ethereum network', {
        chainId: network.chainId,
        name: network.name
      });
      
      // Set up wallet if private key is provided
      if (privateKey || process.env.ETH_PRIVATE_KEY) {
        const key = privateKey || process.env.ETH_PRIVATE_KEY;
        this.wallet = new ethers.Wallet(key, this.provider);
        const address = await this.wallet.getAddress();
        
        logger.info('Ethereum wallet initialized', {
          address,
          // Don't log the actual balance for security reasons
          hasBalance: 'Checking...'
        });
        
        // Check wallet balance
        const balance = await this.provider.getBalance(address);
        const etherBalance = ethers.utils.formatEther(balance);
        
        logger.info('Ethereum wallet balance', {
          etherBalance
        });
        
        if (balance.isZero()) {
          logger.warn('Ethereum wallet has zero balance');
        }
      } else {
        logger.warn('No Ethereum private key provided, read-only mode enabled');
      }
      
      // Initialize Uniswap contracts
      this.uniswapRouter = new ethers.Contract(
        this.addresses.uniswapRouter,
        UNISWAP_ROUTER_ABI,
        this.wallet || this.provider
      );
      
      this.uniswapFactory = new ethers.Contract(
        this.addresses.uniswapFactory,
        UNISWAP_FACTORY_ABI,
        this.wallet || this.provider
      );
      
      logger.info('Ethereum module initialized successfully');
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize Ethereum module', {
        error: error.message
      });
      return false;
    }
  }
  
  /**
   * Get token information
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<Object>} Token information
   */
  async getTokenInfo(tokenAddress) {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.provider
      );
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.totalSupply()
      ]);
      
      const tokenInfo = {
        address: tokenAddress,
        name,
        symbol,
        decimals,
        totalSupply: totalSupply.toString()
      };
      
      logger.debug('Retrieved token information', { tokenAddress });
      
      return tokenInfo;
    } catch (error) {
      logger.error('Failed to get token information', {
        tokenAddress,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get token balance
   * @param {string} tokenAddress - Token contract address
   * @param {string} [walletAddress] - Wallet address (defaults to connected wallet)
   * @returns {Promise<string>} Token balance
   */
  async getTokenBalance(tokenAddress, walletAddress = null) {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      const address = walletAddress || (this.wallet ? await this.wallet.getAddress() : null);
      
      if (!address) {
        throw new Error('No wallet address provided or available');
      }
      
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.provider
      );
      
      const balance = await tokenContract.balanceOf(address);
      const decimals = await tokenContract.decimals();
      
      const formattedBalance = ethers.utils.formatUnits(balance, decimals);
      
      logger.debug('Retrieved token balance', {
        tokenAddress,
        walletAddress: address,
        balance: formattedBalance
      });
      
      return formattedBalance;
    } catch (error) {
      logger.error('Failed to get token balance', {
        tokenAddress,
        walletAddress,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Check token allowance
   * @param {string} tokenAddress - Token contract address
   * @param {string} spenderAddress - Spender contract address
   * @param {string} [ownerAddress] - Owner address (defaults to connected wallet)
   * @returns {Promise<string>} Token allowance
   */
  async getTokenAllowance(tokenAddress, spenderAddress, ownerAddress = null) {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      const owner = ownerAddress || (this.wallet ? await this.wallet.getAddress() : null);
      
      if (!owner) {
        throw new Error('No owner address provided or available');
      }
      
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.provider
      );
      
      const allowance = await tokenContract.allowance(owner, spenderAddress);
      const decimals = await tokenContract.decimals();
      
      const formattedAllowance = ethers.utils.formatUnits(allowance, decimals);
      
      logger.debug('Retrieved token allowance', {
        tokenAddress,
        owner,
        spender: spenderAddress,
        allowance: formattedAllowance
      });
      
      return formattedAllowance;
    } catch (error) {
      logger.error('Failed to get token allowance', {
        tokenAddress,
        spenderAddress,
        ownerAddress,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Approve token spending
   * @param {string} tokenAddress - Token contract address
   * @param {string} spenderAddress - Spender contract address
   * @param {string} amount - Amount to approve (in token units)
   * @returns {Promise<Object>} Transaction receipt
   */
  async approveToken(tokenAddress, spenderAddress, amount) {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      if (!this.wallet) {
        throw new Error('No wallet available for transactions');
      }
      
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.wallet
      );
      
      const decimals = await tokenContract.decimals();
      const amountInWei = ethers.utils.parseUnits(amount, decimals);
      
      // Check current gas price
      const gasPrice = await this.provider.getGasPrice();
      const maxGasPrice = ethers.utils.parseUnits(
        config.get('trading.ethereum.maxGasPrice', '100'),
        'gwei'
      );
      
      if (gasPrice.gt(maxGasPrice)) {
        throw new Error(`Current gas price (${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei) exceeds maximum allowed (${ethers.utils.formatUnits(maxGasPrice, 'gwei')} gwei)`);
      }
      
      logger.trading('Approving token spending', {
        tokenAddress,
        spenderAddress,
        amount,
        gasPrice: ethers.utils.formatUnits(gasPrice, 'gwei')
      });
      
      const tx = await tokenContract.approve(spenderAddress, amountInWei, {
        gasPrice,
        gasLimit: 100000 // Standard gas limit for approve
      });
      
      logger.trading('Token approval transaction sent', {
        tokenAddress,
        spenderAddress,
        amount,
        txHash: tx.hash
      });
      
      const receipt = await tx.wait();
      
      logger.trading('Token approval confirmed', {
        tokenAddress,
        spenderAddress,
        amount,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      });
      
      return receipt;
    } catch (error) {
      logger.error('Failed to approve token', {
        tokenAddress,
        spenderAddress,
        amount,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Get token price from Uniswap
   * @param {string} tokenAddress - Token contract address
   * @param {string} [baseTokenAddress] - Base token address (defaults to WETH)
   * @param {string} [amountIn] - Input amount (defaults to 1 token)
   * @returns {Promise<string>} Token price in base token
   */
  async getTokenPrice(tokenAddress, baseTokenAddress = WETH_ADDRESS, amountIn = '1') {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.provider
      );
      
      const decimals = await tokenContract.decimals();
      const amountInWei = ethers.utils.parseUnits(amountIn, decimals);
      
      // Get price from Uniswap
      const path = [tokenAddress, baseTokenAddress];
      const amounts = await this.uniswapRouter.getAmountsOut(amountInWei, path);
      
      // Format the output amount
      const baseTokenContract = new ethers.Contract(
        baseTokenAddress,
        ERC20_ABI,
        this.provider
      );
      
      const baseDecimals = await baseTokenContract.decimals();
      const price = ethers.utils.formatUnits(amounts[1], baseDecimals);
      
      logger.debug('Retrieved token price from Uniswap', {
        tokenAddress,
        baseTokenAddress,
        price
      });
      
      return price;
    } catch (error) {
      logger.error('Failed to get token price', {
        tokenAddress,
        baseTokenAddress,
        error: error.message
      });
      
      // Return zero if price cannot be determined
      return '0';
    }
  }
  
  /**
   * Check if a token pair exists on Uniswap
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<boolean>} Whether the pair exists
   */
  async checkPairExists(tokenA, tokenB) {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      const pairAddress = await this.uniswapFactory.getPair(tokenA, tokenB);
      
      // If pair address is zero address, pair doesn't exist
      const exists = pairAddress !== ethers.constants.AddressZero;
      
      logger.debug('Checked Uniswap pair existence', {
        tokenA,
        tokenB,
        exists,
        pairAddress: exists ? pairAddress : 'Not exists'
      });
      
      return exists;
    } catch (error) {
      logger.error('Failed to check pair existence', {
        tokenA,
        tokenB,
        error: error.message
      });
      return false;
    }
  }
  
  /**
   * Get liquidity information for a token pair
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<Object>} Liquidity information
   */
  async getPairLiquidity(tokenA, tokenB) {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      // Get pair address
      const pairAddress = await this.uniswapFactory.getPair(tokenA, tokenB);
      
      if (pairAddress === ethers.constants.AddressZero) {
        return {
          exists: false,
          liquidity: '0',
          tokenAReserve: '0',
          tokenBReserve: '0'
        };
      }
      
      // Create pair contract
      const pairContract = new ethers.Contract(
        pairAddress,
        UNISWAP_PAIR_ABI,
        this.provider
      );
      
      // Get token addresses from pair (to determine order)
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();
      
      // Get reserves
      const [reserve0, reserve1] = await pairContract.getReserves();
      
      // Get token decimals
      const token0Contract = new ethers.Contract(token0, ERC20_ABI, this.provider);
      const token1Contract = new ethers.Contract(token1, ERC20_ABI, this.provider);
      
      const decimals0 = await token0Contract.decimals();
      const decimals1 = await token1Contract.decimals();
      
      // Format reserves
      const reserve0Formatted = ethers.utils.formatUnits(reserve0, decimals0);
      const reserve1Formatted = ethers.utils.formatUnits(reserve1, decimals1);
      
      // Determine which reserve is which token
      let tokenAReserve, tokenBReserve;
      
      if (token0.toLowerCase() === tokenA.toLowerCase()) {
        tokenAReserve = reserve0Formatted;
        tokenBReserve = reserve1Formatted;
      } else {
        tokenAReserve = reserve1Formatted;
        tokenBReserve = reserve0Formatted;
      }
      
      // If one of the tokens is WETH, calculate USD liquidity
      let liquidityUSD = '0';
      
      if (tokenA.toLowerCase() === WETH_ADDRESS.toLowerCase() || 
          tokenB.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
        
        const ethPrice = await this.getEthPrice();
        
        if (tokenA.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
          liquidityUSD = (parseFloat(tokenAReserve) * parseFloat(ethPrice) * 2).toString();
        } else {
          liquidityUSD = (parseFloat(tokenBReserve) * parseFloat(ethPrice) * 2).toString();
        }
      }
      
      const result = {
        exists: true,
        pairAddress,
        tokenAReserve,
        tokenBReserve,
        liquidityUSD
      };
      
      logger.debug('Retrieved pair liquidity', {
        tokenA,
        tokenB,
        pairAddress,
        liquidityUSD
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to get pair liquidity', {
        tokenA,
        tokenB,
        error: error.message
      });
      
      return {
        exists: false,
        liquidity: '0',
        tokenAReserve: '0',
        tokenBReserve: '0',
        error: error.message
      };
    }
  }
  
  /**
   * Get ETH price in USD
   * @returns {Promise<string>} ETH price in USD
   */
  async getEthPrice() {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      // Use a stablecoin pair to determine ETH price
      // USDC is a common stablecoin with good liquidity
      const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      
      // Get price from Uniswap
      const path = [WETH_ADDRESS, USDC_ADDRESS];
      const amounts = await this.uniswapRouter.getAmountsOut(
        ethers.utils.parseEther('1'), // 1 ETH
        path
      );
      
      // USDC has 6 decimals
      const ethPrice = ethers.utils.formatUnits(amounts[1], 6);
      
      logger.debug('Retrieved ETH price', { ethPrice });
      
      return ethPrice;
    } catch (error) {
      logger.error('Failed to get ETH price', { error: error.message });
      
      // Return a default price if unable to fetch
      // This is not ideal but prevents complete failure
      return '1800';
    }
  }
  
  /**
   * Swap tokens on Uniswap
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @param {string} amountIn - Input amount (in token units)
   * @param {number} slippagePercent - Maximum slippage percentage
   * @returns {Promise<Object>} Transaction receipt
   */
  async swapTokens(tokenIn, tokenOut, amountIn, slippagePercent = 1) {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      if (!this.wallet) {
        throw new Error('No wallet available for transactions');
      }
      
      // Check if trading is enabled
      const tradingEnabled = config.get('exchanges.ethereum.tradingEnabled', false);
      
      if (!tradingEnabled) {
        logger.security('Ethereum trading is disabled, simulating swap', {
          tokenIn,
          tokenOut,
          amountIn,
          slippagePercent
        });
        
        return {
          simulated: true,
          tokenIn,
          tokenOut,
          amountIn,
          timestamp: new Date().toISOString()
        };
      }
      
      // Get token details
      const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, this.provider);
      const decimalsIn = await tokenInContract.decimals();
      const amountInWei = ethers.utils.parseUnits(amountIn, decimalsIn);
      
      // Check allowance if not ETH
      if (tokenIn !== WETH_ADDRESS) {
        const walletAddress = await this.wallet.getAddress();
        const allowance = await tokenInContract.allowance(
          walletAddress,
          this.addresses.uniswapRouter
        );
        
        if (allowance.lt(amountInWei)) {
          logger.trading('Insufficient allowance, approving tokens', {
            tokenIn,
            amountIn,
            currentAllowance: ethers.utils.formatUnits(allowance, decimalsIn)
          });
          
          await this.approveToken(
            tokenIn,
            this.addresses.uniswapRouter,
            amountIn
          );
        }
      }
      
      // Get expected output amount
      const path = [tokenIn, tokenOut];
      const amounts = await this.uniswapRouter.getAmountsOut(amountInWei, path);
      const expectedOut = amounts[1];
      
      // Calculate minimum output with slippage
      const slippageFactor = 1 - (slippagePercent / 100);
      const minOut = expectedOut.mul(Math.floor(slippageFactor * 1000)).div(1000);
      
      // Set deadline to 20 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      
      // Check current gas price
      const gasPrice = await this.provider.getGasPrice();
      const maxGasPrice = ethers.utils.parseUnits(
        config.get('trading.ethereum.maxGasPrice', '100'),
        'gwei'
      );
      
      if (gasPrice.gt(maxGasPrice)) {
        throw new Error(`Current gas price (${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei) exceeds maximum allowed (${ethers.utils.formatUnits(maxGasPrice, 'gwei')} gwei)`);
      }
      
      // Prepare transaction parameters
      const txParams = {
        gasPrice,
        gasLimit: 300000 // Higher gas limit for swaps
      };
      
      let tx;
      
      // Execute the swap
      if (tokenIn === WETH_ADDRESS) {
        // ETH -> Token
        logger.trading('Swapping ETH for tokens', {
          amountIn,
          tokenOut,
          expectedOut: ethers.utils.formatEther(expectedOut),
          minOut: ethers.utils.formatEther(minOut),
          slippagePercent
        });
        
        txParams.value = amountInWei;
        
        tx = await this.uniswapRouter.swapExactETHForTokens(
          minOut,
          path,
          await this.wallet.getAddress(),
          deadline,
          txParams
        );
      } else if (tokenOut === WETH_ADDRESS) {
        // Token -> ETH
        logger.trading('Swapping tokens for ETH', {
          tokenIn,
          amountIn,
          expectedOut: ethers.utils.formatEther(expectedOut),
          minOut: ethers.utils.formatEther(minOut),
          slippagePercent
        });
        
        tx = await this.uniswapRouter.swapExactTokensForETH(
          amountInWei,
          minOut,
          path,
          await this.wallet.getAddress(),
          deadline,
          txParams
        );
      } else {
        // Token -> Token
        logger.trading('Swapping tokens for tokens', {
          tokenIn,
          tokenOut,
          amountIn,
          expectedOut: ethers.utils.formatEther(expectedOut),
          minOut: ethers.utils.formatEther(minOut),
          slippagePercent
        });
        
        tx = await this.uniswapRouter.swapExactTokensForTokens(
          amountInWei,
          minOut,
          path,
          await this.wallet.getAddress(),
          deadline,
          txParams
        );
      }
      
      logger.trading('Swap transaction sent', {
        txHash: tx.hash
      });
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      logger.trading('Swap confirmed', {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      });
      
      return receipt;
    } catch (error) {
      logger.error('Failed to swap tokens', {
        tokenIn,
        tokenOut,
        amountIn,
        slippagePercent,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Listen for new liquidity pairs on Uniswap
   * @param {Function} callback - Callback function for new pairs
   * @returns {Object} Listener object
   */
  listenForNewPairs(callback) {
    try {
      if (!this.initialized) {
        throw new Error('Ethereum module not initialized');
      }
      
      logger.info('Starting to listen for new Uniswap pairs');
      
      // Listen for PairCreated events
      const filter = this.uniswapFactory.filters.PairCreated();
      
      this.uniswapFactory.on(filter, async (token0, token1, pairAddress, event) => {
        try {
          logger.info('New Uniswap pair detected', {
            token0,
            token1,
            pairAddress
          });
          
          // Get token information
          const [token0Info, token1Info] = await Promise.all([
            this.getTokenInfo(token0),
            this.getTokenInfo(token1)
          ]);
          
          // Get liquidity information
          const liquidityInfo = await this.getPairLiquidity(token0, token1);
          
          // Check if one of the tokens is WETH
          const hasEth = token0.toLowerCase() === WETH_ADDRESS.toLowerCase() || 
                         token1.toLowerCase() === WETH_ADDRESS.toLowerCase();
          
          // Prepare pair data
          const pairData = {
            pairAddress,
            token0: {
              address: token0,
              ...token0Info
            },
            token1: {
              address: token1,
              ...token1Info
            },
            liquidity: liquidityInfo,
            hasEth,
            timestamp: new Date().toISOString(),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash
          };
          
          // Call the callback with the pair data
          callback(pairData);
        } catch (error) {
          logger.error('Error processing new pair', {
            token0,
            token1,
            pairAddress,
            error: error.message
          });
        }
      });
      
      logger.info('Listening for new Uniswap pairs');
      
      return {
        stop: () => {
          this.uniswapFactory.removeAllListeners(filter);
          logger.info('Stopped listening for new Uniswap pairs');
        }
      };
    } catch (error) {
      logger.error('Failed to set up pair listener', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new EthereumModule();
