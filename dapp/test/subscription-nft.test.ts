import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory, ChannelNFT } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Subscription Features and NFT Integration", function () {
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
    const tiers = [
      { tier: DurationTier.OneDay, price: ethers.parseEther("0.01"), subscribers: 0 },
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 },
      { tier: DurationTier.Year, price: ethers.parseEther("1.0"), subscribers: 0 }
    ];
    await subscriptionManager.connect(signers.alice).createChannel("Test Channel", tiers);
    channelId = 1;
  });

  it("should successfully subscribe to channel", async function () {
    const tier = DurationTier.Month;
    const price = ethers.parseEther("0.1");
    
    const tx = await subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
      value: price
    });
    
    // Verify event
    await expect(tx).to.emit(subscriptionManager, "Subscribed");
    
    // Verify NFT is minted
    const nftContractAddress = await subscriptionManager.getChannelNFTContract(channelId);
    const nftContract = await ethers.getContractAt("ChannelNFT", nftContractAddress) as ChannelNFT;
    
    const balance = await nftContract.balanceOf(signers.bob.address);
    expect(balance).to.equal(1);
    
    // Verify subscription information
    const subscription = await subscriptionManager.getSubscription(channelId, 1);
    expect(subscription.channelId).to.equal(channelId);
    expect(subscription.subscriber).to.equal(signers.bob.address);
    expect(subscription.tier).to.equal(tier);
    
    // Verify subscription validity
    const isValid = await subscriptionManager.isSubscriptionValid(channelId, 1);
    expect(isValid).to.be.true;
  });

  it("should reject incorrect payment amount", async function () {
    const tier = DurationTier.Month;
    const correctPrice = ethers.parseEther("0.1");
    const wrongPrice = ethers.parseEther("0.05");
    
    await expect(
      subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
        value: wrongPrice
      })
    ).to.be.revertedWithCustomError(subscriptionManager, "IncorrectPayment");
  });

  it("should reject non-existent subscription tier", async function () {
    // DurationTier.Quarter is not in the channel's tier list
    const tier = DurationTier.Quarter;
    const price = ethers.parseEther("0.25");
    
    await expect(
      subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
        value: price
      })
    ).to.be.revertedWithCustomError(subscriptionManager, "TierNotFound");
  });

  it("should correctly transfer payment to channel owner", async function () {
    const tier = DurationTier.Month;
    const price = ethers.parseEther("0.1");
    
    const initialBalance = await ethers.provider.getBalance(signers.alice.address);
    
    await subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
      value: price
    });
    
    const finalBalance = await ethers.provider.getBalance(signers.alice.address);
    expect(finalBalance - initialBalance).to.equal(price);
  });

  it("should update subscriber count", async function () {
    const tier = DurationTier.Month;
    const price = ethers.parseEther("0.1");
    
    // First subscription
    await subscriptionManager.connect(signers.bob).subscribe(channelId, tier, {
      value: price
    });
    
    // Second subscription
    await subscriptionManager.connect(signers.charlie).subscribe(channelId, tier, {
      value: price
    });
    
    // Verify subscriber count
    const channel = await subscriptionManager.getChannel(channelId);
    expect(channel.tiers[1].subscribers).to.equal(2); // Month is index 1
  });

  it("should support different users subscribing to different tiers", async function () {
    // Bob subscribes for 1 day
    await subscriptionManager.connect(signers.bob).subscribe(channelId, DurationTier.OneDay, {
      value: ethers.parseEther("0.01")
    });
    
    // Charlie subscribes for 1 year
    await subscriptionManager.connect(signers.charlie).subscribe(channelId, DurationTier.Year, {
      value: ethers.parseEther("1.0")
    });
    
    // Verify subscription information
    const bobSubscription = await subscriptionManager.getSubscription(channelId, 1);
    const charlieSubscription = await subscriptionManager.getSubscription(channelId, 2);
    
    expect(bobSubscription.tier).to.equal(DurationTier.OneDay);
    expect(charlieSubscription.tier).to.equal(DurationTier.Year);
    
    // Verify different expiration times
    expect(charlieSubscription.expiresAt > bobSubscription.expiresAt).to.be.true;
  });

  it("should reject subscription to invalid channel", async function () {
    await expect(
      subscriptionManager.connect(signers.bob).subscribe(999, DurationTier.Month, {
        value: ethers.parseEther("0.1")
      })
    ).to.be.revertedWithCustomError(subscriptionManager, "ChannelNotFound");
  });

  it("should correctly calculate subscription expiration time", async function () {
    const beforeTime = Math.floor(Date.now() / 1000);
    
    await subscriptionManager.connect(signers.bob).subscribe(channelId, DurationTier.Month, {
      value: ethers.parseEther("0.1")
    });
    
    const afterTime = Math.floor(Date.now() / 1000);
    
    const subscription = await subscriptionManager.getSubscription(channelId, 1);
    const expectedMinExpireTime = beforeTime + 30 * 24 * 3600; // 30 days
    const expectedMaxExpireTime = afterTime + 30 * 24 * 3600 + 300; // Allow 5 minutes error
    
    expect(Number(subscription.expiresAt)).to.be.greaterThanOrEqual(expectedMinExpireTime);
    expect(Number(subscription.expiresAt)).to.be.lessThanOrEqual(expectedMaxExpireTime);
  });
});
