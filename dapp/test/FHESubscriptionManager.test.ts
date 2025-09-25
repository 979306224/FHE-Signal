import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  FHESubscriptionManager,
  FHESubscriptionManager__factory,
  MockERC20,
  MockERC20__factory,
} from "../types";

const ONE_DAY_TIER = 0;
const ONE_DAY_PRICE = ethers.parseEther("10");
const TEST_METADATA_URI = "ipfs://signal-feed-1";

async function deploySubscriptionManager(
  deployer: HardhatEthersSigner,
): Promise<FHESubscriptionManager> {
  const factory = new FHESubscriptionManager__factory(deployer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return contract;
}

async function deployPaymentToken(
  deployer: HardhatEthersSigner,
  initialHolder: HardhatEthersSigner,
): Promise<MockERC20> {
  const factory = new MockERC20__factory(deployer);
  const token = await factory.deploy(
    "Mock Dollar",
    "MDL",
    await initialHolder.getAddress(),
    ethers.parseEther("1000"),
  );
  await token.waitForDeployment();
  return token;
}

describe("FHESubscriptionManager", function () {
  let publisher: HardhatEthersSigner;
  let subscriber: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;
  let subscriptionManager: FHESubscriptionManager;
  let paymentToken: MockERC20;
  let contractAddress: string;
  let tokenAddress: string;
  let feedId: bigint;

  before(async function () {
    [publisher, subscriber, outsider] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    subscriptionManager = await deploySubscriptionManager(publisher);
    contractAddress = await subscriptionManager.getAddress();

    paymentToken = await deployPaymentToken(publisher, subscriber);
    tokenAddress = await paymentToken.getAddress();

    console.log("subscription manager deployed", contractAddress);

    feedId = await subscriptionManager
      .connect(publisher)
      .registerFeed.staticCall(TEST_METADATA_URI);

    await subscriptionManager
      .connect(publisher)
      .registerFeed(TEST_METADATA_URI);

    await subscriptionManager
      .connect(publisher)
      .setPricing(feedId, tokenAddress, [
        {
          tier: ONE_DAY_TIER,
          price: ONE_DAY_PRICE,
        },
      ]);
  });


});









