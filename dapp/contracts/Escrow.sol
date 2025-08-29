// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { ERC20Detail, ERC721Detail } from "./common.sol";
import { IEscrow } from "./IEscrow.sol";
import { ErrERC20Escrow, ErrERC20Back, ErrERC20ToWinner, ErrOnlyManager, ErrInsufficientBalance } from "./errors.sol";

contract Escrow is IEscrow, IERC721Receiver, SepoliaConfig {
    address public manager;
    
    // per-user per-token encrypted balances
    mapping(address user => mapping(address token => euint64 encBalance)) private _balances;
    mapping(uint256 bundleId => mapping(address bidder => euint64 encBid)) private _lockedBids;
    mapping(uint256 bundleId => mapping(address bidder => bool hasBid)) private _hasBid;
    mapping(uint256 bundleId => mapping(address bidder => address token)) private _lockedBidToken;

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token);
    event BidLocked(uint256 indexed bundleId, address indexed bidder);
    event BidReleased(uint256 indexed bundleId, address indexed bidder);

    constructor(address _manager) {
        manager = _manager;
    }

    modifier onlyManager() {
        if (msg.sender != manager) revert ErrOnlyManager();
        _;
    }

    function updateManager(address _manager) external onlyManager {
        manager = _manager;
    }

    function deposit(
        address token,
        uint256 amount,
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external {
        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert ErrERC20Escrow();

        euint64 encAmount = FHE.fromExternal(inputEuint64, inputProof);
        euint64 currentBalance = _balances[msg.sender][token];
        _balances[msg.sender][token] = FHE.add(currentBalance, encAmount);

        FHE.allow(_balances[msg.sender][token], msg.sender);

        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(
        address token,
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external {
        euint64 encAmount = FHE.fromExternal(inputEuint64, inputProof);
        euint64 currentBalance = _balances[msg.sender][token];

        _balances[msg.sender][token] = FHE.sub(currentBalance, encAmount);

        // NOTE: In a production FHE flow, decryption should be performed off-chain via oracle.
        // Here we assume the plaintext amount equals the ERC20 transfer amount provided by the encrypted input.
        // If your environment does not support on-chain decrypt, replace with oracle callback flow.
        uint64 amount = FHE.decrypt(encAmount);
        bool ok = IERC20(token).transfer(msg.sender, amount);
        if (!ok) revert ErrERC20Back();

        FHE.allow(_balances[msg.sender][token], msg.sender);

        emit Withdraw(msg.sender, token);
    }

    function lockBid(
        uint256 bundleId,
        address bidder,
        address token,
        externalEuint64 inputEuint64,
        bytes calldata inputProof
    ) external onlyManager {
        euint64 encBid = FHE.fromExternal(inputEuint64, inputProof);
        euint64 currentBalance = _balances[bidder][token];

        _balances[bidder][token] = FHE.sub(currentBalance, encBid);
        _lockedBids[bundleId][bidder] = encBid;
        _lockedBidToken[bundleId][bidder] = token;
        _hasBid[bundleId][bidder] = true;

        FHE.allow(_balances[bidder][token], bidder);
        FHE.allow(_lockedBids[bundleId][bidder], manager);

        emit BidLocked(bundleId, bidder);
    }

    function releaseBid(uint256 bundleId, address bidder) external onlyManager {
        if (!_hasBid[bundleId][bidder]) return;

        address token = _lockedBidToken[bundleId][bidder];
        euint64 encBid = _lockedBids[bundleId][bidder];
        euint64 currentBalance = _balances[bidder][token];

        _balances[bidder][token] = FHE.add(currentBalance, encBid);
        delete _lockedBids[bundleId][bidder];
        delete _lockedBidToken[bundleId][bidder];
        _hasBid[bundleId][bidder] = false;

        FHE.allow(_balances[bidder][token], bidder);

        emit BidReleased(bundleId, bidder);
    }

    function transferLockedBid(
        uint256 bundleId,
        address from,
        address to
    ) external onlyManager {
        if (!_hasBid[bundleId][from]) return;

        address token = _lockedBidToken[bundleId][from];
        euint64 encBid = _lockedBids[bundleId][from];
        uint64 amount = FHE.decrypt(encBid);

        bool ok = IERC20(token).transfer(to, amount);
        if (!ok) revert ErrERC20ToWinner();

        delete _lockedBids[bundleId][from];
        delete _lockedBidToken[bundleId][from];
        _hasBid[bundleId][from] = false;
    }

    function isBidAtLeast(uint256 bundleId, address bidder, uint64 min) external view returns (bool) {
        euint64 encBid = _lockedBids[bundleId][bidder];
        if (!_hasBid[bundleId][bidder]) return false;
        // Compare by decrypting bid locally; in real deployments, consider zero-knowledge compare
        uint64 amount = FHE.decrypt(encBid);
        return amount >= min;
    }

    function getEncryptedBalanceOf(address user, address token) external view returns (euint64) {
        return _balances[user][token];
    }

    function getLockedBid(uint256 bundleId, address bidder) external view returns (euint64) {
        return _lockedBids[bundleId][bidder];
    }

    function hasBid(uint256 bundleId, address bidder) external view returns (bool) {
        return _hasBid[bundleId][bidder];
    }
    

    function escrowFrom(address from, ERC20Detail[] calldata erc20s, ERC721Detail[] calldata erc721s) external onlyManager {
        for (uint256 i = 0; i < erc20s.length; i++) {
            if (erc20s[i].amount > 0) {
                bool ok = IERC20(erc20s[i].token).transferFrom(from, address(this), erc20s[i].amount);
                if (!ok) revert ErrERC20Escrow();
            }
        }
        for (uint256 j = 0; j < erc721s.length; j++) {
            IERC721(erc721s[j].token).safeTransferFrom(from, address(this), erc721s[j].tokenId);
        }
    }

    function releaseTo(address to, ERC20Detail[] calldata erc20s, ERC721Detail[] calldata erc721s) external onlyManager {
        for (uint256 i = 0; i < erc20s.length; i++) {
            if (erc20s[i].amount > 0) {
                bool ok = IERC20(erc20s[i].token).transfer(to, erc20s[i].amount);
                if (!ok) revert ErrERC20ToWinner();
            }
        }
        for (uint256 j = 0; j < erc721s.length; j++) {
            IERC721(erc721s[j].token).safeTransferFrom(address(this), to, erc721s[j].tokenId);
        }
    }

    function returnTo(address to, ERC20Detail[] calldata erc20s, ERC721Detail[] calldata erc721s) external onlyManager {
        for (uint256 i = 0; i < erc20s.length; i++) {
            if (erc20s[i].amount > 0) {
                bool ok = IERC20(erc20s[i].token).transfer(to, erc20s[i].amount);
                if (!ok) revert ErrERC20Back();
            }
        }
        for (uint256 j = 0; j < erc721s.length; j++) {
            IERC721(erc721s[j].token).safeTransferFrom(address(this), to, erc721s[j].tokenId);
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}


