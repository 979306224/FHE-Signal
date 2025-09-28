import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Signal Submission and FHE Encryption Features", function () {
  let signers: Signers;
  let subscriptionManager: FHESubscriptionManager;
  let subscriptionManagerAddress: string;
  let nftFactory: NFTFactory;
  let nftFactoryAddress: string;
  let channelId: number;
  let topicId: number;

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

    // Create test channel and topic
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    await subscriptionManager.connect(signers.alice).createChannel("Test Channel", tiers);
    channelId = 1;
    
    const endDate = Math.floor(Date.now() / 1000) + 86400; // Expires in 1 day
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTestIPFSHash", endDate, 10, 90, 50
    );
    topicId = 1;
    
    // Add users to allowlist
    const users = [signers.bob.address, signers.charlie.address];
    const weights = [100, 200];
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
  });

  it("should successfully submit Signal", async function () {
    // Create encrypted input
    const signalValue = 75;
    const encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.bob.address)
      .add8(signalValue)
      .encrypt();
    
    const tx = await subscriptionManager.connect(signers.bob).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // Verify event
    await expect(tx)
      .to.emit(subscriptionManager, "SignalSubmitted")
      .withArgs(topicId, 1, signers.bob.address);
    
    await expect(tx)
      .to.emit(subscriptionManager, "AverageUpdated")
      .withArgs(topicId, 1);
    
    // Verify signal data
    const signal = await subscriptionManager.getSignal(1);
    expect(signal.signalId).to.equal(1);
    expect(signal.channelId).to.equal(channelId);
    expect(signal.topicId).to.equal(topicId);
    expect(signal.submitter).to.equal(signers.bob.address);
    
    // Verify submission status
    expect(await subscriptionManager.hasSubmitted(topicId, signers.bob.address)).to.be.true;
    expect(await subscriptionManager.hasSubmitted(topicId, signers.charlie.address)).to.be.false;
    
    // Verify topic update
    const topic = await subscriptionManager.getTopic(topicId);
    expect(topic.submissionCount).to.equal(1);
    expect(topic.totalWeight).to.equal(100); // Bob's weight
  });

  it("should reject submission from non-allowlist users", async function () {
    const signalValue = 75;
    const encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.david.address)
      .add8(signalValue)
      .encrypt();
    
    await expect(
      subscriptionManager.connect(signers.david).submitSignal(
        topicId,
        encryptedInput.handles[0],
        encryptedInput.inputProof
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "NotInAllowlist");
  });

  it("should reject duplicate submissions", async function () {
    // First submission
    const signalValue = 75;
    let encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.bob.address)
      .add8(signalValue)
      .encrypt();
    
    await subscriptionManager.connect(signers.bob).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // Second submission should fail
    encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.bob.address)
      .add8(80)
      .encrypt();
    
    await expect(
      subscriptionManager.connect(signers.bob).submitSignal(
        topicId,
        encryptedInput.handles[0],
        encryptedInput.inputProof
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "AlreadySubmitted");
  });

  it("should reject submissions to expired topic", async function () {
    // First test that we cannot create expired topic
    const pastDate = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago (expired)
    await expect(
      subscriptionManager.connect(signers.alice).createTopic(
        channelId, "QmExpiredTopic", pastDate, 10, 90, 50
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "InvalidEndDate");
    
    // Get current block time and create a topic that will expire soon (expires in 60 seconds)
    const currentBlock = await ethers.provider.getBlock('latest');
    const currentBlockTime = currentBlock!.timestamp;
    const shortDate = currentBlockTime + 60; // Expires in 60 seconds
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmExpiredTopic", shortDate, 10, 90, 50
    );
    const expiredTopicId = 2;
    
    // Fast forward blockchain time to make topic expire
    await ethers.provider.send("evm_increaseTime", [65]); // Fast forward 65 seconds
    await ethers.provider.send("evm_mine", []); // Mine a new block
    
    const signalValue = 75;
    const encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.bob.address)
      .add8(signalValue)
      .encrypt();
    
    await expect(
      subscriptionManager.connect(signers.bob).submitSignal(
        expiredTopicId,
        encryptedInput.handles[0],
        encryptedInput.inputProof
      )
    ).to.be.revertedWithCustomError(subscriptionManager, "TopicExpired");
  });

  it("should correctly handle out-of-range values", async function () {
    // Submit signal smaller than minimum value (should be set to default value 50)
    const tooSmallValue = 5; // Less than minValue(10)
    let encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.bob.address)
      .add8(tooSmallValue)
      .encrypt();
    
    await subscriptionManager.connect(signers.bob).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // Submit signal larger than maximum value (should be set to default value 50)
    const tooLargeValue = 95; // Greater than maxValue(90)
    encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.charlie.address)
      .add8(tooLargeValue)
      .encrypt();
    
    await subscriptionManager.connect(signers.charlie).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // Verify both signals are recorded
    const topic = await subscriptionManager.getTopic(topicId);
    expect(topic.submissionCount).to.equal(2);
    expect(topic.totalWeight).to.equal(300); // 100 + 200
  });

  it("should correctly calculate weighted average", async function () {
    // Bob submits value 75, weight 100
    let encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.bob.address)
      .add8(75)
      .encrypt();
    
    await subscriptionManager.connect(signers.bob).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // Charlie submits value 25, weight 200
    encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.charlie.address)
      .add8(25)
      .encrypt();
    
    await subscriptionManager.connect(signers.charlie).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // Verify weighted average: (75*100 + 25*200) / (100+200) = (7500 + 5000) / 300 = 41.67 ≈ 41
    const topic = await subscriptionManager.getTopic(topicId);
    expect(topic.submissionCount).to.equal(2);
    expect(topic.totalWeight).to.equal(300);
  });

  it("should correctly index signals to topic", async function () {
    // Submit multiple signals
    const values = [75, 25];
    const users = [signers.bob, signers.charlie];
    
    for (let i = 0; i < values.length; i++) {
      const encryptedInput = await fhevm
        .createEncryptedInput(subscriptionManagerAddress, users[i].address)
        .add8(values[i])
        .encrypt();
      
      await subscriptionManager.connect(users[i]).submitSignal(
        topicId,
        encryptedInput.handles[0],
        encryptedInput.inputProof
      );
    }
    
    // Verify signal count under topic
    const signalCount = await subscriptionManager.getTopicSignalCount(topicId);
    expect(signalCount).to.equal(2);
    
    // Verify getting all signals
    const signals = await subscriptionManager.getTopicSignals(topicId);
    expect(signals.length).to.equal(2);
    expect(signals[0].submitter).to.equal(signers.bob.address);
    expect(signals[1].submitter).to.equal(signers.charlie.address);
  });
});
