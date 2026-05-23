require('dotenv').config();
const path = require('path');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..', '..');

function checksumAddress(address) {
  if (!address) {
    return address;
  }
  return ethers.getAddress(address.toLowerCase());
}

const config = {
  privateKey: process.env.PRIVATE_KEY || '',
  bscRpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
  bscRpcFallbacks: (process.env.BSC_RPC_FALLBACKS || [
    'https://bsc-dataseed1.binance.org/',
    'https://bsc-dataseed2.binance.org/',
    'https://bsc.publicnode.com',
  ].join(',')).split(',').map((url) => url.trim()).filter(Boolean),
  tokenAddress: checksumAddress(process.env.TOKEN_ADDRESS || '0x1dF5b60a0045c2b8221ADAa3a982778157E70749'),
  bscscanApiKey: process.env.BSCSCAN_API_KEY || '',
  dryRun: String(process.env.DRY_RUN || 'false').toLowerCase() === 'true',

  maxWalletsPerDay: parseInt(process.env.MAX_WALLETS_PER_DAY || '100', 10),
  maxWalletsPerHour: parseInt(process.env.MAX_WALLETS_PER_HOUR || '10', 10),
  minBnbBalance: parseFloat(process.env.MIN_BNB_BALANCE || '0.005'),
  retryLimit: parseInt(process.env.RETRY_LIMIT || '3', 10),
  scanBlockRange: parseInt(process.env.SCAN_BLOCK_RANGE || '200', 10),

  minDelayMs: 15_000,
  maxDelayMs: 35_000,

  distributionAmounts: [0.1, 0.2, 0.4, 0.5, 0.8, 1.4, 1.7, 2.0],

  paths: {
    root: ROOT,
    data: path.join(ROOT, 'data'),
    logs: path.join(ROOT, 'logs'),
    walletsCsv: path.join(ROOT, 'data', 'wallets.csv'),
    processed: path.join(ROOT, 'data', 'processed.json'),
    rateLimits: path.join(ROOT, 'data', 'rate-limits.json'),
    walletCache: path.join(ROOT, 'data', 'wallet-cache.json'),
    blacklist: path.join(ROOT, 'data', 'blacklist.json'),
    txLog: path.join(ROOT, 'logs', 'transactions.log'),
  },

  contracts: {
    pancakeRouterV2: checksumAddress('0x10ED43C718714eb63d5aA57B78B54704E256024E'),
    pancakeFactoryV2: checksumAddress('0xCA143Ce32Fe78f1f7019d7d551a6402f9C67C2b0'),
    wbnb: checksumAddress('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'),
  },

  // Known meme / AI token contracts used to identify active traders (research signals)
  watchTokens: [
    checksumAddress('0x1dF5b60a0045c2b8221ADAa3a982778157E70749'), // MGPT
    checksumAddress('0xfb5B838b6cfEEdC2873aB27866079A703763a729'), // FLOKI
    checksumAddress('0xc748673057861a2592757C92d0b3957c4355af44'), // Baby Doge
    checksumAddress('0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'), // CAKE
    checksumAddress('0x2170Ed0880ac9A755fd29B2688956BD959F933F8'), // ETH
    checksumAddress('0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'), // BTCB
  ],

  erc20Abi: [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ],

  pancakePairAbi: [
    'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
  ],
};

function validateConfig(requirePrivateKey = false) {
  const errors = [];

  if (!config.bscRpcUrl) {
    errors.push('BSC_RPC_URL is required');
  }

  if (requirePrivateKey && !config.privateKey) {
    errors.push('PRIVATE_KEY is required for sending transactions');
  }

  if (config.tokenAddress && !/^0x[a-fA-F0-9]{40}$/.test(config.tokenAddress)) {
    errors.push('TOKEN_ADDRESS must be a valid Ethereum address');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration error:\n- ${errors.join('\n- ')}`);
  }

  return config;
}

module.exports = { config, validateConfig };
