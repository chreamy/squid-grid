// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
}

interface IUniswapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
    function factory() external view returns (address);
    function WETH9() external view returns (address);
}

interface IV3Factory {
    function getPool(address, address, uint24) external view returns (address);
}

/// @notice Immutable, game-only ETH -> NFLX single-pool Uniswap V3 conversion.
contract DepositConverter {
    using SafeERC20 for IERC20;
    address public immutable game;
    address public immutable pot;
    IUniswapRouter public immutable router;
    IWETH public immutable weth;
    IERC20 public immutable token;
    address public immutable pool;
    uint24 public immutable poolFee;
    error InvalidSwap();

    constructor(address pot_, address router_, address weth_, address token_, uint24 fee_) {
        if (
            pot_ == address(0) || pot_ == address(1) || pot_ == address(2) || router_.code.length == 0
                || weth_.code.length == 0 || token_.code.length == 0 || weth_ == token_
        ) revert InvalidSwap();
        game = msg.sender;
        pot = pot_;
        router = IUniswapRouter(router_);
        weth = IWETH(weth_);
        token = IERC20(token_);
        poolFee = fee_;
        if (router.WETH9() != weth_) revert InvalidSwap();
        address pool_ = IV3Factory(router.factory()).getPool(weth_, token_, fee_);
        if (pool_.code.length == 0) revert InvalidSwap();
        pool = pool_;
    }

    function convert(uint256 minimumOut, uint256 expiresAt) external payable returns (uint256 received) {
        if (msg.sender != game || msg.value == 0 || minimumOut == 0 || block.timestamp > expiresAt) {
            revert InvalidSwap();
        }
        uint256 beforeOut = token.balanceOf(pot);
        uint256 beforeIn = weth.balanceOf(address(this));
        weth.deposit{value: msg.value}();
        IERC20(address(weth)).forceApprove(address(router), msg.value);
        router.exactInputSingle(
            IUniswapRouter.ExactInputSingleParams(address(weth), address(token), poolFee, pot, msg.value, minimumOut, 0)
        );
        IERC20(address(weth)).forceApprove(address(router), 0);
        received = token.balanceOf(pot) - beforeOut;
        // Revert partial input consumption: all ETH credited as luck must actually be spent.
        if (received < minimumOut || weth.balanceOf(address(this)) != beforeIn) revert InvalidSwap();
    }
}
