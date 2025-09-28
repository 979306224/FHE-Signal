import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Contract Deployment and Initialization", function () {
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

  it("should correctly deploy contracts", async function () {
    expect(subscriptionManagerAddress).to.be.a('string');
    expect(nftFactoryAddress).to.be.a('string');
  });

  it("should correctly set NFT factory address", async function () {
    const factoryAddress = await subscriptionManager.NFT_FACTORY();
    expect(factoryAddress).to.equal(nftFactoryAddress);
  });

  it("should correctly set contract owner", async function () {
    const owner = await subscriptionManager.owner();
    expect(owner).to.equal(signers.deployer.address);
  });

  it("should correctly initialize counters", async function () {
    // Test if counter starts from 0 by creating a channel
    const tiers = [
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }
    ];
    const channelTx = await subscriptionManager.connect(signers.alice).createChannel("Test Channel", tiers);
    const receipt = await channelTx.wait();
    
    const event = receipt?.logs.find(log => 
      log.topics[0] === ethers.id("ChannelCreated(uint256,address,string)")
    );
    
    expect(event).to.not.be.undefined;
    // Parse event to get channelId
    const channelId = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], event!.topics[1])[0];
    expect(channelId).to.equal(1); // First channel ID should be 1
  });
});
