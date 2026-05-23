const { ethers } = require('ethers');
const { config } = require('../utils/config');
const { logInfo, logDebug } = require('../utils/logger');

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

function scoreWalletActivity(activity, tokenTags) {
  let score = 0;
  let memeTrader = false;
  let aiTrader = false;

  if (!activity) {
    return { score: 0, memeTrader, aiTrader, tokenCount: 0, transfers: 0 };
  }

  score += Math.min(activity.transfers, 10);

  for (const tokenAddress of activity.tokens) {
    if (tokenAddress.toLowerCase() === config.tokenAddress.toLowerCase()) {
      memeTrader = true;
      aiTrader = true;
      score += 5;
    }

    const tags = tokenTags[tokenAddress] || [];
    if (tags.includes('meme')) {
      memeTrader = true;
      score += 2;
    }
    if (tags.includes('ai')) {
      aiTrader = true;
      score += 2;
    }
  }

  if (activity.transfers >= 1) {
    score += 1;
  }

  return {
    score,
    memeTrader,
    aiTrader,
    tokenCount: activity.tokens.size,
    transfers: activity.transfers,
  };
}

function qualifyFromActivity(walletAddresses, walletActivity, tokenTags, minTransfers, options = {}) {
  const minScore = options.minScore || 1;
  const traders = [];
  const rejected = [];

  for (const wallet of walletAddresses) {
    const checksum = ethers.getAddress(wallet);
    const activity = walletActivity.get(checksum);
    const scored = scoreWalletActivity(activity, tokenTags);

    if (scored.transfers < minTransfers && scored.transfers === 0) {
      // Candidate from swap scan without transfer logs — still accept with base score
      scored.score = 1;
      scored.transfers = 0;
    }

    if (scored.score < minScore) {
      rejected.push({ wallet: checksum, ...scored, reason: 'score_below_threshold' });
      continue;
    }

    traders.push({
      wallet: checksum,
      transfers: scored.transfers,
      memeTrader: scored.memeTrader,
      aiTrader: scored.aiTrader,
      tokenCount: scored.tokenCount,
      score: scored.score,
    });

    logDebug('Wallet qualified', {
      wallet: checksum,
      score: scored.score,
      transfers: scored.transfers,
      memeTrader: scored.memeTrader,
      aiTrader: scored.aiTrader,
    });
  }

  if (rejected.length > 0) {
    logDebug('Wallets rejected during qualification', {
      count: rejected.length,
      sample: rejected.slice(0, 5),
    });
  }

  return traders;
}

async function detectActiveTraders(provider, walletAddresses, options = {}) {
  const minTransfers = options.minTransfers ?? 1;
  const tokenTags = await buildTokenTags(provider);

  if (options.walletActivity instanceof Map) {
    const traders = qualifyFromActivity(
      walletAddresses,
      options.walletActivity,
      tokenTags,
      minTransfers,
      options
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
      const { getLogsInChunks } = require('../utils/rpcLogs');
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

  const traders = qualifyFromActivity(
    walletAddresses,
    walletActivity,
    tokenTags,
    minTransfers,
    options
  );

  logInfo('Trader detection complete', {
    candidates: walletAddresses.length,
    qualified: traders.length,
  });

  return traders;
}

module.exports = {
  detectActiveTraders,
  classifyTokenSymbol,
  scoreWalletActivity,
};
