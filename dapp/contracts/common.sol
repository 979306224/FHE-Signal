// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ebool,eaddress,euint8} from "@fhevm/solidity/lib/FHE.sol";


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


    // 仅存储该频道下的 Signal 主键，详情通过全局映射查询
    uint256[] signalIds;

    // 当前信号数量
    uint256 signalCount;

    // 创建时间
    uint256 createdAt;
    // 最后一次推送时间
    uint256 lastPublishedAt;
}


struct Signal{

    uint256 signalId;
    
    uint256 channelId;

    // 目标token的地址 加密后
    eaddress token;
    // 操作方向  true为做多  false为做空
    ebool direction;
    // 信号强度  0~100 越大标示这个信号越强  
    euint8 level;
}