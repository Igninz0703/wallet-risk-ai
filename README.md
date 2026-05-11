# ChainGuard — AI Wallet Intelligence

> Real-time Ethereum wallet risk analysis powered by Claude AI + Etherscan.
> Built for compliance professionals, accountants, and lawyers.

---

## What it does

- **Risk score (0–100)** — deterministic, auditable, every point explained
- **Sanctions check** — direct match + 1-hop indirect exposure (OFAC SDN verified)
- **Evidence visualization** — top 5 key transactions flagged by risk level
- **AI analysis** — plain-language explanation by Claude Sonnet
- **PDF report** — unique Report ID, archivable for compliance documentation

---

## Local Development (Demo / Hackathon)

### Requirements

- [Node.js](https://nodejs.org) v18+ (`node --version` to check)
- Etherscan API key (free)
- Anthropic API key

### Get API keys

**Etherscan (free):** etherscan.io/register → My Account → API Keys → Add

**Anthropic:** console.anthropic.com → API Keys → Create Key → add $5 credit

### Run locally

Option A — command line:
```bash
node server.js sk-ant-api03-YOUR_ANTHROPIC_KEY YOUR_ETHERSCAN_KEY
```

Option B — .env file (recommended):
```
ANTHROPIC_KEY=sk-ant-api03-YOUR_KEY_HERE
ETHERSCAN_KEY=YOUR_ETHERSCAN_KEY_HERE
```
```bash
node server.js
```

Open **http://localhost:3000** — the server auto-serves the frontend.

---

## Production Deployment (Railway)

For a public URL without running a local server:

1. Create account at [railway.app](https://railway.app)
2. New Project → Deploy from GitHub / upload files
3. Add environment variables in Railway dashboard:
   - `ANTHROPIC_KEY=sk-ant-api03-...`
   - `ETHERSCAN_KEY=...`
   - `PORT=3000`
4. Railway auto-detects Node.js and runs `node server.js`
5. Get your public URL: `https://your-project.railway.app`

---

## Demo Wallets

| Wallet | Expected result |
|--------|-----------------|
| `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | Low risk — Vitalik Buterin |
| `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | Contract analysis |
| `0x098b716b8aaf21512996dc57eb0615e2383e2f96` | HIGH RISK — Ronin Bridge Hacker, Lazarus/DPRK (OFAC SDN) |
| `0x58f56615180a8eea4c462235d9e215f72484b4a3` | HIGH RISK — Harmony Bridge Hacker, Lazarus (OFAC SDN) |

> Note on Tornado Cash: OFAC removed immutable TC contracts from SDN in March 2025 (Van Loon v Treasury).
> Use Ronin/Harmony addresses above for the strongest compliance demo — Lazarus Group remains actively sanctioned.

---

## How Scoring Works

Deterministic scoring — every point is auditable:

| Signal | Points |
|--------|--------|
| Baseline | +10 |
| Wallet age (0–10yr) | 0–18 |
| Transaction volume | 1–13 |
| ETH balance | 0–20 |
| Token exposure | 0–14 |
| Contract diversity | 0–8 |
| Contract type | +10 |
| OFAC Direct Match | **override → 90** |
| Sanctions Counterparty | **override → 75** |
| 1-Hop Indirect Exposure | **override → 60** |

The AI does not calculate the score. Claude explains the deterministic output.

---

## 1-Hop Risk Detection

Three levels of sanctions exposure:

- **Direct match** — the analyzed wallet IS a sanctioned address
- **Counterparty** — wallet sent/received directly from a sanctioned address
- **1-hop indirect** — a counterparty of the wallet is itself a sanctioned address

All based on on-chain transaction data. No assumptions.

---

## Sanctions Database

| Group | Addresses | Source | Status |
|-------|-----------|--------|--------|
| Tornado Cash (mutable/governance) | 28 | OFAC SDN Aug 2022 | Partially delisted Mar 2025 |
| Lazarus — Ronin hack ($625M) | 4 | OFAC SDN Apr 2022, FBI | Active |
| Lazarus — Harmony hack ($100M) | 1 | Elliptic | Active |
| Lazarus — Bybit hack ($1.5B) | 3 | Elliptic/Chainalysis 2025 | Active |
| Blender.io | 4 | OFAC SDN May 2022 | Active |

---

## Architecture

```
Browser → POST /analyze → Node.js server
                               |           |
                         Etherscan     Anthropic
                         (on-chain)    (Claude)
                               |
                    { walletData, scoring,
                      aiText, sanctionFlags,
                      evidenceTxs }
```

No database. No user accounts. API keys in browser localStorage only (password-masked).

---

## Disclaimer

Preliminary screening tool only. Does not constitute legal, financial, or compliance advice.
Consult a qualified AML professional for regulated compliance decisions.

---

## Built with

- Claude Sonnet 4.6 (Anthropic)
- Etherscan API v2
- Node.js (no framework)
- Vanilla HTML/CSS/JS (no build step)
