// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {  euint256 } from "@fhevm/solidity/lib/FHE.sol";



struct IPFSFile{
    euint256 cidv0;

    address uploader;

}