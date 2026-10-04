// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";
import {IUniswapRouter} from "../contracts/DepositConverter.sol";

contract MockToken is ERC20 {
    constructor(string memory n) ERC20(n, n) {}

    function mint(address to, uint256 n) external {
        _mint(to, n);
    }
}

contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped test ETH", "WETH") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }
}

contract MockSwapRouter {
    MockWETH public weth;
    MockToken public token;
    bool public failSwap;
    bool public partialFill;

    constructor() {
        weth = new MockWETH();
        token = new MockToken("TEST_NFLX");
    }

    function WETH9() external view returns (address) {
        return address(weth);
    }

    function factory() external view returns (address) {
        return address(this);
    }

    function getPool(address a, address b, uint24 f) external view returns (address) {
        return a == address(weth) && b == address(token) && f == 3000 ? address(this) : address(0);
    }

    function setFailure(bool f, bool p) external {
        failSwap = f;
        partialFill = p;
    }

    function exactInputSingle(IUniswapRouter.ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        require(!failSwap, "swap failed");
        require(p.tokenIn == address(weth) && p.tokenOut == address(token) && p.fee == 3000);
        uint256 input = partialFill ? p.amountIn / 2 : p.amountIn;
        weth.transferFrom(msg.sender, address(this), input);
        out = input * 100;
        require(out >= p.amountOutMinimum, "slippage");
        token.mint(p.recipient, out);
    }
}
