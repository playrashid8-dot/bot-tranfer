const fs = require('fs');
const csv = require('csv-parser');
const { config } = require('./config');
const { ensureDir, normalizeAddress } = require('./helpers');

const CSV_HEADER = 'wallet_address,last_seen,status\n';

function ensureWalletsCsv() {
  const filePath = config.paths.walletsCsv;
  ensureDir(config.paths.data);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, CSV_HEADER, 'utf8');
  }
}

function walletExists(rows, address) {
  const normalized = normalizeAddress(address);
  return rows.some((row) => normalizeAddress(row.wallet_address) === normalized);
}

async function readWallets() {
  const filePath = config.paths.walletsCsv;
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function writeWallets(rows) {
  const filePath = config.paths.walletsCsv;
  ensureDir(config.paths.data);

  const lines = [CSV_HEADER.trim()];
  for (const row of rows) {
    lines.push(`${row.wallet_address},${row.last_seen},${row.status}`);
  }

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

async function upsertWallet(address, status = 'pending') {
  const rows = await readWallets();
  const normalized = normalizeAddress(address);
  const now = new Date().toISOString();

  const existing = rows.find((row) => normalizeAddress(row.wallet_address) === normalized);
  if (existing) {
    existing.last_seen = now;
    existing.status = status;
  } else {
    rows.push({
      wallet_address: address,
      last_seen: now,
      status,
    });
  }

  writeWallets(rows);
  return rows;
}

async function updateWalletStatus(address, status) {
  const rows = await readWallets();
  const normalized = normalizeAddress(address);
  const target = rows.find((row) => normalizeAddress(row.wallet_address) === normalized);

  if (target) {
    target.status = status;
    target.last_seen = new Date().toISOString();
    writeWallets(rows);
  }

  return target;
}

async function getPendingWallets() {
  ensureWalletsCsv();
  const rows = await readWallets();
  return rows.filter((row) => String(row.status).trim().toLowerCase() === 'pending');
}

async function getWalletStats() {
  const rows = await readWallets();
  const stats = {
    total: rows.length,
    pending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of rows) {
    if (stats[row.status] !== undefined) {
      stats[row.status] += 1;
    }
  }

  return stats;
}

module.exports = {
  readWallets,
  writeWallets,
  upsertWallet,
  updateWalletStatus,
  getPendingWallets,
  getWalletStats,
  walletExists,
  ensureWalletsCsv,
};
