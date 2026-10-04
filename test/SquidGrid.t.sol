// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {SquidGrid} from "../contracts/SquidGrid.sol";
import {DepositConverter} from "../contracts/DepositConverter.sol";
import {MockSwapRouter, MockToken, MockWETH} from "./SwapMocks.sol";
import {ChainlinkOracle, IVRFWrapper} from "../contracts/ChainlinkOracle.sol";

contract MockOracle {
    uint256 public requestFee;
    uint256 public next = 1;

    function setFee(uint256 f) external {
        requestFee = f;
    }

    function requestRandomness(uint32) external payable returns (uint256) {
        require(msg.value == requestFee);
        return next++;
    }

    function deliver(SquidGrid g, uint256 id, uint256 word) external {
        g.rawFulfillRandomness(id, word);
    }
}

contract GridHarness is SquidGrid {
    constructor(address o, address p, address r, address w, address t)
        SquidGrid(o, p, 0.001 ether, r, w, t, 3000, "https://example.test/nft/")
    {}

    function sample(uint256 target) external view returns (uint256) {
        require(target < totalRisk());
        return _sample(target);
    }
}

contract MockWrapper {
    uint256 public next = 1;
    uint256 public fee = 0.001 ether;

    function calculateRequestPriceNative(uint32, uint32) external view returns (uint256) {
        return fee;
    }

    function estimateRequestPriceNative(uint32, uint32, uint256) external view returns (uint256) {
        return fee;
    }

    function requestRandomWordsInNative(uint32 gasLimit, uint16 confirmations, uint32 words, bytes calldata args)
        external
        payable
        returns (uint256)
    {
        require(msg.value == fee && gasLimit == 200000 && confirmations == 3 && words == 1);
        require(keccak256(args) == keccak256(abi.encodeWithSelector(bytes4(keccak256("VRF ExtraArgsV1")), true)));
        return next++;
    }

    function deliver(ChainlinkOracle o, uint256 id, uint256 word) external {
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        o.rawFulfillRandomWords(id, words);
    }
}

contract GridTest is Test {
    MockOracle oracle;
    GridHarness game;
    MockSwapRouter swap;
    MockToken token;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address protocol = address(0xCAFE);

    function setUp() public {
        vm.warp(1800000000);
        oracle = new MockOracle();
        swap = new MockSwapRouter();
        token = swap.token();
        game = new GridHarness(address(oracle), protocol, address(swap), address(swap.weth()), address(token));
        vm.deal(alice, 5000 ether);
        vm.deal(bob, 5000 ether);
        vm.deal(address(this), 100 ether);
    }

    function fill() internal {
        vm.startPrank(alice);
        while (game.minted() < 1000) {
            uint256 n = 1000 - game.minted();
            if (n > 20) n = 20;
            game.mint{value: n * 0.001 ether}(n);
        }
        vm.stopPrank();
    }

    function draw(uint256 word) internal returns (uint256) {
        vm.warp(game.deadline());
        game.requestRound();
        oracle.deliver(game, game.pendingRequest(), word);
        return game.settleRound();
    }

    function testPaidMintExactlyAndStartsOnlyWhenFull() public {
        vm.prank(alice);
        vm.expectRevert(SquidGrid.InvalidInput.selector);
        game.mint(1);
        vm.prank(alice);
        game.mint{value: 0.001 ether}(1);
        assertEq(game.round(), 0);
        assertEq(protocol.balance, 0.001 ether);
        fill();
        assertEq(game.minted(), 1000);
        assertEq(game.aliveCount(), 1000);
        assertEq(game.deadline(), block.timestamp + 600);
        assertEq(protocol.balance, 1 ether);
        vm.expectRevert(SquidGrid.InvalidInput.selector);
        game.mint{value: 0.001 ether}(1);
    }

    function testLinearLuckValues() public view {
        assertEq(game.luckFor(0), 0);
        for (uint256 k = 1; k <= 10; k++) {
            assertEq(game.luckFor(k * 0.01 ether), k * 100000);
        }
        assertEq(game.luckFor(1 ether), 10000000);
        assertEq(game.luckFor(1), 0);
    }

    function testFuzzLuckMonotonic(uint128 a, uint128 b) public view {
        uint256 low = uint256(a) < uint256(b) ? a : b;
        uint256 high = uint256(a) > uint256(b) ? a : b;
        low = bound(low, 0, game.MAX_DEPOSIT());
        high = bound(high, low, game.MAX_DEPOSIT());
        assertLe(game.luckFor(low), game.luckFor(high));
    }

    function testAnyoneCanSponsorAndFundsArePermanent() public {
        vm.prank(alice);
        game.mint{value: 0.001 ether}(1);
        vm.startPrank(bob);
        game.boost{value: 0.01 ether}(1, 1, block.timestamp + 60);
        game.boost{value: 0.02 ether}(1, 1, block.timestamp + 60);
        vm.stopPrank();
        assertEq(game.luck(1), 300000);
        assertEq(game.deposited(1), 0.03 ether);
        assertEq(protocol.balance, 0.001 ether);
        assertEq(token.balanceOf(protocol), 3 ether);
        assertEq(game.totalTokenReceived(), 3 ether);
        assertEq(address(game).balance, 0);
    }

    function testZeroDepositsGiveEqualOdds() public {
        fill();
        for (uint256 id = 1; id <= 1000; id++) {
            (uint256 n, uint256 d) = game.eliminationOdds(id);
            assertEq(n, 1);
            assertEq(d, 1000);
        }
    }

    function testRoundSnapshotUnaffectedByMultipleSponsorsAndSharedTreeNodes() public {
        fill();
        uint256 total = game.totalRisk();
        vm.startPrank(bob);
        game.boost{value: 0.63 ether}(1, 1, block.timestamp + 60);
        game.boost{value: 0.07 ether}(2, 1, block.timestamp + 60);
        game.boost{value: 0.01 ether}(1, 1, block.timestamp + 60);
        vm.stopPrank();
        assertEq(game.roundLuck(1), 0);
        assertEq(game.roundLuck(2), 0);
        assertEq(game.totalRisk(), total);
        for (uint256 id = 1; id <= 1000; id++) {
            assertEq(game.riskWeight(id), 1);
            assertEq(game.sample(id - 1), id);
        }
        // Deterministic target 999 eliminates token 1000 while all snapshot weights are one.
        uint256 victim = draw(999 + 1000 * (1 << 128));
        assertEq(victim, 1000);
        assertEq(game.roundLuck(1), game.luck(1));
        assertEq(game.roundLuck(2), 700000);
        assertEq(game.roundTotalLuck(), game.totalLuck());
    }

    function testDepositsAndTransfersStayOpenWhileDrawPending() public {
        fill();
        vm.warp(game.deadline());
        game.requestRound();
        vm.prank(bob);
        game.boost{value: 1 ether}(1, 1, block.timestamp + 60);
        vm.prank(alice);
        game.transferFrom(alice, bob, 1);
        assertEq(game.ownerOf(1), bob);
        assertEq(game.roundLuck(1), 0);
        assertGt(game.luck(1), 0);
        oracle.deliver(game, game.pendingRequest(), 999 + 1000 * (1 << 128));
        game.settleRound();
        assertEq(game.roundLuck(1), game.luck(1));
    }

    function testADeadPlayersQueuedLuckAlsoDies() public {
        fill();
        vm.prank(bob);
        game.boost{value: 1 ether}(1000, 1, block.timestamp + 60);
        assertGt(game.totalLuck(), 0);
        uint256 victim = draw(999 + 1000 * (1 << 128));
        assertEq(victim, 1000);
        assertEq(game.luck(victim), 0);
        assertEq(game.roundLuck(victim), 0);
        assertEq(game.totalLuck(), 0);
        assertEq(game.totalRisk(), 999);
        assertEq(game.deposited(victim), 1 ether);
        assertEq(protocol.balance, 1 ether);
        assertEq(token.balanceOf(protocol), 100 ether);
        vm.prank(bob);
        vm.expectRevert(SquidGrid.WrongPhase.selector);
        game.boost{value: 1}(victim, 1, block.timestamp + 60);
    }

    function testSoleLuckHolderHasAtMostDoubleProtection() public {
        vm.prank(alice);
        game.mint{value: 0.001 ether}(1);
        vm.prank(bob);
        game.boost{value: 0.01 ether}(1, 1, block.timestamp + 60);
        fill();
        assertEq(game.riskWeight(1), 100000);
        assertEq(game.riskWeight(2), 200000);
        assertEq(game.sample(0), 1);
    }

    function testThreePlayerExampleExactly() public {
        vm.prank(alice);
        game.mint{value: 0.002 ether}(2);
        vm.startPrank(bob);
        game.boost{value: 0.06 ether}(1, 1, block.timestamp + 60);
        game.boost{value: 0.03 ether}(2, 1, block.timestamp + 60);
        vm.stopPrank();
        fill();
        for (uint256 id = 3; id <= 999; id++) {
            assertEq(draw(2700000 + game.totalRisk() * (1 << 128)), id);
        }
        assertEq(game.aliveCount(), 3);
        assertEq(game.totalRisk(), 4500000);
        assertEq(game.riskWeight(1), 1200000);
        assertEq(game.riskWeight(2), 1500000);
        assertEq(game.riskWeight(1000), 1800000);
    }

    function testZeroLuckFinalistStillHasOneThirdWinChance() public {
        vm.prank(alice);
        game.mint{value: 0.001 ether}(1);
        vm.prank(bob);
        game.boost{value: 1 ether}(1, 1, block.timestamp + 60);
        fill();
        for (uint256 id = 2; id <= 999; ++id) {
            assertEq(draw(10000000 + game.totalRisk() * (1 << 128)), id);
        }
        assertEq(game.aliveCount(), 2);
        assertEq(game.riskWeight(1), 10000000);
        assertEq(game.riskWeight(1000), 20000000);
        assertEq(game.totalRisk(), 30000000);
        assertEq(game.sample(0), 1);
    }

    function testEveryWeightedBoundaryAfterSnapshotActivation() public {
        fill();
        vm.startPrank(bob);
        game.boost{value: 0.03 ether}(456, 1, block.timestamp + 60);
        game.boost{value: 0.07 ether}(800, 1, block.timestamp + 60);
        vm.stopPrank();
        draw(999 + 1000 * (1 << 128));
        uint256 cumulative;
        for (uint256 id = 1; id <= 1000; id++) {
            uint256 weight = game.riskWeight(id);
            if (weight == 0) continue;
            assertEq(game.sample(cumulative), id);
            assertEq(game.sample(cumulative + weight - 1), id);
            cumulative += weight;
        }
        assertEq(cumulative, game.totalRisk());
    }

    function testAuthRequestBindingAndZeroWord() public {
        fill();
        vm.expectRevert(SquidGrid.WrongPhase.selector);
        game.requestRound();
        vm.warp(game.deadline());
        game.requestRound();
        uint256 id = game.pendingRequest();
        vm.expectRevert(SquidGrid.UnauthorizedOracle.selector);
        game.rawFulfillRandomness(id, 0);
        vm.expectRevert(SquidGrid.WrongPhase.selector);
        oracle.deliver(game, id + 1, 0);
        oracle.deliver(game, id, 0);
        assertTrue(game.randomnessReady());
        vm.expectRevert(SquidGrid.WrongPhase.selector);
        oracle.deliver(game, id, 1);
        vm.expectRevert(SquidGrid.WrongPhase.selector);
        game.requestRound();
        game.settleRound();
    }

    function testOracleCostsSeparateAndExcessRefundIsWithdrawable() public {
        fill();
        oracle.setFee(0.001 ether);
        vm.warp(game.deadline());
        game.requestRound{value: 0.002 ether}();
        assertEq(address(oracle).balance, 0.001 ether);
        assertEq(protocol.balance, 1 ether);
        assertEq(game.refundCredit(address(this)), 0.001 ether);
        uint256 before_ = bob.balance;
        game.withdrawRefund(payable(bob));
        assertEq(bob.balance - before_, 0.001 ether);
        assertEq(game.refundCredit(address(this)), 0);
    }

    function testFullSeasonRanksAndPermanentPotRouting() public {
        fill();
        uint256[1001] memory ids;
        for (uint256 i; i < 999; i++) {
            uint256 victim = draw(uint256(keccak256(abi.encode(i))));
            uint256 rank = 1000 - i;
            assertEq(game.finishPosition(victim), rank);
            assertEq(game.eliminatedRound(victim), i + 1);
            ids[rank] = victim;
        }
        ids[1] = game.winner();
        assertEq(game.aliveCount(), 1);
        assertEq(game.finishPosition(ids[1]), 1);
        assertTrue(game.alive(ids[1]));
        assertEq(protocol.balance, 1 ether);
        assertEq(address(game).balance, 0);
        vm.prank(alice);
        game.transferFrom(alice, bob, ids[2]);
        assertEq(game.ownerOf(ids[2]), bob);
        vm.expectRevert(SquidGrid.WrongPhase.selector);
        game.requestRound();
        vm.prank(bob);
        vm.expectRevert(SquidGrid.WrongPhase.selector);
        game.boost{value: 1}(ids[1], 1, block.timestamp + 60);
    }

    function testSwapFailureRevertsFundsLuckAndSnapshotChanges() public {
        fill();
        uint256 before_ = bob.balance;
        swap.setFailure(true, false);
        vm.prank(bob);
        vm.expectRevert();
        game.boost{value: 0.01 ether}(1, 1, block.timestamp + 60);
        assertEq(bob.balance, before_);
        assertEq(game.deposited(1), 0);
        assertEq(game.totalLuck(), 0);
        assertEq(token.balanceOf(protocol), 0);
        swap.setFailure(false, false);
        vm.prank(bob);
        game.boost{value: 0.01 ether}(1, 1, block.timestamp + 60);
        assertEq(game.roundLuck(1), 0);
        assertEq(game.luck(1), 100000);
    }

    function testMinimumOutputExpiryAndPartialConsumptionRevert() public {
        fill();
        vm.prank(bob);
        vm.expectRevert();
        game.boost{value: 0.01 ether}(1, 2 ether, block.timestamp + 60);
        vm.prank(bob);
        vm.expectRevert(DepositConverter.InvalidSwap.selector);
        game.boost{value: 0.01 ether}(1, 1, block.timestamp - 1);
        vm.prank(bob);
        vm.expectRevert(DepositConverter.InvalidSwap.selector);
        game.boost{value: 0.01 ether}(1, 0, block.timestamp + 60);
        swap.setFailure(false, true);
        vm.prank(bob);
        vm.expectRevert(DepositConverter.InvalidSwap.selector);
        game.boost{value: 0.01 ether}(1, 1, block.timestamp + 60);
        assertEq(game.totalDeposited(), 0);
        assertEq(token.balanceOf(protocol), 0);
    }

    function testConverterOnlyGameAndNoResidualApproval() public {
        fill();
        DepositConverter converter = game.converter();
        vm.prank(bob);
        vm.expectRevert(DepositConverter.InvalidSwap.selector);
        converter.convert{value: 0.01 ether}(1, block.timestamp + 60);
        vm.prank(bob);
        game.boost{value: 0.01 ether}(1, 1, block.timestamp + 60);
        assertEq(swap.weth().allowance(address(converter), address(swap)), 0);
        assertEq(swap.weth().balanceOf(address(converter)), 0);
        assertEq(address(converter).balance, 0);
    }

    function testDeadNFTMetadataAndTransfers() public {
        fill();
        uint256 id = draw(type(uint256).max);
        assertEq(game.eliminatedRound(id), 1);
        assertEq(game.finishPosition(id), 1000);
        vm.prank(alice);
        game.transferFrom(alice, bob, id);
        assertEq(game.ownerOf(id), bob);
        assertTrue(bytes(game.tokenURI(id)).length > 200);
    }

    function testChainlinkAdapterPinsGameAndStoresResultBeforeDelivery() public {
        MockWrapper wrapper = new MockWrapper();
        ChainlinkOracle adapter = new ChainlinkOracle(address(wrapper));
        SquidGrid g = new SquidGrid(
            address(adapter),
            protocol,
            0.001 ether,
            address(swap),
            address(swap.weth()),
            address(token),
            3000,
            "https://example.test/nft/"
        );
        vm.prank(bob);
        vm.expectRevert(ChainlinkOracle.Unauthorized.selector);
        adapter.bindGame(address(g));
        adapter.bindGame(address(g));
        vm.expectRevert(ChainlinkOracle.Unauthorized.selector);
        adapter.bindGame(address(game));
        vm.startPrank(alice);
        for (uint256 i; i < 50; i++) {
            g.mint{value: 0.02 ether}(20);
        }
        vm.stopPrank();
        vm.warp(g.deadline());
        g.requestRound{value: 0.001 ether}();
        uint256 id = g.pendingRequest();
        uint256[] memory words = new uint256[](1);
        vm.expectRevert(ChainlinkOracle.Unauthorized.selector);
        adapter.rawFulfillRandomWords(id, words);
        wrapper.deliver(adapter, id, 0);
        assertFalse(g.randomnessReady());
        vm.prank(bob);
        adapter.deliver(id);
        assertTrue(g.randomnessReady());
        g.settleRound();
        assertEq(g.aliveCount(), 999);
        vm.expectRevert();
        adapter.deliver(id);
    }
}
