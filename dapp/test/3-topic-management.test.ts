import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Topic创建和管理功能", function () {
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
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    await subscriptionManager.connect(signers.alice).createChannel("测试频道", tiers);
    channelId = 1;
  });

  it("应该成功创建Topic", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400; // 1天后过期
    const minValue = 10;
    const maxValue = 90;
    const defaultValue = 50;
    
    const tx = await subscriptionManager.connect(signers.alice).createTopic(
      channelId, 
      "QmTestIPFSHash", 
      endDate, 
      minValue, 
      maxValue, 
      defaultValue
    );
    
    // 验证事件
    await expect(tx)
      .to.emit(subscriptionManager, "TopicCreated")
      .withArgs(1, channelId, signers.alice.address, "QmTestIPFSHash", endDate);
    
    // 验证Topic数据
    const topic = await subscriptionManager.getTopic(1);
    expect(topic.topicId).to.equal(1);
    expect(topic.channelId).to.equal(channelId);
    expect(topic.ipfs).to.equal("QmTestIPFSHash");
    expect(topic.endDate).to.equal(endDate);
    expect(topic.creator).to.equal(signers.alice.address);
    expect(topic.minValue).to.equal(minValue);
    expect(topic.maxValue).to.equal(maxValue);
    expect(topic.defaultValue).to.equal(defaultValue);
    expect(topic.totalWeight).to.equal(0);
    expect(topic.submissionCount).to.equal(0);
  });

  it("只有频道所有者能创建Topic", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    
    await expect(
      subscriptionManager.connect(signers.bob).createTopic(
        channelId, "QmTestIPFSHash", endDate, 10, 90, 50
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "NotChannelOwner");
  });

  it("不应该创建过期的Topic", async function () {
    const pastDate = Math.floor(Date.now() / 1000) - 3600; // 1小时前
    
    await expect(
      subscriptionManager.connect(signers.alice).createTopic(
        channelId, "QmTestIPFSHash", pastDate, 10, 90, 50
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "InvalidEndDate");
  });

  it("应该验证值范围配置", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    
    // minValue > maxValue
    await expect(
      subscriptionManager.connect(signers.alice).createTopic(
        channelId, "QmTestIPFSHash", endDate, 90, 10, 50
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "InvalidValueRange");
    
    // defaultValue < minValue
    await expect(
      subscriptionManager.connect(signers.alice).createTopic(
        channelId, "QmTestIPFSHash", endDate, 50, 90, 10
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "InvalidValueRange");
    
    // defaultValue > maxValue
    await expect(
      subscriptionManager.connect(signers.alice).createTopic(
        channelId, "QmTestIPFSHash", endDate, 10, 50, 90
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "InvalidValueRange");
  });

  it("应该正确添加Topic到频道索引", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    
    // 创建3个Topic
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTopic1", endDate, 10, 90, 50
    );
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTopic2", endDate, 20, 80, 50
    );
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTopic3", endDate, 30, 70, 50
    );
    
    // 验证频道Topic计数
    const topicCount = await subscriptionManager.getChannelTopicCount(channelId);
    expect(topicCount).to.equal(3);
    
    // 验证频道Topics
    const topics = await subscriptionManager.getChannelTopics(channelId);
    expect(topics.length).to.equal(3);
    expect(topics[0].ipfs).to.equal("QmTopic1");
    expect(topics[1].ipfs).to.equal("QmTopic2");
    expect(topics[2].ipfs).to.equal("QmTopic3");
  });

  it("应该拒绝无效的频道ID", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    
    await expect(
      subscriptionManager.connect(signers.alice).createTopic(
        999, "QmTestIPFSHash", endDate, 10, 90, 50
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "ChannelNotFound");
  });
});
