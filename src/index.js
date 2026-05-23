#!/usr/bin/env node

const { Command } = require('commander');
const { config } = require('./utils/config');
const { initDataDirs } = require('./utils/helpers');
const { getWalletStats } = require('./utils/csvStorage');
const { getProcessedCount } = require('./utils/cache');
const { getRateLimitReport } = require('./utils/rateLimiter');
const { runScanner } = require('./scanner/index');
const { runDistributionBot } = require('./sender/index');

const program = new Command();

program
  .name('mgpt-bsc-automation')
  .description('Educational BSC wallet scanner and controlled MGPT distribution system')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan recent BSC activity and store qualified trader wallets')
  .option('-b, --blocks <number>', 'Block range to scan', String(config.scanBlockRange))
  .action(async (options) => {
    try {
      initDataDirs();
      const report = await runScanner({
        blockRange: parseInt(options.blocks, 10),
      });
      console.log('\nScan report:');
      console.log(JSON.stringify(report, null, 2));
    } catch (error) {
      console.error(`Scan failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('send')
  .description('Send randomized MGPT amounts to pending wallets with rate limits')
  .option('--dry-run', 'Simulate transfers without broadcasting transactions', false)
  .action(async (options) => {
    try {
      initDataDirs();
      const summary = await runDistributionBot({
        dryRun: Boolean(options.dryRun),
      });
      console.log('\nSend summary:');
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error(`Send failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('run')
  .description('Scan wallets, then run one controlled distribution batch')
  .option('--dry-run', 'Simulate transfers without broadcasting transactions', false)
  .option('-b, --blocks <number>', 'Block range to scan', String(config.scanBlockRange))
  .action(async (options) => {
    try {
      initDataDirs();
      await runScanner({ blockRange: parseInt(options.blocks, 10) });
      const summary = await runDistributionBot({
        dryRun: Boolean(options.dryRun),
      });
      console.log('\nPipeline complete:');
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error(`Pipeline failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show wallet CSV stats, processed cache, and rate-limit state')
  .action(async () => {
    try {
      initDataDirs();
      const [walletStats, rateLimits] = await Promise.all([
        getWalletStats(),
        Promise.resolve(getRateLimitReport()),
      ]);

      const status = {
        token: config.tokenAddress,
        dryRunDefault: config.dryRun,
        wallets: walletStats,
        processed: getProcessedCount(),
        rateLimits,
      };

      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      console.error(`Status failed: ${error.message}`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
