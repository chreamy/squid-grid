// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC721} from "openzeppelin-contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/utils/ReentrancyGuard.sol";
import {Math} from "openzeppelin-contracts/utils/math/Math.sol";
import {Strings} from "openzeppelin-contracts/utils/Strings.sol";
import {Base64} from "openzeppelin-contracts/utils/Base64.sol";
import {DepositConverter} from "./DepositConverter.sol";

interface IGridOracle {
    function requestRandomness(uint32 gasLimit) external payable returns (uint256);
    function requestFee() external view returns (uint256);
}

/// @notice 1,000 enter, one survives. Immutable rules, snapshot odds, transferable numbered Player NFTs.
contract SquidGrid is ERC721, ReentrancyGuard {
    uint256 public constant RULES_VERSION = 4;
    uint256 public constant MAX_PLAYERS = 1000;
    uint256 public constant ROUND_INTERVAL = 10 minutes;
    uint256 public constant LUCK_SCALE = 100_000;
    uint256 public constant DEPOSIT_UNIT = 0.01 ether;
    uint256 public constant MAX_DEPOSIT = 1e30;
    IGridOracle public immutable oracle;
    address payable public immutable pot;
    DepositConverter public immutable converter;
    string public imageBaseURI;
    uint256 public totalTokenReceived;
    uint256 public immutable mintPrice;
    uint256 public minted;
    uint256 public aliveCount;
    uint256 public totalLuck;
    uint256 public roundTotalLuck;
    uint256 public totalDeposited;
    uint256 public round;
    uint256 public deadline;
    uint256 public pendingRequest;
    uint256 public randomWord;
    bool public randomnessReady;
    uint256 public winner;
    mapping(address => uint256) public refundCredit;
    mapping(uint256 => bool) public alive;
    mapping(uint256 => uint256) public deposited;
    mapping(uint256 => uint256) public luck;
    mapping(uint256 => uint256) public eliminatedRound;
    mapping(uint256 => uint256) public finishPosition;
    // Copy-on-write snapshots: first update in a round preserves its start value.
    mapping(uint256 => uint256) private luckEpoch;
    mapping(uint256 => uint256) private oldLuck;
    uint256[1025] private countTree;
    uint256[1025] private luckTree;
    uint256[1025] private treeEpoch;
    uint256[1025] private oldTreeLuck;

    struct PlayerView {
        address holder;
        bool alive;
        uint256 deposited;
        uint256 luck;
        uint256 roundLuck;
        uint256 eliminatedRound;
        uint256 finishPosition;
    }
    event Entered(address indexed holder, uint256 indexed tokenId);
    event GameStarted(uint256 deadline);
    event ProtectionAdded(
        uint256 indexed tokenId, address indexed sponsor, uint256 amount, uint256 luck, uint256 effectiveRound
    );
    event DepositSwapped(uint256 indexed tokenId, uint256 ethIn, uint256 tokenOut);
    event RoundRequested(uint256 indexed round, uint256 indexed requestId);
    event RandomnessReceived(uint256 indexed requestId);
    event Eliminated(
        uint256 indexed tokenId, uint256 indexed round, uint256 position, uint256 requestId, uint256 randomWord
    );
    event WinnerCrowned(uint256 indexed tokenId, address indexed holder);
    error InvalidInput();
    error WrongPhase();
    error UnauthorizedOracle();

    constructor(
        address oracle_,
        address pot_,
        uint256 price,
        address swapRouter,
        address weth,
        address token,
        uint24 poolFee,
        string memory artBaseURI
    ) ERC721("Squid Grid: Player", "SQUID") {
        if (oracle_.code.length == 0 || pot_ == address(0) || bytes(artBaseURI).length == 0) {
            revert InvalidInput();
        }
        bytes memory uri = bytes(artBaseURI);
        if (uri.length > 300 || uri[uri.length - 1] != bytes1("/")) revert InvalidInput();
        for (uint256 i; i < uri.length; ++i) {
            if (uint8(uri[i]) < 33 || uint8(uri[i]) > 126 || uri[i] == bytes1(uint8(34)) || uri[i] == bytes1(uint8(92)))
            {
                revert InvalidInput();
            }
        }
        oracle = IGridOracle(oracle_);
        mintPrice = price;
        pot = payable(pot_);
        imageBaseURI = artBaseURI;
        converter = new DepositConverter(pot_, swapRouter, weth, token, poolFee);
    }

    function mint(uint256 quantity) external payable nonReentrant {
        if (quantity == 0 || quantity > 20 || minted + quantity > MAX_PLAYERS || msg.value != mintPrice * quantity) {
            revert InvalidInput();
        }
        for (uint256 n; n < quantity; ++n) {
            uint256 id = ++minted;
            alive[id] = true;
            ++aliveCount;
            for (uint256 i = id; i <= MAX_PLAYERS; i += i & (~i + 1)) {
                ++countTree[i];
            }
            _safeMint(msg.sender, id);
            emit Entered(msg.sender, id);
        }
        if (msg.value != 0) {
            (bool ok,) = pot.call{value: msg.value}("");
            if (!ok) revert InvalidInput();
        }
        if (minted == MAX_PLAYERS) {
            round = 1;
            roundTotalLuck = totalLuck;
            deadline = block.timestamp + ROUND_INTERVAL;
            emit GameStarted(deadline);
        }
    }

    /// @notice Anyone may sponsor any living NFT, including during a pending draw.
    /// Deposits during round R only affect R+1 if that NFT survives.
    function boost(uint256 id, uint256 minimumTokenOut, uint256 expiresAt) external payable nonReentrant {
        if (!alive[id] || winner != 0) revert WrongPhase();
        uint256 cumulative = deposited[id] + msg.value;
        if (msg.value == 0 || cumulative > MAX_DEPOSIT) revert InvalidInput();
        uint256 before_ = luck[id];
        uint256 after_ = luckFor(cumulative);
        if (round != 0 && luckEpoch[id] != round) {
            luckEpoch[id] = round;
            oldLuck[id] = before_;
        }
        deposited[id] = cumulative;
        luck[id] = after_;
        totalLuck += after_ - before_;
        totalDeposited += msg.value;
        _changeTreeLuck(id, before_, after_);
        uint256 received = converter.convert{value: msg.value}(minimumTokenOut, expiresAt);
        totalTokenReceived += received;
        emit DepositSwapped(id, msg.value, received);
        emit ProtectionAdded(id, msg.sender, msg.value, after_, round == 0 ? 1 : round + 1);
    }

    function requestRound() external payable nonReentrant {
        if (round == 0 || winner != 0 || block.timestamp < deadline || pendingRequest != 0) revert WrongPhase();
        uint256 fee = oracle.requestFee();
        if (msg.value < fee) revert InvalidInput();
        refundCredit[msg.sender] += msg.value - fee;
        pendingRequest = oracle.requestRandomness{value: fee}(100_000);
        if (pendingRequest == 0) revert InvalidInput();
        emit RoundRequested(round, pendingRequest);
    }

    function rawFulfillRandomness(uint256 requestId, uint256 word) external {
        if (msg.sender != address(oracle)) revert UnauthorizedOracle();
        if (requestId == 0 || requestId != pendingRequest || randomnessReady) revert WrongPhase();
        randomWord = word;
        randomnessReady = true;
        emit RandomnessReceived(requestId);
    }

    function settleRound() external nonReentrant returns (uint256 id) {
        if (!randomnessReady || pendingRequest == 0 || winner != 0) revert WrongPhase();
        uint256 requestId = pendingRequest;
        uint256 word = randomWord;
        id = _sample(_uniform(word, totalRisk()));
        finishPosition[id] = aliveCount;
        alive[id] = false;
        eliminatedRound[id] = round;
        _changeTreeLuck(id, luck[id], 0);
        totalLuck -= luck[id];
        luck[id] = 0;
        for (uint256 i = id; i <= MAX_PLAYERS; i += i & (~i + 1)) {
            --countTree[i];
        }
        --aliveCount;
        pendingRequest = 0;
        randomnessReady = false;
        randomWord = 0;
        emit Eliminated(id, round, finishPosition[id], requestId, word);
        if (aliveCount == 1) {
            winner = _firstAlive();
            finishPosition[winner] = 1;
            deadline = 0;
            roundTotalLuck = totalLuck;
            emit WinnerCrowned(winner, ownerOf(winner));
        } else {
            ++round;
            roundTotalLuck = totalLuck;
            deadline = block.timestamp + ROUND_INTERVAL;
        }
    }

    function withdrawRefund(address payable recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidInput();
        uint256 amount = refundCredit[msg.sender];
        refundCredit[msg.sender] = 0;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert InvalidInput();
    }

    function oracleFee() external view returns (uint256) {
        return oracle.requestFee();
    }

    /// @notice Round-start score, never changed by in-round deposits.
    function roundLuck(uint256 id) public view returns (uint256) {
        if (!alive[id]) return 0;
        return round != 0 && luckEpoch[id] == round ? oldLuck[id] : luck[id];
    }

    function totalRisk() public view returns (uint256) {
        if (aliveCount <= 1) return 0;
        uint256 total = round == 0 ? totalLuck : roundTotalLuck;
        return total == 0 ? aliveCount : total * (2 * aliveCount - 1);
    }

    function riskWeight(uint256 id) public view returns (uint256) {
        if (!alive[id] || aliveCount <= 1) return 0;
        uint256 total = round == 0 ? totalLuck : roundTotalLuck;
        return total == 0 ? 1 : 2 * total - roundLuck(id);
    }

    function eliminationOdds(uint256 id) external view returns (uint256 numerator, uint256 denominator) {
        return (riskWeight(id), totalRisk());
    }

    /// @notice Linear luck: 100,000 points per 0.01 ETH, floored to a whole point.
    function luckFor(uint256 amount) public pure returns (uint256) {
        if (amount > MAX_DEPOSIT) revert InvalidInput();
        return Math.mulDiv(amount, LUCK_SCALE, DEPOSIT_UNIT);
    }

    function playersPage(uint256 start, uint256 size) external view returns (PlayerView[] memory page) {
        if (start == 0 || size > 100 || start + size > minted + 1) revert InvalidInput();
        page = new PlayerView[](size);
        for (uint256 i; i < size; ++i) {
            uint256 id = start + i;
            page[i] = PlayerView(
                ownerOf(id), alive[id], deposited[id], luck[id], roundLuck(id), eliminatedRound[id], finishPosition[id]
            );
        }
    }

    function _changeTreeLuck(uint256 id, uint256 before_, uint256 after_) private {
        for (uint256 i = id; i <= MAX_PLAYERS; i += i & (~i + 1)) {
            if (round != 0 && treeEpoch[i] != round) {
                treeEpoch[i] = round;
                oldTreeLuck[i] = luckTree[i];
            }
            luckTree[i] = luckTree[i] - before_ + after_;
        }
    }

    function _nodeRoundLuck(uint256 i) private view returns (uint256) {
        return round != 0 && treeEpoch[i] == round ? oldTreeLuck[i] : luckTree[i];
    }

    function _sample(uint256 target) internal view returns (uint256) {
        uint256 index;
        uint256 mass;
        uint256 total = round == 0 ? totalLuck : roundTotalLuck;
        for (uint256 bit = 512; bit > 0; bit >>= 1) {
            uint256 next = index + bit;
            if (next <= MAX_PLAYERS) {
                uint256 segment = total == 0 ? countTree[next] : 2 * total * countTree[next] - _nodeRoundLuck(next);
                if (mass + segment <= target) {
                    mass += segment;
                    index = next;
                }
            }
        }
        return index + 1;
    }

    function _firstAlive() private view returns (uint256) {
        uint256 index;
        for (uint256 bit = 512; bit > 0; bit >>= 1) {
            uint256 next = index + bit;
            if (next <= MAX_PLAYERS && countTree[next] == 0) index = next;
        }
        return index + 1;
    }

    function _uniform(uint256 word, uint256 bound) private pure returns (uint256) {
        uint256 threshold = (type(uint256).max - bound + 1) % bound;
        while (word < threshold) word = uint256(keccak256(abi.encode(word)));
        return word % bound;
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id);
        string memory state = winner == id ? "WINNER" : alive[id] ? "ALIVE" : "DEAD";
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(
                bytes(
                    string.concat(
                        '{"name":"',
                        !alive[id] ? "Dead Player" : "Player",
                        " #",
                        Strings.toString(id),
                        '","description":"1,000 enter. 1 survives. Prize distribution is handled manually by the protocol pot operator.","image":"',
                        imageBaseURI,
                        Strings.toString(id),
                        '.svg","attributes":[{"trait_type":"Status","value":"',
                        state,
                        '"},{"trait_type":"Eliminated round","value":',
                        Strings.toString(eliminatedRound[id]),
                        '},{"trait_type":"Finishing position","value":',
                        Strings.toString(finishPosition[id]),
                        "}]}"
                    )
                )
            )
        );
    }
}
