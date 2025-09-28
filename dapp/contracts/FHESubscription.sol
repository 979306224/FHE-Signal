// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

// Import FHE (Fully Homomorphic Encryption) related libraries (for encrypting Signal fields)
import {
    FHE,
    euint8,
    euint64,
    externalEuint8
} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Import common type definitions
import {TierPrice, Channel, Signal, DurationTier, Topic, AllowlistEntry} from "./common.sol";
// Import NFT factory
import {NFTFactory} from "./NFTFactory.sol";
import {ChannelNFT} from "./ChannelNFT.sol";
// Import ReentrancyGuard
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
    error InvalidValueRange(); // Invalid value range (min > max, etc.)
    error AlreadyAccessed(); // Already decrypted this topic
    error TopicChannelMismatch(); // Topic does not match channel


    // NFT factory instance
    NFTFactory public immutable NFT_FACTORY;
    
    constructor() Ownable(msg.sender) {
        // Deploy NFT factory
        NFT_FACTORY = new NFTFactory();
    }

    uint256 private _currentChannelId = 0;
    uint256 private _currentTopicId = 0;
    uint256 private _currentSignalId = 0;

    // Channel storage
    mapping(uint256 channelId => Channel channel) private _channels;
    // Topic storage
    mapping(uint256 topicId => Topic topic) private _topics;
    // signalId -> Signal mapping, for querying signals by id
    mapping(uint256 signalId => Signal signal) private _signals;
    
    // channel allowlist: channelId => (address => AllowlistEntry)
    mapping(uint256 channelId => mapping(address user => AllowlistEntry)) private _channelAllowlists;
    // Track allowlist address list for each channel: channelId => address[]
    mapping(uint256 channelId => address[]) private _channelAllowlistAddresses;
    // Check if user has already submitted signal: topicId => (address => bool)
    mapping(uint256 topicId => mapping(address user => bool)) private _hasSubmitted;
    // Record if user has already decrypted topic result: topicId => (address => bool)
    mapping(uint256 topicId => mapping(address user => bool)) private _hasAccessed;

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
    event TopicResultAccessed(uint256 indexed topicId, address indexed user, uint256 tokenId);

    // Removed old subscription metadata structure, now using NFT contract to manage subscription information

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

        // Set price tiers
        for (uint256 i = 0; i < tiers.length; i++) {
            channel.tiers.push(tiers[i]);
        }

        // Create NFT contract for channel
        address nftContract = NFT_FACTORY.createChannelNFT(newId, info);
        channel.nftContract = nftContract;

        emit ChannelCreated(newId, msg.sender, info);
        return newId;
    }
    function getChannelMaxId() external view returns (uint256) {
        return _currentChannelId;
    }


    /**
     * @dev Create new topic
     * @param channelId Channel ID
     * @param ipfs IPFS hash describing topic content
     * @param endDate Topic end date (timestamp)
     * @param minValue Minimum allowed value
     * @param maxValue Maximum allowed value
     * @param defaultValue Default value (used when input is out of range)
     * @return topicId ID of newly created topic
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
        
        // Validate value range configuration
        if (minValue > maxValue) revert InvalidValueRange();
        if (defaultValue < minValue || defaultValue > maxValue) revert InvalidValueRange();

        uint256 newTopicId = ++_currentTopicId;
        
        // Initialize FHE encrypted zero value
        euint64 zeroValue = FHE.asEuint64(0);
        // Grant zero value access permission to contract address
        FHE.allow(zeroValue, address(this));
        // Grant channel owner access permission
        FHE.allow(zeroValue,channel.owner);

        
        Topic storage topic = _topics[newTopicId];
        topic.topicId = newTopicId;
        topic.channelId = channelId;
        topic.ipfs = ipfs;
        topic.endDate = endDate;
        topic.creator = msg.sender;
        topic.createdAt = block.timestamp;
        
        // Set value range configuration
        topic.minValue = minValue;
        topic.maxValue = maxValue;
        topic.defaultValue = defaultValue;
        
        // Initialize calculation related fields
        topic.totalWeightedValue = zeroValue;
        topic.average = zeroValue;
        topic.totalWeight = 0;
        topic.submissionCount = 0;
        
        // Add new topic ID to channel's index array
        channel.topicIds.push(newTopicId);

        emit TopicCreated(newTopicId, channelId, msg.sender, ipfs, endDate);
        return newTopicId;
    }


    /**
     * @dev Batch add addresses to channel's allowlist
     * @param channelId channel ID
     * @param users Array of user addresses
     * @param weights Array of user weights (plaintext)
     */
    function batchAddToAllowlist(
        uint256 channelId,
        address[] calldata users,
        uint64[] calldata weights
    ) external {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        if (channel.owner != msg.sender) revert NotChannelOwner();

        // Security checks
        if (users.length == 0) revert EmptyArray();
        if (users.length > 100) revert ArrayTooLarge(); // Limit batch operation size to prevent gas exhaustion
        
        // Check array length consistency
        if (users.length != weights.length) {
            revert ArrayLengthMismatch();
        }

        // Batch process each user
        for (uint256 i = 0; i < users.length; i++) {
            // If user is not in allowlist, add to address list
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
     * @dev Batch remove addresses from allowlist
     * @param channelId channel ID
     * @param users Array of user addresses
     */
    function batchRemoveFromAllowlist(uint256 channelId, address[] calldata users) external {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        if (channel.owner != msg.sender) revert NotChannelOwner();

        // Security checks
        if (users.length == 0) revert EmptyArray();
        if (users.length > 100) revert ArrayTooLarge(); // Limit batch operation size to prevent gas exhaustion

        // Batch remove users
        for (uint256 i = 0; i < users.length; i++) {
            // Remove from allowlist
            delete _channelAllowlists[channelId][users[i]];
            
            // Remove from address list
            _removeFromAddressList(channelId, users[i]);
            
            emit AllowlistUpdated(channelId, users[i], false);
        }
    }
    /**
     * @dev Internal function: remove specified address from address list
     * @param channelId Channel ID
     * @param user User address to remove
     */
    function _removeFromAddressList(uint256 channelId, address user) internal {
        address[] storage addresses = _channelAllowlistAddresses[channelId];
        for (uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i] == user) {
                // Move the last element to current position, then delete the last element
                addresses[i] = addresses[addresses.length - 1];
                addresses.pop();
                break;
            }
        }
    }

    /**
     * @dev Get all allowlist entries for specified channel
     * @param channelId Channel ID
     * @return allowlist Array of all allowlist entries
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
     * @dev Get number of addresses in allowlist for specified channel
     * @param channelId Channel ID
     * @return count Number of addresses in allowlist
     */
    function getAllowlistCount(uint256 channelId) external view returns (uint256) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        
        return _channelAllowlistAddresses[channelId].length;
    }

    /**
     * @dev Get allowlist entries with pagination (save gas, avoid returning large amounts of data)
     * @param channelId Channel ID
     * @param offset Offset
     * @param limit Limit count
     * @return allowlist Allowlist entries in specified range
     * @return total Total number of entries
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
        
        // Check offset
        if (offset >= total) {
            return (new AllowlistEntry[](0), total);
        }
        
        // Calculate actual number to return
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 actualLength = end - offset;
        
        // Create result array
        allowlist = new AllowlistEntry[](actualLength);
        for (uint256 i = 0; i < actualLength; i++) {
            allowlist[i] = _channelAllowlists[channelId][addresses[offset + i]];
        }
        
        return (allowlist, total);
    }
    /**
    * @dev Submit signal to specified topic
    * @param topicId topic ID
    * @param inputValue Signal value (0-255, corresponds to external ciphertext of euint8)
    * @param proof FHE proof
    * @return signalId ID of newly created signal
    */
    function submitSignal(
        uint256 topicId,
        externalEuint8 inputValue,
        bytes calldata proof
    ) external returns (uint256) {
        // Basic validation
        Topic storage topic = _topics[topicId];
        if (topic.topicId == 0) revert TopicNotFound();
        if (block.timestamp >= topic.endDate) revert TopicExpired();

        // allowlist and duplicate submission validation
        Channel storage channel = _channels[topic.channelId];
        AllowlistEntry storage allowlistEntry = _channelAllowlists[topic.channelId][msg.sender];
        
        // Channel owner doesn't need to be in whitelist to submit signal
        if (!allowlistEntry.exists && channel.owner != msg.sender) {
            revert NotInAllowlist();
        }
        if (_hasSubmitted[topicId][msg.sender]) revert AlreadySubmitted();

        // External ciphertext to euint8 (off-chain encryption -> on-chain ciphertext)
        euint8 value = FHE.fromExternal(inputValue, proof);
        
        // Grant value access permission to contract address
        FHE.allow(value, address(this));

        // Use euint8 constants for comparison and selection (bit width alignment, avoid library overload mismatch)
        euint8 minE = FHE.asEuint8(topic.minValue);
        euint8 maxE = FHE.asEuint8(topic.maxValue);
        euint8 defE = FHE.asEuint8(topic.defaultValue);

        // If less than minimum value -> use default value
        value = FHE.select(FHE.lt(value, minE), defE, value);
        // If greater than maximum value -> use default value
        value = FHE.select(FHE.gt(value, maxE), defE, value);

        // Create and save Signal
        uint256 newSignalId = ++_currentSignalId;
        _signals[newSignalId] = Signal({
            signalId: newSignalId,
            channelId: topic.channelId,
            topicId: topicId,
            submitter: msg.sender,
            value: value,
            submittedAt: block.timestamp
        });

         // Add new signal ID to topic's index array
         topic.signalIds.push(newSignalId);
         
         // Mark submission & update weighted average (internally already euint64 aligned)
         _hasSubmitted[topicId][msg.sender] = true;
         
         // If user is in allowlist, use their weight; otherwise use default weight 1
         uint64 weight = allowlistEntry.exists ? allowlistEntry.weight : 1;
         _updateAverage(topicId, value, weight);
 
         // Events
         emit SignalSubmitted(topicId, newSignalId, msg.sender);
         return newSignalId;
    }


    /**
     * @dev Internal function: update topic's weighted average
     * @param topicId topic ID
     * @param value Newly submitted value (FHE encrypted)
     * @param weight Submitter's plaintext weight
     */
    function _updateAverage(uint256 topicId, euint8 value, uint64 weight) internal {
        Topic storage topic = _topics[topicId];
        
        // Extend uint8 value to uint64 for calculation
        euint64 valueAs64 = FHE.asEuint64(value);
        
        // Grant valueAs64 access permission to contract address
        FHE.allow(valueAs64, address(this));
        
        // Calculate weighted value: weight * value (weight is plaintext, can be multiplied directly)
        euint64 weightedValue = FHE.mul(valueAs64, weight);
        
        // Grant weightedValue access permission to contract address
        FHE.allow(weightedValue, address(this));
        
        // Grant totalWeightedValue access permission to contract address (if not initialization)
        if (topic.submissionCount > 0) {
            FHE.allow(topic.totalWeightedValue, address(this));
        }
        
        // Update total weighted value and total weight
        topic.totalWeightedValue = FHE.add(topic.totalWeightedValue, weightedValue);
        // Grant updated totalWeightedValue access permission to contract address
        FHE.allow(topic.totalWeightedValue, address(this));
        topic.totalWeight += weight;

        // Update submission count
        topic.submissionCount++;
        
        // Calculate true weighted average: sum(weight * value) / sum(weight)
        // This way the result can stay within the original value range
        if (topic.totalWeight > 0) {
            topic.average = FHE.div(topic.totalWeightedValue, uint64(topic.totalWeight));
            // Grant average access permission to contract address
            FHE.allow(topic.average, address(this));
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
     * @dev Get topic information
     * @param topicId topic ID
     * @return topic topic information
     */
    function getTopic(uint256 topicId) external view returns (Topic memory) {
        return _topics[topicId];
    }

    /**
     * @dev Check if user is in channel's allowlist
     * @param channelId channel ID
     * @param user User address
     * @return Whether in allowlist
     */
    function isInAllowlist(uint256 channelId, address user) external view returns (bool) {
        return _channelAllowlists[channelId][user].exists;
    }

    /**
     * @dev Check if user has already submitted signal
     * @param topicId topic ID
     * @param user User address
     * @return Whether already submitted
     */
    function hasSubmitted(uint256 topicId, address user) external view returns (bool) {
        return _hasSubmitted[topicId][user];
    }

    /**
     * @dev Check if user has already decrypted and accessed topic result
     * @param topicId topic ID
     * @param user User address
     * @return Whether already accessed
     */
    function hasAccessedTopic(uint256 topicId, address user) external view returns (bool) {
        return _hasAccessed[topicId][user];
    }

    /**
     * @dev Get number of topics under channel
     * @param channelId Channel ID
     * @return count Number of topics
     */
    function getChannelTopicCount(uint256 channelId) external view returns (uint256) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        return channel.topicIds.length;
    }

    /**
     * @dev Get number of signals under topic
     * @param topicId topic ID
     * @return count Number of signals
     */
    function getTopicSignalCount(uint256 topicId) external view returns (uint256) {
        Topic storage topic = _topics[topicId];
        if (topic.topicId == 0) revert TopicNotFound();
        return topic.signalIds.length;
    }


    /**
     * @dev Get all signals under topic (efficient version, using index array)
     * @param topicId topic ID
     * @return signals All signals under topic
     */
    function getTopicSignals(uint256 topicId) external view returns (Signal[] memory) {
        Topic storage topic = _topics[topicId];
        if (topic.topicId == 0) revert TopicNotFound();

        uint256[] storage signalIds = topic.signalIds;
        Signal[] memory results = new Signal[](signalIds.length);
        
        for (uint256 i = 0; i < signalIds.length; i++) {
            results[i] = _signals[signalIds[i]];
        }
        
        return results;
    }

    /**
     * @dev Get all topics under channel (efficient version, using index array)
     * @param channelId Channel ID
     * @return topics All topics under channel
     */
    function getChannelTopics(uint256 channelId) external view returns (Topic[] memory) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();

        uint256[] storage topicIds = channel.topicIds;
        Topic[] memory results = new Topic[](topicIds.length);
        
        for (uint256 i = 0; i < topicIds.length; i++) {
            results[i] = _topics[topicIds[i]];
        }
        
        return results;
    }

    /**
     * @dev Get signals under topic with pagination
     * @param topicId topic ID
     * @param offset Offset
     * @param limit Limit count
     * @return signals Signals in specified range
     * @return total Total count
     */
    function getTopicSignalsPaginated(
        uint256 topicId,
        uint256 offset,
        uint256 limit
    ) external view returns (Signal[] memory signals, uint256 total) {
        Topic storage topic = _topics[topicId];
        if (topic.topicId == 0) revert TopicNotFound();

        uint256[] storage signalIds = topic.signalIds;
        total = signalIds.length;

        // Check offset
        if (offset >= total) {
            return (new Signal[](0), total);
        }

        // Calculate actual number to return
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 actualLength = end - offset;

        // Create result array
        signals = new Signal[](actualLength);
        for (uint256 i = 0; i < actualLength; i++) {
            signals[i] = _signals[signalIds[offset + i]];
        }

        return (signals, total);
    }

    /**
     * @dev Get topics under channel with pagination
     * @param channelId Channel ID
     * @param offset Offset
     * @param limit Limit count
     * @return topics Topics in specified range
     * @return total Total count
     */
    function getChannelTopicsPaginated(
        uint256 channelId,
        uint256 offset,
        uint256 limit
    ) external view returns (Topic[] memory topics, uint256 total) {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();

        uint256[] storage topicIds = channel.topicIds;
        total = topicIds.length;

        // Check offset
        if (offset >= total) {
            return (new Topic[](0), total);
        }

        // Calculate actual number to return
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 actualLength = end - offset;

        // Create result array
        topics = new Topic[](actualLength);
        for (uint256 i = 0; i < actualLength; i++) {
            topics[i] = _topics[topicIds[offset + i]];
        }

        return (topics, total);
    }

    function subscribe(uint256 channelId, DurationTier tier)
        external
        payable
        nonReentrant
        returns (uint256)
    {
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();

        // Find corresponding tier and price
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

        // Calculate expiration time
        uint256 durationSeconds = _durationForTier(tier);

        // Mint subscription NFT through NFT factory
        uint256 tokenId = NFT_FACTORY.mintSubscriptionNFT(
            channelId,
            msg.sender,
            tier,
            durationSeconds
        );

        // Subscriber count +1
        channel.tiers[foundIndex].subscribers += 1;

        // Transfer payment to channel owner
        (bool success, ) = payable(channel.owner).call{value: price}("");
        if (!success) revert TransferFailed();

        uint256 expiresAt = block.timestamp + durationSeconds;
        emit Subscribed(tokenId, channelId, tier, price, msg.sender, expiresAt);
        return tokenId;
    }

    /**
     * @dev Get subscription information (from corresponding NFT contract)
     * @param channelId Channel ID
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
     * @dev Check if subscription is valid
     * @param channelId Channel ID
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
     * @dev Get channel's NFT contract address
     * @param channelId Channel ID
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
        if (tier == DurationTier.HalfYear) return 180 days;
        // DurationTier.Year
        return 365 days;
    }




    /**
     * @dev Get encrypted average value of topic for subscribed users (requires client-side decryption)
     * @param channelId Channel ID
     * @param topicId topic ID
     * @param tokenId User's subscription NFT ID (ignored if user is channel owner)
     */
    function accessTopicResult(
        uint256 channelId,
        uint256 topicId, 
        uint256 tokenId
    ) external  {
        // Verify channel exists
        Channel storage channel = _channels[channelId];
        if (channel.channelId == 0) revert ChannelNotFound();
        
        // Verify topic exists and belongs to specified channel
        Topic storage topic = _topics[topicId];
        if (topic.topicId == 0) revert TopicNotFound();
        if (topic.channelId != channelId) revert TopicChannelMismatch();
        
        // Check if user has already decrypted this topic
        if (_hasAccessed[topicId][msg.sender]) revert AlreadyAccessed();
        
        // Check if user is channel owner - if so, skip NFT validation
        if (channel.owner == msg.sender) {
            // Channel owner can access without NFT
            _hasAccessed[topicId][msg.sender] = true;
            FHE.allow(topic.average, msg.sender);
            emit TopicResultAccessed(topicId, msg.sender, 0); // Use 0 as tokenId for owner access
            return;
        }
        
        // For non-owners, verify user has valid subscription
        ChannelNFT nftContract = ChannelNFT(channel.nftContract);
        if (nftContract.ownerOf(tokenId) != msg.sender) revert NotSubscriptionOwner();
        if (!nftContract.isSubscriptionValid(tokenId)) revert SubscriptionExpired();

        // Record that user has accessed this topic
        _hasAccessed[topicId][msg.sender] = true;

        // Grant access permission, user can decrypt off-chain
        FHE.allow(topic.average, msg.sender);
        
        // Emit access event
        emit TopicResultAccessed(topicId, msg.sender, tokenId);
    }


    function getTopicAccessed(uint256 topicId) external view returns (bool) {
        return _hasAccessed[topicId][msg.sender];
    }




}