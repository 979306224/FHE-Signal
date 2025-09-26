// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

// 导入FHE（全同态加密）相关库（用于加密Signal字段）
import {
    FHE,
    euint8,
    euint64,
    externalEuint8
} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// 导入通用类型定义
import {TierPrice, Channel, Signal, DurationTier, Topic, AllowlistEntry} from "./common.sol";
// 导入NFT工厂
import {NFTFactory} from "./NFTFactory.sol";
import {ChannelNFT} from "./ChannelNFT.sol";
// 导入ReentrancyGuard
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";



contract FHESubscriptionManager is SepoliaConfig, Ownable, ReentrancyGuard {

    error ChannelNotFound();
    error NotChannelOwner();
    error TopicNotFound();
    error NotTopicCreator();
    error TopicExpired();
    error TopicNotExpired();
    error NotInAllowlist();
    error AlreadySubmitted();
    error InvalidEndDate();
    error NotSubscriptionOwner();
    error SubscriptionExpired();
    error ArrayLengthMismatch();
    error ArrayTooLarge();
    error EmptyArray();
    error InvalidValueRange(); // 无效的值范围（min > max等）


    // NFT工厂实例
    NFTFactory public immutable NFT_FACTORY;
    
    constructor() Ownable(msg.sender) {
        // 部署NFT工厂
        NFT_FACTORY = new NFTFactory();
    }

    uint256 private _currentChannelId = 0;
    uint256 private _currentTopicId = 0;
    uint256 private _currentSignalId = 0;

    // 频道存储
    mapping(uint256 channelId => Channel channel) private _channels;
    // Topic存储
    mapping(uint256 topicId => Topic topic) private _topics;
    // signalId -> Signal 映射，便于按id查询信号
    mapping(uint256 signalId => Signal signal) private _signals;
    
    // channel allowlist: channelId => (address => AllowlistEntry)
    mapping(uint256 channelId => mapping(address user => AllowlistEntry)) private _channelAllowlists;
    // 跟踪每个频道的allowlist地址列表: channelId => address[]
    mapping(uint256 channelId => address[]) private _channelAllowlistAddresses;
    // 检查用户是否已经提交过signal: topicId => (address => bool)
    mapping(uint256 topicId => mapping(address user => bool)) private _hasSubmitted;

    event ChannelCreated(uint256 indexed id, address indexed owner, string info);
    event TopicCreated(
        uint256 indexed topicId, 
        uint256 indexed channelId, 
        address indexed creator, 
        string ipfs, 
        uint256 endDate
    );
    event AllowlistUpdated(uint256 indexed channelId, address indexed user, bool added);
    event SignalSubmitted(uint256 indexed topicId, uint256 indexed signalId, address indexed submitter);
    event AverageUpdated(uint256 indexed topicId, uint256 submissionCount);
    event Subscribed(
        uint256 indexed tokenId,
        uint256 indexed channelId,
        DurationTier tier,
        uint256 price,
        address indexed subscriber,
        uint256 expiresAt
    );

    // 已移除旧的订阅元数据结构，现在使用NFT合约管理订阅信息

    error TierNotFound();
    error IncorrectPayment(uint256 expected, uint256 actual);
    error TransferFailed();

    function createChannel(string memory info, TierPrice[] memory tiers) external returns (uint256) {
        uint256 newId = ++_currentChannelId;

        Channel storage channel = _channels[newId];
        channel.channelId = newId;
        channel.info = info;
        channel.owner = msg.sender;
        channel.createdAt = block.timestamp;
        channel.lastPublishedAt = 0;

        // 设置价格梯度
        for (uint256 i = 0; i < tiers.length; i++) {
            channel.tiers.push(tiers[i]);
        }

        // 为频道创建NFT合约
        address nftContract = NFT_FACTORY.createChannelNFT(newId, info);
        channel.nftContract = nftContract;

        emit ChannelCreated(newId, msg.sender, info);
        return newId;
    }



    /**
     * @dev 创建新的topic
     * @param channelId 频道ID
     * @param ipfs IPFS哈希，描述topic内容
     * @param endDate topic结束日期（时间戳）
     * @param minValue 最小允许值
     * @param maxValue 最大允许值
     * @param defaultValue 默认值（当输入超出范围时使用）
     * @return topicId 新创建的topic ID
     */
    function createTopic(
        uint256 channelId,
        string memory ipfs,
        uint256 endDate,
        uint8 minValue,
        uint8 maxValue,
        uint8 defaultValue
    ) external returns (uint256) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        if (channel.owner != msg.sender) revert NotChannelOwner();
        if (endDate <= block.timestamp) revert InvalidEndDate();
        
        // 验证值范围配置
        if (minValue > maxValue) revert InvalidValueRange();
        if (defaultValue < minValue || defaultValue > maxValue) revert InvalidValueRange();

        uint256 newTopicId = ++_currentTopicId;
        
        // 初始化FHE加密的零值
        euint64 zeroValue = FHE.asEuint64(0);
        
        Topic storage topic = _topics[newTopicId];
        topic.topicId = newTopicId;
        topic.channelId = channelId;
        topic.ipfs = ipfs;
        topic.endDate = endDate;
        topic.creator = msg.sender;
        topic.createdAt = block.timestamp;
        
        // 设置值范围配置
        topic.minValue = minValue;
        topic.maxValue = maxValue;
        topic.defaultValue = defaultValue;
        
        // 初始化计算相关字段
        topic.totalWeightedValue = zeroValue;
        topic.average = zeroValue;
        topic.totalWeight = 0;
        topic.submissionCount = 0;

        emit TopicCreated(newTopicId, channelId, msg.sender, ipfs, endDate);
        return newTopicId;
    }


    /**
     * @dev 批量添加地址到channel的allowlist
     * @param channelId channel ID
     * @param users 用户地址数组
     * @param weights 用户权重数组（明文）
     */
    function batchAddToAllowlist(
        uint256 channelId,
        address[] calldata users,
        uint64[] calldata weights
    ) external {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        if (channel.owner != msg.sender) revert NotChannelOwner();

        // 安全检查
        if (users.length == 0) revert EmptyArray();
        if (users.length > 100) revert ArrayTooLarge(); // 限制批量操作大小以防止gas用尽
        
        // 检查数组长度一致性
        if (users.length != weights.length) {
            revert ArrayLengthMismatch();
        }

        // 批量处理每个用户
        for (uint256 i = 0; i < users.length; i++) {
            // 如果用户不在allowlist中，添加到地址列表
            if (!_channelAllowlists[channelId][users[i]].exists) {
                _channelAllowlistAddresses[channelId].push(users[i]);
            }

            _channelAllowlists[channelId][users[i]] = AllowlistEntry({
                user: users[i],
                weight: weights[i],
                exists: true
            });

            emit AllowlistUpdated(channelId, users[i], true);
        }
    }


    /**
     * @dev 批量从allowlist中移除地址
     * @param channelId channel ID
     * @param users 用户地址数组
     */
    function batchRemoveFromAllowlist(uint256 channelId, address[] calldata users) external {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        if (channel.owner != msg.sender) revert NotChannelOwner();

        // 安全检查
        if (users.length == 0) revert EmptyArray();
        if (users.length > 100) revert ArrayTooLarge(); // 限制批量操作大小以防止gas用尽

        // 批量移除用户
        for (uint256 i = 0; i < users.length; i++) {
            // 从allowlist中移除
            delete _channelAllowlists[channelId][users[i]];
            
            // 从地址列表中移除
            _removeFromAddressList(channelId, users[i]);
            
            emit AllowlistUpdated(channelId, users[i], false);
        }
    }
    /**
     * @dev 内部函数：从地址列表中移除指定地址
     * @param channelId 频道ID
     * @param user 要移除的用户地址
     */
    function _removeFromAddressList(uint256 channelId, address user) internal {
        address[] storage addresses = _channelAllowlistAddresses[channelId];
        for (uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i] == user) {
                // 将最后一个元素移到当前位置，然后删除最后一个元素
                addresses[i] = addresses[addresses.length - 1];
                addresses.pop();
                break;
            }
        }
    }

    /**
     * @dev 获取指定频道的所有allowlist条目
     * @param channelId 频道ID
     * @return allowlist 所有allowlist条目的数组
     */
    function getAllowlist(uint256 channelId) external view returns (AllowlistEntry[] memory) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        
        address[] storage addresses = _channelAllowlistAddresses[channelId];
        AllowlistEntry[] memory allowlist = new AllowlistEntry[](addresses.length);
        
        for (uint256 i = 0; i < addresses.length; i++) {
            allowlist[i] = _channelAllowlists[channelId][addresses[i]];
        }
        
        return allowlist;
    }

    /**
     * @dev 获取指定频道的allowlist地址数量
     * @param channelId 频道ID
     * @return count allowlist中的地址数量
     */
    function getAllowlistCount(uint256 channelId) external view returns (uint256) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        
        return _channelAllowlistAddresses[channelId].length;
    }

    /**
     * @dev 分页获取allowlist条目（节省gas，避免返回大量数据）
     * @param channelId 频道ID
     * @param offset 偏移量
     * @param limit 限制数量
     * @return allowlist 指定范围的allowlist条目
     * @return total 总条目数
     */
    function getAllowlistPaginated(
        uint256 channelId, 
        uint256 offset, 
        uint256 limit
    ) external view returns (AllowlistEntry[] memory allowlist, uint256 total) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        
        address[] storage addresses = _channelAllowlistAddresses[channelId];
        total = addresses.length;
        
        // 检查偏移量
        if (offset >= total) {
            return (new AllowlistEntry[](0), total);
        }
        
        // 计算实际返回的数量
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 actualLength = end - offset;
        
        // 创建结果数组
        allowlist = new AllowlistEntry[](actualLength);
        for (uint256 i = 0; i < actualLength; i++) {
            allowlist[i] = _channelAllowlists[channelId][addresses[offset + i]];
        }
        
        return (allowlist, total);
    }
    /**
     * @dev 提交signal到指定topic
     * @param topicId topic ID
     * @param inputValue signal值（0-255，FHE加密）
     * @param proof FHE证明
     * @return signalId 新创建的signal ID
     */
    function submitSignal(
        uint256 topicId,
        externalEuint8 inputValue,
        bytes calldata proof
    ) external returns (uint256) {
        Topic storage topic = _topics[topicId];
        if (topic.topicId == 0) revert TopicNotFound();
        if (block.timestamp >= topic.endDate) revert TopicExpired();
        
        // 检查用户是否在channel的allowlist中
        AllowlistEntry storage allowlistEntry = _channelAllowlists[topic.channelId][msg.sender];
        if (!allowlistEntry.exists) revert NotInAllowlist();
        
        // 检查用户是否已经提交过
        if (_hasSubmitted[topicId][msg.sender]) revert AlreadySubmitted();

        euint8 value = FHE.fromExternal(inputValue, proof);
        
        value = FHE.select(FHE.lt(value, topic.minValue), FHE.asEuint8(topic.defaultValue), value);
        value = FHE.select(FHE.gt(value, topic.maxValue), FHE.asEuint8(topic.defaultValue), value);
        
        // 创建signal
        uint256 newSignalId = ++_currentSignalId;
        Signal memory signal = Signal({
            signalId: newSignalId,
            channelId: topic.channelId,
            topicId: topicId,
            submitter: msg.sender,
            value: value,
            submittedAt: block.timestamp
        });
        _signals[newSignalId] = signal;
        
        // 标记用户已提交
        _hasSubmitted[topicId][msg.sender] = true;
        
        // 更新加权平均值
        _updateAverage(topicId, value, allowlistEntry.weight);
        
        emit SignalSubmitted(topicId, newSignalId, msg.sender);
        return newSignalId;
    }

    /**
     * @dev 内部函数：更新topic的加权平均值
     * @param topicId topic ID
     * @param value 新提交的值（FHE加密）
     * @param weight 提交者的明文权重
     */
    function _updateAverage(uint256 topicId, euint8 value, uint64 weight) internal {
        Topic storage topic = _topics[topicId];
        
        // 将uint8的value扩展为uint64进行计算
        euint64 valueAs64 = FHE.asEuint64(value);
        
        // 计算加权值：weight * value（权重是明文，可以直接相乘）
        euint64 weightedValue = FHE.mul(valueAs64, weight);
        
        // 更新总加权值和总权重
        topic.totalWeightedValue = FHE.add(topic.totalWeightedValue, weightedValue);
        topic.totalWeight += weight;

        // 更新提交次数
        topic.submissionCount++;
        
        // 计算真正的加权平均值：sum(weight * value) / sum(weight)
        // 这样结果就能保持在原始值的范围内
        if (topic.totalWeight > 0) {
            topic.average = FHE.div(topic.totalWeightedValue, uint64(topic.totalWeight));
        }
        
        emit AverageUpdated(topicId, topic.submissionCount);
    }


    function getChannel(uint256 id) external view returns (Channel memory) {
        return _channels[id];
    }

    function getSignal(uint256 signalId) external view returns (Signal memory) {
        return _signals[signalId];
    }

    /**
     * @dev 获取topic信息
     * @param topicId topic ID
     * @return topic topic信息
     */
    function getTopic(uint256 topicId) external view returns (Topic memory) {
        return _topics[topicId];
    }

    /**
     * @dev 检查用户是否在channel的allowlist中
     * @param channelId channel ID
     * @param user 用户地址
     * @return 是否在allowlist中
     */
    function isInAllowlist(uint256 channelId, address user) external view returns (bool) {
        return _channelAllowlists[channelId][user].exists;
    }

    /**
     * @dev 检查用户是否已经提交过signal
     * @param topicId topic ID
     * @param user 用户地址
     * @return 是否已提交
     */
    function hasSubmitted(uint256 topicId, address user) external view returns (bool) {
        return _hasSubmitted[topicId][user];
    }


    /**
     * @dev 获取topic下的所有signals（注意：signals现在属于topics而不是channels）
     * @param topicId topic ID
     * @return signals topic下的所有signals（按提交时间排序）
     */
    function getTopicSignals(uint256 topicId) external view returns (Signal[] memory) {
        Topic storage topic = _topics[topicId];
        if (topic.topicId == 0) revert TopicNotFound();

        // 由于我们没有在Topic中存储signalIds数组，需要遍历所有signals
        // 这种方法效率较低，实际项目中可能需要优化
        uint256 count = 0;
        uint256 totalSignals = _currentSignalId;
        
        // 首先计算属于这个topic的signal数量
        for (uint256 i = 1; i <= totalSignals; i++) {
            if (_signals[i].topicId == topicId) {
                count++;
            }
        }
        
        // 创建结果数组并填充
        Signal[] memory results = new Signal[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= totalSignals; i++) {
            if (_signals[i].topicId == topicId) {
                results[index] = _signals[i];
                index++;
            }
        }
        
        return results;
    }

    /**
     * @dev 获取频道下的所有topics
     * @param channelId 频道ID
     * @return topics 频道下的所有topics
     */
    function getChannelTopics(uint256 channelId) external view returns (Topic[] memory) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();

        // 计算属于这个频道的topic数量
        uint256 count = 0;
        uint256 totalTopics = _currentTopicId;
        
        for (uint256 i = 1; i <= totalTopics; i++) {
            if (_topics[i].channelId == channelId) {
                count++;
            }
        }
        
        // 创建结果数组并填充
        Topic[] memory results = new Topic[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= totalTopics; i++) {
            if (_topics[i].channelId == channelId) {
                results[index] = _topics[i];
                index++;
            }
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

        // 通过NFT工厂铸造订阅NFT
        uint256 tokenId = NFT_FACTORY.mintSubscriptionNFT(
            channelId,
            msg.sender,
            tier,
            durationSeconds
        );

        // 订阅人数 +1
        channel.tiers[foundIndex].subscribers += 1;

        // 付款转给频道所有者
        (bool success, ) = payable(channel.owner).call{value: price}("");
        if (!success) revert TransferFailed();

        uint256 expiresAt = block.timestamp + durationSeconds;
        emit Subscribed(tokenId, channelId, tier, price, msg.sender, expiresAt);
        return tokenId;
    }

    /**
     * @dev 获取订阅信息（从对应的NFT合约中获取）
     * @param channelId 频道ID
     * @param tokenId NFT ID
     */
    function getSubscription(uint256 channelId, uint256 tokenId)
        external
        view
        returns (ChannelNFT.SubscriptionNFT memory)
    {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        
        ChannelNFT nftContract = ChannelNFT(channel.nftContract);
        return nftContract.getSubscription(tokenId);
    }
    
    /**
     * @dev 检查订阅是否有效
     * @param channelId 频道ID
     * @param tokenId NFT ID
     */
    function isSubscriptionValid(uint256 channelId, uint256 tokenId)
        external
        view
        returns (bool)
    {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        
        ChannelNFT nftContract = ChannelNFT(channel.nftContract);
        return nftContract.isSubscriptionValid(tokenId);
    }
    
    /**
     * @dev 获取频道的NFT合约地址
     * @param channelId 频道ID
     */
    function getChannelNFTContract(uint256 channelId)
        external
        view
        returns (address)
    {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        return channel.nftContract;
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




    /**
     * @dev 为订阅用户获取topic的加密平均值（需要客户端解密）
     * @param channelId 频道ID  
     * @param topicId topic ID
     * @param tokenId 用户的订阅NFT ID
     */
    function accessTopicResult(
        uint256 channelId,
        uint256 topicId, 
        uint256 tokenId
    ) external  {
        // 验证topic存在且属于指定频道
        Topic storage topic = _topics[topicId];
        if (topic.topicId == 0) revert TopicNotFound();
        if (topic.channelId != channelId) revert ChannelNotFound();
        
        // 验证用户有有效的订阅
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        
        ChannelNFT nftContract = ChannelNFT(channel.nftContract);
        if (nftContract.ownerOf(tokenId) != msg.sender) revert NotSubscriptionOwner();
        if (!nftContract.isSubscriptionValid(tokenId)) revert SubscriptionExpired();


        // 开放访问权限 用户可以链下解密
        FHE.allow(topic.average, msg.sender);

    }



}