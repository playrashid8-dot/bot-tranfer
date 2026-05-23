const { ethers } = require('ethers');
const { config } = require('../utils/config');
const { logInfo, logWarn } = require('../utils/logger');
const { getLogsInChunks } = require('../utils/rpcLogs');

const SWAP_TOPIC = ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)');
const ZERO_ADDRESS = ethers.ZeroAddress;

function isValidPairAddress(pair) {
  if (!pair) {
    return false;
  }
  try {
    const normalized = ethers.getAddress(pair);
    return normalized !== ZERO_ADDRESS;
  } catch {
    return false;
  }
}

async function getPairAddress(provider, tokenA, tokenB) {
  if (config.pairAddress && isValidPairAddress(config.pairAddress)) {
    logInfo('Using PAIR_ADDRESS override from environment', { pair: config.pairAddress });
    return config.pairAddress;
  }

  try {
    const factory = new ethers.Contract(
      config.contracts.pancakeFactoryV2,
      ['function getPair(address tokenA, address tokenB) external view returns (address pair)'],
      provider
    );

    const pair = await factory.getPair(tokenA, tokenB);
    if (!isValidPairAddress(pair)) {
      logWarn('PancakeSwap getPair returned empty — pair scan skipped, BSC scan continues', {
        tokenA,
        tokenB,
        hint: 'Set PAIR_ADDRESS in .env to scan a specific pair',
      });
      return null;
    }

    return ethers.getAddress(pair);
  } catch (error) {
    logWarn('PancakeSwap pair lookup failed — continuing without pair scan', {
      tokenA,
      tokenB,
      error: error.message,
      hint: 'Set PAIR_ADDRESS in .env to bypass factory lookup',
    });
    return null;
  }
}

async function scanPancakeSwapActivity(provider, options = {}) {
  const blockRange = options.blockRange || config.scanBlockRange;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - blockRange);

  const pair = await getPairAddress(provider, config.tokenAddress, config.contracts.wbnb);
  if (!pair) {
    return { wallets: [], fromBlock, toBlock: latestBlock, pair: null };
  }

  try {
    logInfo('Scanning PancakeSwap pair swaps', { pair, fromBlock, toBlock: latestBlock });

    const logs = await getLogsInChunks(provider, {
      address: pair,
      topics: [SWAP_TOPIC],
      fromBlock,
      toBlock: latestBlock,
    }, { chunkSize: 500, pauseMs: 500 });

    const wallets = new Set();

    for (const log of logs) {
      if (log.topics.length < 3) {
        continue;
      }

      const trader = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
      const recipient = ethers.getAddress(`0x${log.topics[2].slice(26)}`);

      wallets.add(trader);
      wallets.add(recipient);
    }

    logInfo('PancakeSwap scan complete', { pair, swapWallets: wallets.size });

    return {
      wallets: [...wallets],
      fromBlock,
      toBlock: latestBlock,
      pair,
    };
  } catch (error) {
    logWarn('PancakeSwap swap log scan failed — BSC scan results preserved', {
      pair,
      error: error.message,
    });
    return { wallets: [], fromBlock, toBlock: latestBlock, pair };
  }
}

module.exports = {
  scanPancakeSwapActivity,
  getPairAddress,
};
