import {
  provider,
  fs,
  contract,
  loadSigner,
  assertTestnet,
  boundedSend,
  parseEther,
} from "./runtime.mjs";
await assertTestnet();
const state = JSON.parse(fs.readFileSync("public/deployment.json", "utf8"));
const signer = loadSigner(),
  gameAddress = process.env.GAME_ADDRESS || state.game;
if (!gameAddress)
  throw new Error("Load a deployment.json or set GAME_ADDRESS.");
const game = contract("SquidGrid", gameAddress, signer),
  oracle = contract("ChainlinkOracle", await game.oracle(), signer);
if ((await oracle.game()).toLowerCase() !== gameAddress.toLowerCase())
  throw new Error("Oracle/game binding mismatch.");
console.log("Keeper:", signer.address, "arena:", gameAddress);
fs.mkdirSync("artifacts", { recursive: true });
const lockPath = "artifacts/keeper.lock",
  lock = fs.openSync(lockPath, "wx");
fs.writeSync(lock, String(process.pid));
const close = () => {
  try {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  } catch {}
};
process.on("exit", close);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
const initialBalance = await provider.getBalance(signer.address),
  budget = parseEther(process.env.KEEPER_BUDGET_ETH || "0.1");
async function send(tx) {
  const balance = await provider.getBalance(signer.address),
    gasPrice = tx.gasPrice || (await provider.getFeeData()).gasPrice;
  const projected =
    (((await provider.estimateGas({ ...tx, gasPrice, from: signer.address })) *
      125n) /
      100n) *
      gasPrice +
    (tx.value || 0n);
  if (initialBalance - balance + projected > budget)
    throw new Error("Keeper session budget would be exceeded.");
  return boundedSend(signer, tx, { maxCost: budget });
}
async function tick() {
  if ((await game.winner()) !== 0n) {
    console.log("Winner:", String(await game.winner()));
    return true;
  }
  if ((await game.round()) === 0n) return false;
  const pending = await game.pendingRequest();
  if (pending === 0n) {
    const block = await provider.getBlock("latest");
    if (BigInt(block.timestamp) < (await game.deadline())) return false;
    const gasPrice = (await provider.getFeeData()).gasPrice,
      value = ((await oracle.quote(gasPrice)) * 120n) / 100n;
    if (value > parseEther(".02"))
      throw new Error("VRF fee exceeds 0.02 ETH cap.");
    console.log(
      "Requested:",
      (
        await send(
          await game.requestRound.populateTransaction({ value, gasPrice }),
        )
      ).hash,
    );
    return false;
  }
  if (await game.randomnessReady()) {
    console.log(
      "Settled:",
      (await send(await game.settleRound.populateTransaction())).hash,
    );
    return false;
  }
  const result = await oracle.results(pending);
  if (result.received)
    console.log(
      "Delivered:",
      (await send(await oracle.deliver.populateTransaction(pending))).hash,
    );
  return false;
}
try {
  do {
    if ((await tick()) || process.argv.includes("--once")) break;
    await new Promise((r) => setTimeout(r, 15000));
  } while (true);
} catch (error) {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
} finally {
  close();
}
