import {
  BrowserProvider,
  Contract,
  ContractFactory,
  JsonRpcProvider,
  formatEther,
  formatUnits,
  parseEther,
  isAddress,
  ZeroAddress,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { CHAIN_ID, RPC, EXPLORER, WRAPPER, MINT_PRICE } from "./game.js";
import {
  POT,
  SWAP_ROUTER,
  WETH,
  QUOTER,
  FACTORY,
  TOKEN_ABI,
  FACTORY_ABI,
  QUOTER_ABI,
} from "./network.js";
export { formatEther, parseEther };
export const rpc = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
let artifacts;
export async function getArtifacts() {
  if (!artifacts)
    artifacts = Promise.all(
      ["SquidGrid", "DepositConverter", "ChainlinkOracle"].map(async (name) => {
        const res = await fetch("/contracts/" + name + ".json");
        if (!res.ok) throw new Error("Contract artifacts are unavailable.");
        return res.json();
      }),
    );
  const [game, converter, oracle] = await artifacts;
  return { game, converter, oracle };
}
export async function connect() {
  if (!window.ethereum)
    throw new Error(
      "Open this site in an EVM wallet browser, or install a browser wallet with Sepolia enabled.",
    );
  await window.ethereum.request({ method: "eth_requestAccounts" });
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
  } catch (e) {
    if (e.code === 4902)
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xaa36a7",
            chainName: "Ethereum Sepolia",
            rpcUrls: [RPC],
            nativeCurrency: {
              name: "Sepolia ETH",
              symbol: "ETH",
              decimals: 18,
            },
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
    else throw e;
  }
  const provider = new BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID)
    throw new Error("Switch to Ethereum Sepolia (11155111).");
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}
export async function readGameConfig(game) {
  const a = await getArtifacts(),
    g = new Contract(game, a.game.abi, rpc),
    converter = await g.converter(),
    c = new Contract(converter, a.converter.abi, rpc);
  const [
    potAddress,
    oracle,
    token,
    pool,
    poolFee,
    swapRouter,
    weth,
    imageBaseURI,
  ] = await Promise.all([
    g.pot(),
    g.oracle(),
    c.token(),
    c.pool(),
    c.poolFee(),
    c.router(),
    c.weth(),
    g.imageBaseURI(),
  ]);
  if (
    potAddress.toLowerCase() !== POT.toLowerCase() ||
    swapRouter.toLowerCase() !== SWAP_ROUTER.toLowerCase() ||
    weth.toLowerCase() !== WETH.toLowerCase()
  )
    throw new Error("This game has a different pot or swap route.");
  if ((await g.RULES_VERSION()) !== 4n)
    throw new Error("This arena uses a different rules version.");
  const adapter = new Contract(oracle, a.oracle.abi, rpc);
  if (
    (await adapter.wrapper()).toLowerCase() !== WRAPPER.toLowerCase() ||
    (await adapter.game()).toLowerCase() !== game.toLowerCase()
  )
    throw new Error("Unexpected randomness configuration.");
  const tokenContract = new Contract(token, TOKEN_ABI, rpc),
    [tokenDecimals, tokenSymbol] = await Promise.all([
      tokenContract.decimals(),
      tokenContract.symbol(),
    ]);
  return {
    schemaVersion: 4,
    chainId: CHAIN_ID,
    game,
    oracle,
    converter,
    potAddress,
    token,
    pool,
    poolFee: Number(poolFee),
    swapRouter,
    weth,
    quoter: QUOTER,
    imageBaseURI,
    tokenDecimals: Number(tokenDecimals),
    tokenSymbol,
    status: "deployed",
  };
}
export async function readArena(config) {
  const a = await getArtifacts(),
    c = new Contract(config.game, a.game.abi, rpc);
  const block = await rpc.getBlockNumber(),
    opts = { blockTag: block };
  const [
    minted,
    alive,
    round,
    deadline,
    pending,
    received,
    winner,
    totalDeposited,
    mintPrice,
    totalTokenReceived,
  ] = await Promise.all([
    c.minted(opts),
    c.aliveCount(opts),
    c.round(opts),
    c.deadline(opts),
    c.pendingRequest(opts),
    c.randomnessReady(opts),
    c.winner(opts),
    c.totalDeposited(opts),
    c.mintPrice(opts),
    c.totalTokenReceived(opts),
  ]);
  if ((await c.RULES_VERSION(opts)) !== 4n)
    throw new Error("This arena uses a different rules version.");
  const chunks = [];
  for (let start = 1; start <= Number(minted); start += 100)
    chunks.push(
      c.playersPage(start, Math.min(100, Number(minted) - start + 1), opts),
    );
  const data = (await Promise.all(chunks)).flat();
  const players = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    minted: false,
    alive: false,
    owner: "",
    deposited: 0,
    luck: 0,
    roundLuck: 0,
    eliminatedRound: 0,
    finishPosition: 0,
  }));
  data.forEach((p, i) => {
    players[i] = {
      id: i + 1,
      minted: true,
      alive: p.alive,
      owner: p.holder,
      deposited: Number(formatEther(p.deposited)),
      luck: Number(p.luck),
      roundLuck: Number(p.roundLuck),
      eliminatedRound: Number(p.eliminatedRound),
      finishPosition: Number(p.finishPosition),
    };
  });
  return {
    players,
    minted: Number(minted),
    alive: Number(alive),
    round: Number(round),
    deadline: Number(deadline),
    pending: pending !== 0n,
    requestId: pending,
    received,
    winner: Number(winner),
    totalDeposited: Number(formatEther(totalDeposited)),
    potReceived: Number(formatEther(totalDeposited + minted * mintPrice)),
    tokenReceived: formatUnits(totalTokenReceived, config.tokenDecimals),
    mintPrice,
    block,
  };
}
async function assertWallet(wallet) {
  if (Number((await wallet.provider.getNetwork()).chainId) !== CHAIN_ID)
    throw new Error("Reconnect to Ethereum Sepolia.");
}
export async function quoteDeposit(config, amount) {
  const input = parseEther(amount);
  if (input <= 0n) throw new Error("Enter a positive ETH amount.");
  const quoter = new Contract(QUOTER, QUOTER_ABI, rpc);
  const [output] = await quoter.quoteExactInputSingle.staticCall([
    WETH,
    config.token,
    input,
    config.poolFee,
    0,
  ]);
  const minimum = (output * 9950n) / 10000n;
  if (minimum === 0n) throw new Error("Swap output is too small.");
  return {
    amount,
    input,
    output,
    minimum,
    expiresAt: Math.floor(Date.now() / 1000) + 120,
    outputLabel: formatUnits(output, config.tokenDecimals),
    minimumLabel: formatUnits(minimum, config.tokenDecimals),
  };
}
export async function gameWrite(config, wallet, method, args = [], value = 0n) {
  await assertWallet(wallet);
  const a = await getArtifacts(),
    c = new Contract(config.game, a.game.abi, wallet.signer);
  const overrides = { value };
  if (method === "requestRound") {
    const fees = await wallet.provider.getFeeData();
    const gasPrice = fees.gasPrice;
    if (!gasPrice) throw new Error("No gas price available");
    const oracle = new Contract(config.oracle, a.oracle.abi, wallet.provider);
    overrides.gasPrice = gasPrice;
    overrides.value = ((await oracle.quote(gasPrice)) * 120n) / 100n;
    if (overrides.value > parseEther(".02"))
      throw new Error("VRF fee exceeds 0.02 testnet ETH cap.");
  }
  const tx = await c[method](...args, overrides);
  await tx.wait();
  return tx.hash;
}
export async function deliverResult(config, wallet, id) {
  await assertWallet(wallet);
  const a = await getArtifacts(),
    o = new Contract(config.oracle, a.oracle.abi, wallet.signer);
  const result = await o.results(id);
  if (!result.received)
    throw new Error(
      "Chainlink VRF is still processing this request. No new draw will be requested.",
    );
  const tx = await o.deliver(id);
  await tx.wait();
  return tx.hash;
}
export async function validateDeployment(config, provider = rpc) {
  if (!isAddress(config.token) || !config.poolFee || !config.imageBaseURI)
    throw new Error(
      "Configure an NFLX token, liquid Uniswap pool fee, and public NFT image base URI before deployment.",
    );
  if (!/^(https:\/\/|ipfs:\/\/)[^"\\\s]+\/$/.test(config.imageBaseURI))
    throw new Error(
      "The public art base URI must start with https:// or ipfs:// and end with /.",
    );
  for (const address of [WRAPPER, SWAP_ROUTER, WETH, QUOTER, config.token])
    if ((await provider.getCode(address)) === "0x")
      throw new Error(
        "A configured contract is missing on Sepolia: " + address,
      );
  const factory = new Contract(FACTORY, FACTORY_ABI, provider),
    pool = await factory.getPool(WETH, config.token, config.poolFee);
  if (
    pool === ZeroAddress ||
    (config.pool && config.pool.toLowerCase() !== pool.toLowerCase())
  )
    throw new Error("No matching WETH/NFLX Uniswap V3 pool exists.");
  const p = new Contract(
    pool,
    ["function liquidity() view returns(uint128)"],
    provider,
  );
  if ((await p.liquidity()) === 0n)
    throw new Error("The configured pool has no active liquidity.");
  return pool;
}
export async function deployFromWallet(wallet, config, onProgress) {
  await assertWallet(wallet);
  await validateDeployment(config, wallet.provider);
  const a = await getArtifacts();
  const key =
    "squid-grid-sepolia-v4-" +
    wallet.address.toLowerCase() +
    "-" +
    keccak256(
      toUtf8Bytes(
        JSON.stringify([
          config.token,
          config.poolFee,
          config.imageBaseURI,
          POT,
        ]),
      ),
    );
  const progress = JSON.parse(localStorage.getItem(key) || "{}"),
    save = () => localStorage.setItem(key, JSON.stringify(progress));
  const deploy = async (artifact, args, label) => {
    onProgress(label);
    const c = await new ContractFactory(
      artifact.abi,
      artifact.bytecode,
      wallet.signer,
    ).deploy(...args);
    const receipt = await c.deploymentTransaction().wait();
    if (receipt.status !== 1) throw new Error("Deployment failed.");
    return c;
  };
  let o;
  if (progress.oracle)
    o = new Contract(progress.oracle, a.oracle.abi, wallet.signer);
  else {
    o = await deploy(a.oracle, [WRAPPER], "1 / 3 · Deploy Chainlink adapter");
    progress.oracle = await o.getAddress();
    save();
  }
  let g;
  if (progress.game) g = new Contract(progress.game, a.game.abi, wallet.signer);
  else {
    g = await deploy(
      a.game,
      [
        progress.oracle,
        POT,
        parseEther(MINT_PRICE),
        SWAP_ROUTER,
        WETH,
        config.token,
        config.poolFee,
        config.imageBaseURI,
      ],
      "2 / 3 · Deploy game and swap converter",
    );
    progress.game = await g.getAddress();
    save();
  }
  const bound = await o.game();
  if (bound === ZeroAddress) {
    onProgress("3 / 3 · Permanently bind game");
    await (await o.bindGame(progress.game)).wait();
  } else if (bound.toLowerCase() !== progress.game.toLowerCase())
    throw new Error("Oracle is bound to a different game.");
  const result = await readGameConfig(progress.game);
  Object.assign(progress, result, {
    rpcUrl: RPC,
    explorer: EXPLORER,
    wrapper: WRAPPER,
    mintPrice: MINT_PRICE,
  });
  save();
  return progress;
}
