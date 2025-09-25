// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

// 导入FHE（全同态加密）相关库（用于加密Signal字段）
import {
    FHE,
    ebool, 
    eaddress, 
    euint8,
    externalEbool,
    externalEaddress,
    externalEuint8
} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// 导入通用类型定义
import {TierPrice, Channel,Signal,DurationTier} from "./common.sol";



contract FHESubscriptionManager is SepoliaConfig, Ownable, ERC721, ReentrancyGuard {

    error ChannelNotFound();
    error NotChannelOwner();


    constructor() Ownable(msg.sender) ERC721("ChannelSubscription", "CHSUB") 
    {

    }

    uint256 private _currentChannelId = 0;
    uint256 private _currentSignalId = 0;

    // 频道存储
    mapping(uint256 channelId => Channel channel) private _channels;
    // signalId -> Signal 映射，便于按id查询信号
    mapping(uint256 signalId => Signal signal) private _signals;

    event ChannelCreated(uint256 indexed id, address indexed owner, string info);
    event SignalCreated(uint256 indexed channelId, uint256 indexed signalIndex);
    event Subscribed(
        uint256 indexed tokenId,
        uint256 indexed channelId,
        DurationTier tier,
        uint256 price,
        address indexed subscriber,
        uint256 expiresAt
    );

    // 订阅 NFT 元数据
    struct SubscriptionMeta {
        uint256 channelId;
        uint256 expiresAt;
        DurationTier tier;
    }

    // tokenId -> 订阅信息
    mapping(uint256 tokenId => SubscriptionMeta subscription) private _subscriptionByToken;
    uint256 private _nextSubscriptionTokenId = 1;

    error TierNotFound();
    error IncorrectPayment(uint256 expected, uint256 actual);
    error TransferFailed();

    function createChannel(string memory info, TierPrice[] memory tiers) external onlyOwner returns (uint256) {
        uint256 newId = ++_currentChannelId;

        Channel storage channel = _channels[newId];
        channel.channelId = newId;
        channel.info = info;
        channel.owner = msg.sender;
        channel.createdAt = block.timestamp;
        channel.lastPublishedAt = 0;
        channel.signalCount = 0;

        // 设置价格梯度
        for (uint256 i = 0; i < tiers.length; i++) {
            channel.tiers.push(tiers[i]);
        }

        emit ChannelCreated(newId, msg.sender, info);
        return newId;
    }



    function createSignal(
        uint256 channelId,
        externalEaddress inputToken,
        externalEbool inputDirection,
        externalEuint8 inputLevel,
        bytes calldata proof
    ) external returns (uint256) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        if (channel.owner != msg.sender) revert NotChannelOwner();

        eaddress token = FHE.fromExternal(inputToken, proof);
        ebool direction = FHE.fromExternal(inputDirection, proof);
        euint8 level = FHE.fromExternal(inputLevel, proof);

        uint256 newSignalId = ++_currentSignalId;
        Signal memory signal = Signal({
            signalId: newSignalId,
            channelId: channelId,
            token: token,
            direction: direction,
            level: level
        });
        _signals[newSignalId] = signal;
        channel.signalIds.push(newSignalId);
        channel.signalCount = channel.signalIds.length;
        channel.lastPublishedAt = block.timestamp;


        emit SignalCreated(channelId, newSignalId);
        return newSignalId;
    }


    function getChannel(uint256 id) external view returns (Channel memory) {
        return _channels[id];
    }

    function getSignal(uint256 signalId) external view returns (Signal memory) {
        return _signals[signalId];
    }


    function getChannelSignals(
        uint256 channelId,
        uint256 offset,
        uint256 limit
    ) external view returns (Signal[] memory) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();

        uint256 total = channel.signalIds.length;
        if (offset >= total || limit == 0) {
            return new Signal[](0);
        }

        uint256 available = total - offset;
        uint256 size = available < limit ? available : limit;
        Signal[] memory results = new Signal[](size);

        for (uint256 i = 0; i < size; i++) {
            uint256 idx = total - 1 - offset - i;
            uint256 sigId = channel.signalIds[idx];
            results[i] = _signals[sigId];
        }
        return results;
    }

    function subscribe(uint256 channelId, DurationTier tier)
        external
        payable
        nonReentrant
        returns (uint256)
    {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();

        // 查找对应等级与价格
        uint256 price = 0;
        uint256 foundIndex = 0;
        bool found = false;
        for (uint256 i = 0; i < channel.tiers.length; i++) {
            if (channel.tiers[i].tier == tier) {
                price = channel.tiers[i].price;
                foundIndex = i;
                found = true;
                break;
            }
        }
        if (!found) revert TierNotFound();
        if (msg.value != price) revert IncorrectPayment(price, msg.value);

        // 计算过期时间
        uint256 durationSeconds = _durationForTier(tier);
        uint256 expiresAt = block.timestamp + durationSeconds;

        // mint 订阅 NFT
        uint256 tokenId = _nextSubscriptionTokenId++;
        _safeMint(msg.sender, tokenId);
        _subscriptionByToken[tokenId] = SubscriptionMeta({
            channelId: channelId,
            expiresAt: expiresAt,
            tier: tier
        });

        // 订阅人数 +1
        channel.tiers[foundIndex].subscribers += 1;

        // 付款转给频道所有者
        (bool success, ) = payable(channel.owner).call{value: price}("");
        if (!success) revert TransferFailed();

        emit Subscribed(tokenId, channelId, tier, price, msg.sender, expiresAt);
        return tokenId;
    }

    function getSubscription(uint256 tokenId)
        external
        view
        returns (SubscriptionMeta memory)
    {
        return _subscriptionByToken[tokenId];
    }

    function _durationForTier(DurationTier tier)
        internal
        pure
        returns (uint256)
    {
        if (tier == DurationTier.OneDay) return 1 days;
        if (tier == DurationTier.Month) return 30 days;
        if (tier == DurationTier.Quarter) return 90 days;
        if (tier == DurationTier.HalfYeah) return 180 days;
        // DurationTier.Year
        return 365 days;
    }






    function accessSignal(uint256 signalId) external view returns (bool) {
        Signal memory signal = _signals[signalId];
        if (signal.channelId == 0) revert SignalNotFound();
        return true;
    }






}