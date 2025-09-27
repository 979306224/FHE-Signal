/**
 * 合约服务使用示例
 * 
 * 本文件展示了如何使用 ContractService 与智能合约进行交互
 */

import ContractService from '../services/contractService';
import { DurationTier, type TierPrice, type BatchAllowlistParams } from '../types/contracts';

// ============ 读取操作示例 ============

/**
 * 示例1: 获取频道信息
 */
export async function exampleGetChannel() {
  try {
    const channelId = BigInt(1);
    const channel = await ContractService.getChannel(channelId);
    
    console.log('频道信息:', {
      id: channel.channelId.toString(),
      info: channel.info,
      owner: channel.owner,
      createdAt: ContractService.formatTimestamp(channel.createdAt),
      topicCount: channel.topicIds.length,
      tiers: channel.tiers.map(tier => ({
        tier: ContractService.getDurationTierName(tier.tier),
        price: ContractService.weiToEther(tier.price) + ' ETH',
        subscribers: tier.subscribers.toString()
      }))
    });
    
    return channel;
  } catch (error) {
    console.error('获取频道信息失败:', error);
    throw error;
  }
}

/**
 * 示例2: 获取Topic信息
 */
export async function exampleGetTopic() {
  try {
    const topicId = BigInt(1);
    const topic = await ContractService.getTopic(topicId);
    
    console.log('Topic信息:', {
      id: topic.topicId.toString(),
      channelId: topic.channelId.toString(),
      ipfs: topic.ipfs,
      creator: topic.creator,
      endDate: ContractService.formatTimestamp(topic.endDate),
      valueRange: `${topic.minValue}-${topic.maxValue} (默认: ${topic.defaultValue})`,
      submissions: topic.submissionCount.toString(),
      totalWeight: topic.totalWeight.toString()
    });
    
    return topic;
  } catch (error) {
    console.error('获取Topic信息失败:', error);
    throw error;
  }
}

/**
 * 示例3: 检查用户状态
 */
export async function exampleCheckUserStatus(userAddress: string) {
  try {
    const channelId = BigInt(1);
    const topicId = BigInt(1);
    
    // 检查是否在allowlist中
    const isInAllowlist = await ContractService.isInAllowlist(channelId, userAddress);
    
    // 检查是否已提交signal
    const hasSubmitted = await ContractService.hasSubmitted(topicId, userAddress);
    
    console.log('用户状态:', {
      address: userAddress,
      isInAllowlist,
      hasSubmitted
    });
    
    return { isInAllowlist, hasSubmitted };
  } catch (error) {
    console.error('检查用户状态失败:', error);
    throw error;
  }
}

/**
 * 示例4: 分页获取allowlist
 */
export async function exampleGetAllowlistPaginated() {
  try {
    const channelId = BigInt(1);
    const offset = 0;
    const limit = 10;
    
    const result = await ContractService.getAllowlistPaginated(channelId, offset, limit);
    
    console.log('分页Allowlist:', {
      total: result.total.toString(),
      currentPage: Math.floor(offset / limit) + 1,
      items: result.items.map(entry => ({
        user: entry.user,
        weight: entry.weight.toString(),
        exists: entry.exists
      }))
    });
    
    return result;
  } catch (error) {
    console.error('获取分页Allowlist失败:', error);
    throw error;
  }
}

// ============ 写入操作示例 ============

/**
 * 示例5: 创建频道
 */
export async function exampleCreateChannel() {
  try {
    // 定义价格梯度
    const tiers: TierPrice[] = [
      {
        tier: DurationTier.OneDay,
        price: ContractService.etherToWei('0.01'), // 0.01 ETH for 1 day
        subscribers: BigInt(0)
      },
      {
        tier: DurationTier.Month,
        price: ContractService.etherToWei('0.1'), // 0.1 ETH for 1 month
        subscribers: BigInt(0)
      },
      {
        tier: DurationTier.Year,
        price: ContractService.etherToWei('1'), // 1 ETH for 1 year
        subscribers: BigInt(0)
      }
    ];
    
    const result = await ContractService.createChannel(
      'AI 预测市场频道', // 频道信息
      tiers
    );
    
    if (result.success) {
      console.log('频道创建成功:', {
        hash: result.hash,
        blockNumber: result.blockNumber?.toString(),
        gasUsed: result.gasUsed?.toString()
      });
    } else {
      console.error('频道创建失败:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('创建频道异常:', error);
    throw error;
  }
}

/**
 * 示例6: 创建Topic
 */
export async function exampleCreateTopic() {
  try {
    const channelId = BigInt(1);
    const ipfs = 'QmYourIPFSHash'; // IPFS哈希
    const endDate = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60); // 7天后过期
    const minValue = 0;
    const maxValue = 100;
    const defaultValue = 50;
    
    const result = await ContractService.createTopic(
      channelId,
      ipfs,
      endDate,
      minValue,
      maxValue,
      defaultValue
    );
    
    if (result.success) {
      console.log('Topic创建成功:', {
        hash: result.hash,
        blockNumber: result.blockNumber?.toString()
      });
    } else {
      console.error('Topic创建失败:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('创建Topic异常:', error);
    throw error;
  }
}

/**
 * 示例7: 批量添加用户到allowlist
 */
export async function exampleBatchAddToAllowlist() {
  try {
    const params: BatchAllowlistParams = {
      channelId: BigInt(1),
      users: [
        '0x1234567890123456789012345678901234567890',
        '0x0987654321098765432109876543210987654321'
      ],
      weights: [BigInt(100), BigInt(200)] // 权重
    };
    
    const result = await ContractService.batchAddToAllowlist(params);
    
    if (result.success) {
      console.log('批量添加到Allowlist成功:', {
        hash: result.hash,
        usersAdded: params.users.length
      });
    } else {
      console.error('批量添加失败:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('批量添加异常:', error);
    throw error;
  }
}

/**
 * 示例8: 订阅频道
 */
export async function exampleSubscribeChannel() {
  try {
    const channelId = BigInt(1);
    const tier = DurationTier.Month;
    const paymentAmount = '0.1'; // 0.1 ETH
    
    const result = await ContractService.subscribe(channelId, tier, paymentAmount);
    
    if (result.success) {
      console.log('订阅成功:', {
        hash: result.hash,
        tier: ContractService.getDurationTierName(tier),
        amount: paymentAmount + ' ETH'
      });
    } else {
      console.error('订阅失败:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('订阅异常:', error);
    throw error;
  }
}

/**
 * 示例9: 提交Signal（需要FHE加密）
 */
export async function exampleSubmitSignal() {
  try {
    const topicId = BigInt(1);
    // 注意：这里需要使用FHE库进行加密，以下是示例格式
    const encryptedValue = '0x...'; // FHE加密后的值
    const proof = '0x...'; // FHE证明
    
    const result = await ContractService.submitSignal(topicId, encryptedValue, proof);
    
    if (result.success) {
      console.log('Signal提交成功:', {
        hash: result.hash,
        topicId: topicId.toString()
      });
    } else {
      console.error('Signal提交失败:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('提交Signal异常:', error);
    throw error;
  }
}

/**
 * 示例10: 访问Topic结果
 */
export async function exampleAccessTopicResult() {
  try {
    const channelId = BigInt(1);
    const topicId = BigInt(1);
    const tokenId = BigInt(1); // 用户的订阅NFT ID
    
    const result = await ContractService.accessTopicResult(channelId, topicId, tokenId);
    
    if (result.success) {
      console.log('访问Topic结果成功:', {
        hash: result.hash,
        topicId: topicId.toString(),
        tokenId: tokenId.toString()
      });
    } else {
      console.error('访问Topic结果失败:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('访问Topic结果异常:', error);
    throw error;
  }
}

// ============ 综合使用示例 ============

/**
 * 示例11: 完整的用户订阅流程
 */
export async function exampleCompleteSubscriptionFlow(userAddress: string) {
  try {
    console.log('开始完整订阅流程...');
    
    // 1. 获取频道信息
    const channelId = BigInt(1);
    const channel = await ContractService.getChannel(channelId);
    console.log('频道信息:', channel.info);
    
    // 2. 检查用户是否在allowlist中
    const isInAllowlist = await ContractService.isInAllowlist(channelId, userAddress);
    if (!isInAllowlist) {
      console.log('用户不在allowlist中，无法订阅');
      return;
    }
    
    // 3. 选择订阅等级并订阅
    const tier = DurationTier.Month;
    const tierInfo = channel.tiers.find(t => t.tier === tier);
    if (!tierInfo) {
      console.log('未找到对应的订阅等级');
      return;
    }
    
    const paymentAmount = ContractService.weiToEther(tierInfo.price);
    const subscribeResult = await ContractService.subscribe(channelId, tier, paymentAmount);
    
    if (!subscribeResult.success) {
      console.error('订阅失败:', subscribeResult.error);
      return;
    }
    
    console.log('订阅成功！交易哈希:', subscribeResult.hash);
    
    // 4. 获取频道的topics
    const topics = await ContractService.getChannelTopics(channelId);
    console.log('频道Topics数量:', topics.length);
    
    // 5. 检查订阅状态（这里需要获取NFT ID，实际中从事件或其他方式获取）
    // const tokenId = BigInt(1); // 假设的NFT ID
    // const isValid = await ContractService.isSubscriptionValid(channelId, tokenId);
    // console.log('订阅有效性:', isValid);
    
    console.log('完整订阅流程完成！');
    
  } catch (error) {
    console.error('订阅流程失败:', error);
    throw error;
  }
}

/**
 * 示例12: 管理员管理allowlist流程
 */
export async function exampleManageAllowlist(channelId: bigint) {
  try {
    console.log('开始管理allowlist...');
    
    // 1. 获取当前allowlist
    const currentAllowlist = await ContractService.getAllowlist(channelId);
    console.log('当前allowlist用户数:', currentAllowlist.length);
    
    // 2. 批量添加新用户
    const newUsers = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222'
    ];
    const weights = [BigInt(150), BigInt(120)];
    
    const addResult = await ContractService.batchAddToAllowlist({
      channelId,
      users: newUsers,
      weights
    });
    
    if (addResult.success) {
      console.log('批量添加用户成功');
    }
    
    // 3. 获取更新后的allowlist
    const updatedAllowlist = await ContractService.getAllowlist(channelId);
    console.log('更新后allowlist用户数:', updatedAllowlist.length);
    
    // 4. 如果需要，移除某些用户
    const usersToRemove = ['0x1111111111111111111111111111111111111111'];
    
    const removeResult = await ContractService.batchRemoveFromAllowlist({
      channelId,
      users: usersToRemove
    });
    
    if (removeResult.success) {
      console.log('批量移除用户成功');
    }
    
    console.log('Allowlist管理完成！');
    
  } catch (error) {
    console.error('管理allowlist失败:', error);
    throw error;
  }
}

// ============ 工具函数使用示例 ============

/**
 * 示例13: 使用工具函数
 */
export function exampleUtilityFunctions() {
  console.log('=== 工具函数示例 ===');
  
  // 时间戳格式化
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  console.log('格式化时间:', ContractService.formatTimestamp(timestamp));
  
  // ETH 单位转换
  const weiAmount = BigInt('1000000000000000000'); // 1 ETH in wei
  console.log('Wei转ETH:', ContractService.weiToEther(weiAmount));
  console.log('ETH转Wei:', ContractService.etherToWei('1.5'));
  
  // 地址验证
  const validAddress = '0x1234567890123456789012345678901234567890';
  const invalidAddress = '0x123';
  console.log('地址验证 (有效):', ContractService.isValidAddress(validAddress));
  console.log('地址验证 (无效):', ContractService.isValidAddress(invalidAddress));
  
  // 订阅等级信息
  console.log('订阅等级名称:', ContractService.getDurationTierName(DurationTier.Month));
  console.log('订阅等级秒数:', ContractService.getDurationTierSeconds(DurationTier.Month));
  
  // 合约地址
  console.log('合约地址:', ContractService.getContractAddresses());
}

export default {
  exampleGetChannel,
  exampleGetTopic,
  exampleCheckUserStatus,
  exampleGetAllowlistPaginated,
  exampleCreateChannel,
  exampleCreateTopic,
  exampleBatchAddToAllowlist,
  exampleSubscribeChannel,
  exampleSubmitSignal,
  exampleAccessTopicResult,
  exampleCompleteSubscriptionFlow,
  exampleManageAllowlist,
  exampleUtilityFunctions
};
