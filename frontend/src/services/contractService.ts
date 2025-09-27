import {
  writeContract,
  readContract,
  waitForTransactionReceipt,
  simulateContract
} from '@wagmi/core';
import { parseEther, formatEther, parseAbi, type Address } from 'viem';
import { wagmiConfig } from '../config/wallet';
import type {
  Channel,
  Topic,
  Signal,
  AllowlistEntry,
  TierPrice,
  SubscriptionNFT,
  TransactionResult,
  PaginatedResult,
  BatchAllowlistParams,
  BatchRemoveParams,
  ContractAddresses
} from '../types/contracts';
import { DurationTier } from '../types/contracts';
import { showErrorTransactionToast, showPendingTransactionToast, showSuccessTransactionToast } from '../components/TransactionToast';

// 合约地址配置（从部署文件读取）
const CONTRACT_ADDRESSES: ContractAddresses = {
  FHESubscriptionManager: '0x9052ffC126deF2D5EEaDdFff85Dd9878a825DcfE',
  NFTFactory: '0xcB2EC254d95c337a82B0F10a6512579BB586C828'
};

// 合约ABI - 这里只包含主要方法，实际使用时需要完整的ABI
const FHE_SUBSCRIPTION_MANAGER_ABI = parseAbi([
  // 读取方法
  'function getChannel(uint256 id) view returns ((uint256 channelId, string info, address owner, (uint8 tier, uint256 price, uint256 subscribers)[] tiers, uint256 tierCount, address nftContract, uint256 createdAt, uint256 lastPublishedAt, uint256[] topicIds) channel)',
  'function getChannelMaxId() view returns (uint256)',
  'function getTopic(uint256 topicId) view returns ((uint256 topicId, uint256 channelId, string ipfs, uint256 endDate, address creator, uint256 createdAt, uint8 minValue, uint8 maxValue, uint8 defaultValue, uint256 totalWeight, uint256 submissionCount, uint256[] signalIds) topic)',
  'function getSignal(uint256 signalId) view returns ((uint256 signalId, uint256 channelId, uint256 topicId, address submitter, uint256 submittedAt) signal)',
  'function getAllowlist(uint256 channelId) view returns ((address user, uint64 weight, bool exists)[] allowlist)',
  'function getAllowlistPaginated(uint256 channelId, uint256 offset, uint256 limit) view returns ((address user, uint64 weight, bool exists)[] allowlist, uint256 total)',
  'function getChannelTopics(uint256 channelId) view returns ((uint256 topicId, uint256 channelId, string ipfs, uint256 endDate, address creator, uint256 createdAt, uint8 minValue, uint8 maxValue, uint8 defaultValue, uint256 totalWeight, uint256 submissionCount, uint256[] signalIds)[] topics)',
  'function getTopicSignals(uint256 topicId) view returns ((uint256 signalId, uint256 channelId, uint256 topicId, address submitter, uint256 submittedAt)[] signals)',
  'function isInAllowlist(uint256 channelId, address user) view returns (bool)',
  'function hasSubmitted(uint256 topicId, address user) view returns (bool)',
  'function hasAccessedTopic(uint256 topicId, address user) view returns (bool)',
  'function getChannelTopicCount(uint256 channelId) view returns (uint256)',
  'function getTopicSignalCount(uint256 topicId) view returns (uint256)',
  'function getAllowlistCount(uint256 channelId) view returns (uint256)',
  'function getSubscription(uint256 channelId, uint256 tokenId) view returns (uint256 channelId, uint256 expiresAt, uint8 tier, address subscriber, uint256 mintedAt)',
  'function isSubscriptionValid(uint256 channelId, uint256 tokenId) view returns (bool)',
  'function getChannelNFTContract(uint256 channelId) view returns (address)',

  // 写入方法
  'function createChannel(string info, (uint8 tier, uint256 price, uint256 subscribers)[] tiers) returns (uint256)',
  'function createTopic(uint256 channelId, string ipfs, uint256 endDate, uint8 minValue, uint8 maxValue, uint8 defaultValue) returns (uint256)',
  'function batchAddToAllowlist(uint256 channelId, address[] users, uint64[] weights)',
  'function batchRemoveFromAllowlist(uint256 channelId, address[] users)',
  'function submitSignal(uint256 topicId, bytes inputValue, bytes proof) returns (uint256)',
  'function subscribe(uint256 channelId, uint8 tier) payable returns (uint256)',
  'function accessTopicResult(uint256 channelId, uint256 topicId, uint256 tokenId)',
  'function resetTopicAccess(uint256 topicId, address user)'
]);

const CHANNEL_NFT_ABI = parseAbi([
  'function getSubscription(uint256 tokenId) view returns ((uint256 channelId, uint256 expiresAt, uint8 tier, address subscriber, uint256 mintedAt) subscription)',
  'function isSubscriptionValid(uint256 tokenId) view returns (bool)',
  'function getTimeRemaining(uint256 tokenId) view returns (uint256)',
  'function getUserValidSubscriptions(address user) view returns (uint256[])',
  'function batchCheckExpired(uint256[] tokenIds) view returns (bool[])',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)'
]);

/**
 * 合约服务类，提供与智能合约交互的所有方法
 */
export class ContractService {
  
  // ============ 读取方法 ============
  
  /**
   * 获取频道信息
   */
  static async getChannel(channelId: bigint): Promise<Channel> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getChannel',
        args: [channelId]
      });
      
      return result as Channel;
    } catch (error) {
      console.error('获取频道信息失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前最大频道ID
   */
  static async getChannelMaxId(): Promise<bigint> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getChannelMaxId'
      });
      
      return result as bigint;
    } catch (error) {
      console.error('获取最大频道ID失败:', error);
      throw error;
    }
  }

  /**
   * 批量获取所有频道信息
   */
  static async getChannels(): Promise<Channel[]> {
    try {
      // 首先获取最大频道ID
      const maxId = await this.getChannelMaxId();
      console.log(`获取到最大频道ID: ${maxId.toString()}`);
      
      if (maxId === 0n) {
        console.log('当前没有任何频道');
        return [];
      }

      const channels: Channel[] = [];
      const promises: Promise<Channel | null>[] = [];

      // 创建 1 到 maxId 的频道ID获取任务
      for (let i = 1n; i <= maxId; i++) {
        const promise = this.getChannel(i)
          .then(channel => channel)
          .catch(() => null); // 如果频道不存在，返回null
        promises.push(promise);
      }

      const results = await Promise.allSettled(promises);
      
      // 过滤出成功获取的频道
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          channels.push(result.value);
        }
      }
      
      console.log(`成功获取 ${channels.length} 个频道，共尝试 ${maxId.toString()} 个ID`);
      return channels;
    } catch (error) {
      console.error('批量获取频道信息失败:', error);
      throw error;
    }
  }

  /**
   * 获取Topic信息
   */
  static async getTopic(topicId: bigint): Promise<Topic> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getTopic',
        args: [topicId]
      });
      
      return result as Topic;
    } catch (error) {
      console.error('获取Topic信息失败:', error);
      throw error;
    }
  }

  /**
   * 获取Signal信息
   */
  static async getSignal(signalId: bigint): Promise<Signal> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getSignal',
        args: [signalId]
      });
      
      return result as Signal;
    } catch (error) {
      console.error('获取Signal信息失败:', error);
      throw error;
    }
  }

  /**
   * 获取频道的Allowlist
   */
  static async getAllowlist(channelId: bigint): Promise<AllowlistEntry[]> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getAllowlist',
        args: [channelId]
      });
      
      return result as AllowlistEntry[];
    } catch (error) {
      console.error('获取Allowlist失败:', error);
      throw error;
    }
  }

  /**
   * 分页获取Allowlist
   */
  static async getAllowlistPaginated(
    channelId: bigint, 
    offset: number, 
    limit: number
  ): Promise<PaginatedResult<AllowlistEntry>> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getAllowlistPaginated',
        args: [channelId, BigInt(offset), BigInt(limit)]
      });
      
      const [items, total] = result as [AllowlistEntry[], bigint];
      return {
        items,
        total,
        offset,
        limit
      };
    } catch (error) {
      console.error('分页获取Allowlist失败:', error);
      throw error;
    }
  }

  /**
   * 获取频道下的所有Topics
   */
  static async getChannelTopics(channelId: bigint): Promise<Topic[]> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getChannelTopics',
        args: [channelId]
      });
      
      return result as Topic[];
    } catch (error) {
      console.error('获取频道Topics失败:', error);
      throw error;
    }
  }

  /**
   * 获取Topic下的所有Signals
   */
  static async getTopicSignals(topicId: bigint): Promise<Signal[]> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getTopicSignals',
        args: [topicId]
      });
      
      return result as Signal[];
    } catch (error) {
      console.error('获取Topic Signals失败:', error);
      throw error;
    }
  }

  /**
   * 检查用户是否在Allowlist中
   */
  static async isInAllowlist(channelId: bigint, userAddress: string): Promise<boolean> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'isInAllowlist',
        args: [channelId, userAddress as Address]
      });
      
      return result as boolean;
    } catch (error) {
      console.error('检查Allowlist状态失败:', error);
      throw error;
    }
  }

  /**
   * 检查用户是否已提交Signal
   */
  static async hasSubmitted(topicId: bigint, userAddress: string): Promise<boolean> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'hasSubmitted',
        args: [topicId, userAddress as Address]
      });
      
      return result as boolean;
    } catch (error) {
      console.error('检查提交状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取订阅信息
   */
  static async getSubscription(channelId: bigint, tokenId: bigint): Promise<SubscriptionNFT> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getSubscription',
        args: [channelId, tokenId]
      });
      
      return result as unknown as SubscriptionNFT;
    } catch (error) {
      console.error('获取订阅信息失败:', error);
      throw error;
    }
  }

  /**
   * 检查订阅是否有效
   */
  static async isSubscriptionValid(channelId: bigint, tokenId: bigint): Promise<boolean> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'isSubscriptionValid',
        args: [channelId, tokenId]
      });
      
      return result as boolean;
    } catch (error) {
      console.error('检查订阅有效性失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户的有效订阅NFT
   */
  static async getUserValidSubscriptions(
    nftContractAddress: string, 
    userAddress: string
  ): Promise<bigint[]> {
    try {
      const result = await readContract(wagmiConfig, {
        address: nftContractAddress as Address,
        abi: CHANNEL_NFT_ABI,
        functionName: 'getUserValidSubscriptions',
        args: [userAddress as Address]
      });
      
      return result as bigint[];
    } catch (error) {
      console.error('获取用户有效订阅失败:', error);
      throw error;
    }
  }

  // ============ 写入方法 ============

  /**
   * 创建频道
   */
  static async createChannel(
    info: string,
    tiers: TierPrice[]
  ): Promise<TransactionResult & { channelId?: bigint }> {
    const toastId = showPendingTransactionToast({ action: '创建频道' });
    try {
      // 首先模拟交易
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'createChannel',
        args: [info, tiers as any]
      });

      // 执行交易
      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: '创建频道', hash });

      // 等待交易确认
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        // 尝试从事件日志中提取ChannelId
        let channelId: bigint | undefined;
        
        try {
          // ChannelCreated事件的签名哈希 (keccak256("ChannelCreated(uint256,address,string)"))
          const channelCreatedSignature = '0x7c6b8e2c936da8f68bb7780c28a2a9ce07d9c1d3f86e8a2e96ca9b1b59b6a4e8';
          
          // 查找ChannelCreated事件（使用已知的事件签名或简单匹配）
          const channelCreatedEvent = receipt.logs.find((log: any) => {
            return log.topics && log.topics.length >= 2 && 
                   (log.topics[0] === channelCreatedSignature || 
                    log.address?.toLowerCase() === CONTRACT_ADDRESSES.FHESubscriptionManager.toLowerCase());
          });
          
          if (channelCreatedEvent && channelCreatedEvent.topics[1]) {
            // 第一个indexed参数（channelId）
            channelId = BigInt(channelCreatedEvent.topics[1]);
            console.log('创建的频道ID:', channelId.toString());
          } else {
            // 降级处理：尝试从第一个有效的日志中解析
            const firstLog = receipt.logs.find((log: any) => 
              log.topics && log.topics.length >= 2
            );
            if (firstLog) {
              try {
                if (firstLog.topics[1]) {
                  channelId = BigInt(firstLog.topics[1]);
                  console.log('推测的频道ID:', channelId.toString());
                }
              } catch {
                console.warn('无法解析频道ID');
              }
            }
          }
        } catch (eventError) {
          console.warn('提取频道ID失败:', eventError);
        }

        showSuccessTransactionToast({ id: toastId, action: '创建频道', hash });
        
        return {
          hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          success: receipt.status === 'success',
          channelId
        };
      } else {
        showErrorTransactionToast({ id: toastId, action: '创建频道', hash, message: '交易未成功' });
        
        return {
          hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          success: false
        };
      }
    } catch (error) {
      console.error('创建频道失败:', error);

      showErrorTransactionToast({
        id: toastId,
        action: '创建频道',
        message: error instanceof Error ? error.message : '未知错误'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 创建Topic
   */
  static async createTopic(
    channelId: bigint,
    ipfs: string,
    endDate: bigint,
    minValue: number,
    maxValue: number,
    defaultValue: number
  ): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: '创建话题' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'createTopic',
        args: [channelId, ipfs, endDate, minValue, maxValue, defaultValue]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: '创建话题', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: '创建话题', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: '创建话题', hash, message: '交易未成功' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('创建Topic失败:', error);

      showErrorTransactionToast({
        id: toastId,
        action: '创建话题',
        message: error instanceof Error ? error.message : '未知错误'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 批量添加到Allowlist
   */
  static async batchAddToAllowlist(params: BatchAllowlistParams): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: '批量添加白名单' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'batchAddToAllowlist',
        args: [params.channelId, params.users as Address[], params.weights]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: '批量添加白名单', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: '批量添加白名单', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: '批量添加白名单', hash, message: '交易未成功' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('批量添加到Allowlist失败:', error);

      showErrorTransactionToast({
        id: toastId,
        action: '批量添加白名单',
        message: error instanceof Error ? error.message : '未知错误'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 批量从Allowlist移除
   */
  static async batchRemoveFromAllowlist(params: BatchRemoveParams): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: '批量移除白名单' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'batchRemoveFromAllowlist',
        args: [params.channelId, params.users as Address[]]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: '批量移除白名单', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: '批量移除白名单', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: '批量移除白名单', hash, message: '交易未成功' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('批量从Allowlist移除失败:', error);

      showErrorTransactionToast({
        id: toastId,
        action: '批量移除白名单',
        message: error instanceof Error ? error.message : '未知错误'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 订阅频道
   */
  static async subscribe(
    channelId: bigint,
    tier: DurationTier,
    paymentAmount: string
  ): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: '订阅频道' });
    try {
      const value = parseEther(paymentAmount);
      
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'subscribe',
        args: [channelId, tier],
        value
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: '订阅频道', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: '订阅频道', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: '订阅频道', hash, message: '交易未成功' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('订阅失败:', error);

      showErrorTransactionToast({
        id: toastId,
        action: '订阅频道',
        message: error instanceof Error ? error.message : '未知错误'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 提交Signal（需要FHE加密）
   */
  static async submitSignal(
    topicId: bigint,
    encryptedValue: string,
    proof: string
  ): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: '提交信号' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'submitSignal',
        args: [topicId, encryptedValue as `0x${string}`, proof as `0x${string}`]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: '提交信号', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: '提交信号', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: '提交信号', hash, message: '交易未成功' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('提交Signal失败:', error);

      showErrorTransactionToast({
        id: toastId,
        action: '提交信号',
        message: error instanceof Error ? error.message : '未知错误'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 访问Topic结果
   */
  static async accessTopicResult(
    channelId: bigint,
    topicId: bigint,
    tokenId: bigint
  ): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: '访问话题结果' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'accessTopicResult',
        args: [channelId, topicId, tokenId]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: '访问话题结果', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: '访问话题结果', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: '访问话题结果', hash, message: '交易未成功' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('访问Topic结果失败:', error);

      showErrorTransactionToast({
        id: toastId,
        action: '访问话题结果',
        message: error instanceof Error ? error.message : '未知错误'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  // ============ 工具方法 ============

  /**
   * 将Wei转换为Ether字符串
   */
  static weiToEther(wei: bigint): string {
    return formatEther(wei);
  }

  /**
   * 将Ether字符串转换为Wei
   */
  static etherToWei(ether: string): bigint {
    return parseEther(ether);
  }

  /**
   * 获取合约地址
   */
  static getContractAddresses(): ContractAddresses {
    return CONTRACT_ADDRESSES;
  }

  /**
   * 格式化时间戳为可读日期
   */
  static formatTimestamp(timestamp: bigint): string {
    return new Date(Number(timestamp) * 1000).toLocaleString('zh-CN');
  }

  /**
   * 检查地址格式
   */
  static isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * 获取DurationTier的显示名称
   */
  static getDurationTierName(tier: DurationTier): string {
    const names = {
      [DurationTier.OneDay]: '1天',
      [DurationTier.Month]: '1个月',
      [DurationTier.Quarter]: '3个月',
      [DurationTier.HalfYear]: '6个月',
      [DurationTier.Year]: '1年'
    } as const;
    return names[tier as keyof typeof names] || '未知';
  }

  /**
   * 获取DurationTier的秒数
   */
  static getDurationTierSeconds(tier: DurationTier): number {
    const seconds = {
      [DurationTier.OneDay]: 24 * 60 * 60,
      [DurationTier.Month]: 30 * 24 * 60 * 60,
      [DurationTier.Quarter]: 90 * 24 * 60 * 60,
      [DurationTier.HalfYear]: 180 * 24 * 60 * 60,
      [DurationTier.Year]: 365 * 24 * 60 * 60
    } as const;
    return seconds[tier as keyof typeof seconds] || 0;
  }
}

export default ContractService;
