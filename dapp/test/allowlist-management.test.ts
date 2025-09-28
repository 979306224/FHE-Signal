import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Allowlist Management Features", function () {
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

  it("Should successfully batch add users to allowlist", async function () {
    const users = [signers.bob.address, signers.charlie.address, signers.david.address];
    const weights = [100, 200, 150];
    
    const tx = await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
    
    // Verify event
    await expect(tx)
      .to.emit(subscriptionManager, "AllowlistUpdated")
      .withArgs(channelId, signers.bob.address, true);
    
    // Verify allowlist entries
    const allowlist = await subscriptionManager.getAllowlist(channelId);
    expect(allowlist.length).to.equal(3);
    
    // Verify user weights
    for (let i = 0; i < users.length; i++) {
      expect(allowlist[i].user).to.equal(users[i]);
      expect(allowlist[i].weight).to.equal(weights[i]);
      expect(allowlist[i].exists).to.be.true;
      
      // Verify individual query
      const isInList = await subscriptionManager.isInAllowlist(channelId, users[i]);
      expect(isInList).to.be.true;
    }
  });

  it("Only channel owner can manage allowlist", async function () {
    const users = [signers.bob.address];
    const weights = [100];
    
    await expect(
      subscriptionManager.connect(signers.bob)
        .batchAddToAllowlist(channelId, users, weights)
    ).to.be.revertedWithCustomError(subscriptionManager, "NotChannelOwner");
    
    await expect(
      subscriptionManager.connect(signers.bob)
        .batchRemoveFromAllowlist(channelId, users)
    ).to.be.revertedWithCustomError(subscriptionManager, "NotChannelOwner");
  });

  it("Should validate array length consistency", async function () {
    const users = [signers.bob.address, signers.charlie.address];
    const weights = [100]; // Array length mismatch
    
    await expect(
      subscriptionManager.connect(signers.alice)
        .batchAddToAllowlist(channelId, users, weights)
    ).to.be.revertedWithCustomError(subscriptionManager, "ArrayLengthMismatch");
  });

  it("Should reject empty arrays", async function () {
    await expect(
      subscriptionManager.connect(signers.alice)
        .batchAddToAllowlist(channelId, [], [])
    ).to.be.revertedWithCustomError(subscriptionManager, "EmptyArray");
    
    await expect(
      subscriptionManager.connect(signers.alice)
        .batchRemoveFromAllowlist(channelId, [])
    ).to.be.revertedWithCustomError(subscriptionManager, "EmptyArray");
  });

  it("Should reject oversized arrays", async function () {
    // Create array with more than 100 users
    const users = Array(101).fill(signers.bob.address);
    const weights = Array(101).fill(100);
    
    await expect(
      subscriptionManager.connect(signers.alice)
        .batchAddToAllowlist(channelId, users, weights)
    ).to.be.revertedWithCustomError(subscriptionManager, "ArrayTooLarge");
  });

  it("Should successfully batch remove allowlist users", async function () {
    // Add users first
    const users = [signers.bob.address, signers.charlie.address, signers.david.address];
    const weights = [100, 200, 150];
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
    
    // Remove some users
    const usersToRemove = [signers.bob.address, signers.david.address];
    const tx = await subscriptionManager.connect(signers.alice)
      .batchRemoveFromAllowlist(channelId, usersToRemove);
    
    // Verify event
    await expect(tx)
      .to.emit(subscriptionManager, "AllowlistUpdated")
      .withArgs(channelId, signers.bob.address, false);
    
    // Verify remaining users
    const allowlist = await subscriptionManager.getAllowlist(channelId);
    expect(allowlist.length).to.equal(1);
    expect(allowlist[0].user).to.equal(signers.charlie.address);
    
    // Verify removed users are not in list
    expect(await subscriptionManager.isInAllowlist(channelId, signers.bob.address)).to.be.false;
    expect(await subscriptionManager.isInAllowlist(channelId, signers.david.address)).to.be.false;
    expect(await subscriptionManager.isInAllowlist(channelId, signers.charlie.address)).to.be.true;
  });

  it("Should correctly handle duplicate user additions", async function () {
    // First addition
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, [signers.bob.address], [100]);
    
    // Second addition of same user (different weight)
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, [signers.bob.address], [200]);
    
    // Should only have one entry with weight updated to 200
    const allowlist = await subscriptionManager.getAllowlist(channelId);
    expect(allowlist.length).to.equal(1);
    expect(allowlist[0].weight).to.equal(200);
  });

  it("Should support paginated allowlist queries", async function () {
    // Add 5 users
    const users = [
      signers.bob.address, 
      signers.charlie.address, 
      signers.david.address, 
      signers.eve.address,
      signers.deployer.address
    ];
    const weights = [100, 200, 150, 300, 250];
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
    
    // Paginated query: offset=1, limit=2
    const [paginatedList, total] = await subscriptionManager
      .getAllowlistPaginated(channelId, 1, 2);
    
    expect(total).to.equal(5);
    expect(paginatedList.length).to.equal(2);
    
    // Query all
    const [allList] = await subscriptionManager
      .getAllowlistPaginated(channelId, 0, 10);
    expect(allList.length).to.equal(5);
    
    // Out of range query
    const [emptyList] = await subscriptionManager
      .getAllowlistPaginated(channelId, 10, 5);
    expect(emptyList.length).to.equal(0);
  });

  it("Should correctly return allowlist count", async function () {
    expect(await subscriptionManager.getAllowlistCount(channelId)).to.equal(0);
    
    // Add users
    const users = [signers.bob.address, signers.charlie.address];
    const weights = [100, 200];
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
    
    expect(await subscriptionManager.getAllowlistCount(channelId)).to.equal(2);
    
    // Remove one user
    await subscriptionManager.connect(signers.alice)
      .batchRemoveFromAllowlist(channelId, [signers.bob.address]);
    
    expect(await subscriptionManager.getAllowlistCount(channelId)).to.equal(1);
  });
});
