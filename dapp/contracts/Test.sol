// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { FHE } from "@fhevm/solidity/lib/FHE.sol";
import { euint256, externalEuint256 } from "encrypted-types/EncryptedTypes.sol";

/**
 * @title Test
 * @dev 用于测试FHEVM功能的简单合约
 * 支持存储和检索加密的uint256值
 */
contract Test is SepoliaConfig {
    /// @dev 存储加密的uint256值
    euint256 public a;

    /**
     * @dev 设置加密的uint256值
     * @param inputEuint256 外部加密的uint256值
     * @param inputProof 输入证明
     */
    function setA(externalEuint256 inputEuint256, bytes calldata inputProof) external {
        a = FHE.fromExternal(inputEuint256, inputProof);
        FHE.allow(a, msg.sender);
        FHE.allowThis(a);
    }

    /**
     * @dev 获取存储的加密uint256值
     * @return 加密的uint256值
     */
    function getA() external view returns (euint256) {
        return a;
    }
}