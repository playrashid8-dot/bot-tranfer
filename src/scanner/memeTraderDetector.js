const { ethers } = require('ethers');
const { config } = require('../utils/config');
const { logInfo } = require('../utils/logger');
const { getLogsInChunks } = require('../utils/rpcLogs');

const MEME_KEYWORDS = ['meme', 'doge', 'pepe', 'shib', 'floki', 'bonk', 'wojak', 'cat', 'moon'];
const AI_KEYWORDS = ['ai', 'gpt', 'agent', 'neural', 'bot', 'llm', 'brain'];

async function getTokenSymbol(provider, tokenAddress) {
  try {
    const token = new ethers.Contract(
      tokenAddress,
      ['function symbol() view returns (string)'],
      provider
    );
    return (await token.symbol()).toLowerCase();
  } catch {
    return '';
  }
}

function classifyTokenSymbol(symbol) {
  const tags = [];
  if (MEME_KEYWORDS.some((keyword) => symbol.includes(keyword))) {
    tags.push('meme');
  }
  if (AI_KEYWORDS.some((keyword) => symbol.includes(keyword))) {
    tags.push('ai');
  }
  return tags;
}

async function buildTokenTags(provider) {
  const tokenTags = {};

  for (const tokenAddress of config.watchTokens) {
    const symbol = await getTokenSymbol(provider, tokenAddress);
    const tags = classifyTokenSymbol(symbol);

    if (tokenAddress.toLowerCase() === config.tokenAddress.toLowerCase()) {
      tags.push('ai', 'meme');
    }

    tokenTags[tokenAddress] = [...new Set(tags)];
  }

  return tokenTags;
}

function qualifyFromActivity(walletAddresses, walletActivity, tokenTags, minTransfers) {
  const traders = [];

  for (const wallet of walletAddresses) {
    const checksum = ethers.getAddress(wallet);
    const activity = walletActivity.get(checksum);
    if (!activity || activity.transfers < minTransfers) {
      continue;
    }

    let memeTrader = false;
    let aiTrader = false;

    for (const tokenAddress of activity.tokens) {
      if (tokenAddress.toLowerCase() === config.tokenAddress.toLowerCase()) {
        memeTrader = true;
        aiTrader = true;
      }

      const tags = tokenTags[tokenAddress] || [];
      if (tags.includes('meme')) memeTrader = true;
      if (tags.includes('ai')) aiTrader = true;
    }

    if (!memeTrader && !aiTrader) {
      continue;
    }

    traders.push({
      wallet: checksum,
      transfers: activity.transfers,
      memeTrader,
      aiTrader,
      tokenCount: activity.tokens.size,
    });
  }

  return traders;
}

async function detectActiveTraders(provider, walletAddresses, options = {}) {
  const minTransfers = options.minTransfers || 1;
  const tokenTags = await buildTokenTags(provider);

  if (options.walletActivity instanceof Map) {
    const traders = qualifyFromActivity(
      walletAddresses,
      options.walletActivity,
      tokenTags,
      minTransfers
    );

    logInfo('Trader detection complete (cached activity)', {
      candidates: walletAddresses.length,
      qualified: traders.length,
    });

    return traders;
  }

  const blockRange = options.blockRange || config.scanBlockRange;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - blockRange);
  const walletActivity = new Map();
  const transferTopic = ethers.id('Transfer(address,address,uint256)');
  const walletSet = new Set(walletAddresses.map((address) => address.toLowerCase()));

  for (const tokenAddress of config.watchTokens) {
    try {
      const logs = await getLogsInChunks(provider, {
        address: tokenAddress,
        topics: [transferTopic],
        fromBlock,
        toBlock: latestBlock,
      }, { chunkSize: 500, pauseMs: 500 });

      for (const log of logs) {
        const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
        const to = ethers.getAddress(`0x${log.topics[2].slice(26)}`);

        for (const wallet of [from, to]) {
          if (!walletSet.has(wallet.toLowerCase())) {
            continue;
          }

          const current = walletActivity.get(wallet) || {
            transfers: 0,
            meme: false,
            ai: false,
            tokens: new Set(),
          };

          current.transfers += 1;
          current.tokens.add(tokenAddress);
          walletActivity.set(wallet, current);
        }
      }
    } catch (error) {
      logInfo('Trader detection skipped for token due to RPC error', {
        tokenAddress,
        error: error.message,
      });
    }
  }

  const traders = [];

  for (const [wallet, activity] of walletActivity.entries()) {
    if (activity.transfers < minTransfers) {
      continue;
    }

    let memeTrader = false;
    let aiTrader = false;

    for (const tokenAddress of activity.tokens) {
      if (tokenAddress.toLowerCase() === config.tokenAddress.toLowerCase()) {
        memeTrader = true;
        aiTrader = true;
      }

      const tags = tokenTags[tokenAddress] || [];
      if (tags.includes('meme')) memeTrader = true;
      if (tags.includes('ai')) aiTrader = true;
    }

    if (!memeTrader && !aiTrader) {
      continue;
    }

    traders.push({
      wallet,
      transfers: activity.transfers,
      memeTrader,
      aiTrader,
      tokenCount: activity.tokens.size,
    });
  }

  logInfo('Trader detection complete', {
    candidates: walletAddresses.length,
    qualified: traders.length,
  });

  return traders;
}

module.exports = {
  detectActiveTraders,
  classifyTokenSymbol,
};
