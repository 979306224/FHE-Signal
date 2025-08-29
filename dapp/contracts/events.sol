// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract SaleEvents {
    event BundleCreated(uint256 indexed bundleId, address indexed seller);
    event BundleCanceled(uint256 indexed bundleId);
    event BidPlaced(uint256 indexed bundleId, address indexed bidder);
    event BundleAccepted(uint256 indexed bundleId, address indexed winner, uint256 payAmount);
}


