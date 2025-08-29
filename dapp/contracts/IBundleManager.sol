// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20Detail, ERC721Detail, AssetBundle, BundleStatus } from "./common.sol";

interface IBundleManager {
    function createBundle(
        ERC20Detail[] calldata erc20s,
        ERC721Detail[] calldata erc721s,
        address payToken,
        uint8 payTokenDecimals,
        uint64 payMinPrice,
        uint256 deadline
    ) external returns (uint256 bundleId);

    function cancelBundle(uint256 bundleId) external;

    function setAccepted(uint256 bundleId) external;

    function releaseTo(uint256 bundleId, address to) external;

    function getBundle(uint256 bundleId) external view returns (AssetBundle memory);

    function getERC20s(uint256 bundleId) external view returns (ERC20Detail[] memory);

    function getERC721s(uint256 bundleId) external view returns (ERC721Detail[] memory);

    function sellerOf(uint256 bundleId) external view returns (address);
}


