import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - 频道创建功能", function () {
  let signers: Signers;
  let subscriptionManager: FHESubscriptionManager;
  let subscriptionManagerAddress: string;
  let nftFactory: NFTFactory;
  let nftFactoryAddress: string;

  before(async function () {
    signers = await getSigners();
  });

  beforeEach(async () => {
    // 检查是否在FHEVM模拟环境中运行
    if (!fhevm.isMock) {
      throw new Error(`此测试套件只能在FHEVM模拟环境中运行`);
    }
    ({ 
      subscriptionManager, 
      subscriptionManagerAddress, 
      nftFactory,
      nftFactoryAddress
    } = await deployFixture());
  });

  it("应该成功创建频道", async function () {
    const tiers = [
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 },
      { tier: DurationTier.Year, price: ethers.parseEther("1.0"), subscribers: 0 }
    ];
    
    const tx = await subscriptionManager.connect(signers.alice).createChannel("Alice的频道", tiers);
    const receipt = await tx.wait();
    
    // 验证事件
    await expect(tx)
      .to.emit(subscriptionManager, "ChannelCreated")
      .withArgs(1, signers.alice.address, "Alice的频道");
    
    // 验证频道数据
    const channel = await subscriptionManager.getChannel(1);
    expect(channel.channelId).to.equal(1);
    expect(channel.info).to.equal("Alice的频道");
    expect(channel.owner).to.equal(signers.alice.address);
    expect(channel.tiers.length).to.equal(2);
    expect(channel.tiers[0].tier).to.equal(DurationTier.Month);
    expect(channel.tiers[0].price).to.equal(ethers.parseEther("0.1"));
    expect(channel.tiers[1].tier).to.equal(DurationTier.Year);
    expect(channel.tiers[1].price).to.equal(ethers.parseEther("1.0"));
  });

  it("应该为频道创建NFT合约", async function () {
    const tiers = [
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }
    ];
    
    await subscriptionManager.connect(signers.alice).createChannel("Alice的频道", tiers);
    
    const channel = await subscriptionManager.getChannel(1);
    expect(channel.nftContract).to.not.equal(ethers.ZeroAddress);
    
    // 验证NFT合约地址
    const nftContractAddress = await subscriptionManager.getChannelNFTContract(1);
    expect(nftContractAddress).to.equal(channel.nftContract);
    
    // 验证NFT工厂中的记录
    const factoryNFTAddress = await nftFactory.getChannelNFT(1);
    expect(factoryNFTAddress).to.equal(channel.nftContract);
  });

  it("应该支持多用户创建不同频道", async function () {
    const tiers1 = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    const tiers2 = [{ tier: DurationTier.Year, price: ethers.parseEther("1.0"), subscribers: 0 }];
    
    // Alice创建频道1
    await subscriptionManager.connect(signers.alice).createChannel("Alice的频道", tiers1);
    
    // Bob创建频道2
    await subscriptionManager.connect(signers.bob).createChannel("Bob的频道", tiers2);
    
    const channel1 = await subscriptionManager.getChannel(1);
    const channel2 = await subscriptionManager.getChannel(2);
    
    expect(channel1.owner).to.equal(signers.alice.address);
    expect(channel2.owner).to.equal(signers.bob.address);
    expect(channel1.info).to.equal("Alice的频道");
    expect(channel2.info).to.equal("Bob的频道");
  });

  it("应该支持复杂的价格等级配置", async function () {
    const tiers = [
      { tier: DurationTier.OneDay, price: ethers.parseEther("0.01"), subscribers: 0 },
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 },
      { tier: DurationTier.Quarter, price: ethers.parseEther("0.25"), subscribers: 0 },
      { tier: DurationTier.HalfYear, price: ethers.parseEther("0.4"), subscribers: 0 },
      { tier: DurationTier.Year, price: ethers.parseEther("0.7"), subscribers: 0 }
    ];
    
    await subscriptionManager.connect(signers.alice).createChannel("完整价格频道", tiers);
    
    const channel = await subscriptionManager.getChannel(1);
    expect(channel.tiers.length).to.equal(5);
    
    // 验证每个等级的价格
    for (let i = 0; i < tiers.length; i++) {
      expect(channel.tiers[i].tier).to.equal(tiers[i].tier);
      expect(channel.tiers[i].price).to.equal(tiers[i].price);
      expect(channel.tiers[i].subscribers).to.equal(0);
    }
  });

  it("应该正确设置创建时间", async function () {
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    
    const beforeTime = Math.floor(Date.now() / 1000);
    await subscriptionManager.connect(signers.alice).createChannel("时间测试频道", tiers);
    const afterTime = Math.floor(Date.now() / 1000);
    
    const channel = await subscriptionManager.getChannel(1);
    expect(Number(channel.createdAt)).to.be.greaterThanOrEqual(beforeTime);
    expect(Number(channel.createdAt)).to.be.lessThanOrEqual(afterTime + 10); // 允许10秒误差
    expect(channel.lastPublishedAt).to.equal(0);
  });
});
