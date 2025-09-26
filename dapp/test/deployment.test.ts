import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - 合约部署和初始化", function () {
  let signers: Signers;
  let subscriptionManager: FHESubscriptionManager;
  let subscriptionManagerAddress: string;
  let nftFactory: NFTFactory;
  let nftFactoryAddress: string;

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
  });

  it("应该正确部署合约", async function () {
    expect(subscriptionManagerAddress).to.be.a('string');
    expect(nftFactoryAddress).to.be.a('string');
  });

  it("应该正确设置NFT工厂地址", async function () {
    const factoryAddress = await subscriptionManager.NFT_FACTORY();
    expect(factoryAddress).to.equal(nftFactoryAddress);
  });

  it("应该正确设置合约所有者", async function () {
    const owner = await subscriptionManager.owner();
    expect(owner).to.equal(signers.deployer.address);
  });

  it("应该正确初始化计数器", async function () {
    // 通过创建一个频道来测试计数器是否从0开始
    const tiers = [
      { tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }
    ];
    const channelTx = await subscriptionManager.connect(signers.alice).createChannel("测试频道", tiers);
    const receipt = await channelTx.wait();
    
    const event = receipt?.logs.find(log => 
      log.topics[0] === ethers.id("ChannelCreated(uint256,address,string)")
    );
    
    expect(event).to.not.be.undefined;
    // 解析事件获取channelId
    const channelId = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], event!.topics[1])[0];
    expect(channelId).to.equal(1); // 第一个频道ID应该是1
  });
});
