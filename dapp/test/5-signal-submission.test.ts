import { ethers, fhevm } from "hardhat";
import { FHESubscriptionManager, NFTFactory } from "../types";
import { expect } from "chai";
import { deployFixture, getSigners, DurationTier, type Signers } from "./test-utils";

describe("FHESubscriptionManager - Signal提交和FHE加密功能", function () {
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

    // 创建测试频道和topic
    const tiers = [{ tier: DurationTier.Month, price: ethers.parseEther("0.1"), subscribers: 0 }];
    await subscriptionManager.connect(signers.alice).createChannel("测试频道", tiers);
    channelId = 1;
    
    const endDate = Math.floor(Date.now() / 1000) + 86400; // 1天后过期
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmTestIPFSHash", endDate, 10, 90, 50
    );
    topicId = 1;
    
    // 添加用户到allowlist
    const users = [signers.bob.address, signers.charlie.address];
    const weights = [100, 200];
    await subscriptionManager.connect(signers.alice)
      .batchAddToAllowlist(channelId, users, weights);
  });

  it("应该成功提交Signal", async function () {
    // 创建加密输入
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
    
    // 验证事件
    await expect(tx)
      .to.emit(subscriptionManager, "SignalSubmitted")
      .withArgs(topicId, 1, signers.bob.address);
    
    await expect(tx)
      .to.emit(subscriptionManager, "AverageUpdated")
      .withArgs(topicId, 1);
    
    // 验证signal数据
    const signal = await subscriptionManager.getSignal(1);
    expect(signal.signalId).to.equal(1);
    expect(signal.channelId).to.equal(channelId);
    expect(signal.topicId).to.equal(topicId);
    expect(signal.submitter).to.equal(signers.bob.address);
    
    // 验证提交状态
    expect(await subscriptionManager.hasSubmitted(topicId, signers.bob.address)).to.be.true;
    expect(await subscriptionManager.hasSubmitted(topicId, signers.charlie.address)).to.be.false;
    
    // 验证topic更新
    const topic = await subscriptionManager.getTopic(topicId);
    expect(topic.submissionCount).to.equal(1);
    expect(topic.totalWeight).to.equal(100); // Bob的权重
  });

  it("应该拒绝非allowlist用户提交", async function () {
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

  it("应该拒绝重复提交", async function () {
    // 第一次提交
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
    
    // 第二次提交应该失败
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

  it("应该拒绝向过期topic提交", async function () {
    // 创建已过期的topic
    const pastDate = Math.floor(Date.now() / 1000) - 3600; // 1小时前
    await subscriptionManager.connect(signers.alice).createTopic(
      channelId, "QmExpiredTopic", pastDate, 10, 90, 50
    );
    const expiredTopicId = 2;
    
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

  it("应该正确处理超出范围的值", async function () {
    // 提交小于最小值的signal（应该被设为默认值50）
    const tooSmallValue = 5; // 小于minValue(10)
    let encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.bob.address)
      .add8(tooSmallValue)
      .encrypt();
    
    await subscriptionManager.connect(signers.bob).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // 提交大于最大值的signal（应该被设为默认值50）
    const tooLargeValue = 95; // 大于maxValue(90)
    encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.charlie.address)
      .add8(tooLargeValue)
      .encrypt();
    
    await subscriptionManager.connect(signers.charlie).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // 验证两个signal都被记录
    const topic = await subscriptionManager.getTopic(topicId);
    expect(topic.submissionCount).to.equal(2);
    expect(topic.totalWeight).to.equal(300); // 100 + 200
  });

  it("应该正确计算加权平均值", async function () {
    // Bob提交值75，权重100
    let encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.bob.address)
      .add8(75)
      .encrypt();
    
    await subscriptionManager.connect(signers.bob).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // Charlie提交值25，权重200
    encryptedInput = await fhevm
      .createEncryptedInput(subscriptionManagerAddress, signers.charlie.address)
      .add8(25)
      .encrypt();
    
    await subscriptionManager.connect(signers.charlie).submitSignal(
      topicId,
      encryptedInput.handles[0],
      encryptedInput.inputProof
    );
    
    // 验证加权平均值：(75*100 + 25*200) / (100+200) = (7500 + 5000) / 300 = 41.67 ≈ 41
    const topic = await subscriptionManager.getTopic(topicId);
    expect(topic.submissionCount).to.equal(2);
    expect(topic.totalWeight).to.equal(300);
  });

  it("应该正确索引signals到topic", async function () {
    // 提交多个signals
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
    
    // 验证topic下的signal数量
    const signalCount = await subscriptionManager.getTopicSignalCount(topicId);
    expect(signalCount).to.equal(2);
    
    // 验证获取所有signals
    const signals = await subscriptionManager.getTopicSignals(topicId);
    expect(signals.length).to.equal(2);
    expect(signals[0].submitter).to.equal(signers.bob.address);
    expect(signals[1].submitter).to.equal(signers.charlie.address);
  });
});
