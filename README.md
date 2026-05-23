# MEMEGPT (MGPT) BSC Automation

Educational/research Node.js system for scanning active BSC trader wallets and performing **controlled, rate-limited** MGPT token distribution.

This project is designed for:

- Wallet discovery from on-chain activity
- Safe filtering of externally owned accounts (EOAs)
- CSV-backed wallet storage
- Randomized small transfers with human-like delays
- Daily/hourly rate limits to prevent burst spam

It is **not** intended for wash trading, fake volume, contract manipulation, or unsolicited mass spam.

---

## Token

| Field | Value |
|-------|-------|
| Name | MEMEGPT (MGPT) |
| Contract | `0x1dF5b60a0045c2b8221ADAa3a982778157E70749` |
| Chain | BNB Smart Chain Mainnet |

---

## Project Structure

```
├── src/
│   ├── scanner/          # BSC + PancakeSwap scanning modules
│   ├── sender/           # MGPT distribution bot
│   ├── utils/            # Config, CSV, cache, gas, logging, rate limits
│   └── index.js          # CLI entry point
├── data/
│   ├── wallets.csv       # Stored wallet records
│   ├── processed.json    # Processed wallet tracking
│   ├── wallet-cache.json # Scanner cache
│   ├── rate-limits.json  # Hourly/daily send counters
│   └── blacklist.json    # Optional blocked addresses
├── logs/
│   └── transactions.log  # JSON-line transaction and system logs
├── .env.example
├── package.json
└── README.md
```

---

## Requirements

- Node.js 18+
- A funded BSC wallet with:
  - BNB for gas
  - MGPT balance for distribution
- BSC RPC endpoint (public or private)

Optional:

- BscScan API key for supplemental token transfer history
- Private BSC RPC endpoint (strongly recommended — public RPCs rate-limit `eth_getLogs`)

---

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment template:

```bash
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

3. Edit `.env`:

```env
PRIVATE_KEY=your_private_key_without_0x_prefix
BSC_RPC_URL=https://bsc-dataseed.binance.org/
TOKEN_ADDRESS=0x1dF5b60a0045c2b8221ADAa3a982778157E70749
DRY_RUN=true
```

4. Ensure your sender wallet holds enough MGPT and BNB before live sends.

---

## CLI Commands

### Scan wallets

Scans recent BSC blocks, PancakeSwap MGPT/WBNB pair activity, and filters active meme/AI traders:

```bash
npm run scan
```

Custom block range:

```bash
node src/index.js scan --blocks 1000
```

### Send MGPT (live)

```bash
npm run send
```

### Dry run (recommended first)

```bash
npm run dry-run
```

### Full pipeline

Scan, then send one controlled batch:

```bash
node src/index.js run --dry-run
```

### Status report

```bash
npm run status
```

---

## Distribution Rules

Randomized MGPT amounts:

```
0.1, 0.2, 0.4, 0.5, 0.8, 1.4, 1.7, 2.0
```

Safety controls:

- 15–35 second randomized delay between sends
- Max **10 wallets/hour**
- Max **100 wallets/day**
- Gas estimation before each transfer
- BNB balance check before sending
- Retry up to 3 times, then mark wallet failed
- Duplicate/processed wallet prevention
- Contract addresses excluded (EOA-only)
- Optional blacklist support

---

## CSV Format

`data/wallets.csv`:

```csv
wallet_address,last_seen,status
0xabc...,2026-05-23T12:00:00.000Z,pending
```

Status values:

- `pending` — eligible for distribution
- `sent` — successfully processed
- `failed` — failed after retry limit
- `skipped` — manually or automatically skipped

---

## Logging

All activity is appended to `logs/transactions.log` as JSON lines:

```json
{
  "timestamp": "2026-05-23T12:00:00.000Z",
  "wallet": "0x...",
  "amount": "0.4",
  "txHash": "0x...",
  "status": "success",
  "dryRun": false,
  "error": null
}
```

---

## Blacklist

Add addresses to `data/blacklist.json`:

```json
{
  "addresses": [
    "0x0000000000000000000000000000000000000001"
  ]
}
```

---

## Recommended Operating Flow

1. Start with `DRY_RUN=true`
2. Run `npm run scan`
3. Review `data/wallets.csv`
4. Run `npm run dry-run`
5. Inspect `logs/transactions.log`
6. Fund sender wallet with MGPT + BNB
7. Set `DRY_RUN=false`
8. Run controlled batches with `npm run send`
9. Monitor `npm run status`

---

## Security Notes

- Never commit `.env`
- Never share your private key
- Use a dedicated hot wallet with limited funds
- Keep rate limits enabled
- Review discovered wallets before large campaigns
- Comply with local regulations and platform policies

---

## Troubleshooting

| Issue | Likely cause | Fix |
|-------|--------------|-----|
| `PRIVATE_KEY is required` | Missing env var | Fill `.env` |
| `Insufficient BNB for gas` | Low BNB balance | Top up sender wallet |
| `Insufficient MGPT balance` | Low token balance | Add MGPT to sender |
| `Daily/Hourly limit reached` | Safety cap hit | Wait for next window |
| No wallets found | Narrow scan range | Increase `--blocks` |
| RPC timeouts | Public RPC congestion | Use private BSC RPC |

---

## Disclaimer

This software is provided for educational and research purposes only. You are responsible for how you use it. Operate ethically, respect rate limits, and avoid spammy or deceptive behavior.
