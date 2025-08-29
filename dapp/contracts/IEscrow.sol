// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20Detail, ERC721Detail } from "./common.sol";

interface IEscrow {
    function escrowFrom(address from, ERC20Detail[] calldata erc20s, ERC721Detail[] calldata erc721s) external;
    function releaseTo(address to, ERC20Detail[] calldata erc20s, ERC721Detail[] calldata erc721s) external;
    function returnTo(address to, ERC20Detail[] calldata erc20s, ERC721Detail[] calldata erc721s) external;
}


