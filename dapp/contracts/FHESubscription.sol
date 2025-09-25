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

// 导入通用类型定义
import {TierPrice, Channel,Signal} from "./common.sol";



contract FHESubscriptionManager is SepoliaConfig, Ownable {

    error ChannelNotFound();
    error NotChannelOwner();


    constructor() Ownable(msg.sender) 
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
        channel.tierCount = tiers.length;
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


    function getChannelSignals(uint256 channelId) external view returns (Signal[] memory) {
        uint256[] memory signalIds = _channels[channelId].signalIds;
        Signal[] memory signals = new Signal[](signalIds.length);
        for (uint256 i = 0; i < signalIds.length; i++) {
            signals[i] = _signals[signalIds[i]];
        }
        return signals;
    }











}