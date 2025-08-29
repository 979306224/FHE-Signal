// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AssetBundle, ERC20Detail, ERC721Detail, BundleStatus } from "./common.sol";
import { IBundleManager } from "./IBundleManager.sol";
import { IEscrow } from "./IEscrow.sol";
import { SaleEvents } from "./events.sol";
import { ErrOnlySeller, ErrStatus, ErrDeadline, ErrBundle } from "./errors.sol";

contract BundleManager is IBundleManager, SaleEvents {
    mapping(uint256 bundleId => AssetBundle bundle) private _bundles;
    uint256 private _nextBundleId = 1;
    IEscrow public immutable escrow;

    constructor(IEscrow _escrow) {
        escrow = _escrow;
    }

    function createBundle(
        ERC20Detail[] calldata erc20s,
        ERC721Detail[] calldata erc721s,
        address payToken,
        uint8 payTokenDecimals,
        uint64 payMinPrice,
        uint256 deadline
    ) external returns (uint256 bundleId) {
        if (deadline <= block.timestamp) revert ErrDeadline();

        bundleId = _nextBundleId++;
        AssetBundle storage b = _bundles[bundleId];
        b.bundleId = bundleId;
        b.seller = msg.sender;
        b.payMinPrice = payMinPrice;
        b.payToken = payToken;
        b.payTokenDecimals = payTokenDecimals;
        b.deadline = deadline;
        b.status = BundleStatus.Active;

        for (uint256 i = 0; i < erc20s.length; i++) b.erc20s.push(erc20s[i]);
        for (uint256 j = 0; j < erc721s.length; j++) b.erc721s.push(erc721s[j]);

        escrow.escrowFrom(msg.sender, erc20s, erc721s);

        emit BundleCreated(bundleId, msg.sender);
    }

    function cancelBundle(uint256 bundleId) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller == address(0)) revert ErrBundle();
        if (b.seller != msg.sender) revert ErrOnlySeller();
        if (b.status != BundleStatus.Active) revert ErrStatus();

        b.status = BundleStatus.Canceled;
        escrow.returnTo(b.seller, b.erc20s, b.erc721s);
        emit BundleCanceled(bundleId);
    }

    function setAccepted(uint256 bundleId) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller == address(0)) revert ErrBundle();
        if (b.status != BundleStatus.Active) revert ErrStatus();
        b.status = BundleStatus.Accepted;
    }

    function releaseTo(uint256 bundleId, address to) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller == address(0)) revert ErrBundle();
        if (b.status != BundleStatus.Accepted) revert ErrStatus();
        escrow.releaseTo(to, b.erc20s, b.erc721s);
    }

    function getBundle(uint256 bundleId) external view returns (AssetBundle memory) {
        return _bundles[bundleId];
    }

    function getERC20s(uint256 bundleId) external view returns (ERC20Detail[] memory) {
        return _bundles[bundleId].erc20s;
    }

    function getERC721s(uint256 bundleId) external view returns (ERC721Detail[] memory) {
        return _bundles[bundleId].erc721s;
    }

    function sellerOf(uint256 bundleId) external view returns (address) {
        return _bundles[bundleId].seller;
    }
}


