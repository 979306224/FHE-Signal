import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";

export type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
  david: HardhatEthersSigner;
  eve: HardhatEthersSigner;
};

// 定义枚举映射
export const DurationTier = {
  OneDay: 0,
  Month: 1,
  Quarter: 2,
  HalfYear: 3,
  Year: 4
};

export async function deployFixture() {
  // 部署FHESubscriptionManager合约
  const FHESubscriptionManagerFactory = await ethers.getContractFactory("FHESubscriptionManager");
  const subscriptionManager = await FHESubscriptionManagerFactory.deploy() as FHESubscriptionManager;
  const subscriptionManagerAddress = await subscriptionManager.getAddress();

  // 获取NFT工厂地址
  const nftFactoryAddress = await subscriptionManager.NFT_FACTORY();
  const nftFactory = await ethers.getContractAt("NFTFactory", nftFactoryAddress) as NFTFactory;

  return { 
    subscriptionManager, 
    subscriptionManagerAddress, 
    nftFactory,
    nftFactoryAddress
  };
}

export async function getSigners(): Promise<Signers> {
  const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
  return { 
    deployer: ethSigners[0], 
    alice: ethSigners[1], 
    bob: ethSigners[2], 
    charlie: ethSigners[3],
    david: ethSigners[4],
    eve: ethSigners[5]
  };
}
