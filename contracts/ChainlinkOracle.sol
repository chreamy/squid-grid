// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Native-payment subset of Chainlink's official IVRFV2PlusWrapper API.
/// https://github.com/smartcontractkit/chainlink-evm/blob/develop/contracts/src/v0.8/vrf/interfaces/IVRFV2PlusWrapper.sol
interface IVRFWrapper {
    function calculateRequestPriceNative(uint32, uint32) external view returns (uint256);
    function estimateRequestPriceNative(uint32, uint32, uint256) external view returns (uint256);
    function requestRandomWordsInNative(uint32, uint16, uint32, bytes calldata) external payable returns (uint256);
}

interface IRandomConsumer {
    function rawFulfillRandomness(uint256, uint256) external;
}

/// @notice Chainlink VRF v2.5 adapter. No cancellation, redraw, upgrade, or operator-provided word.
contract ChainlinkOracle {
    IVRFWrapper public immutable wrapper;
    address public immutable deployer;
    address public game;
    uint32 public constant CALLBACK_GAS = 200_000;
    uint16 public constant CONFIRMATIONS = 3;

    struct Result {
        bool requested;
        bool received;
        uint256 word;
    }
    mapping(uint256 => Result) public results;
    event GameBound(address indexed game);
    event ResultStored(uint256 indexed requestId, uint256 word);
    error Unauthorized();
    error InvalidRequest();

    constructor(address wrapper_) {
        if (wrapper_.code.length == 0) revert InvalidRequest();
        wrapper = IVRFWrapper(wrapper_);
        deployer = msg.sender;
    }

    /// @notice Single setup operation; nobody can change the game after binding.
    function bindGame(address game_) external {
        if (msg.sender != deployer || game != address(0) || game_.code.length == 0) revert Unauthorized();
        game = game_;
        emit GameBound(game_);
    }

    function requestFee() external view returns (uint256) {
        return wrapper.calculateRequestPriceNative(CALLBACK_GAS, 1);
    }

    function quote(uint256 gasPrice) external view returns (uint256) {
        return wrapper.estimateRequestPriceNative(CALLBACK_GAS, 1, gasPrice);
    }

    function requestRandomness(uint32) external payable returns (uint256 id) {
        if (msg.sender != game) revert Unauthorized();
        uint256 cost = wrapper.calculateRequestPriceNative(CALLBACK_GAS, 1);
        if (msg.value != cost) revert InvalidRequest();
        id = wrapper.requestRandomWordsInNative{value: cost}(
            CALLBACK_GAS, CONFIRMATIONS, 1, abi.encodeWithSelector(bytes4(keccak256("VRF ExtraArgsV1")), true)
        );
        if (id == 0 || results[id].requested) revert InvalidRequest();
        results[id].requested = true;
    }

    /// @notice Store only. Permissionless delivery happens separately so game callback failure
    /// cannot discard a verified Chainlink result or cause a redraw.
    function rawFulfillRandomWords(uint256 id, uint256[] calldata words) external {
        if (msg.sender != address(wrapper)) revert Unauthorized();
        Result storage result = results[id];
        if (!result.requested || result.received || words.length != 1) revert InvalidRequest();
        result.received = true;
        result.word = words[0];
        emit ResultStored(id, words[0]);
    }

    function deliver(uint256 id) external {
        Result storage result = results[id];
        if (!result.received) revert InvalidRequest();
        IRandomConsumer(game).rawFulfillRandomness(id, result.word);
    }
}
