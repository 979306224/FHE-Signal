import { Modal, Typography, Space, Button, Card, Tag, Avatar, List, Empty, Spin, Toast, Form } from '@douyinfe/semi-ui';
import { IconUser, IconCalendar, IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from 'wagmi';
import { readContract } from '@wagmi/core';
import { parseAbi, type Address } from 'viem';
import { wagmiConfig } from '../config/wallet';
import type { Channel, Topic, SubscriptionNFT } from '../types/contracts';
import type { IPFSChannel } from '../types/ipfs';
import { ContractService, PinataService } from '../services';
import { fheService } from '../FHE/fheService';
import { useFHE, FHEStatus } from '../FHE/fheContext';
import { FHEStatusIndicator } from '../FHE/FHEStatusIndicator';
import FHEProgressToast from './FHEProgressToast';
import ChannelSubscribeModal from './ChannelSubscribeModal';
import AllowlistModal from './AllowlistModal';
import './ChannelDetailModal.less';

const { Title, Text } = Typography;

// Tier number to text mapping
const TIER_NAMES: Record<number, string> = {
  0: '1 Day',
  1: '1 Month',
  2: '3 Months',
  3: '6 Months',
  4: '1 Year'
};

// Tier conversion function
const getTierName = (tier: number): string => {
  return TIER_NAMES[tier] || `Tier ${tier}`;
};

// NFT contract ABI
const CHANNEL_NFT_ABI = parseAbi([
  'function getSubscription(uint256 tokenId) view returns ((uint256 channelId, uint256 expiresAt, uint8 tier, address subscriber, uint256 mintedAt) subscription)',
  'function isSubscriptionValid(uint256 tokenId) view returns (bool)',
  'function getUserValidSubscriptions(address user) view returns (uint256[])',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)'
]);

// Check if user has valid subscription
async function checkUserSubscription(nftContractAddress: string, userAddress: string, channelId: bigint): Promise<{
  hasValidSubscription: boolean;
  subscriptionInfo?: SubscriptionNFT;
}> {
  try {
    // Get user's valid subscription NFT tokenIds
    const tokenIds = await readContract(wagmiConfig, {
      address: nftContractAddress as Address,
      abi: CHANNEL_NFT_ABI,
      functionName: 'getUserValidSubscriptions',
      args: [userAddress as Address]
    }) as bigint[];

    console.log('User valid subscriptions tokenIds:', tokenIds);

    // Check if each tokenId belongs to current channel and is valid
    for (const tokenId of tokenIds) {
      try {
        // Get subscription info
        const subscription = await readContract(wagmiConfig, {
          address: nftContractAddress as Address,
          abi: CHANNEL_NFT_ABI,
          functionName: 'getSubscription',
          args: [tokenId]
        }) as unknown as SubscriptionNFT;

        // Check if belongs to current channel
        if (subscription.channelId === channelId) {
          // Check if subscription is still valid (not expired)
          const isValid = await readContract(wagmiConfig, {
            address: nftContractAddress as Address,
            abi: CHANNEL_NFT_ABI,
            functionName: 'isSubscriptionValid',
            args: [tokenId]
          }) as boolean;

          if (isValid) {
            console.log(`Found valid subscription for channel ${channelId.toString()}, tokenId: ${tokenId.toString()}`);
            return {
              hasValidSubscription: true,
              subscriptionInfo: subscription
            };
          }
        }
      } catch (err) {
        console.warn('Failed to check subscription for tokenId', tokenId.toString(), ':', err);
      }
    }

    return { hasValidSubscription: false };
  } catch (err) {
    console.error('Failed to check user subscription:', err);
    return { hasValidSubscription: false };
  }
}

interface ChannelDetailModalProps {
  visible: boolean;
  onClose: () => void;
  channel: Channel;
  ipfsData?: IPFSChannel;
}

interface TopicWithIPFS extends Topic {
  ipfsData?: {
    title: string;
    description: string;
  };
}

export default function ChannelDetailModal({ visible, onClose, channel, ipfsData }: ChannelDetailModalProps) {
  const { address: userAddress, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { status: fheStatus, isReady } = useFHE();
  const fheReady = fheStatus === FHEStatus.READY && isReady();

  // Debug FHE status
  useEffect(() => {
    console.log('FHE status debug:', {
      fheStatus,
      isReady: isReady(),
      fheReady,
      FHEStatus: FHEStatus
    });
  }, [fheStatus, fheReady]);
  const [topics, setTopics] = useState<TopicWithIPFS[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isInAllowlist, setIsInAllowlist] = useState(false);
  const [hasValidSubscription, setHasValidSubscription] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionNFT | null>(null);
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [showSubmitSignal, setShowSubmitSignal] = useState(false);
  const [showAllowlistModal, setShowAllowlistModal] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<bigint | null>(null);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [submittingSignal, setSubmittingSignal] = useState(false);
  const [signalValue, setSignalValue] = useState<string>('');
  const [formApiRef, setFormApiRef] = useState<any>(null);

  // Decryption related state
  const [decryptedResults, setDecryptedResults] = useState<Map<bigint, any>>(new Map());
  const [decryptingTopics, setDecryptingTopics] = useState<Set<bigint>>(new Set());

  // FHE progress state
  const [showFHEProgress, setShowFHEProgress] = useState(false);
  const [fheProgressStep, setFheProgressStep] = useState(0);
  const [fheProgressName, setFheProgressName] = useState('');

  // Use useWriteContract hook
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);

  // Wait for transaction confirmation
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: pendingTxHash as `0x${string}` | undefined,
  });

  // Handle transaction status changes
  useEffect(() => {
    if (isConfirmed && receipt) {
      console.log('Transaction confirmation result:', receipt);
      if (receipt.status === 'success') {
        Toast.success('🎉 Signal submitted successfully! Transaction confirmed');
        setShowSubmitSignal(false);
        setSelectedTopicId(null);
        setSignalValue('');
        setPendingTxHash(null);
        // Reload topic list
        loadTopics();
      } else {
        console.error('Transaction failed, receipt:', receipt);
        Toast.error('❌ Transaction failed, please check console for details');
        setPendingTxHash(null);
      }
      setSubmittingSignal(false);
    }
  }, [isConfirmed, receipt]);

  // Listen for transaction confirmation status changes
  useEffect(() => {
    if (pendingTxHash && isConfirming) {
      Toast.info('⏳ Transaction confirming, please wait...');
    }
  }, [pendingTxHash, isConfirming]);

  // Check user permissions and subscription status
  useEffect(() => {
    if (!userAddress || !isConnected) {
      setIsOwner(false);
      setIsInAllowlist(false);
      setHasValidSubscription(false);
      setSubscriptionInfo(null);
      return;
    }

    const checkPermissions = async () => {
      try {
        // Check if is channel owner
        const ownerStatus = channel.owner.toLowerCase() === userAddress.toLowerCase();
        setIsOwner(ownerStatus);

        console.log('channel', channel);

        // Check if in allowlist
        if (!ownerStatus) {
          const allowlistStatus = await ContractService.isInAllowlist(channel.channelId, userAddress);
          setIsInAllowlist(allowlistStatus);
        } else {
          setIsInAllowlist(true); // Owner is in allowlist by default
        }

        // Check if has valid subscription
        if (channel.nftContract) {
          const subscriptionResult = await checkUserSubscription(channel.nftContract, userAddress, channel.channelId);
          setHasValidSubscription(subscriptionResult.hasValidSubscription);
          setSubscriptionInfo(subscriptionResult.subscriptionInfo || null);
          console.log('Subscription check result:', subscriptionResult);
        } else {
          setHasValidSubscription(false);
          setSubscriptionInfo(null);
        }
      } catch (error) {
        console.error('Failed to check user permissions:', error);
      }
    };

    if (visible) {
      checkPermissions();
    }
  }, [channel, userAddress, isConnected, visible]);

  // Load all topics for the channel
  const loadTopics = useCallback(async () => {
    if (!visible) return;

    setLoadingTopics(true);
    try {
      // Get topic info based on channel.topicIds
      const topicIds = channel.topicIds || [];
      console.log('channel.topicIds', topicIds);

      const topicData = await ContractService.getTopicsByIds(topicIds);
      console.log('topicData', topicData);

      // Get IPFS data in parallel
      const topicsWithIPFS = await Promise.allSettled(
        topicData.map(async (topic) => {
          try {
            const ipfsData = await PinataService.fetchJson<{ title: string; description: string }>(topic.ipfs);
            return { ...topic, ipfsData };
          } catch (ipfsError) {
            console.warn(`Topic ${topic.topicId} IPFS data fetch failed:`, ipfsError);
            return { ...topic, ipfsData: undefined };
          }
        })
      );

      const validTopics: TopicWithIPFS[] = [];
      topicsWithIPFS.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          validTopics.push(result.value);
        } else {
          validTopics.push({ ...topicData[index], ipfsData: undefined });
        }
      });

      // Sort by creation time in descending order
      validTopics.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      setTopics(validTopics);
    } catch (error) {
      console.error('Failed to load topics:', error);
      Toast.error('Failed to load topic list');
    } finally {
      setLoadingTopics(false);
    }
  }, [channel.channelId, channel.topicIds, visible]);

  useEffect(() => {
    if (visible) {
      loadTopics();
    }
  }, [visible, loadTopics]);

  const handleCreateTopic = useCallback(async (values: any) => {
    if (!userAddress || creatingTopic) return;

    setCreatingTopic(true);
    try {
      // Upload topic info to IPFS
      const topicInfo = {
        title: values.title,
        description: values.description
      };

      const ipfsResult = await PinataService.uploadJson(topicInfo);

      // Create topic
      const endDate = BigInt(Math.floor(new Date(values.endDate).getTime() / 1000));
      const result = await ContractService.createTopic(
        channel.channelId,
        ipfsResult.ipfsUri,
        endDate,
        values.minValue,
        values.maxValue,
        values.defaultValue
      );

      if (result.success) {
        Toast.success('Topic created successfully!');
        setShowCreateTopic(false);
        loadTopics(); // Reload topics
      } else {
        Toast.error(`Failed to create topic: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to create topic:', error);
      Toast.error('Failed to create topic');
    } finally {
      setCreatingTopic(false);
    }
  }, [userAddress, channel.channelId, creatingTopic, loadTopics]);

  const handleSubmitSignal = useCallback(async (values?: any) => {
    if (!userAddress || !selectedTopicId || submittingSignal || isWritePending) return;

    setSubmittingSignal(true);
    try {
      // Use passed value or current state value, if neither then use default value
      let value = values?.value || signalValue;
      if (!value) {
        // Get current topic's default value
        const topic = topics.find(t => t.topicId === selectedTopicId);
        if (topic) {
          value = topic.defaultValue;
          console.log('Using default value:', value);
        } else {
          Toast.error('Unable to get topic info');
          setSubmittingSignal(false);
          return;
        }
      }

      const numericValue = Number(value);
      if (isNaN(numericValue)) {
        Toast.error('Please enter a valid number');
        setSubmittingSignal(false);
        return;
      }

      // Check if FHE is ready
      if (!fheReady) {
        Toast.error('FHE service not ready, please try again later');
        setSubmittingSignal(false);
        return;
      }

      // Show processing started toast
      Toast.info('Starting topic info validation...');

      // Pre-check: verify topic exists and is not expired
      try {
        const topic = await ContractService.getTopic(selectedTopicId);
        console.log('Topic info:', topic);
        const channel = await ContractService.getChannel(topic.channelId);
        const now = Math.floor(Date.now() / 1000);
        if (Number(topic.endDate) <= now) {
          Toast.error('Topic has expired, cannot submit signal');
          setSubmittingSignal(false);
          return;
        }

        // Frontend validation of signal value range
        if (numericValue < topic.minValue || numericValue > topic.maxValue) {
          Toast.error(`Signal value must be within ${topic.minValue} - ${topic.maxValue} range`);
          setSubmittingSignal(false);
          return;
        }

        // Check if already submitted
        const hasSubmitted = await ContractService.hasSubmitted(selectedTopicId, userAddress);
        if (hasSubmitted) {
          Toast.error('You have already submitted a signal');
          setSubmittingSignal(false);
          return;
        }

        // Check if in allowlist
        const isInAllowlist = await ContractService.isInAllowlist(topic.channelId, userAddress);
        if (!isInAllowlist && channel.owner !== userAddress) {
          Toast.error('You are not in the allowlist, cannot submit signal');
          setSubmittingSignal(false);
          return;
        }
      } catch (error) {
        console.error('Pre-check failed:', error);
        Toast.error('Unable to verify topic info, please try again later');
        setSubmittingSignal(false);
        return;
      }

      // Start FHE encryption progress
      setShowFHEProgress(true);
      setFheProgressStep(1);
      setFheProgressName('Preparing FHE encryption environment...');

      // Get contract address
      const contractAddresses = ContractService.getContractAddresses();
      const contractAddress = contractAddresses.FHESubscriptionManager;

      // Use FHE to encrypt signal value - following reference pattern
      console.log('Starting FHE encryption of signal value:', {
        value: numericValue,
        contractAddress,
        userAddress,
        topicId: selectedTopicId.toString()
      });

      // Verify FHE service status
      if (!fheService.isReady()) {
        Toast.error('FHE service not ready');
        setSubmittingSignal(false);
        setShowFHEProgress(false);
        return;
      }

      setFheProgressStep(2);
      setFheProgressName('Creating encrypted input...');

      const encryptedInput = fheService.createEncryptedInput(contractAddress, userAddress);
      encryptedInput.add8(numericValue);

      setFheProgressStep(3);
      setFheProgressName('Executing FHE encryption calculation...');

      const encryptedResult = await encryptedInput.encrypt();
      const encryptedValueHandle = encryptedResult.handles[0];
      const proof = encryptedResult.inputProof;

      // Verify encryption result
      if (!encryptedValueHandle || !proof) {
        Toast.error('FHE encryption failed: missing encrypted data or proof');
        setSubmittingSignal(false);
        setShowFHEProgress(false);
        return;
      }

      // Verify encryptedValueHandle is 32 bytes (bytes32)
      if (encryptedValueHandle.length !== 32) {
        Toast.error(`FHE encryption failed: encryptedValue length should be 32 bytes, actual ${encryptedValueHandle.length} bytes`);
        setSubmittingSignal(false);
        setShowFHEProgress(false);
        return;
      }

      setFheProgressStep(4);
      setFheProgressName('Verifying encryption result...');

      // Use same conversion function
      const uint8ArrayToHex = (array: Uint8Array): `0x${string}` => {
        return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
      };

      console.log('FHE encryption completed:', {
        encryptedValue: `Uint8Array(${encryptedValueHandle.length})`,
        proof: `Uint8Array(${proof.length})`,
        encryptedValueHex: uint8ArrayToHex(encryptedValueHandle),
        proofHex: uint8ArrayToHex(proof)
      });

      setFheProgressStep(5);
      setFheProgressName('Preparing to submit transaction...');

      // Get contract call configuration
      const contractConfig = ContractService.getSubmitSignalConfig(
        selectedTopicId,
        encryptedValueHandle,
        proof
      );

      // Use useWriteContract to execute transaction
      console.log('Transaction configuration:', contractConfig);
      const hash = await writeContractAsync(contractConfig);
      console.log('Transaction hash:', hash);
      setPendingTxHash(hash);

      // Complete FHE progress
      setFheProgressStep(5);
      setFheProgressName('FHE encryption completed!');

      // Delay closing progress bar
      setTimeout(() => {
        setShowFHEProgress(false);
        Toast.info('Transaction submitted, waiting for confirmation...');
      }, 1000);
    } catch (error) {
      console.error('Failed to submit signal:', error);

      // Detailed error message handling
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;

        // Check common contract errors
        if (error.message.includes('TopicNotFound')) {
          errorMessage = 'Topic does not exist';
        } else if (error.message.includes('TopicExpired')) {
          errorMessage = 'Topic has expired';
        } else if (error.message.includes('NotInAllowlist')) {
          errorMessage = 'You are not in the allowlist, cannot submit signal';
        } else if (error.message.includes('AlreadySubmitted')) {
          errorMessage = 'You have already submitted a signal';
        } else if (error.message.includes('revert')) {
          errorMessage = 'Contract call failed, please check permissions and parameters';
        }
      }

      Toast.error(`Failed to submit signal: ${errorMessage}`);
      setSubmittingSignal(false);
      setShowFHEProgress(false);
    }
  }, [userAddress, selectedTopicId, submittingSignal, signalValue, fheReady, isWritePending, writeContractAsync, loadTopics]);

  // Refresh channel data
  const handleRefresh = useCallback(async () => {
    try {
      Toast.info('🔄 Refreshing data...');
      await loadTopics();
      Toast.success('✅ Data refresh completed');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      Toast.error('❌ Failed to refresh data');
    }
  }, [loadTopics]);

  // Click topic to submit signal
  const handleTopicClick = useCallback((topic: TopicWithIPFS) => {
    if (!isOwner && !isInAllowlist) {
      Toast.warning('You do not have permission to submit signals, need to join allowlist');
      return;
    }

    // Check if topic has expired
    if (new Date(Number(topic.endDate) * 1000) <= new Date()) {
      Toast.warning('This topic has expired, cannot submit signal');
      return;
    }

    // Check if FHE is ready
    if (!fheReady) {
      Toast.warning('FHE service not ready, please wait for FHE initialization to complete');
      return;
    }

    setSelectedTopicId(topic.topicId);
    setShowSubmitSignal(true);
  }, [isOwner, isInAllowlist, fheReady]);

  // Decrypt topic results
  const handleDecryptTopic = useCallback(async (topicId: bigint) => {
    if (!userAddress || !fheReady || !walletClient || (!isOwner && !hasValidSubscription)) {
      Toast.warning('You do not have permission to decrypt topic results');
      return;
    }

    try {
      setDecryptingTopics(prev => new Set(prev).add(topicId));

      // Get topic info
      const topic = await ContractService.getTopic(topicId);
      console.log(topic, 'topic')
      // Check if there are submitted signals
      if (topic.submissionCount === 0n) {
        Toast.warning('This topic has no submitted signals yet');
        return;
      }

      // Use FHE to decrypt
      const contractAddresses = ContractService.getContractAddresses();
      const contractAddress = contractAddresses.FHESubscriptionManager;

      // Get real encrypted handles from contract - only decrypt average value
      const handles = [
        topic.average             // Average value handle (bytes32)
      ];

      // Use FHEService for decryption
      const results = await fheService.decryptMultipleValuesWithWalletClient(
        handles,
        contractAddress,
        walletClient
      );

      // Store decryption results
      setDecryptedResults(prev => {
        const newMap = new Map(prev);
        newMap.set(topicId, {
          average: results[handles[0]] || 0,
          decryptedAt: Date.now()
        });
        return newMap;
      });

      Toast.success('Decryption successful!');
    } catch (error) {
      console.error('Decryption failed:', error);
      Toast.error('Decryption failed, please try again');
    } finally {
      setDecryptingTopics(prev => {
        const newSet = new Set(prev);
        newSet.delete(topicId);
        return newSet;
      });
    }
  }, [userAddress, fheReady, walletClient, isOwner, hasValidSubscription]);

  const tierInfo = useMemo(() => {
    if (!channel.tiers || channel.tiers.length === 0) {
      return { minPrice: '-', maxPrice: '-', tierCount: 0 };
    }

    const prices = channel.tiers.map(tier => tier.price);
    const minPrice = prices.reduce((min, price) => price < min ? price : min);
    const maxPrice = prices.reduce((max, price) => price > max ? price : max);

    return {
      minPrice: ContractService.weiToEther(minPrice),
      maxPrice: ContractService.weiToEther(maxPrice),
      tierCount: channel.tiers.length
    };
  }, [channel.tiers]);

  const totalSubscribers = useMemo(() => {
    return channel.tiers?.reduce((total, tier) => total + tier.subscribers, 0n) || 0n;
  }, [channel.tiers]);

  return (
    <Modal
      title="Channel Details"
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      style={{ maxWidth: '90vw' }}
      bodyStyle={{ maxHeight: '80vh', overflowY: 'auto' }}
    >
      <div className="channel-detail-modal">
        {/* Channel basic info */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16 }}>
              <Avatar
                size="large"
                src={ipfsData?.logo ? ipfsData.logo.replace('ipfs://', 'https://ipfs.io/ipfs/') : undefined}
                style={{
                  marginRight: 16,
                  flexShrink: 0,
                  backgroundColor: !ipfsData?.logo ? 'var(--semi-color-primary)' : undefined
                }}
              >
                {!ipfsData?.logo && ipfsData?.name ? ipfsData.name.charAt(0).toUpperCase() : 'C'}
              </Avatar>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Title heading={4} style={{ margin: 0 }}>
                    {ipfsData?.name || `Channel ${channel.channelId.toString()}`}
                  </Title>
                  <Button
                    type="tertiary"
                    size="small"
                    icon={<IconRefresh />}
                    onClick={handleRefresh}
                    loading={loadingTopics}
                    style={{
                      padding: '4px 8px',
                      minWidth: 'auto',
                      height: 'auto'
                    }}
                    title="Refresh Data"
                  />
                </div>

                <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
                  {ipfsData?.description || 'No description'}
                </Text>

                <Space wrap>
                  <Tag color="blue">
                    <IconUser style={{ marginRight: 4 }} />
                    {totalSubscribers.toString()} Subscribers
                  </Tag>

                  <Tag color="green">
                    {topics.length} Topics
                  </Tag>

                  {tierInfo.tierCount > 0 && (
                    <Tag color="orange">
                      {tierInfo.minPrice === tierInfo.maxPrice
                        ? `${tierInfo.minPrice} ETH`
                        : `${tierInfo.minPrice} - ${tierInfo.maxPrice} ETH`
                      }
                    </Tag>
                  )}

                  <Tag color="purple">
                    ID: {channel.channelId.toString()}
                  </Tag>

                  {/* User status display */}
                  {isConnected && (
                    <>
                      {/* Owner status */}
                      {isOwner && (
                        <Tag color="red">
                          👑 Channel Owner
                        </Tag>
                      )}

                      {/* Subscription status */}
                      <Tag color={hasValidSubscription ? "green" : "grey"}>
                        {hasValidSubscription ?
                          `✓ Subscribed${subscriptionInfo ? ` (${getTierName(Number(subscriptionInfo.tier))})` : ''}` :
                          "Not Subscribed"
                        }
                      </Tag>
                    </>
                  )}


                </Space>

                <div style={{ marginTop: 12 }}>
                  <Text type="tertiary" size="small">
                    <IconCalendar style={{ marginRight: 4 }} />
                    Created at {ContractService.formatTimestamp(channel.createdAt)}
                  </Text>
                </div>
              </div>
            </div>
            <div>
              <ChannelSubscribeModal channelId={channel.channelId} />
            </div>
          </div>


          {/* Action buttons */}
          {isConnected && isOwner && (
            <Space>
              <Button
                type="primary"
                icon={<IconPlus />}
                onClick={() => setShowCreateTopic(true)}
              >
                Create Topic
              </Button>

              <Button
                type="tertiary"
                size="small"
                icon={<IconUser />}
                onClick={() => setShowAllowlistModal(true)}
                style={{ marginRight: 8 }}
              >
                Manage Allowlist
              </Button>
            </Space>
          )}

        </Card>

        {/* Topic list */}
        <Card title="Historical Topics">
          {loadingTopics ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : topics.length === 0 ? (
            <Empty
              title="No Topics"
              description="This channel has not created any topics yet"
            />
          ) : (
            <List
              dataSource={topics}
              renderItem={(topic) => {
                const isExpired = new Date(Number(topic.endDate) * 1000) <= new Date();
                const canSubmit = (isOwner || isInAllowlist) && !isExpired && fheReady;

                return (
                  <List.Item
                    className={canSubmit ? 'clickable-topic' : ''}
                    style={{
                      border: '1px solid var(--semi-color-border)',
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 12,
                      cursor: canSubmit ? 'pointer' : 'default',
                      transition: 'all 0.2s ease',
                      backgroundColor: canSubmit ? 'var(--semi-color-fill-0)' : 'transparent',
                      opacity: isExpired ? 0.6 : 1
                    }}
                    onClick={() => canSubmit && handleTopicClick(topic)}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <Title heading={6} style={{ margin: 0 }}>
                            {topic.ipfsData?.title || `Topic ${topic.topicId.toString()}`}
                          </Title>
                        <Space>
                          <Tag size="small" color="cyan">
                            ID: {topic.topicId.toString()}
                          </Tag>
                          <Tag size="small" color={isExpired ? 'red' : 'green'}>
                            {isExpired ? 'Ended' : 'In Progress'}
                          </Tag>
                          {canSubmit && (
                            <Tag size="small" color="blue">
                              Click to Submit Signal
                            </Tag>
                          )}
                          {!canSubmit && !isExpired && (isOwner || isInAllowlist) && !fheReady && (
                            <Tag size="small" color="orange">
                              FHE Not Ready
                            </Tag>
                          )}
                          {!canSubmit && !isExpired && !(isOwner || isInAllowlist) && (
                            <Tag size="small" color="grey">
                              No Permission
                            </Tag>
                          )}
                        </Space>
                      </div>

                      <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
                        {topic.ipfsData?.description || 'No description'}
                      </Text>

                      <Space wrap>
                        <Text size="small" type="tertiary">
                          Submissions: {topic.submissionCount.toString()}
                        </Text>
                        <Text size="small" type="tertiary">
                          Range: {topic.minValue} - {topic.maxValue}
                        </Text>
                        <Text size="small" type="tertiary">
                          Deadline: {new Date(Number(topic.endDate) * 1000).toLocaleString('en-US')}
                        </Text>
                      </Space>

                      {/* Encrypted results display area */}
                      {topic.submissionCount > 0n && (
                        <div style={{
                          marginTop: 12,
                          padding: 12,
                          backgroundColor: 'var(--semi-color-fill-0)',
                          borderRadius: 6,
                          border: '1px solid var(--semi-color-border)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Text size="small" strong>Encrypted Results:</Text>
                            {(isOwner || hasValidSubscription) && (
                              <Button
                                size="small"
                                type="primary"
                                loading={decryptingTopics.has(topic.topicId)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDecryptTopic(topic.topicId);
                                }}
                                disabled={!fheReady}
                              >
                                {decryptingTopics.has(topic.topicId) ? 'Decrypting...' : 'Decrypt'}
                              </Button>
                            )}
                          </div>

                          {decryptedResults.has(topic.topicId) ? (
                            <div>
                              <Text size="small" type="secondary">
                                Average: {decryptedResults.get(topic.topicId)?.average || '***'}
                              </Text>
                            </div>
                          ) : (
                            <div>
                              <Text size="small" type="tertiary">
                                Average: ***
                              </Text>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Card>

        <div style={{
          height: '24px'
        }}></div>

        {/* Create topic modal */}
        <Modal
          title="Create New Topic"
          visible={showCreateTopic}
          onCancel={creatingTopic ? undefined : () => setShowCreateTopic(false)}
          closeOnEsc={!creatingTopic}
          maskClosable={!creatingTopic}
          footer={null}
          width={600}
        >
          <Form
            onSubmit={handleCreateTopic}
            getFormApi={(formApi) => setFormApiRef(formApi)}
          >
            <Form.Input
              field="title"
              label="Topic Title"
              placeholder="Please enter topic title"
              rules={[{ required: true, message: 'Please enter topic title' }]}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                Give the topic a concise and clear title to help users quickly understand the topic content
              </Text>
            </div>

            <Form.Input
              field="description"
              label="Topic Description"
              placeholder="Please enter topic description"
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                Describe in detail the background, purpose and participation method of the topic to help users understand the topic
              </Text>
            </div>

            <Form.Input
              field="endDate"
              label="Deadline"
              type="datetime-local"
              placeholder="Please select deadline"
              rules={[{ required: true, message: 'Please select deadline' }]}
              initValue={(() => {
                // Default to 1 week later
                const oneWeekLater = new Date();
                oneWeekLater.setDate(oneWeekLater.getDate() + 7);
                // Format to datetime-local required format (YYYY-MM-DDTHH:MM)
                return oneWeekLater.toISOString().slice(0, 16);
              })()}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                Set the end time of the topic, after which users will no longer be able to submit signals
              </Text>
            </div>

            <Form.InputNumber
              field="minValue"
              label="Minimum Value"
              placeholder="Please enter minimum value"
              rules={[{ required: true, message: 'Please enter minimum value' }]}
              style={{ width: '100%' }}
              initValue={1}
              min={1}
              max={100}
              onChange={(value) => {
                // If input value exceeds 1-100 range, automatically change to 1
                const numValue = Number(value);
                if (value && (numValue < 1 || numValue > 100)) {
                  formApiRef?.setValue('minValue', 1);
                  Toast.warning('Minimum value out of range, automatically adjusted to 1');
                }
              }}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                The minimum value that users can submit signals, values outside the range will be automatically adjusted to the default value
              </Text>
            </div>

            <Form.InputNumber
              field="maxValue"
              label="Maximum Value"
              placeholder="Please enter maximum value"
              rules={[{ required: true, message: 'Please enter maximum value' }]}
              style={{ width: '100%' }}
              initValue={100}
              min={1}
              max={100}
              onChange={(value) => {
                // If input value exceeds 1-100 range, automatically change to 100
                const numValue = Number(value);
                if (value && (numValue < 1 || numValue > 100)) {
                  formApiRef?.setValue('maxValue', 100);
                  Toast.warning('Maximum value out of range, automatically adjusted to 100');
                }
              }}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                The maximum value that users can submit signals, values outside the range will be automatically adjusted to the default value
              </Text>
            </div>

            <Form.InputNumber
              field="defaultValue"
              label="Default Value"
              placeholder="Please enter default value"
              rules={[{ required: true, message: 'Please enter default value' }]}
              style={{ width: '100%' }}
              initValue={50}
              min={1}
              max={100}
              onChange={(value) => {
                // If input value exceeds 1-100 range, automatically change to 50
                const numValue = Number(value);
                if (value && (numValue < 1 || numValue > 100)) {
                  formApiRef?.setValue('defaultValue', 50);
                  Toast.warning('Default value out of range, automatically adjusted to 50');
                }
              }}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                When users submit signals, if they exceed the range, they will be adjusted to this default value
              </Text>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Button onClick={() => setShowCreateTopic(false)}>
                Cancel
              </Button>
              <Button htmlType="submit" type="primary" loading={creatingTopic}>
                Create Topic
              </Button>
            </div>
          </Form>
          <div style={{
            height: '24px'
          }}></div>

        </Modal>

        {/* Submit signal modal */}
        <Modal
          title="Submit Signal"
          visible={showSubmitSignal}
          onCancel={submittingSignal || isWritePending || isConfirming ? undefined : () => {
            setShowSubmitSignal(false);
            setSelectedTopicId(null);
            setSignalValue('');
          }}
          closeOnEsc={!(submittingSignal || isWritePending || isConfirming)}
          maskClosable={!(submittingSignal || isWritePending || isConfirming)}
          footer={null}
          width={600}
        >
          {selectedTopicId && (() => {
            const topic = topics.find(t => t.topicId === selectedTopicId);
            if (!topic) return null;

            const isExpired = new Date(Number(topic.endDate) * 1000) <= new Date();

            return (
              <Card style={{ marginBottom: 20, border: '1px solid var(--semi-color-border)' }}>
                <div style={{ marginBottom: 12 }}>
                  <Title heading={5} style={{ margin: 0, marginBottom: 8 }}>
                    {topic.ipfsData?.title || `Topic ${topic.topicId.toString()}`}
                  </Title>
                  <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
                    {topic.ipfsData?.description || 'No description'}
                  </Text>
                </div>

                <Space wrap style={{ marginBottom: 12 }}>
                  <Tag size="small" color="cyan">
                    ID: {topic.topicId.toString()}
                  </Tag>
                  <Tag size="small" color={isExpired ? 'red' : 'green'}>
                    {isExpired ? 'Ended' : 'In Progress'}
                  </Tag>
                  <Tag size="small" color="blue">
                    Submissions: {topic.submissionCount.toString()}
                  </Tag>
                </Space>

                <div style={{
                  padding: 12,
                  backgroundColor: 'var(--semi-color-fill-0)',
                  borderRadius: 6,
                  marginBottom: 12
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary" size="small">Signal Value Range:</Text>
                      <Text size="small" strong>
                        {topic.minValue} - {topic.maxValue}
                      </Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary" size="small">Default Value:</Text>
                      <Text size="small" strong>
                        {topic.defaultValue}
                      </Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary" size="small">Deadline:</Text>
                      <Text size="small" strong>
                        {new Date(Number(topic.endDate) * 1000).toLocaleString('en-US')}
                      </Text>
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: 8,
                  backgroundColor: 'var(--semi-color-fill-1)',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <Space align="center">
                    <Text type="secondary" size="small">FHE Status:</Text>
                    <FHEStatusIndicator showLabel={true} size="small" />
                  </Space>
                  {!fheReady && (
                    <Text type="tertiary" size="small">
                      Please wait for FHE initialization to complete
                    </Text>
                  )}
                </div>
              </Card>
            );
          })()}

          <Form onSubmit={handleSubmitSignal}>
            {(() => {
              const topic = selectedTopicId ? topics.find(t => t.topicId === selectedTopicId) : null;
              if (!topic) return null;

              return (
                <Form.InputNumber
                  field="value"
                  label="Signal Value"
                  placeholder={`Please enter an integer between ${topic.minValue} - ${topic.maxValue}`}
                  rules={[
                    { required: true, message: 'Please enter signal value' },
                    {
                      validator: (_, value) => {
                        if (!value) return true;

                        const numValue = Number(value);
                        if (!Number.isInteger(numValue)) {
                          return new Error('Please enter an integer');
                        }

                        if (numValue < topic.minValue || numValue > topic.maxValue) {
                          return new Error(`Please enter an integer between ${topic.minValue} - ${topic.maxValue}`);
                        }

                        return true;
                      }
                    }
                  ]}
                  style={{ width: '100%' }}
                  min={topic.minValue}
                  max={topic.maxValue}
                  step={1}
                  precision={0}
                  initValue={topic.defaultValue}
                  onChange={(value) => setSignalValue(value ? value.toString() : '')}
                />
              );
            })()}
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                Please enter an integer that meets the topic settings, values outside the range will be automatically adjusted to the default value
              </Text>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Button
                onClick={() => {
                  setShowSubmitSignal(false);
                  setSelectedTopicId(null);
                  setSignalValue('');
                }}
                disabled={submittingSignal || isWritePending || isConfirming}
              >
                Cancel
              </Button>
              <Button
                htmlType="submit"
                type="primary"
                loading={submittingSignal || isWritePending || isConfirming}
                disabled={!fheReady || submittingSignal || isWritePending}
              >
                {!fheReady ? 'FHE Not Ready' :
                  isWritePending ? 'Submitting...' :
                    isConfirming ? 'Confirming...' :
                      'Submit Signal'}
              </Button>
            </div>
          </Form>

          <div style={{
            height: '24px'
          }}></div>
        </Modal>
      </div>

      {/* FHE Progress Toast */}
      <FHEProgressToast
        visible={showFHEProgress}
        currentStep={fheProgressStep}
        totalSteps={5}
        stepName={fheProgressName}
        onComplete={() => {
          setShowFHEProgress(false);
        }}
      />

      {/* Allowlist Management Modal */}
      <AllowlistModal
        channelId={channel.channelId}
        visible={showAllowlistModal}
        onClose={() => setShowAllowlistModal(false)}
      />
    </Modal>
  );
}
