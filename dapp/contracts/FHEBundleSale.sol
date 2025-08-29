// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { AssetBundle, ERC20Detail, ERC721Detail, BundleStatus } from "./common.sol";
import { SaleEvents } from "./events.sol";
import {
    ErrDeadline,
    ErrOnlySeller,
    ErrStatus,
    ErrBundle,
    ErrSellerBid,
    ErrNoBid,
    ErrMinPrice,
    ErrNativeDisabled,
    ErrERC20Escrow,
    ErrERC20Back,
    ErrNotEnded,
    ErrPayFail,
    ErrERC20ToWinner
} from "./errors.sol";


contract FHEBundleSale is SepoliaConfig, IERC721Receiver, SaleEvents {

    // bundleId => bundle detail
    mapping(uint256 bundleId => AssetBundle bundle) private _bundles;
    // bundleId => bidder => encrypted bid
    mapping(uint256 bundleId => mapping(address bidder => euint64 encBid)) private _bids;
    // bundleId => bidder => has bid
    mapping(uint256 bundleId => mapping(address bidder => bool hasBid)) private _hasBid;

    uint256 private _nextBundleId = 1;

    // events are inherited from SaleEvents

    function getBundle(uint256 bundleId) external view returns (AssetBundle memory) {
        return _bundles[bundleId];
    }

    function getEncryptedBid(uint256 bundleId, address bidder) external view returns (euint64) {
        return _bids[bundleId][bidder];
    }

    // internal helpers
    function _escrowERC20s(address from, ERC20Detail[] calldata erc20s) private {
        for (uint256 i = 0; i < erc20s.length; i++) {
            if (erc20s[i].amount > 0) {
                bool okEscrow = IERC20(erc20s[i].token).transferFrom(from, address(this), erc20s[i].amount);
                if (!okEscrow) revert ErrERC20Escrow();
            }
        }
    }

    function _returnEscrowAssets(AssetBundle storage b) private {
        for (uint256 i = 0; i < b.erc20s.length; i++) {
            if (b.erc20s[i].amount > 0) {
                bool ok = IERC20(b.erc20s[i].token).transfer(b.seller, b.erc20s[i].amount);
                if (!ok) revert ErrERC20Back();
            }
        }
        for (uint256 j = 0; j < b.erc721s.length; j++) {
            IERC721(b.erc721s[j].token).safeTransferFrom(address(this), b.seller, b.erc721s[j].tokenId);
        }
    }

    function _validateAccept(AssetBundle storage b, address winner, uint256 payAmount) private view {
        if (b.seller != msg.sender) revert ErrOnlySeller();
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (block.timestamp < b.deadline) revert ErrNotEnded();
        if (winner == address(0)) revert ErrBundle();
        if (!_hasBid[b.bundleId][winner]) revert ErrNoBid();
        if (payAmount < uint256(b.payMinPrice)) revert ErrMinPrice();
    }

    function _transferPayment(AssetBundle storage b, address payer, uint256 amount) private {
        if (b.payToken != address(0)) {
            bool ok = IERC20(b.payToken).transferFrom(payer, b.seller, amount);
            if (!ok) revert ErrPayFail();
        } else {
            revert ErrNativeDisabled();
        }
    }

    function _transferAssetsTo(address to, AssetBundle storage b) private {
        for (uint256 i = 0; i < b.erc20s.length; i++) {
            if (b.erc20s[i].amount > 0) {
                bool ok2 = IERC20(b.erc20s[i].token).transfer(to, b.erc20s[i].amount);
                if (!ok2) revert ErrERC20ToWinner();
            }
        }
        for (uint256 j = 0; j < b.erc721s.length; j++) {
            IERC721(b.erc721s[j].token).safeTransferFrom(address(this), to, b.erc721s[j].tokenId);
        }
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

        // copy and escrow ERC20s
        for (uint256 i = 0; i < erc20s.length; i++) {
            b.erc20s.push(erc20s[i]);
        }
        _escrowERC20s(msg.sender, erc20s);

        // copy and escrow ERC721s
        for (uint256 j = 0; j < erc721s.length; j++) {
            b.erc721s.push(erc721s[j]);
            IERC721(erc721s[j].token).safeTransferFrom(msg.sender, address(this), erc721s[j].tokenId);
        }

        emit BundleCreated(bundleId, msg.sender);
    }

    function cancelBundle(uint256 bundleId) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.seller != msg.sender) revert ErrOnlySeller();
        if (b.status != BundleStatus.Active) revert ErrStatus();

        b.status = BundleStatus.Canceled;

        // return escrowed assets
        _returnEscrowAssets(b);

        emit BundleCanceled(bundleId);
    }

    function placeBid(
        uint256 bundleId,
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (block.timestamp >= b.deadline) revert ErrDeadline();
        if (b.seller == address(0)) revert ErrBundle();
        if (msg.sender == b.seller) revert ErrSellerBid();

        euint64 encBid = FHE.fromExternal(inputEuint64, inputProof);
        _bids[bundleId][msg.sender] = encBid;
        _hasBid[bundleId][msg.sender] = true;

        // allow seller to decrypt this bidder's ciphertext via oracle
        FHE.allow(encBid, b.seller);

        emit BidPlaced(bundleId, msg.sender);
    }

    // seller or bidder can delegate decryption permission to a viewer
    function allowBidDecryption(
        uint256 bundleId,
        address bidder,
        address viewer
    ) external {
        AssetBundle storage b = _bundles[bundleId];
        if (b.status != BundleStatus.Active) revert ErrStatus();
        if (b.seller == address(0)) revert ErrBundle();
        if (!(msg.sender == b.seller || msg.sender == bidder)) revert ErrOnlySeller();

        if (!_hasBid[bundleId][bidder]) revert ErrNoBid();
        euint64 encBid = _bids[bundleId][bidder];
        FHE.allow(encBid, viewer);
    }

    // solhint-disable-next-line code-complexity
    function acceptBundle(
        uint256 bundleId,
        address winner,
        uint256 payAmount
    ) external {
        AssetBundle storage b = _bundles[bundleId];
        _validateAccept(b, winner, payAmount);

        b.status = BundleStatus.Accepted;

        // transfer payment from winner to seller
        _transferPayment(b, winner, payAmount);

        // transfer assets to winner
        _transferAssetsTo(winner, b);

        emit BundleAccepted(bundleId, winner, payAmount);
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