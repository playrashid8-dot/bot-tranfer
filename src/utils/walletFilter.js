const { ethers } = require('ethers');
const { config } = require('./config');
const { isValidAddress, normalizeAddress } = require('./helpers');
const { loadBlacklist, isProcessed } = require('./cache');
const { walletExists } = require('./csvStorage');

async function isExternallyOwnedAccount(provider, address) {
  const code = await provider.getCode(address);
  return code === '0x' || code === '0x0';
}

async function filterWallet(provider, address, options = {}) {
  const {
    existingRows = [],
    skipProcessed = true,
    blacklist = null,
  } = options;

  const reasons = [];

  if (!isValidAddress(address)) {
    return { valid: false, address, reasons: ['invalid_address'] };
  }

  const normalized = normalizeAddress(address);

  if (blacklist && blacklist.has(normalized)) {
    return { valid: false, address, reasons: ['blacklisted'] };
  }

  if (walletExists(existingRows, address)) {
    return { valid: false, address, reasons: ['duplicate_csv'] };
  }

  if (skipProcessed && isProcessed(address)) {
    return { valid: false, address, reasons: ['already_processed'] };
  }

  const isEoa = await isExternallyOwnedAccount(provider, address);
  if (!isEoa) {
    return { valid: false, address, reasons: ['contract_address'] };
  }

  return { valid: true, address, reasons: [] };
}

async function filterWallets(provider, addresses, options = {}) {
  const blacklist = options.blacklist || loadBlacklist();
  const existingRows = options.existingRows || [];
  const results = {
    accepted: [],
    rejected: [],
  };

  const unique = [...new Set(addresses.map(normalizeAddress))];

  for (const address of unique) {
    const checksum = ethers.getAddress(address);
    const result = await filterWallet(provider, checksum, {
      existingRows,
      blacklist,
      skipProcessed: options.skipProcessed !== false,
    });

    if (result.valid) {
      results.accepted.push(checksum);
    } else {
      results.rejected.push(result);
    }
  }

  return results;
}

module.exports = {
  isExternallyOwnedAccount,
  filterWallet,
  filterWallets,
};
