// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ChannelNFT} from "./ChannelNFT.sol";
import {DurationTier} from "./common.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NFTFactory
 * @dev Factory contract for creating independent NFT contracts for each channel
 */
contract NFTFactory is Ownable {
    
    // Mapping from channel ID to NFT contract address
    mapping(uint256 channelId => address nftContract) private _channelNFTs;
    
    // Store all created NFT contract addresses
    address[] private _allNFTContracts;
    
    // Events
    event ChannelNFTCreated(
        uint256 indexed channelId,
        address indexed nftContract,
        string channelInfo
    );
    
    // Errors
    error ChannelNFTAlreadyExists();
    error ChannelNFTNotFound();
    error InvalidChannelData();
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Create NFT contract for channel
     * @param channelId Channel ID
     * @param channelInfo Channel information
     * @return nftContract Address of newly created NFT contract
     */
    function createChannelNFT(
        uint256 channelId,
        string memory channelInfo
    ) external onlyOwner returns (address) {
        if (channelId == 0) revert InvalidChannelData();
        if (_channelNFTs[channelId] != address(0)) revert ChannelNFTAlreadyExists();
        
        // Create new ChannelNFT contract
        ChannelNFT nftContract = new ChannelNFT(
            channelId,
            channelInfo,
            address(this) // NFT factory as owner of NFT contract
        );
        
        address nftAddress = address(nftContract);
        
        // Store mapping relationship
        _channelNFTs[channelId] = nftAddress;
        _allNFTContracts.push(nftAddress);
        
        emit ChannelNFTCreated(channelId, nftAddress, channelInfo);
        return nftAddress;
    }
    
    /**
     * @dev Get NFT contract address for channel
     * @param channelId Channel ID
     * @return NFT contract address
     */
    function getChannelNFT(uint256 channelId) external view returns (address) {
        address nftContract = _channelNFTs[channelId];
        if (nftContract == address(0)) revert ChannelNFTNotFound();
        return nftContract;
    }
    
    /**
     * @dev Check if channel already has NFT contract
     * @param channelId Channel ID
     * @return Whether it exists
     */
    function hasChannelNFT(uint256 channelId) external view returns (bool) {
        return _channelNFTs[channelId] != address(0);
    }
    
    /**
     * @dev Mint NFT for subscriber
     * @param channelId Channel ID
     * @param subscriber Subscriber address
     * @param tier Subscription tier
     * @param duration Subscription duration (seconds)
     * @return tokenId ID of newly minted NFT
     */
    function mintSubscriptionNFT(
        uint256 channelId,
        address subscriber,
        DurationTier tier,
        uint256 duration
    ) external onlyOwner returns (uint256) {
        address nftContract = _channelNFTs[channelId];
        if (nftContract == address(0)) revert ChannelNFTNotFound();
        
        // Call NFT contract's mint function
        return ChannelNFT(nftContract).mintSubscription(subscriber, tier, duration);
    }
    
    /**
     * @dev Get all NFT contract addresses
     * @return Array of all NFT contract addresses
     */
    function getAllNFTContracts() external view returns (address[] memory) {
        return _allNFTContracts;
    }
    
    /**
     * @dev Get total number of NFT contracts
     * @return Total number of contracts
     */
    function getNFTContractCount() external view returns (uint256) {
        return _allNFTContracts.length;
    }
    
    /**
     * @dev Batch get channel NFT contract addresses
     * @param channelIds Array of channel IDs
     * @return nftContracts Array of NFT contract addresses
     */
    function batchGetChannelNFTs(uint256[] calldata channelIds) 
        external 
        view 
        returns (address[] memory nftContracts) 
    {
        nftContracts = new address[](channelIds.length);
        for (uint256 i = 0; i < channelIds.length; i++) {
            nftContracts[i] = _channelNFTs[channelIds[i]];
        }
    }
}
