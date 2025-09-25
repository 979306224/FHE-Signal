// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint256} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {externalEuint256} from "encrypted-types/EncryptedTypes.sol";

contract Test is SepoliaConfig {
    euint256 private _a;

    function setA(externalEuint256 inputHandle, bytes calldata inputProof) external {
        euint256 value = FHE.fromExternal(inputHandle, inputProof);
        value = FHE.allow(value, msg.sender);
        value = FHE.allowThis(value);
        _a = value;
    }

    function getA() external view returns (euint256) {
        return _a;
    }
}
