// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { euint64 } from "@fhevm/solidity/lib/FHE.sol";


library CommonLib {

    struct ERC20Detail {
        address token;
        uint256 amount;
    }

    struct ERC721Detail {
        address token; 
        uint256 tokenId; 
    }

    enum BundleStatus { Canceled, Active, Accepted }


    struct AssetBundle {
        uint256 bundleId;      
        address seller;        

        ERC20Detail[] erc20s;  
        ERC721Detail[] erc721s;

        // 最低价
        uint64 payMinPrice;
        // 要求支付什么币
        address payToken;
        // 支付币的精度
        uint8 payTokenDecimals;

        // 截止时间
        uint256 deadline;       

        // 状态
        BundleStatus status;
    }



}
