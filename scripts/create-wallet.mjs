import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { Wallet } from "ethers";
const file = "secrets/testnet-wallet.json";
if (fs.existsSync(file))
  throw new Error("Wallet already exists; refusing to overwrite it.");
fs.mkdirSync("secrets", { recursive: true, mode: 0o700 });
if (process.platform === "win32") {
  const user = os.userInfo().username;
  const result = spawnSync(
    "icacls",
    ["secrets", "/inheritance:r", "/grant:r", user + ":(OI)(CI)F"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error("Could not restrict wallet directory permissions.");
}
const wallet = Wallet.createRandom();
fs.writeFileSync(
  file,
  JSON.stringify(
    {
      chainId: 11155111,
      address: wallet.address,
      privateKey: wallet.privateKey,
    },
    null,
    2,
  ),
  { flag: "wx", mode: 0o600 },
);
console.log("TESTNET address:", wallet.address);
console.log(
  "Private key saved only to ignored " +
    file +
    ". Back it up securely; never fund this with mainnet assets.",
);
console.log("Faucet: https://faucets.chain.link/sepolia");
