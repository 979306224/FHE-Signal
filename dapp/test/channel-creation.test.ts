import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Channel Creation Features", function () {
  let signers: Signers;
  let subscriptionManager: FHESubscriptionManager;
  let subscriptionManagerAddress: string;
  let nftFactory: NFTFactory;
  let nftFactoryAddress: string;

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
  });

  it("Should successfully create channel", async function () {
    const tiers = [
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 },
      { tier: DurationTier.Year, price: ethers.parseEther("1.0"), subscribers: 0 }
    ];
    
    const tx = await subscriptionManager.connect(signers.alice).createChannel("Alice's Channel", tiers);
    const receipt = await tx.wait();
    
    // Verify event
    await expect(tx)
      .to.emit(subscriptionManager, "ChannelCreated")
      .withArgs(1, signers.alice.address, "Alice's Channel");
    
    // Verify channel data
    const channel = await subscriptionManager.getChannel(1);
    expect(channel.channelId).to.equal(1);
    expect(channel.info).to.equal("Alice's Channel");
    expect(channel.owner).to.equal(signers.alice.address);
    expect(channel.tiers.length).to.equal(2);
    expect(channel.tiers[0].tier).to.equal(DurationTier.Month);
    expect(channel.tiers[0].price).to.equal(ethers.parseEther("0.1"));
    expect(channel.tiers[1].tier).to.equal(DurationTier.Year);
    expect(channel.tiers[1].price).to.equal(ethers.parseEther("1.0"));
  });

  it("Should create NFT contract for channel", async function () {
    const tiers = [
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }
    ];
    
    await subscriptionManager.connect(signers.alice).createChannel("Alice's Channel", tiers);
    
    const channel = await subscriptionManager.getChannel(1);
    expect(channel.nftContract).to.not.equal(ethers.ZeroAddress);
    
    // Verify NFT contract address
    const nftContractAddress = await subscriptionManager.getChannelNFTContract(1);
    expect(nftContractAddress).to.equal(channel.nftContract);
    
    // Verify record in NFT factory
    const factoryNFTAddress = await nftFactory.getChannelNFT(1);
    expect(factoryNFTAddress).to.equal(channel.nftContract);
  });

  it("Should support multiple users creating different channels", async function () {
    const tiers1 = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    const tiers2 = [{ tier: DurationTier.Year, price: ethers.parseEther("1.0"), subscribers: 0 }];
    
    // Alice creates channel 1
    await subscriptionManager.connect(signers.alice).createChannel("Alice's Channel", tiers1);
    
    // Bob creates channel 2
    await subscriptionManager.connect(signers.bob).createChannel("Bob's Channel", tiers2);
    
    const channel1 = await subscriptionManager.getChannel(1);
    const channel2 = await subscriptionManager.getChannel(2);
    
    expect(channel1.owner).to.equal(signers.alice.address);
    expect(channel2.owner).to.equal(signers.bob.address);
    expect(channel1.info).to.equal("Alice's Channel");
    expect(channel2.info).to.equal("Bob's Channel");
  });

  it("Should support complex price tier configuration", async function () {
    const tiers = [
      { tier: DurationTier.OneDay, price: ethers.parseEther("0.01"), subscribers: 0 },
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 },
      { tier: DurationTier.Quarter, price: ethers.parseEther("0.25"), subscribers: 0 },
      { tier: DurationTier.HalfYear, price: ethers.parseEther("0.4"), subscribers: 0 },
      { tier: DurationTier.Year, price: ethers.parseEther("0.7"), subscribers: 0 }
    ];
    
    await subscriptionManager.connect(signers.alice).createChannel("Complete Price Channel", tiers);
    
    const channel = await subscriptionManager.getChannel(1);
    expect(channel.tiers.length).to.equal(5);
    
    // Verify price for each tier
    for (let i = 0; i < tiers.length; i++) {
      expect(channel.tiers[i].tier).to.equal(tiers[i].tier);
      expect(channel.tiers[i].price).to.equal(tiers[i].price);
      expect(channel.tiers[i].subscribers).to.equal(0);
    }
  });


});
