import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - 访问控制和权限管理", function () {
  let signers: Signers;
  let subscriptionManager: FHESubscriptionManager;
  let subscriptionManagerAddress: string;
  let nftFactory: NFTFactory;
  let nftFactoryAddress: string;
  let channelId: number;
  let topicId: number;
  let tokenId: number;

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

    // 创建频道、topic和订阅
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    await subscriptionManager.connect(signers.alice).createChannel("测试频道", tiers);
    channelId = 1;
    
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTestIPFSHash", endDate, 10, 90, 50
    );
    topicId = 1;
    
    // Bob订阅频道
    await subscriptionManager.connect(signers.bob).subscribe(channelId, DurationTier.Month, {
      value: ethers.parseEther("0.1")
    });
    tokenId = 1;
    
    // 添加用户到allowlist并提交signal
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, [signers.charlie.address], [100]);
    
    const encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.charlie.address)
      .add8(75)
      .encrypt();
    
    await subscriptionManager.connect(signers.charlie).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
  });

  it("应该允许有效订阅用户访问topic结果", async function () {
    const tx = await subscriptionManager.connect(signers.bob)
      .accessTopicResult(channelId, topicId, tokenId);
    
    // 验证事件
    await expect(tx)
      .to.emit(subscriptionManager, "TopicResultAccessed")
      .withArgs(topicId, signers.bob.address, tokenId);
    
    // 验证访问状态
    expect(await subscriptionManager.hasAccessedTopic(topicId, signers.bob.address)).to.be.true;
  });

  it("应该拒绝非NFT所有者访问", async function () {
    await expect(
      subscriptionManager.connect(signers.charlie)
        .accessTopicResult(channelId, topicId, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "NotSubscriptionOwner");
  });

  it("应该拒绝重复访问", async function () {
    // 第一次访问
    await subscriptionManager.connect(signers.bob)
      .accessTopicResult(channelId, topicId, tokenId);
    
    // 第二次访问应该失败
    await expect(
      subscriptionManager.connect(signers.bob)
        .accessTopicResult(channelId, topicId, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "AlreadyAccessed");
  });

  it("应该拒绝topic和频道不匹配的访问", async function () {
    // 创建另一个频道和topic
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    await subscriptionManager.connect(signers.david).createChannel("另一个频道", tiers);
    const anotherChannelId = 2;
    
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    await subscriptionManager.connect(signers.david).createTopic(
      anotherChannelId, "QmAnotherTopic", endDate, 10, 90, 50
    );
    const anotherTopicId = 2;
    
    // 尝试用频道1的tokenId去访问频道2的topic（应该因为topic和channel不匹配而失败）
    // 这里我们传入正确的channelId，但是传入错误的topicId（属于不同频道）
    await expect(
      subscriptionManager.connect(signers.bob)
        .accessTopicResult(channelId, anotherTopicId, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "TopicChannelMismatch");
  });

  it("只有频道所有者能重置访问记录", async function () {
    // Bob访问topic
    await subscriptionManager.connect(signers.bob)
      .accessTopicResult(channelId, topicId, tokenId);
    
    expect(await subscriptionManager.hasAccessedTopic(topicId, signers.bob.address)).to.be.true;
    
    // 频道所有者重置访问记录
    await subscriptionManager.connect(signers.alice)
      .resetTopicAccess(topicId, signers.bob.address);
    
    expect(await subscriptionManager.hasAccessedTopic(topicId, signers.bob.address)).to.be.false;
    
    // 非频道所有者不能重置
    await expect(
      subscriptionManager.connect(signers.bob)
        .resetTopicAccess(topicId, signers.bob.address)
    ).to.be.revertedWithCustomError(subscriptionManager, "NotChannelOwner");
  });

  it("应该拒绝无效的topic ID", async function () {
    await expect(
      subscriptionManager.connect(signers.bob)
        .accessTopicResult(channelId, 999, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "TopicNotFound");
  });

  it("应该拒绝无效的频道ID", async function () {
    await expect(
      subscriptionManager.connect(signers.bob)
        .accessTopicResult(999, topicId, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "ChannelNotFound");
  });
});
