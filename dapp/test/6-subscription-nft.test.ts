import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory, ChannelNFT } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - 订阅功能和NFT集成", function () {
  let signers: Signers;
  let subscriptionManager: FHESubscriptionManager;
  let subscriptionManagerAddress: string;
  let nftFactory: NFTFactory;
  let nftFactoryAddress: string;
  let channelId: number;

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

    // 创建测试频道
    const tiers = [
      { tier: DurationTier.OneDay, price: ethers.parseEther("0.01"), subscribers: 0 },
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 },
      { tier: DurationTier.Year, price: ethers.parseEther("1.0"), subscribers: 0 }
    ];
    await subscriptionManager.connect(signers.alice).createChannel("测试频道", tiers);
    channelId = 1;
  });

  it("应该成功订阅频道", async function () {
    const tier = DurationTier.Month;
    const price = ethers.parseEther("0.1");
    
    const tx = await subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
      value: price
    });
    
    // 验证事件
    await expect(tx).to.emit(subscriptionManager, "Subscribed");
    
    // 验证NFT被铸造
    const nftContractAddress = await subscriptionManager.getChannelNFTContract(channelId);
    const nftContract = await ethers.getContractAt("ChannelNFT", nftContractAddress) as ChannelNFT;
    
    const balance = await nftContract.balanceOf(signers.bob.address);
    expect(balance).to.equal(1);
    
    // 验证订阅信息
    const subscription = await subscriptionManager.getSubscription(channelId, 1);
    expect(subscription.channelId).to.equal(channelId);
    expect(subscription.subscriber).to.equal(signers.bob.address);
    expect(subscription.tier).to.equal(tier);
    
    // 验证订阅有效性
    const isValid = await subscriptionManager.isSubscriptionValid(channelId, 1);
    expect(isValid).to.be.true;
  });

  it("应该拒绝错误的支付金额", async function () {
    const tier = DurationTier.Month;
    const correctPrice = ethers.parseEther("0.1");
    const wrongPrice = ethers.parseEther("0.05");
    
    await expect(
      subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
        value: wrongPrice
      })
    ).to.be.revertedWithCustomError(subscriptionManager, "IncorrectPayment");
  });

  it("应该拒绝不存在的订阅等级", async function () {
    // DurationTier.Quarter不在频道的等级列表中
    const tier = DurationTier.Quarter;
    const price = ethers.parseEther("0.25");
    
    await expect(
      subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
        value: price
      })
    ).to.be.revertedWithCustomError(subscriptionManager, "TierNotFound");
  });

  it("应该正确转账给频道所有者", async function () {
    const tier = DurationTier.Month;
    const price = ethers.parseEther("0.1");
    
    const initialBalance = await ethers.provider.getBalance(signers.alice.address);
    
    await subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
      value: price
    });
    
    const finalBalance = await ethers.provider.getBalance(signers.alice.address);
    expect(finalBalance - initialBalance).to.equal(price);
  });

  it("应该更新订阅者计数", async function () {
    const tier = DurationTier.Month;
    const price = ethers.parseEther("0.1");
    
    // 第一次订阅
    await subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
      value: price
    });
    
    // 第二次订阅
    await subscriptionManager.connect(signers.charlie).subscribe(channelId, tier, {
      value: price
    });
    
    // 验证订阅者计数
    const channel = await subscriptionManager.getChannel(channelId);
    expect(channel.tiers[1].subscribers).to.equal(2); // Month是索引1
  });

  it("应该支持不同用户订阅不同等级", async function () {
    // Bob订阅1天
    await subscriptionManager.connect(signers.bob).subscribe(channelId, DurationTier.OneDay, {
      value: ethers.parseEther("0.01")
    });
    
    // Charlie订阅1年
    await subscriptionManager.connect(signers.charlie).subscribe(channelId, DurationTier.Year, {
      value: ethers.parseEther("1.0")
    });
    
    // 验证订阅信息
    const bobSubscription = await subscriptionManager.getSubscription(channelId, 1);
    const charlieSubscription = await subscriptionManager.getSubscription(channelId, 2);
    
    expect(bobSubscription.tier).to.equal(DurationTier.OneDay);
    expect(charlieSubscription.tier).to.equal(DurationTier.Year);
    
    // 验证过期时间不同
    expect(charlieSubscription.expiresAt > bobSubscription.expiresAt).to.be.true;
  });

  it("应该拒绝无效频道的订阅", async function () {
    await expect(
      subscriptionManager.connect(signers.bob).subscribe(999, DurationTier.Month, {
        value: ethers.parseEther("0.1")
      })
    ).to.be.revertedWithCustomError(subscriptionManager, "ChannelNotFound");
  });

  it("应该正确计算订阅过期时间", async function () {
    const beforeTime = Math.floor(Date.now() / 1000);
    
    await subscriptionManager.connect(signers.bob).subscribe(channelId, DurationTier.Month, {
      value: ethers.parseEther("0.1")
    });
    
    const afterTime = Math.floor(Date.now() / 1000);
    
    const subscription = await subscriptionManager.getSubscription(channelId, 1);
    const expectedExpireTime = beforeTime + 30 * 24 * 3600; // 30天
    
    expect(Number(subscription.expiresAt)).to.be.greaterThanOrEqual(expectedExpireTime);
    expect(Number(subscription.expiresAt)).to.be.lessThanOrEqual(afterTime + 30 * 24 * 3600 + 5);
  });
});
