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

// Contract address configuration (read from deployment file)
const CONTRACT_ADDRESSES: ContractAddresses = {
  FHESubscriptionManager: '0x2adB5f093E8e3A0950Cb60A226E183f11803CD85',
  NFTFactory: '0xcB2EC254d95c337a82B0F10a6512579BB586C828'
};

// Utility functions
const uint8ArrayToHex = (array: Uint8Array): `0x${string}` => {
  return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
};

// Contract ABI - Contains error definitions and main methods
const FHE_SUBSCRIPTION_MANAGER_ABI = parseAbi([
  // Error definitions
  'error ChannelNotFound()',
  'error NotChannelOwner()',
  'error TopicNotFound()',
  'error NotTopicCreator()',
  'error TopicExpired()',
  'error TopicNotExpired()',
  'error NotInAllowlist()',
  'error AlreadySubmitted()',
  'error InvalidEndDate()',
  'error NotSubscriptionOwner()',
  'error SubscriptionExpired()',
  'error ArrayLengthMismatch()',
  'error ArrayTooLarge()',
  'error EmptyArray()',
  'error InvalidValueRange()',
  'error AlreadyAccessed()',
  'error TopicChannelMismatch()',

  // Read methods
  'function getChannel(uint256 id) view returns ((uint256 channelId, string info, address owner, (uint8 tier, uint256 price, uint256 subscribers)[] tiers, uint256 tierCount, address nftContract, uint256 createdAt, uint256 lastPublishedAt, uint256[] topicIds) channel)',
  'function getChannelMaxId() view returns (uint256)',
  'function getTopic(uint256 topicId) view returns ((uint256 topicId, uint256 channelId, string ipfs, uint256 endDate, address creator, uint256 createdAt, uint8 minValue, uint8 maxValue, uint8 defaultValue, bytes32 totalWeightedValue, bytes32 average, uint256 totalWeight, uint256 submissionCount, uint256[] signalIds) topic)',
  'function getSignal(uint256 signalId) view returns ((uint256 signalId, uint256 channelId, uint256 topicId, address submitter, bytes32 value, uint256 submittedAt) signal)',
  'function getAllowlist(uint256 channelId) view returns ((address user, uint64 weight, bool exists)[] allowlist)',
  'function getAllowlistPaginated(uint256 channelId, uint256 offset, uint256 limit) view returns ((address user, uint64 weight, bool exists)[] allowlist, uint256 total)',
  'function getChannelTopics(uint256 channelId) view returns ((uint256 topicId, uint256 channelId, string ipfs, uint256 endDate, address creator, uint256 createdAt, uint8 minValue, uint8 maxValue, uint8 defaultValue, bytes32 totalWeightedValue, bytes32 average, uint256 totalWeight, uint256 submissionCount, uint256[] signalIds)[] topics)',
  'function getTopicSignals(uint256 topicId) view returns ((uint256 signalId, uint256 channelId, uint256 topicId, address submitter, bytes32 value, uint256 submittedAt)[] signals)',
  'function isInAllowlist(uint256 channelId, address user) view returns (bool)',
  'function hasSubmitted(uint256 topicId, address user) view returns (bool)',
  'function hasAccessedTopic(uint256 topicId, address user) view returns (bool)',
  'function getChannelTopicCount(uint256 channelId) view returns (uint256)',
  'function getTopicSignalCount(uint256 topicId) view returns (uint256)',
  'function getAllowlistCount(uint256 channelId) view returns (uint256)',
  'function getSubscription(uint256 channelId, uint256 tokenId) view returns (uint256 channelId, uint256 expiresAt, uint8 tier, address subscriber, uint256 mintedAt)',
  'function isSubscriptionValid(uint256 channelId, uint256 tokenId) view returns (bool)',
  'function getChannelNFTContract(uint256 channelId) view returns (address)',

  // Write methods
  'function createChannel(string info, (uint8 tier, uint256 price, uint256 subscribers)[] tiers) returns (uint256)',
  'function createTopic(uint256 channelId, string ipfs, uint256 endDate, uint8 minValue, uint8 maxValue, uint8 defaultValue) returns (uint256)',
  'function batchAddToAllowlist(uint256 channelId, address[] users, uint64[] weights)',
  'function batchRemoveFromAllowlist(uint256 channelId, address[] users)',
  'function submitSignal(uint256 topicId, bytes32 inputValue, bytes proof) returns (uint256)',
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
 * Contract service class, provides all methods for interacting with smart contracts
 */
export class ContractService {
  
  // ============ Read Methods ============
  
  /**
   * Get channel information
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
      console.error('Failed to get channel info:', error);
      throw error;
    }
  }

  /**
   * Get current maximum channel ID
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
      console.error('Failed to get max channel ID:', error);
      throw error;
    }
  }

  /**
   * Batch get all channel information
   */
  static async getChannels(): Promise<Channel[]> {
    try {
      // First get maximum channel ID
      const maxId = await this.getChannelMaxId();
      console.log(`Got maximum channel ID: ${maxId.toString()}`);
      
      if (maxId === 0n) {
        console.log('No channels currently exist');
        return [];
      }

      const channels: Channel[] = [];
      const promises: Promise<Channel | null>[] = [];

      // Create channel ID fetch tasks from 1 to maxId
      for (let i = 1n; i <= maxId; i++) {
        const promise = this.getChannel(i)
          .then(channel => channel)
          .catch(() => null); // If channel does not exist, return null
        promises.push(promise);
      }

      const results = await Promise.allSettled(promises);
      
      // Filter out successfully fetched channels
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          channels.push(result.value);
        }
      }
      
      console.log(`Successfully fetched ${channels.length} channels, tried ${maxId.toString()} IDs total`);
      return channels;
    } catch (error) {
      console.error('Failed to batch get channel info:', error);
      throw error;
    }
  }

  /**
   * Get Topic information
   */
  static async getTopic(topicId: bigint): Promise<Topic> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getTopic',
        args: [topicId]
      });
      
      return result as unknown as Topic;
    } catch (error) {
      console.error('Failed to get Topic info:', error);
      throw error;
    }
  }

  /**
   * Get Signal information
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
      console.error('Failed to get Signal info:', error);
      throw error;
    }
  }

  /**
   * Get channel Allowlist
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
      console.error('Failed to get Allowlist:', error);
      throw error;
    }
  }

  /**
   * Get Allowlist with pagination
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
      console.error('Failed to get Allowlist with pagination:', error);
      throw error;
    }
  }

  /**
   * Get all Topics under channel
   */
  static async getChannelTopics(channelId: bigint): Promise<Topic[]> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getChannelTopics',
        args: [channelId]
      });
      
      return result as unknown as Topic[];
    } catch (error) {
      console.error('Failed to get channel Topics:', error);
      throw error;
    }
  }

  /**
   * Batch get Topic info by topicIds
   */
  static async getTopicsByIds(topicIds: bigint[]): Promise<Topic[]> {
    try {
      if (topicIds.length === 0) {
        return [];
      }

      // Get all topic info in parallel
      const topicPromises = topicIds.map(topicId => 
        this.getTopic(topicId).catch(error => {
          console.warn(`Failed to get Topic ${topicId}:`, error);
          return null; // Return null indicates fetch failed
        })
      );

      const results = await Promise.allSettled(topicPromises);
      
      // Filter out successfully fetched topics
      const topics: Topic[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          topics.push(result.value);
        }
      });

      return topics;
    } catch (error) {
      console.error('Failed to batch get Topics:', error);
      throw error;
    }
  }

  /**
   * Get all Signals under Topic
   */
  static async getTopicSignals(topicId: bigint): Promise<Signal[]> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'getTopicSignals',
        args: [topicId]
      });
      
      return result as unknown as Signal[];
    } catch (error) {
      console.error('Failed to get Topic Signals:', error);
      throw error;
    }
  }

  /**
   * Check if user is in Allowlist
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
      console.error('Failed to check Allowlist status:', error);
      throw error;
    }
  }

  /**
   * Check if user has submitted Signal
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
      console.error('Failed to check submission status:', error);
      throw error;
    }
  }

  /**
   * Check if user has accessed topic results
   */
  static async hasAccessedTopic(topicId: bigint, userAddress: string): Promise<boolean> {
    try {
      const result = await readContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'hasAccessedTopic',
        args: [topicId, userAddress as Address]
      });

      return result as boolean;
    } catch (error) {
      console.error('Failed to check topic access status:', error);
      throw error;
    }
  }

  /**
   * Get subscription info
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
      console.error('Failed to get subscription info:', error);
      throw error;
    }
  }

  /**
   * Check if subscription is valid
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
      console.error('Failed to check subscription validity:', error);
      throw error;
    }
  }

  /**
   * Get user's valid subscription NFTs
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
      console.error('Failed to get user valid subscriptions:', error);
      throw error;
    }
  }

  // ============ Write Methods ============

  /**
   * Create channel
   */
  static async createChannel(
    info: string,
    tiers: TierPrice[]
  ): Promise<TransactionResult & { channelId?: bigint }> {
    const toastId = showPendingTransactionToast({ action: 'Create Channel' });
    try {
      // First simulate transaction
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'createChannel',
        args: [info, tiers as any]
      });

      // Execute transaction
      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: 'Create Channel', hash });

      // Wait for transaction confirmation
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        // Try to extract ChannelId from event logs
        let channelId: bigint | undefined;
        
        try {
          // ChannelCreated event signature hash (keccak256("ChannelCreated(uint256,address,string)"))
          const channelCreatedSignature = '0x7c6b8e2c936da8f68bb7780c28a2a9ce07d9c1d3f86e8a2e96ca9b1b59b6a4e8';
          
          // Find ChannelCreated event (using known event signature or simple matching)
          const channelCreatedEvent = receipt.logs.find((log: any) => {
            return log.topics && log.topics.length >= 2 && 
                   (log.topics[0] === channelCreatedSignature || 
                    log.address?.toLowerCase() === CONTRACT_ADDRESSES.FHESubscriptionManager.toLowerCase());
          });
          
          if (channelCreatedEvent && channelCreatedEvent.topics[1]) {
            // First indexed parameter (channelId)
            channelId = BigInt(channelCreatedEvent.topics[1]);
            console.log('Created channel ID:', channelId.toString());
          } else {
            // Fallback: try to parse from first valid log
            const firstLog = receipt.logs.find((log: any) => 
              log.topics && log.topics.length >= 2
            );
            if (firstLog) {
              try {
                if (firstLog.topics[1]) {
                  channelId = BigInt(firstLog.topics[1]);
                  console.log('Inferred channel ID:', channelId.toString());
                }
              } catch {
                console.warn('Unable to parse channel ID');
              }
            }
          }
        } catch (eventError) {
          console.warn('Failed to extract channel ID:', eventError);
        }

        showSuccessTransactionToast({ id: toastId, action: 'Create Channel', hash });
        
        return {
          hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          success: receipt.status === 'success',
          channelId
        };
      } else {
        showErrorTransactionToast({ id: toastId, action: 'Create Channel', hash, message: 'Transaction not successful' });
        
        return {
          hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          success: false
        };
      }
    } catch (error) {
      console.error('Create Channel failed:', error);

      showErrorTransactionToast({
        id: toastId,
        action: 'Create Channel',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create Topic
   */
  static async createTopic(
    channelId: bigint,
    ipfs: string,
    endDate: bigint,
    minValue: number,
    maxValue: number,
    defaultValue: number
  ): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: 'Create Topic' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'createTopic',
        args: [channelId, ipfs, endDate, minValue, maxValue, defaultValue]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: 'Create Topic', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: 'Create Topic', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: 'Create Topic', hash, message: 'Transaction not successful' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('Create Topic failed:', error);

      showErrorTransactionToast({
        id: toastId,
        action: 'Create Topic',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Batch add to Allowlist
   */
  static async batchAddToAllowlist(params: BatchAllowlistParams): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: 'Batch Add to Allowlist' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'batchAddToAllowlist',
        args: [params.channelId, params.users as Address[], params.weights]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: 'Batch Add to Allowlist', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: 'Batch Add to Allowlist', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: 'Batch Add to Allowlist', hash, message: 'Transaction not successful' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('Batch add to Allowlist failed:', error);

      showErrorTransactionToast({
        id: toastId,
        action: 'Batch Add to Allowlist',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Batch remove from Allowlist
   */
  static async batchRemoveFromAllowlist(params: BatchRemoveParams): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: 'Batch Remove from Allowlist' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'batchRemoveFromAllowlist',
        args: [params.channelId, params.users as Address[]]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: 'Batch Remove from Allowlist', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: 'Batch Remove from Allowlist', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: 'Batch Remove from Allowlist', hash, message: 'Transaction not successful' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('Batch remove from Allowlist failed:', error);

      showErrorTransactionToast({
        id: toastId,
        action: 'Batch Remove from Allowlist',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Subscribe to Channel
   */
  static async subscribe(
    channelId: bigint,
    tier: DurationTier,
    paymentAmount: string
  ): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: 'Subscribe to Channel' });
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

      showPendingTransactionToast({ id: toastId, action: 'Subscribe to Channel', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: 'Subscribe to Channel', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: 'Subscribe to Channel', hash, message: 'Transaction not successful' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('Subscription failed:', error);

      showErrorTransactionToast({
        id: toastId,
        action: 'Subscribe to Channel',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get contract call configuration for submitting Signal (for useWriteContract)
   */
  static getSubmitSignalConfig(
    topicId: bigint,
    encryptedValue: Uint8Array,
    proof: Uint8Array
  ) {
    // Convert Uint8Array to hex string
    const encryptedValueHex = uint8ArrayToHex(encryptedValue);
    const proofHex = uint8ArrayToHex(proof);

    return {
      address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
      abi: FHE_SUBSCRIPTION_MANAGER_ABI,
      functionName: 'submitSignal' as const,
      args: [topicId, encryptedValueHex, proofHex] as const
    };
  }

  /**
   * Submit Signal (requires FHE encryption)
   */
  static async submitSignal(
    topicId: bigint,
    encryptedValue: Uint8Array,
    proof: Uint8Array
  ): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: 'Submit Signal' });
    try {
      // Convert Uint8Array to hex string
      const encryptedValueHex = uint8ArrayToHex(encryptedValue);
      const proofHex = uint8ArrayToHex(proof);

      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'submitSignal',
        args: [topicId, encryptedValueHex, proofHex]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: 'Submit Signal', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: 'Submit Signal', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: 'Submit Signal', hash, message: 'Transaction not successful' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('Submit Signal failed:', error);

      showErrorTransactionToast({
        id: toastId,
        action: 'Submit Signal',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Access Topic results
   */
  static async accessTopicResult(
    channelId: bigint,
    topicId: bigint,
    tokenId: bigint
  ): Promise<TransactionResult> {
    const toastId = showPendingTransactionToast({ action: 'Access Topic Results' });
    try {
      const { request } = await simulateContract(wagmiConfig, {
        address: CONTRACT_ADDRESSES.FHESubscriptionManager as Address,
        abi: FHE_SUBSCRIPTION_MANAGER_ABI,
        functionName: 'accessTopicResult',
        args: [channelId, topicId, tokenId]
      });

      const hash = await writeContract(wagmiConfig, request);

      showPendingTransactionToast({ id: toastId, action: 'Access Topic Results', hash });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      if (receipt.status === 'success') {
        showSuccessTransactionToast({ id: toastId, action: 'Access Topic Results', hash });
      } else {
        showErrorTransactionToast({ id: toastId, action: 'Access Topic Results', hash, message: 'Transaction not successful' });
      }
      
      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        success: receipt.status === 'success'
      };
    } catch (error) {
      console.error('Access Topic results failed:', error);

      showErrorTransactionToast({
        id: toastId,
        action: 'Access Topic Results',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hash: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============ Utility Methods ============

  /**
   * Convert Wei to Ether string
   */
  static weiToEther(wei: bigint): string {
    return formatEther(wei);
  }

  /**
   * Convert Ether string to Wei
   */
  static etherToWei(ether: string): bigint {
    return parseEther(ether);
  }

  /**
   * Get contract addresses
   */
  static getContractAddresses(): ContractAddresses {
    return CONTRACT_ADDRESSES;
  }

  /**
   * Format timestamp to readable date
   */
  static formatTimestamp(timestamp: bigint): string {
    return new Date(Number(timestamp) * 1000).toLocaleString('en-US');
  }

  /**
   * Check address format
   */
  static isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Get DurationTier display name
   */
  static getDurationTierName(tier: DurationTier): string {
    const names = {
      [DurationTier.OneDay]: '1 Day',
      [DurationTier.Month]: '1 Month',
      [DurationTier.Quarter]: '3 Months',
      [DurationTier.HalfYear]: '6 Months',
      [DurationTier.Year]: '1 Year'
    } as const;
    return names[tier as keyof typeof names] || 'Unknown';
  }

  /**
   * Get DurationTier seconds
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
