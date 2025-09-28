import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Topic Creation and Management", function () {
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
    // Check if running in FHEVM mock environment
    if (!fhevm.isMock) {
      throw new Error(`This test suite can only run in FHEVM mock environment`);
    }
    ({ 
      subscriptionManager, 
      subscriptionManagerAddress, 
      nftFactory,
      nftFactoryAddress
    } = await deployFixture());

    // Create test channel
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    await subscriptionManager.connect(signers.alice).createChannel("Test Channel", tiers);
    channelId = 1;
  });

  it("should successfully create Topic", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400; // Expires in 1 day
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
    
    // Verify event
    await expect(tx)
      .to.emit(subscriptionManager, "TopicCreated")
      .withArgs(1, channelId, signers.alice.address, "QmTestIPFSHash", endDate);
    
    // Verify Topic data
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

  it("only channel owner can create Topic", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    
    await expect(
      subscriptionManager.connect(signers.bob).createTopic(
        channelId, "QmTestIPFSHash", endDate, 10, 90, 50
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "NotChannelOwner");
  });

  it("should not create expired Topic", async function () {
    const pastDate = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    
    await expect(
      subscriptionManager.connect(signers.alice).createTopic(
        channelId, "QmTestIPFSHash", pastDate, 10, 90, 50
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "InvalidEndDate");
  });

  it("should validate value range configuration", async function () {
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

  it("should correctly add Topic to channel index", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    
    // Create 3 Topics
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTopic1", endDate, 10, 90, 50
    );
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTopic2", endDate, 20, 80, 50
    );
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTopic3", endDate, 30, 70, 50
    );
    
    // Verify channel Topic count
    const topicCount = await subscriptionManager.getChannelTopicCount(channelId);
    expect(topicCount).to.equal(3);
    
    // Verify channel Topics
    const topics = await subscriptionManager.getChannelTopics(channelId);
    expect(topics.length).to.equal(3);
    expect(topics[0].ipfs).to.equal("QmTopic1");
    expect(topics[1].ipfs).to.equal("QmTopic2");
    expect(topics[2].ipfs).to.equal("QmTopic3");
  });

  it("should reject invalid channel ID", async function () {
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    
    await expect(
      subscriptionManager.connect(signers.alice).createTopic(
        999, "QmTestIPFSHash", endDate, 10, 90, 50
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "ChannelNotFound");
  });
});
