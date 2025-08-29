// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { AssetBundle, ERC20Detail, ERC721Detail, BundleStatus } from "./common.sol";
import { SaleEvents } from "./events.sol";
import { IBundleManager } from "./IBundleManager.sol";
import { IEscrow } from "./IEscrow.sol";
import {
    ErrDeadline,
    ErrOnlySeller,
    ErrStatus,
    ErrBundle,
    ErrSellerBid,
    ErrNoBid,
    ErrMinPrice,
    ErrNotEnded,
    ErrZeroAddress
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
}

contract FHEBundleSale is SepoliaConfig, IERC721Receiver, SaleEvents {
    IBundleManager public bundleManager;
    IEscrowExtended public escrow;
    
    mapping(uint256 bundleId => address winner) private _acceptedWinners;
    mapping(uint256 bundleId => uint256 payAmount) private _acceptedAmounts;
    
    constructor(address _bundleManager, address _escrow) {
        if (_bundleManager == address(0) || _escrow == address(0)) revert ErrZeroAddress();
        bundleManager = IBundleManager(_bundleManager);
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
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external {
        escrow.withdraw(inputEuint64, inputProof);
    }
    
    function createBundle(
        ERC20Detail[] calldata erc20s,
        ERC721Detail[] calldata erc721s,
        address payToken,
        uint8 payTokenDecimals,
        uint64 payMinPrice,
        uint256 deadline
    ) external returns (uint256 bundleId) {
        bundleId = bundleManager.createBundle(erc20s, erc721s, payToken, payTokenDecimals, payMinPrice, deadline);
    }
    
    function cancelBundle(uint256 bundleId) external {
        AssetBundle memory b = bundleManager.getBundle(bundleId);
        if (b.seller != msg.sender) revert ErrOnlySeller();
        if (b.status != BundleStatus.Active) revert ErrStatus();
        
        bundleManager.cancelBundle(bundleId);
    }
    
    function placeBid(
        uint256 bundleId,
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external {
        AssetBundle memory b = bundleManager.getBundle(bundleId);
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (block.timestamp >= b.deadline && b.deadline != 0) revert ErrDeadline();
        if (b.seller == address(0)) revert ErrBundle();
        if (msg.sender == b.seller) revert ErrSellerBid();
        
        escrow.lockBid(bundleId, msg.sender, inputEuint64, inputProof);
        
        euint64 encBid = escrow.getLockedBid(bundleId, msg.sender);
        FHE.allow(encBid, b.seller);
        
        emit BidPlaced(bundleId, msg.sender);
    }
    
    function cancelBid(uint256 bundleId) external {
        AssetBundle memory b = bundleManager.getBundle(bundleId);
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (!escrow.hasBid(bundleId, msg.sender)) revert ErrNoBid();
        
        escrow.releaseBid(bundleId, msg.sender);
    }
    
    function acceptBundle(
        uint256 bundleId,
        address winner,
        uint256 payAmount
    ) external {
        AssetBundle memory b = bundleManager.getBundle(bundleId);
        if (b.seller != msg.sender) revert ErrOnlySeller();
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (b.deadline != 0 && block.timestamp < b.deadline) revert ErrNotEnded();
        if (winner == address(0)) revert ErrBundle();
        if (!escrow.hasBid(bundleId, winner)) revert ErrNoBid();
        if (payAmount < uint256(b.payMinPrice)) revert ErrMinPrice();
        
        bundleManager.setAccepted(bundleId);
        _acceptedWinners[bundleId] = winner;
        _acceptedAmounts[bundleId] = payAmount;
        
        emit BundleAccepted(bundleId, winner, payAmount);
    }
    
    function claimBundle(uint256 bundleId) external {
        AssetBundle memory b = bundleManager.getBundle(bundleId);
        if (b.status != BundleStatus.Accepted) revert ErrStatus();
        if (_acceptedWinners[bundleId] != msg.sender) revert ErrBundle();
        
        bundleManager.releaseTo(bundleId, msg.sender);
    }
    
    function claimPayment(uint256 bundleId) external {
        AssetBundle memory b = bundleManager.getBundle(bundleId);
        if (b.status != BundleStatus.Accepted) revert ErrStatus();
        if (b.seller != msg.sender) revert ErrOnlySeller();
        
        address winner = _acceptedWinners[bundleId];
        escrow.transferLockedBid(bundleId, winner, b.seller);
    }
    
    function getBundle(uint256 bundleId) external view returns (AssetBundle memory) {
        return bundleManager.getBundle(bundleId);
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