// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DurationTier} from "./common.sol";

/**
 * @title ChannelNFT
 * @dev Channel subscription NFT contract, each NFT represents a subscription record with expiration timestamp
 */
contract ChannelNFT is ERC721, Ownable {
    
    // NFT metadata structure
    struct SubscriptionNFT {
        uint256 channelId;      // Channel ID
        uint256 expiresAt;      // Expiration timestamp
        DurationTier tier;      // Subscription tier
        address subscriber;     // Subscriber address
        uint256 mintedAt;       // Minting time
    }
    
    // Store NFT metadata
    mapping(uint256 => SubscriptionNFT) private _subscriptions;
    
    // Next NFT ID
    uint256 private _nextTokenId = 1;
    
    // Channel ID
    uint256 public immutable channelId;
    
    // Channel information
    string public channelInfo;
    
    // Events
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
     * @dev Constructor
     * @param _channelId Channel ID
     * @param _channelInfo Channel information
     * @param _owner Contract owner (usually NFT factory)
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
     * @dev Mint subscription NFT
     * @param to Recipient address
     * @param tier Subscription tier
     * @param duration Subscription duration (seconds)
     * @return tokenId ID of newly minted NFT
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
        
        // Store subscription metadata
        _subscriptions[tokenId] = SubscriptionNFT({
            channelId: channelId,
            expiresAt: expiresAt,
            tier: tier,
            subscriber: to,
            mintedAt: block.timestamp
        });
        
        // Mint NFT
        _safeMint(to, tokenId);
        
        emit SubscriptionMinted(tokenId, channelId, to, tier, expiresAt);
        return tokenId;
    }
    
    /**
     * @dev Get subscription information
     * @param tokenId NFT ID
     * @return subscription Subscription information
     */
    function getSubscription(uint256 tokenId) external view returns (SubscriptionNFT memory) {
        if (!_exists(tokenId)) revert InvalidSubscriptionData();
        return _subscriptions[tokenId];
    }
    
    /**
     * @dev Check if subscription is valid (not expired)
     * @param tokenId NFT ID
     * @return Whether valid
     */
    function isSubscriptionValid(uint256 tokenId) public view returns (bool) {
        if (!_exists(tokenId)) return false;
        return block.timestamp <= _subscriptions[tokenId].expiresAt;
    }
    
    /**
     * @dev Get subscription remaining time
     * @param tokenId NFT ID
     * @return Remaining seconds, returns 0 if expired
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
     * @dev Batch check if NFTs are expired
     * @param tokenIds Array of NFT IDs
     * @return expired Array of expiration status
     */
    function batchCheckExpired(uint256[] calldata tokenIds) external view returns (bool[] memory expired) {
        expired = new bool[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            expired[i] = !isSubscriptionValid(tokenIds[i]);
        }
    }
    
    /**
     * @dev Get all valid subscriptions of user
     * @param user User address
     * @return validTokens Array of valid token IDs
     */
    function getUserValidSubscriptions(address user) external view returns (uint256[] memory validTokens) {
        uint256 balance = balanceOf(user);
        uint256[] memory allTokens = new uint256[](balance);
        uint256 validCount = 0;
        
        // Get all user NFTs
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(user, i);
            if (isSubscriptionValid(tokenId)) {
                allTokens[validCount] = tokenId;
                validCount++;
            }
        }
        
        // Create correctly sized array
        validTokens = new uint256[](validCount);
        for (uint256 i = 0; i < validCount; i++) {
            validTokens[i] = allTokens[i];
        }
    }
    
    /**
     * @dev Override transfer function, add expiration check
     */
    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (!isSubscriptionValid(tokenId)) {
            emit SubscriptionExpired(tokenId);
            revert SubscriptionExpiredError();
        }
        super.transferFrom(from, to, tokenId);
    }
    
    /**
     * @dev Override safeTransferFrom function, add expiration check
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
        if (!isSubscriptionValid(tokenId)) {
            emit SubscriptionExpired(tokenId);
            revert SubscriptionExpiredError();
        }
        super.safeTransferFrom(from, to, tokenId, data);
    }
    
    /**
     * @dev Check if NFT exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    
    /**
     * @dev Convert number to string
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
     * @dev Implement tokenOfOwnerByIndex from ERC721Enumerable interface
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
