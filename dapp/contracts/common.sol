// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {euint8,euint64} from "@fhevm/solidity/lib/FHE.sol";


// 订阅时长等级枚举
enum DurationTier {
    OneDay,                // 1天
    Month,                 // 30天
    Quarter,              // 90 季度
    HalfYeah,             // 180
    Year                 // 365天
}


// 等级价格输入结构体  表示不同订阅的价格
struct TierPrice {
    DurationTier tier;
    uint256 price;  // 支付的是原生代币 eth
    // 已订阅人数
    uint256 subscribers;
}



struct Channel{
    uint256 channelId;
    string info;
    address owner;

    /**
    *  价格列表
     */
    TierPrice[] tiers;
    uint256 tierCount;

    // 对应的NFT合约地址
    address nftContract;

    // 创建时间
    uint256 createdAt;
    // 最后一次推送时间
    uint256 lastPublishedAt;
}


// Topic 结构体
struct Topic {
    uint256 topicId;
    uint256 channelId;
    string ipfs;           // IPFS哈希，表示topic想要表达的内容
    uint256 endDate;       // topic结束日期（时间戳）
    address creator;       // topic创建者
    uint256 createdAt;     // 创建时间戳
    
    // 加权平均值相关
    euint64 totalWeightedValue;  // 加权值总和（FHE加密）
    euint64 average;             // 当前平均值（FHE加密）
    uint256 submissionCount;     // 提交次数
}

// Allowlist 条目结构体
struct AllowlistEntry {
    address user;          // 用户地址
    euint64 weight;        // 用户权重（FHE加密）
    bool exists;           // 是否存在标记
}

struct Signal{
    uint256 signalId;
    uint256 channelId;
    uint256 topicId;       // 归属的topic ID
    
    address submitter;     // 提交者地址
    euint8 value;         // 信号值（0-255，FHE加密）
    uint256 submittedAt;  // 提交时间戳
}