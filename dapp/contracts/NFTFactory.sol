// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ChannelNFT} from "./ChannelNFT.sol";
import {DurationTier} from "./common.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NFTFactory
 * @dev 用于为每个频道创建独立的NFT合约的工厂合约
 */
contract NFTFactory is Ownable {
    
    // 存储频道ID到NFT合约地址的映射
    mapping(uint256 channelId => address nftContract) private _channelNFTs;
    
    // 存储所有创建的NFT合约地址
    address[] private _allNFTContracts;
    
    // 事件
    event ChannelNFTCreated(
        uint256 indexed channelId,
        address indexed nftContract,
        string channelInfo
    );
    
    // 错误
    error ChannelNFTAlreadyExists();
    error ChannelNFTNotFound();
    error InvalidChannelData();
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev 为频道创建NFT合约
     * @param channelId 频道ID
     * @param channelInfo 频道信息
     * @return nftContract 新创建的NFT合约地址
     */
    function createChannelNFT(
        uint256 channelId,
        string memory channelInfo
    ) external onlyOwner returns (address) {
        if (channelId == 0) revert InvalidChannelData();
        if (_channelNFTs[channelId] != address(0)) revert ChannelNFTAlreadyExists();
        
        // 创建新的ChannelNFT合约
        ChannelNFT nftContract = new ChannelNFT(
            channelId,
            channelInfo,
            address(this) // NFT工厂作为NFT合约的所有者
        );
        
        address nftAddress = address(nftContract);
        
        // 存储映射关系
        _channelNFTs[channelId] = nftAddress;
        _allNFTContracts.push(nftAddress);
        
        emit ChannelNFTCreated(channelId, nftAddress, channelInfo);
        return nftAddress;
    }
    
    /**
     * @dev 获取频道对应的NFT合约地址
     * @param channelId 频道ID
     * @return NFT合约地址
     */
    function getChannelNFT(uint256 channelId) external view returns (address) {
        address nftContract = _channelNFTs[channelId];
        if (nftContract == address(0)) revert ChannelNFTNotFound();
        return nftContract;
    }
    
    /**
     * @dev 检查频道是否已有NFT合约
     * @param channelId 频道ID
     * @return 是否存在
     */
    function hasChannelNFT(uint256 channelId) external view returns (bool) {
        return _channelNFTs[channelId] != address(0);
    }
    
    /**
     * @dev 为订阅者铸造NFT
     * @param channelId 频道ID
     * @param subscriber 订阅者地址
     * @param tier 订阅等级
     * @param duration 订阅时长（秒）
     * @return tokenId 新铸造的NFT ID
     */
    function mintSubscriptionNFT(
        uint256 channelId,
        address subscriber,
        DurationTier tier,
        uint256 duration
    ) external onlyOwner returns (uint256) {
        address nftContract = _channelNFTs[channelId];
        if (nftContract == address(0)) revert ChannelNFTNotFound();
        
        // 调用NFT合约的铸造函数
        return ChannelNFT(nftContract).mintSubscription(subscriber, tier, duration);
    }
    
    /**
     * @dev 获取所有NFT合约地址
     * @return 所有NFT合约地址数组
     */
    function getAllNFTContracts() external view returns (address[] memory) {
        return _allNFTContracts;
    }
    
    /**
     * @dev 获取NFT合约总数
     * @return 合约总数
     */
    function getNFTContractCount() external view returns (uint256) {
        return _allNFTContracts.length;
    }
    
    /**
     * @dev 批量获取频道NFT合约地址
     * @param channelIds 频道ID数组
     * @return nftContracts NFT合约地址数组
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
