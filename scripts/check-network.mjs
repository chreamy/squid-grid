import { Contract } from "ethers";
import { provider, assertTestnet, fs } from "./runtime.mjs";
import { WRAPPER } from "../src/game.js";
import {
  SWAP_ROUTER,
  QUOTER,
  FACTORY,
  WETH,
  POT,
  FACTORY_ABI,
} from "../src/network.js";
await assertTestnet();
const block = await provider.getBlock("latest"),
  addresses = {
    wrapper: WRAPPER,
    swapRouter: SWAP_ROUTER,
    quoter: QUOTER,
    factory: FACTORY,
    weth: WETH,
  };
for (const [name, address] of Object.entries(addresses))
  if ((await provider.getCode(address)) === "0x")
    throw new Error("No deployed " + name);
const router = new Contract(
  SWAP_ROUTER,
  [
    "function WETH9() view returns(address)",
    "function factory() view returns(address)",
  ],
  provider,
);
if (
  (await router.WETH9()).toLowerCase() !== WETH.toLowerCase() ||
  (await router.factory()).toLowerCase() !== FACTORY.toLowerCase()
)
  throw new Error("Router configuration mismatch.");
const config = JSON.parse(fs.readFileSync("public/deployment.json", "utf8"));
const pool =
  config.token && config.poolFee
    ? await new Contract(FACTORY, FACTORY_ABI, provider).getPool(
        WETH,
        config.token,
        config.poolFee,
      )
    : null;
console.log(
  JSON.stringify(
    {
      chainId: 11155111,
      block: block.number,
      contracts: addresses,
      pot: POT,
      pool,
      status: pool ? "route_found" : "awaiting_NFLX_token_and_pool",
    },
    null,
    2,
  ),
);
