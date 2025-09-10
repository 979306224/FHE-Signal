import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { Test, Test__factory } from "../types";
import { expect } from "chai";
import CID from 'cids';
import { FhevmType } from "@fhevm/hardhat-plugin";

/**
 * 签名者类型定义
 */
type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

/**
 * 部署测试合约的夹具函数
 * @returns 部署的合约实例和地址
 */
async function deployFixture() {
  const factory = (await ethers.getContractFactory("Test")) as Test__factory;
  const testContract = (await factory.deploy()) as Test;
  const testContractAddress = await testContract.getAddress();

  return { testContract, testContractAddress };
}

/**
 * 将BigInt转换为CIDv0格式
 * @param bigint 要转换的BigInt值
 * @returns CIDv0对象
 */
const bigintToCidv0 = (bigint: BigInt): CID => {
    // 步骤1: 将BigInt转换为字节数组
    const hexString = bigint.toString(16).padStart(64, '0');
    const byteArray = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      byteArray[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }
  
    // 步骤2: 添加前两个字节（0x12表示"sha2-256"，0x20表示哈希长度）
    const cidv0Bytes = new Uint8Array(2 + byteArray.length);
    cidv0Bytes[0] = 0x12;  // 算法代码: "sha2-256"
    cidv0Bytes[1] = 0x20;  // 哈希长度: 32字节
    cidv0Bytes.set(byteArray, 2);
  
    // 步骤3: 使用cids库生成CIDv0，确保编码为'dag-pb'
    return new CID(0, 'dag-pb', cidv0Bytes);
};

/**
 * Test合约的测试套件
 * 测试CIDv0与uint256之间的转换功能
 */
describe("Test Contract - CIDv0 to uint256 Conversion", function () {
  let signers: Signers;
  let testContract: Test;
  let testContractAddress: string;

  // 测试用的CIDv0示例
  const cidv0 = 'QmVjcm4A4LMQ78CthhhwDiXEn9rCbsnbfFa1GMLXBQ31iC';

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ testContract, testContractAddress } = await deployFixture());
  });

  it("应该能够将CIDv0转换为uint256并存储到合约中，然后转换回来", async function () {
    // 步骤1: 使用cids库解析CIDv0
    const cid = new CID(cidv0, 'dag-pb');
    const hashBytes = cid.multihash;
    console.log("解析的哈希字节:", hashBytes);
    
    // 步骤2: 截断前两个字节（算法和长度信息），保留哈希字节
    const truncatedBytes = hashBytes.slice(2);
    console.log("截断后的字节:", truncatedBytes);
    
    // 步骤3: 将字节转换为32字节的bytes32格式，然后转换为BigInt
    let hashBytes32 = new Uint8Array(32);
    if (truncatedBytes.length <= 32) {
      hashBytes32.set(truncatedBytes, 32 - truncatedBytes.length);  // 右对齐填充
    } else {
      hashBytes32.set(truncatedBytes.slice(0, 32));  // 截取前32字节
    }
    
    const hashBigInt = BigInt('0x' + Array.from(hashBytes32).map(b => b.toString(16).padStart(2, '0')).join(''));
    console.log("CIDv0哈希作为uint256:", hashBigInt.toString());

    // 步骤4: 将BigInt转换为加密的euint256并存入合约
    const encryptedValue = await fhevm
      .createEncryptedInput(testContractAddress, signers.alice.address)
      .add256(hashBigInt)
      .encrypt();

    const tx = await testContract
      .connect(signers.alice)
      .setA(encryptedValue.handles[0], encryptedValue.inputProof);
    await tx.wait();

    // 步骤5: 从合约中获取加密后的值
    const encryptedA = await testContract.getA();
    
    // 步骤6: 解密该值，验证是否正确
    const decryptedValue = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      encryptedA,
      testContractAddress,
      signers.alice,
    );

    // 步骤7: 验证解密后的值是否与原CIDv0哈希对应的BigInt一致
    expect(decryptedValue).to.eq(hashBigInt);

    // 步骤8: 将BigInt转回CIDv0格式
    const cidv0Res = bigintToCidv0(decryptedValue);

    console.log("转换后的CIDv0:", cidv0Res.toString());

    // 步骤9: 验证生成的CIDv0是否与原始CIDv0匹配
    expect(cidv0Res.toString()).to.eq(cidv0);
  });
});
