export const POT = "0x73da00df8c64c49a91892e263f52538323bc7ecf";
export const SWAP_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
export const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
export const QUOTER = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3";
export const FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";
export const TOKEN_ABI = [
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function balanceOf(address) view returns(uint256)",
];
export const FACTORY_ABI = [
  "function getPool(address,address,uint24) view returns(address)",
];
export const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
];
