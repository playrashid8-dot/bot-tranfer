const { ethers } = require('ethers');
const { config } = require('../utils/config');
const { logInfo } = require('../utils/logger');
const { getLogsInChunks } = require('../utils/rpcLogs');

const SWAP_TOPIC = ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)');

async function getPairAddress(provider, tokenA, tokenB) {
  const factory = new ethers.Contract(
    config.contracts.pancakeFactoryV2,
    ['function getPair(address tokenA, address tokenB) external view returns (address pair)'],
    provider
  );

  const pair = await factory.getPair(tokenA, tokenB);
  if (!pair || pair === ethers.ZeroAddress) {
    return null;
  }

  return pair;
}

async function scanPancakeSwapActivity(provider, options = {}) {
  const blockRange = options.blockRange || config.scanBlockRange;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - blockRange);

  try {
    const pair = await getPairAddress(provider, config.tokenAddress, config.contracts.wbnb);
    if (!pair) {
      logInfo('MGPT/WBNB PancakeSwap pair not found — skipping pair scan');
      return { wallets: [], fromBlock, toBlock: latestBlock, pair: null };
    }

    logInfo('Scanning PancakeSwap pair swaps', { pair, fromBlock, toBlock: latestBlock });

    const logs = await getLogsInChunks(provider, {
      address: pair,
      topics: [SWAP_TOPIC],
      fromBlock,
      toBlock: latestBlock,
    }, { chunkSize: 500, pauseMs: 500 });

    const wallets = new Set();

    for (const log of logs) {
      const trader = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
      const recipient = ethers.getAddress(`0x${log.topics[2].slice(26)}`);

      wallets.add(trader);
      wallets.add(recipient);
    }

    return {
      wallets: [...wallets],
      fromBlock,
      toBlock: latestBlock,
      pair,
    };
  } catch (error) {
    logInfo('PancakeSwap scan skipped due to RPC or pair lookup error', {
      error: error.message,
    });
    return { wallets: [], fromBlock, toBlock: latestBlock, pair: null };
  }
}

module.exports = {
  scanPancakeSwapActivity,
  getPairAddress,
};
