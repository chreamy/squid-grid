import React from "react";
import { POT } from "./network.js";
import { EXPLORER } from "./game.js";
export default function Rules() {
  return (
    <>
      <p>
        <b>1,000 enter. 1 survives.</b> Exactly 1,000 Players, 0.001 Sepolia ETH
        each. Round one starts when all 1,000 are minted.
      </p>
      <ol className="rules-list">
        <li>
          <b>One Player dies each round.</b>Each of 999 rounds has a ten-minute
          window followed by Chainlink VRF delivery and settlement. Anyone can
          advance a due round. There is no admin pause or manual elimination.
        </li>
        <li>
          <b>Linear luck. Limited protection.</b>Luck = 100,000 × cumulative
          deposited ETH ÷ 0.01, rounded down. 0.01 ETH gives 100,000 luck; 0.10
          ETH gives 1,000,000. Anyone can sponsor a living Player. Luck follows
          the NFT when traded.
        </li>
        <li>
          <b>Protection depends on your share.</b>Your share = your active luck
          ÷ total living luck. Risk = 1 − 0.5 × your share. Elimination chance =
          your risk ÷ total risk. Equivalently: (2L − your luck) ÷ [L × (2N −
          1)]. If all luck is zero, each Player has 1/N chance.
        </li>
        <li>
          <b>Nobody is safe. Everybody has a chance.</b>The most protected
          Player has at most 2× the protection of an unprotected Player,
          measured by relative elimination risk. No living Player has zero risk.
          In the final two, even zero luck retains at least a 1-in-3 chance of
          winning. More ETH cannot buy immunity.
        </li>
        <li>
          <b>The field keeps changing.</b>Other Players' deposits can reduce
          your share; eliminations remove luck from the field. Review your
          status before deciding whether more protection is worth it. Deposits
          do not expire. Your current round is fixed; new luck applies next
          round if you survive. The final round has no next round to protect.
        </li>
        <li>
          <b>ETH in. NFLX to the pot.</b>Protection deposits swap through the
          fixed Uniswap pool with a minimum output and expiry. NFLX goes
          directly to the protocol pot. Mint revenue goes there as ETH. Failed
          swaps revert the whole deposit. Successful deposits are permanent.
        </li>
        <li>
          <b>Dead Players remain. Prizes are manual.</b>Dead NFTs keep their
          elimination round and finishing position. They cannot receive
          deposits. There is no prize escrow, automatic claim or enforced
          allocation; the recipient controls the pot.
        </li>
      </ol>
      <div className="rule-foot">
        PROTOCOL POT
        <br />
        <a href={EXPLORER + "/address/" + POT} target="_blank" rel="noreferrer">
          {POT}
        </a>
        <br />
        Sepolia testnet. Token and pool must be configured before deployment.
        Next-round odds are estimates using the current field.
      </div>
    </>
  );
}
