import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Allowlist管理功能", function () {
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

  it("应该成功批量添加用户到allowlist", async function () {
    const users = [signers.bob.address, signers.charlie.address, signers.david.address];
    const weights = [100, 200, 150];
    
    const tx = await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
    
    // 验证事件
    await expect(tx)
      .to.emit(subscriptionManager, "AllowlistUpdated")
      .withArgs(channelId, signers.bob.address, true);
    
    // 验证allowlist条目
    const allowlist = await subscriptionManager.getAllowlist(channelId);
    expect(allowlist.length).to.equal(3);
    
    // 验证用户权重
    for (let i = 0; i < users.length; i++) {
      expect(allowlist[i].user).to.equal(users[i]);
      expect(allowlist[i].weight).to.equal(weights[i]);
      expect(allowlist[i].exists).to.be.true;
      
      // 验证单独查询
      const isInList = await subscriptionManager.isInAllowlist(channelId, users[i]);
      expect(isInList).to.be.true;
    }
  });

  it("只有频道所有者能管理allowlist", async function () {
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

  it("应该验证数组长度一致性", async function () {
    const users = [signers.bob.address, signers.charlie.address];
    const weights = [100]; // 数组长度不匹配
    
    await expect(
      subscriptionManager.connect(signers.alice)
        .batchAddToAllowlist(channelId, users, weights)
    ).to.be.revertedWithCustomError(subscriptionManager, "ArrayLengthMismatch");
  });

  it("应该拒绝空数组", async function () {
    await expect(
      subscriptionManager.connect(signers.alice)
        .batchAddToAllowlist(channelId, [], [])
    ).to.be.revertedWithCustomError(subscriptionManager, "EmptyArray");
    
    await expect(
      subscriptionManager.connect(signers.alice)
        .batchRemoveFromAllowlist(channelId, [])
    ).to.be.revertedWithCustomError(subscriptionManager, "EmptyArray");
  });

  it("应该拒绝过大的数组", async function () {
    // 创建超过100个用户的数组
    const users = Array(101).fill(signers.bob.address);
    const weights = Array(101).fill(100);
    
    await expect(
      subscriptionManager.connect(signers.alice)
        .batchAddToAllowlist(channelId, users, weights)
    ).to.be.revertedWithCustomError(subscriptionManager, "ArrayTooLarge");
  });

  it("应该成功批量移除allowlist用户", async function () {
    // 先添加用户
    const users = [signers.bob.address, signers.charlie.address, signers.david.address];
    const weights = [100, 200, 150];
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
    
    // 移除部分用户
    const usersToRemove = [signers.bob.address, signers.david.address];
    const tx = await subscriptionManager.connect(signers.alice)
      .batchRemoveFromAllowlist(channelId, usersToRemove);
    
    // 验证事件
    await expect(tx)
      .to.emit(subscriptionManager, "AllowlistUpdated")
      .withArgs(channelId, signers.bob.address, false);
    
    // 验证剩余用户
    const allowlist = await subscriptionManager.getAllowlist(channelId);
    expect(allowlist.length).to.equal(1);
    expect(allowlist[0].user).to.equal(signers.charlie.address);
    
    // 验证被移除的用户不在列表中
    expect(await subscriptionManager.isInAllowlist(channelId, signers.bob.address)).to.be.false;
    expect(await subscriptionManager.isInAllowlist(channelId, signers.david.address)).to.be.false;
    expect(await subscriptionManager.isInAllowlist(channelId, signers.charlie.address)).to.be.true;
  });

  it("应该正确处理重复添加用户", async function () {
    // 第一次添加
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, [signers.bob.address], [100]);
    
    // 第二次添加同一用户（权重不同）
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, [signers.bob.address], [200]);
    
    // 应该只有一个条目，权重更新为200
    const allowlist = await subscriptionManager.getAllowlist(channelId);
    expect(allowlist.length).to.equal(1);
    expect(allowlist[0].weight).to.equal(200);
  });

  it("应该支持分页查询allowlist", async function () {
    // 添加5个用户
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
    
    // 分页查询：offset=1, limit=2
    const [paginatedList, total] = await subscriptionManager
      .getAllowlistPaginated(channelId, 1, 2);
    
    expect(total).to.equal(5);
    expect(paginatedList.length).to.equal(2);
    
    // 查询全部
    const [allList] = await subscriptionManager
      .getAllowlistPaginated(channelId, 0, 10);
    expect(allList.length).to.equal(5);
    
    // 超出范围查询
    const [emptyList] = await subscriptionManager
      .getAllowlistPaginated(channelId, 10, 5);
    expect(emptyList.length).to.equal(0);
  });

  it("应该正确返回allowlist数量", async function () {
    expect(await subscriptionManager.getAllowlistCount(channelId)).to.equal(0);
    
    // 添加用户
    const users = [signers.bob.address, signers.charlie.address];
    const weights = [100, 200];
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
    
    expect(await subscriptionManager.getAllowlistCount(channelId)).to.equal(2);
    
    // 移除一个用户
    await subscriptionManager.connect(signers.alice)
      .batchRemoveFromAllowlist(channelId, [signers.bob.address]);
    
    expect(await subscriptionManager.getAllowlistCount(channelId)).to.equal(1);
  });
});
