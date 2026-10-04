import fs from "node:fs";
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  formatEther,
  parseEther,
} from "ethers";
export const CHAIN_ID = 11155111;
export const RPC =
  process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
export const provider = new JsonRpcProvider(RPC);
export const artifact = (name) =>
  JSON.parse(fs.readFileSync("public/contracts/" + name + ".json", "utf8"));
export function loadSigner() {
  let key = process.env.PRIVATE_KEY;
  if (!key && fs.existsSync("secrets/testnet-wallet.json"))
    key = JSON.parse(
      fs.readFileSync("secrets/testnet-wallet.json", "utf8"),
    ).privateKey;
  if (!key)
    throw new Error(
      "No signer configured. Use the browser console with a funded Sepolia wallet, or create a dedicated testnet wallet locally. Never paste a private key in chat.",
    );
  return new Wallet(key, provider);
}
export async function assertTestnet() {
  if ((await provider.getNetwork()).chainId !== BigInt(CHAIN_ID))
    throw new Error(
      "Refusing any network other than Ethereum Sepolia (11155111).",
    );
}
export async function boundedSend(
  signer,
  request,
  { maxCost = parseEther("0.1") } = {},
) {
  const gasPrice = request.gasPrice || (await provider.getFeeData()).gasPrice;
  if (!gasPrice || gasPrice > parseEther("0.00000002"))
    throw new Error("Gas quote missing or exceeds the 20 gwei testnet cap.");
  const gasLimit =
    ((await provider.estimateGas({
      ...request,
      gasPrice,
      from: signer.address,
    })) *
      125n) /
    100n;
  if (gasLimit * gasPrice + (request.value || 0n) > maxCost)
    throw new Error("Transaction exceeds the testnet cost cap.");
  const tx = await signer.sendTransaction({ ...request, gasLimit, gasPrice });
  console.log("Submitted transaction:", tx.hash);
  const receipt = await tx.wait(1, 120000);
  if (!receipt || receipt.status !== 1)
    throw new Error(
      "Transaction not confirmed. Inspect its hash before retrying.",
    );
  return receipt;
}
export const contract = (name, address, runner = provider) =>
  new Contract(address, artifact(name).abi, runner);
export { fs, formatEther, parseEther };
