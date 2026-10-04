export const CHAIN_ID = 11155111;
export const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.etherscan.io";
export const WRAPPER = "0x195f15F2d49d693cE265b4fB0fdDbE15b1850Cc1";
export const MINT_PRICE = "0.001";
export const BASE = 0.01;
export const luckFor = (eth) => Math.floor(eth * 10000000 + 1e-7);
export function probabilities(players, { snapshot = true } = {}) {
  const live = players.filter((p) => p.alive),
    n = live.length;
  const score = (p) => (snapshot ? (p.roundLuck ?? p.luck) : p.luck);
  const total = live.reduce((s, p) => s + score(p), 0);
  return new Map(
    live.map((p) => [
      p.id,
      n < 2
        ? 0
        : total === 0
          ? 1 / n
          : (2 * total - score(p)) / (total * (2 * n - 1)),
    ]),
  );
}
export function demoPlayers() {
  return Array.from({ length: 1000 }, (_, i) => {
    const id = i + 1,
      dead = (id * 73) % 1000 < 154 && id !== 456;
    const deposited =
      id === 456
        ? 0.03
        : (id * 37) % 19 === 0
          ? (((id * 13) % 8) + 1) / 100
          : 0;
    const luck = dead ? 0 : luckFor(deposited),
      eliminatedRound = dead ? ((id * 11) % 154) + 1 : 0;
    return {
      id,
      alive: !dead,
      minted: true,
      deposited,
      luck,
      roundLuck: luck,
      owner: id === 456 ? "YOUR PREVIEW NFT" : "",
      eliminatedRound,
      finishPosition: dead ? 1001 - eliminatedRound : 0,
    };
  });
}
