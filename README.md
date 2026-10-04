# SQUID GRID

**1,000 enter. 1 survives.** Ethereum Sepolia survival NFTs with a pink/teal arena, a ten-minute timer, a 1,000-cell hex grid, and numbered pixel prisoners.

## Current state

The contracts, interactive frontend and 1,000 artwork files are implemented. **No game has been deployed to Sepolia yet.** Deployment requires the intended NFLX token address, a liquid Uniswap V3 WETH/NFLX pool and a funded wallet. No local signer was provided. The UI is explicitly labeled as a simulation until an arena is deployed or loaded.

The configured protocol pot is **0x73DA00df8c64C49a91892e263f52538323bc7ecF**. Its destination cannot be changed after deployment.

## Final rules

- Exactly 1,000 ERC-721 Players, minted for 0.001 Sepolia ETH each. Enrollment starts round 1 automatically when all 1,000 are minted.
- One elimination per round, after at least ten minutes and VRF delivery. 999 rounds produce one winner. The base duration is 6 days, 22 hours, 30 minutes; transaction, keeper and VRF delays add time.
- Linear luck: `floor(cumulative deposited wei × 100000 / 10^16)`. Thus 0.01 ETH gives 100,000 luck, and 0.10 ETH gives 1,000,000. Mint payments do not buy luck.
- Anyone may sponsor any living NFT. Deposits are cumulative and NFT-bound. Dead NFTs retain ownership, original deposited amount, elimination round and finishing position; their luck is removed.
- Round-start snapshots fix the current odds. In-round deposits update the next round if the NFT survives. The UI displays current odds separately from next-round estimates. Estimates use the current field; other deposits and the next elimination will change the actual next-round odds.
- With N living NFTs and total snapshot luck L > 0, token i has integer weight `2L - luck[i]`, and elimination probability `(2L - luck[i]) / (L × (2N - 1))`. If L = 0, all weights are 1. This is risk = 1 − 0.5 × luck share, normalized across the field. Equal scores give equal odds; nobody is immune. The maximum relative protection is 2×. At N = 2, survival probability = (1 + luck share) / 3, between 1/3 and 2/3.
- Example with linear deposits: A deposits 0.06 ETH (600,000 luck), B 0.03 ETH (300,000), C zero. Their elimination chances are 4/15 (26.67%), 1/3 (33.33%), 2/5 (40%).
- An unprotected Player has 1/N risk if everyone has zero luck, or 2/(2N−1) if some other Player has positive luck. There is no logarithmic diminishing return anymore.
- Mint ETH goes immediately to the pot. Each protection deposit wraps ETH, swaps the entire input through a fixed Uniswap V3 pool, and sends the purchased NFLX token directly to the pot. Luck measures the original ETH input, not token price or output.
- **Prizes are manual.** There is no prize escrow, claim function, or contract-enforced allocation. The recipient controls the pot. Finishing positions are recorded for manual distribution.
- NFTs remain transferable during pending draws. There is no admin pause, upgrade, manual elimination, redraw or mutable treasury address.

The last round has no subsequent round to protect. The UI disables protection purchases once its snapshot starts. The contract still permits voluntary deposits into a living finalist until settlement; such donations cannot change the final draw.

## Balance rationale

Protection uses relative luck share, rather than giving every well-funded Player a permanently fixed hazard discount. This limits compounding advantages across 999 rounds. A deposit can improve your next-round relative position; opponents’ deposits can erode it, and eliminations change the field. Deposits never expire.

For a fixed-deposit season with 100 equally funded Players and 900 zero-luck Players, the unfunded cohort wins approximately 68.41% of seasons. With 500 of each, the unfunded cohort wins approximately 29.30%. These are group outcomes under stated assumptions, not individual guarantees or predictions of changing-deposit play. Run `node scripts/analyze-balance.mjs` to reproduce the exact recurrence.

The cap prevents immunity; it does not make spending irrelevant. In a 1,000-Player field with a sole funded Player and nobody else depositing, that Player wins about 2.80% of seasons versus 0.1% for a Player in an entirely equal field.

## Run locally

Node 20.11+ and Foundry are required.

```sh
git clone --recurse-submodules https://github.com/chreamy/squid-grid.git
cd squid-grid
npm ci
forge build
node scripts/export-contracts.mjs
npm run dev
```

If cloned without submodules, run `git submodule update --init --recursive`. Open the URL printed by Vite.

## Checks

```sh
npm test
npm run test:math
npm run test:browser
npm run build
```

For browser QA, install Chromium with `npx playwright install chromium`, or set `BROWSER_CHANNEL=msedge` on a system with Edge. The browser regression verifies that a deposit decreases next-round odds without altering the current snapshot.

A read-only network check verifies the official Sepolia contracts:

```sh
node scripts/check-network.mjs
```

The fork integration deploys a clearly labeled test token and creates liquidity **only inside a local fork**, then exercises Sepolia's actual Uniswap router, factory, position manager and WETH contracts. It does not deploy a test token or pool on Sepolia.

```sh
SEPOLIA_FORK_TEST=true forge test --match-contract SepoliaForkTest \
  --fork-url https://ethereum-sepolia-rpc.publicnode.com \
  --fork-block-number 11843453 -vv
```

PowerShell: set `$env:SEPOLIA_FORK_TEST='true'` first. The standard test run skips fork tests unless enabled.

## Deploy to Sepolia

The browser's **Go on-chain** console accepts the token address, pool fee and public NFT image base URI. It validates deployed contracts and active pool liquidity before requesting three wallet transactions: deploy Chainlink adapter, deploy game plus converter, permanently bind adapter to game. Progress is stored locally for resumption.

For CLI deployment, set environment variables from `.env.example` in your shell. Scripts do not automatically load .env files. A private key is read only from PRIVATE_KEY or the ignored local `secrets/testnet-wallet.json`; use a dedicated testnet signer. The optional `npm run wallet:create` command creates such a file locally and prints only its public address.

```sh
npm run contracts:build
npm run deploy:testnet
npm run keeper
```

The CLI writes `deployments/11155111.json` and `public/deployment.json`. Rebuild the UI after deployment. Keep a keeper funded and running: smart contracts do not wake themselves up. Any wallet can request, deliver and settle a due round. VRF fees are paid by the caller, separate from the pot. Excess request payment is pull-refundable with `withdrawRefund(recipient)`.

The keeper stops when its configured budget would be exceeded. An uncertain transaction receipt must be inspected by hash before retrying deployment. The game prevents a second randomness request while one is pending.

The adapter uses the official native-payment Chainlink VRF v2.5 wrapper. There is no price oracle for the swap. The quote UI displays expected/minimum output with 0.5% slippage and a 120-second deadline. If the swap fails, expires, receives too little, or consumes only part of the ETH, the whole deposit reverts. Router approval is cleared after success.

Contract verification must be performed after actual deployment, with the exact compiler settings and constructor arguments. This repository does not claim that undeployed contracts are verified.

## Artwork

`public/art/prisoner-base.png` is the original generated transparent prisoner. `prisoner-base.webp` is its lossless encoding. The generation prompt and method are in `public/art/generation.txt`.

`public/nft/1.svg` through `1000.svg` are self-contained images. The base character is identical; only the chest number changes. `npm run art:build` reproduces them with vector pixel digits. Their metadata is generated onchain and includes status, elimination round and finishing position. The inspector adds a death-round stamp.

The default preview configuration points to the collection at a pinned source commit on GitHub. You can instead upload it to IPFS and set NFT_BASE_URI to its trailing-slash URI before deployment. A private preview website is not a suitable public NFT image host. The base URI is fixed after construction.

## Architecture and operating limits

- `SquidGrid.sol`: minting, linear luck, lazy round snapshots, weighted selection, ranking and NFT metadata.
- `DepositConverter.sol`: game-only atomic WETH/NFLX swap to the immutable pot.
- `ChainlinkOracle.sol`: stores the authenticated VRF result, then allows permissionless delivery. Failed downstream delivery cannot discard or replace the stored result.
- Fenwick trees keep deposits and weighted draws O(log 1000). Copy-on-write node snapshots preserve round-start probabilities without copying 1,000 records each round.
- Rejection sampling avoids simple modulo bias. Extremely small deposits can round to zero luck; per-NFT cumulative deposits are bounded at 10^30 wei to bound arithmetic.
- No pause does not guarantee uninterrupted progress. VRF availability/funding, transaction submission, token transfer restrictions and pool liquidity remain dependencies. Minting may remain open indefinitely if the collection does not sell out.
- The historical ETH contribution metric is not the pot's current ETH balance: deposit ETH has been exchanged for NFLX, and the pot operator can move assets.
- Tests and fork checks are engineering validation, not an independent security audit.

## Primary references

- [Chainlink VRF supported networks](https://docs.chain.link/vrf/v2-5/supported-networks)
- [Chainlink native direct funding](https://docs.chain.link/vrf/v2-5/direct-funding/get-a-random-number)
- [Official Uniswap Sepolia deployment addresses](https://github.com/Uniswap/contracts/blob/main/deployments/11155111.md)
- [SwapRouter02 exact-input interface](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol)
- [OpenZeppelin Contracts v5.7.0](https://github.com/OpenZeppelin/openzeppelin-contracts/tree/v5.7.0)
