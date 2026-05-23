const axios = require('axios');
const { ethers } = require('ethers');
const { config } = require('../utils/config');
const { logInfo, logWarn } = require('../utils/logger');
const { getLogsInChunks } = require('../utils/rpcLogs');

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

function createActivityEntry() {
  return {
    transfers: 0,
    tokens: new Set(),
  };
}

function recordWalletActivity(activityMap, wallet, tokenAddress) {
  const checksum = ethers.getAddress(wallet);
  const current = activityMap.get(checksum) || createActivityEntry();
  current.transfers += 1;
  current.tokens.add(tokenAddress);
  activityMap.set(checksum, current);
}

async function fetchRecentTokenTransfersViaRpc(provider, tokenAddress, fromBlock, toBlock) {
  const logs = await getLogsInChunks(provider, {
    address: tokenAddress,
    topics: [TRANSFER_TOPIC],
    fromBlock,
    toBlock,
  }, { chunkSize: 500, pauseMs: 500 });

  const wallets = new Set();
  const activity = new Map();

  for (const log of logs) {
    const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
    const to = ethers.getAddress(`0x${log.topics[2].slice(26)}`);

    wallets.add(from);
    wallets.add(to);
    recordWalletActivity(activity, from, tokenAddress);
    recordWalletActivity(activity, to, tokenAddress);
  }

  return { wallets: [...wallets], activity };
}

async function fetchRecentTransactionsBscScan(address, page = 1, offset = 100) {
  if (!config.bscscanApiKey) {
    return { wallets: [], activity: new Map() };
  }

  const url = 'https://api.bscscan.com/api';
  const params = {
    module: 'account',
    action: 'tokentx',
    contractaddress: address,
    page,
    offset,
    sort: 'desc',
    apikey: config.bscscanApiKey,
  };

  try {
    const { data } = await axios.get(url, { params, timeout: 15000 });
    if (data.status !== '1' || !Array.isArray(data.result)) {
      return { wallets: [], activity: new Map() };
    }

    const wallets = new Set();
    const activity = new Map();

    for (const tx of data.result) {
      if (tx.from) {
        const from = ethers.getAddress(tx.from);
        wallets.add(from);
        recordWalletActivity(activity, from, address);
      }
      if (tx.to) {
        const to = ethers.getAddress(tx.to);
        wallets.add(to);
        recordWalletActivity(activity, to, address);
      }
    }

    return { wallets: [...wallets], activity };
  } catch (error) {
    logWarn('BscScan token tx fetch failed', { address, error: error.message });
    return { wallets: [], activity: new Map() };
  }
}

function mergeActivityMaps(target, source) {
  for (const [wallet, entry] of source.entries()) {
    const current = target.get(wallet) || createActivityEntry();
    current.transfers += entry.transfers;
    for (const token of entry.tokens) {
      current.tokens.add(token);
    }
    target.set(wallet, current);
  }
}

async function scanRecentBscActivity(provider, options = {}) {
  const blockRange = options.blockRange || config.scanBlockRange;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - blockRange);

  logInfo('Scanning recent BSC blocks', { fromBlock, toBlock: latestBlock, blockRange });

  const discovered = new Set();
  const walletActivity = new Map();

  for (const tokenAddress of config.watchTokens) {
    try {
      const rpcResult = await fetchRecentTokenTransfersViaRpc(
        provider,
        tokenAddress,
        fromBlock,
        latestBlock
      );

      for (const wallet of rpcResult.wallets) {
        discovered.add(wallet);
      }
      mergeActivityMaps(walletActivity, rpcResult.activity);

      if (config.bscscanApiKey) {
        const bscscanResult = await fetchRecentTransactionsBscScan(tokenAddress);
        for (const wallet of bscscanResult.wallets) {
          discovered.add(wallet);
        }
        mergeActivityMaps(walletActivity, bscscanResult.activity);
      }
    } catch (error) {
      logWarn('Token scan skipped due to RPC error', {
        tokenAddress,
        error: error.message,
      });
    }
  }

  return {
    wallets: [...discovered],
    walletActivity,
    fromBlock,
    toBlock: latestBlock,
  };
}

module.exports = {
  scanRecentBscActivity,
  fetchRecentTokenTransfersViaRpc,
  fetchRecentTransactionsBscScan,
};
