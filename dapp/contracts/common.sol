// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {euint8,euint64} from "@fhevm/solidity/lib/FHE.sol";


// Subscription duration tier enum
enum DurationTier {
    OneDay,                // 1day
    Month,                 // 30day
    Quarter,              // 90 days quarter
    HalfYear,             // 180 days
    Year                 // 365day
}


// Tier price input structure representing prices for different subscriptions
struct TierPrice {
    DurationTier tier;
    uint256 price;  // Payment is in native token eth
    // Number of subscribers
    uint256 subscribers;
}



struct Channel{
    uint256 channelId;
    string info;
    address owner;

    /**
    *  Price list
     */
    TierPrice[] tiers;
    uint256 tierCount;

    // Corresponding NFT contract address
    address nftContract;

    // Creation time
    uint256 createdAt;
    // Last published time
    uint256 lastPublishedAt;
    
    // Index array: all topic IDs under this channel
    uint256[] topicIds;
}


// Topic structure
struct Topic {
    uint256 topicId;
    uint256 channelId;
    string ipfs;           // IPFS hash representing the content that topic wants to express
    uint256 endDate;       // Topic end date (timestamp)
    address creator;       // Topic creator
    uint256 createdAt;     // Creation timestamp
    
    // Value range configuration
    uint8 minValue;        // Minimum allowed value
    uint8 maxValue;        // Maximum allowed value
    uint8 defaultValue;    // Default value (used when input is out of range)
    
    // Weighted average value related
    euint64 totalWeightedValue;  // Sum of weighted values (FHE encrypted)
    euint64 average;             // Current weighted average value (FHE encrypted)
    uint256 totalWeight;         // Plaintext weight sum
    uint256 submissionCount;     // Submission count
    
    // Index array: all signal IDs under this topic
    uint256[] signalIds;
}

// Allowlist entry structure
struct AllowlistEntry {
    address user;          // User address
    uint64 weight;         // User weight (plaintext)
    bool exists;           // Existence flag
}

struct Signal{
    uint256 signalId;
    uint256 channelId;
    uint256 topicId;       // Belonging topic ID
    
    address submitter;     // Submitter address
    euint8 value;         // Signal value (0-255, FHE encrypted)
    uint256 submittedAt;  // Submission timestamp
}