// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {SquidGrid} from "../contracts/SquidGrid.sol";
import {MockOracle} from "./SquidGrid.t.sol";
import {MockToken} from "./SwapMocks.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

interface IWETHFork is IERC20 {
    function deposit() external payable;
}

interface IPositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    function createAndInitializePoolIfNecessary(address, address, uint24, uint160) external payable returns (address);
    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256);
}

contract SepoliaForkTest is Test {
    function testSepoliaDeployedRouterSwapsIntoPot() public {
        vm.skip(!vm.envOr("SEPOLIA_FORK_TEST", false));
        address weth = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
        address router = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
        IPositionManager manager = IPositionManager(0x1238536071E1c677A632429e3655c799b22cDA52);
        vm.deal(address(this), 10 ether);
        MockToken token = new MockToken("TEST_NFLX_LOCAL_FORK");
        token.mint(address(this), 5 ether);
        IWETHFork(weth).deposit{value: 5 ether}();
        IERC20(weth).approve(address(manager), 5 ether);
        token.approve(address(manager), 5 ether);
        (address token0, address token1) = weth < address(token) ? (weth, address(token)) : (address(token), weth);
        manager.createAndInitializePoolIfNecessary(token0, token1, 3000, uint160(1 << 96));
        manager.mint(
            IPositionManager.MintParams(
                token0,
                token1,
                3000,
                -887220,
                887220,
                2 ether,
                2 ether,
                1 ether,
                1 ether,
                address(this),
                block.timestamp + 60
            )
        );
        address pot = address(0xCAFE);
        address alice = address(0xA11CE);
        vm.deal(alice, 1 ether);
        uint256 potBefore = pot.balance;
        MockOracle oracle = new MockOracle();
        SquidGrid game = new SquidGrid(
            address(oracle), pot, 0.001 ether, router, weth, address(token), 3000, "https://example.test/nft/"
        );
        vm.startPrank(alice);
        game.mint{value: 0.001 ether}(1);
        game.boost{value: 0.01 ether}(1, 0.009 ether, block.timestamp + 60);
        vm.stopPrank();
        assertEq(pot.balance - potBefore, 0.001 ether);
        assertGe(token.balanceOf(pot), 0.009 ether);
        assertEq(game.totalTokenReceived(), token.balanceOf(pot));
        assertEq(game.luck(1), 100000);
        assertEq(IERC20(weth).balanceOf(address(game.converter())), 0);
        assertEq(IERC20(weth).allowance(address(game.converter()), router), 0);
    }
}
