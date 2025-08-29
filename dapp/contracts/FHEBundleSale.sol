// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { AssetBundle, ERC20Detail, ERC721Detail, BundleStatus } from "./common.sol";
import { SaleEvents } from "./events.sol";
import { IEscrow } from "./IEscrow.sol";
import {
    ErrDeadline,
    ErrOnlySeller,
    ErrStatus,
    ErrBundle,
    ErrSellerBid,
    ErrNoBid,
    ErrMinPrice,
    ErrZeroAddress,
    ErrPayFail
} from "./errors.sol";

interface IEscrowExtended is IEscrow {
    function deposit(address token, uint256 amount, externalEuint64 inputEuint64, bytes calldata inputProof) external;
    function withdraw(externalEuint64 inputEuint64, bytes calldata inputProof) external;
    function lockBid(uint256 bundleId, address bidder, externalEuint64 inputEuint64, bytes calldata inputProof) external;
    function releaseBid(uint256 bundleId, address bidder) external;
    function transferLockedBid(uint256 bundleId, address from, address to) external;
    function getEncryptedBalance(address user) external view returns (euint64);
    function getLockedBid(uint256 bundleId, address bidder) external view returns (euint64);
    function hasBid(uint256 bundleId, address bidder) external view returns (bool);
    function depositedTokenOf(address user) external view returns (address);
    function isBidAtLeast(uint256 bundleId, address bidder, uint64 min) external view returns (bool);
}

contract FHEBundleSale is SepoliaConfig, IERC721Receiver, SaleEvents {
    IEscrowExtended public escrow;

    // Bundles managed inside this contract
    mapping(uint256 bundleId => AssetBundle bundle) private _bundles;
    uint256 private _nextBundleId = 1;

    // Accepted state and claims
    mapping(uint256 bundleId => address winner) private _acceptedWinners;
    mapping(uint256 bundleId => bool bundleClaimed) private _bundleClaimed;
    mapping(uint256 bundleId => bool paymentClaimed) private _paymentClaimed;

    constructor(address _escrow) {
        if (_escrow == address(0)) revert ErrZeroAddress();
        escrow = IEscrowExtended(_escrow);
    }
    
    function depositToEscrow(
        address token,
        uint256 amount,
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external {
        escrow.deposit(token, amount, inputEuint64, inputProof);
    }
    
    function withdrawFromEscrow(
        address token,
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external {
        escrow.withdraw(token, inputEuint64, inputProof);
    }
    
    function createBundle(
        ERC20Detail[] calldata erc20s,
        ERC721Detail[] calldata erc721s,
        address payToken,
        uint8 payTokenDecimals,
        uint64 payMinPrice,
        uint256 deadline
    ) external returns (uint256 bundleId) {
        if (deadline != 0 && deadline <= block.timestamp) revert ErrDeadline();

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
    
    function placeBid(
        uint256 bundleId,
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller == address(0)) revert ErrBundle();
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (b.deadline != 0 && block.timestamp >= b.deadline) revert ErrDeadline();
        if (msg.sender == b.seller) revert ErrSellerBid();

        // Lock bid using specified pay token
        escrow.lockBid(bundleId, msg.sender, b.payToken, inputEuint64, inputProof);

        euint64 encBid = escrow.getLockedBid(bundleId, msg.sender);
        FHE.allow(encBid, b.seller);

        emit BidPlaced(bundleId, msg.sender);
    }
    
    function cancelBid(uint256 bundleId) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller == address(0)) revert ErrBundle();
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (!escrow.hasBid(bundleId, msg.sender)) revert ErrNoBid();
        if (_acceptedWinners[bundleId] == msg.sender) revert ErrStatus();

        escrow.releaseBid(bundleId, msg.sender);
    }
    
    function acceptBundle(
        uint256 bundleId,
        address winner
    ) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller == address(0)) revert ErrBundle();
        if (b.seller != msg.sender) revert ErrOnlySeller();
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (b.deadline != 0 && block.timestamp > b.deadline) revert ErrDeadline();
        if (winner == address(0)) revert ErrBundle();
        if (!escrow.hasBid(bundleId, winner)) revert ErrNoBid();
        if (!escrow.isBidAtLeast(bundleId, winner, b.payMinPrice)) revert ErrMinPrice();

        b.status = BundleStatus.Accepted;
        _acceptedWinners[bundleId] = winner;

        emit BundleAccepted(bundleId, winner);
    }
    
    function claimBundle(uint256 bundleId) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller == address(0)) revert ErrBundle();
        if (b.status != BundleStatus.Accepted) revert ErrStatus();
        if (_acceptedWinners[bundleId] != msg.sender) revert ErrBundle();
        if (_bundleClaimed[bundleId]) revert ErrStatus();

        _bundleClaimed[bundleId] = true;
        escrow.releaseTo(msg.sender, b.erc20s, b.erc721s);
    }
    
    function claimPayment(uint256 bundleId) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller == address(0)) revert ErrBundle();
        if (b.status != BundleStatus.Accepted) revert ErrStatus();
        if (b.seller != msg.sender) revert ErrOnlySeller();
        if (_paymentClaimed[bundleId]) revert ErrStatus();

        _paymentClaimed[bundleId] = true;
        address winner = _acceptedWinners[bundleId];
        escrow.transferLockedBid(bundleId, winner, b.seller);
    }
    
    function getBundle(uint256 bundleId) external view returns (AssetBundle memory) {
        return _bundles[bundleId];
    }
    
    function getEncryptedBalance(address user) external view returns (euint64) {
        return escrow.getEncryptedBalance(user);
    }
    
    function getLockedBid(uint256 bundleId, address bidder) external view returns (euint64) {
        return escrow.getLockedBid(bundleId, bidder);
    }
    
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}