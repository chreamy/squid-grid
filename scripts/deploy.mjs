import { Contract, ContractFactory, ZeroAddress, isAddress } from "ethers";
import {
  fs,
  provider,
  loadSigner,
  assertTestnet,
  artifact,
  boundedSend,
  contract,
  formatEther,
  parseEther,
  CHAIN_ID,
  RPC,
} from "./runtime.mjs";
import {
  POT,
  SWAP_ROUTER,
  WETH,
  FACTORY,
  QUOTER,
  FACTORY_ABI,
  TOKEN_ABI,
} from "../src/network.js";
import { WRAPPER, MINT_PRICE, EXPLORER } from "../src/game.js";
await assertTestnet();
const config = JSON.parse(fs.readFileSync("public/deployment.json", "utf8"));
const token = process.env.NFLX_TOKEN || config.token,
  poolFee = Number(process.env.POOL_FEE || config.poolFee),
  imageBaseURI = process.env.NFT_BASE_URI || config.imageBaseURI;
if (!isAddress(token) || !poolFee || !imageBaseURI)
  throw new Error(
    "Set NFLX_TOKEN, POOL_FEE and NFT_BASE_URI. A real, liquid WETH/token pool on Sepolia is required; no token address is invented.",
  );
if (!/^(https:\/\/|ipfs:\/\/)[^"\\\s]+\/$/.test(imageBaseURI))
  throw new Error(
    "NFT_BASE_URI must be a public https:// or ipfs:// URI ending in /.",
  );
for (const address of [WRAPPER, SWAP_ROUTER, WETH, QUOTER, token])
  if ((await provider.getCode(address)) === "0x")
    throw new Error("Missing Sepolia contract: " + address);
const pool = await new Contract(FACTORY, FACTORY_ABI, provider).getPool(
  WETH,
  token,
  poolFee,
);
if (
  pool === ZeroAddress ||
  (await new Contract(
    pool,
    ["function liquidity() view returns(uint128)"],
    provider,
  ).liquidity()) === 0n
)
  throw new Error("WETH/NFLX pool is absent or has no active liquidity.");
const signer = loadSigner();
console.log(
  "Sepolia deployer:",
  signer.address,
  "balance:",
  formatEther(await provider.getBalance(signer.address)),
  "ETH",
);
const file = "deployments/11155111.json";
fs.mkdirSync("deployments", { recursive: true });
let state = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : {
      schemaVersion: 4,
      chainId: CHAIN_ID,
      deployer: signer.address,
      rpcUrl: RPC,
      explorer: EXPLORER,
      potAddress: POT,
      wrapper: WRAPPER,
      swapRouter: SWAP_ROUTER,
      weth: WETH,
      quoter: QUOTER,
      token,
      pool,
      poolFee,
      imageBaseURI,
      mintPrice: MINT_PRICE,
      transactions: {},
    };
if (
  state.schemaVersion !== 4 ||
  state.deployer.toLowerCase() !== signer.address.toLowerCase() ||
  state.token.toLowerCase() !== token.toLowerCase() ||
  state.poolFee !== poolFee ||
  state.imageBaseURI !== imageBaseURI
)
  throw new Error(
    "Saved deployment configuration differs. Preserve it and use a new directory for a new season.",
  );
const save = () =>
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
for (const [name, key, args] of [
  ["ChainlinkOracle", "oracle", () => [WRAPPER]],
  [
    "SquidGrid",
    "game",
    () => [
      state.oracle,
      POT,
      parseEther(MINT_PRICE),
      SWAP_ROUTER,
      WETH,
      token,
      poolFee,
      imageBaseURI,
    ],
  ],
]) {
  if (state[key]) {
    if ((await provider.getCode(state[key])) === "0x")
      throw new Error("Missing saved " + key);
    continue;
  }
  const a = artifact(name),
    factory = new ContractFactory(a.abi, a.bytecode, signer);
  const receipt = await boundedSend(
    signer,
    await factory.getDeployTransaction(...args()),
  );
  state[key] = receipt.contractAddress;
  state.transactions[key] = receipt.hash;
  state.deploymentBlock = receipt.blockNumber;
  save();
  console.log(name, state[key]);
}
const oracle = contract("ChainlinkOracle", state.oracle, signer),
  bound = await oracle.game();
if (bound === ZeroAddress) {
  const r = await boundedSend(
    signer,
    await oracle.bindGame.populateTransaction(state.game),
  );
  state.transactions.bind = r.hash;
  save();
} else if (bound.toLowerCase() !== state.game.toLowerCase())
  throw new Error("Oracle is bound to a different game.");
state.converter = await contract("SquidGrid", state.game).converter();
const t = new Contract(token, TOKEN_ABI, provider);
state.tokenDecimals = Number(await t.decimals());
state.tokenSymbol = await t.symbol();
state.status = "deployed";
save();
fs.writeFileSync(
  "public/deployment.json",
  JSON.stringify(state, null, 2) + "\n",
);
console.log(
  "Deployed. Run the keeper with a funded Sepolia signer. No NFTs were minted automatically.",
);
