// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DurationTier} from "./common.sol";

/**
 * @title ChannelNFT
 * @dev 订阅频道的NFT合约，每个NFT代表一个订阅记录，包含过期时间戳
 */
contract ChannelNFT is ERC721, Ownable {
    
    // NFT元数据结构
    struct SubscriptionNFT {
        uint256 channelId;      // 频道ID
        uint256 expiresAt;      // 过期时间戳
        DurationTier tier;      // 订阅等级
        address subscriber;     // 订阅者地址
        uint256 mintedAt;       // 铸造时间
    }
    
    // 存储NFT元数据
    mapping(uint256 => SubscriptionNFT) private _subscriptions;
    
    // 下一个NFT ID
    uint256 private _nextTokenId = 1;
    
    // 频道ID
    uint256 public immutable channelId;
    
    // 频道信息
    string public channelInfo;
    
    // 事件
    event SubscriptionMinted(
        uint256 indexed tokenId,
        uint256 indexed channelId,
        address indexed subscriber,
        DurationTier tier,
        uint256 expiresAt
    );
    
    event SubscriptionExpired(uint256 indexed tokenId);
    
    error SubscriptionExpiredError();
    error NotSubscriptionOwner();
    error InvalidSubscriptionData();
    
    /**
     * @dev 构造函数
     * @param _channelId 频道ID
     * @param _channelInfo 频道信息
     * @param _owner 合约所有者（通常是NFT工厂）
     */
    constructor(
        uint256 _channelId,
        string memory _channelInfo,
        address _owner
    ) ERC721(
        string(abi.encodePacked("Channel #", _toString(_channelId), " Subscription")),
        string(abi.encodePacked("CS", _toString(_channelId)))
    ) Ownable(_owner) {
        channelId = _channelId;
        channelInfo = _channelInfo;
    }
    
    /**
     * @dev 铸造订阅NFT
     * @param to 接收者地址
     * @param tier 订阅等级
     * @param duration 订阅时长（秒）
     * @return tokenId 新铸造的NFT ID
     */
    function mintSubscription(
        address to,
        DurationTier tier,
        uint256 duration
    ) external onlyOwner returns (uint256) {
        if (to == address(0)) revert InvalidSubscriptionData();
        if (duration == 0) revert InvalidSubscriptionData();
        
        uint256 tokenId = _nextTokenId++;
        uint256 expiresAt = block.timestamp + duration;
        
        // 存储订阅元数据
        _subscriptions[tokenId] = SubscriptionNFT({
            channelId: channelId,
            expiresAt: expiresAt,
            tier: tier,
            subscriber: to,
            mintedAt: block.timestamp
        });
        
        // 铸造NFT
        _safeMint(to, tokenId);
        
        emit SubscriptionMinted(tokenId, channelId, to, tier, expiresAt);
        return tokenId;
    }
    
    /**
     * @dev 获取订阅信息
     * @param tokenId NFT ID
     * @return subscription 订阅信息
     */
    function getSubscription(uint256 tokenId) external view returns (SubscriptionNFT memory) {
        if (!_exists(tokenId)) revert InvalidSubscriptionData();
        return _subscriptions[tokenId];
    }
    
    /**
     * @dev 检查订阅是否有效（未过期）
     * @param tokenId NFT ID
     * @return 是否有效
     */
    function isSubscriptionValid(uint256 tokenId) public view returns (bool) {
        if (!_exists(tokenId)) return false;
        return block.timestamp <= _subscriptions[tokenId].expiresAt;
    }
    
    /**
     * @dev 获取订阅剩余时间
     * @param tokenId NFT ID
     * @return 剩余秒数，如果已过期返回0
     */
    function getTimeRemaining(uint256 tokenId) external view returns (uint256) {
        if (!_exists(tokenId)) return 0;
        
        uint256 expiresAt = _subscriptions[tokenId].expiresAt;
        if (block.timestamp >= expiresAt) {
            return 0;
        }
        return expiresAt - block.timestamp;
    }
    
    /**
     * @dev 批量检查NFT是否过期
     * @param tokenIds NFT ID数组
     * @return expired 过期状态数组
     */
    function batchCheckExpired(uint256[] calldata tokenIds) external view returns (bool[] memory expired) {
        expired = new bool[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            expired[i] = !isSubscriptionValid(tokenIds[i]);
        }
    }
    
    /**
     * @dev 获取用户所有的有效订阅
     * @param user 用户地址
     * @return validTokens 有效的token ID数组
     */
    function getUserValidSubscriptions(address user) external view returns (uint256[] memory validTokens) {
        uint256 balance = balanceOf(user);
        uint256[] memory allTokens = new uint256[](balance);
        uint256 validCount = 0;
        
        // 获取用户所有NFT
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(user, i);
            if (isSubscriptionValid(tokenId)) {
                allTokens[validCount] = tokenId;
                validCount++;
            }
        }
        
        // 创建正确大小的数组
        validTokens = new uint256[](validCount);
        for (uint256 i = 0; i < validCount; i++) {
            validTokens[i] = allTokens[i];
        }
    }
    
    /**
     * @dev 重写transfer函数，增加过期检查
     */
    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (!isSubscriptionValid(tokenId)) {
            emit SubscriptionExpired(tokenId);
            revert SubscriptionExpiredError();
        }
        super.transferFrom(from, to, tokenId);
    }
    
    /**
     * @dev 重写safeTransferFrom函数，增加过期检查
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
        if (!isSubscriptionValid(tokenId)) {
            emit SubscriptionExpired(tokenId);
            revert SubscriptionExpiredError();
        }
        super.safeTransferFrom(from, to, tokenId, data);
    }
    
    /**
     * @dev 检查NFT是否存在
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    
    /**
     * @dev 将数字转换为字符串
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
    
    /**
     * @dev 实现ERC721Enumerable接口中的tokenOfOwnerByIndex
     */
    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256) {
        if (index >= balanceOf(owner)) revert InvalidSubscriptionData();
        
        uint256 numMintedSoFar = _nextTokenId - 1;
        uint256 tokenIdsIdx = 0;
        
        for (uint256 i = 1; i <= numMintedSoFar; i++) {
            if (_ownerOf(i) == owner) {
                if (tokenIdsIdx == index) {
                    return i;
                }
                tokenIdsIdx++;
            }
        }
        
        revert InvalidSubscriptionData();
    }
}
