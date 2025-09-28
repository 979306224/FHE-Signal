import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Access Control and Permission Management", function () {
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

    // Create channel, topic and subscription
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    await subscriptionManager.connect(signers.alice).createChannel("Test Channel", tiers);
    channelId = 1;
    
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTestIPFSHash", endDate, 10, 90, 50
    );
    topicId = 1;
    
    // Bob subscribes to channel
    await subscriptionManager.connect(signers.bob).subscribe(channelId, DurationTier.Month, {
      value: ethers.parseEther("0.1")
    });
    tokenId = 1;
    
    // Add user to allowlist and submit signal
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

  it("Should allow valid subscription user to access topic result", async function () {
    const tx = await subscriptionManager.connect(signers.bob)
      .accessTopicResult(channelId, topicId, tokenId);
    
    // Verify event
    await expect(tx)
      .to.emit(subscriptionManager, "TopicResultAccessed")
      .withArgs(topicId, signers.bob.address, tokenId);
    
    // Verify access status
    expect(await subscriptionManager.hasAccessedTopic(topicId, signers.bob.address)).to.be.true;
  });

  it("Should reject non-NFT owner access", async function () {
    await expect(
      subscriptionManager.connect(signers.charlie)
        .accessTopicResult(channelId, topicId, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "NotSubscriptionOwner");
  });

  it("Should reject duplicate access", async function () {
    // First access
    await subscriptionManager.connect(signers.bob)
      .accessTopicResult(channelId, topicId, tokenId);
    
    // Second access should fail
    await expect(
      subscriptionManager.connect(signers.bob)
        .accessTopicResult(channelId, topicId, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "AlreadyAccessed");
  });

  it("Should reject access when topic and channel don't match", async function () {
    // Create another channel and topic
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    await subscriptionManager.connect(signers.david).createChannel("Another Channel", tiers);
    const anotherChannelId = 2;
    
    const endDate = Math.floor(Date.now() / 1000) + 86400;
    await subscriptionManager.connect(signers.david).createTopic(
      anotherChannelId, "QmAnotherTopic", endDate, 10, 90, 50
    );
    const anotherTopicId = 2;
    
    // Try to use channel 1's tokenId to access channel 2's topic (should fail due to topic and channel mismatch)
    // Here we pass the correct channelId, but the wrong topicId (belonging to a different channel)
    await expect(
      subscriptionManager.connect(signers.bob)
        .accessTopicResult(channelId, anotherTopicId, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "TopicChannelMismatch");
  });

  it("Only channel owner can reset access records", async function () {
    // Bob accesses topic
    await subscriptionManager.connect(signers.bob)
      .accessTopicResult(channelId, topicId, tokenId);
    
    expect(await subscriptionManager.hasAccessedTopic(topicId, signers.bob.address)).to.be.true;
    
    // Channel owner resets access record
    await subscriptionManager.connect(signers.alice)
      .resetTopicAccess(topicId, signers.bob.address);
    
    expect(await subscriptionManager.hasAccessedTopic(topicId, signers.bob.address)).to.be.false;
    
    // Non-channel owner cannot reset
    await expect(
      subscriptionManager.connect(signers.bob)
        .resetTopicAccess(topicId, signers.bob.address)
    ).to.be.revertedWithCustomError(subscriptionManager, "NotChannelOwner");
  });

  it("Should reject invalid topic ID", async function () {
    await expect(
      subscriptionManager.connect(signers.bob)
        .accessTopicResult(channelId, 999, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "TopicNotFound");
  });

  it("Should reject invalid channel ID", async function () {
    await expect(
      subscriptionManager.connect(signers.bob)
        .accessTopicResult(999, topicId, tokenId)
    ).to.be.revertedWithCustomError(subscriptionManager, "ChannelNotFound");
  });
});
