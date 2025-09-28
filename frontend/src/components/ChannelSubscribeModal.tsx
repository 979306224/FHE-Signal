import { Button, Modal, Card, Typography, Divider, Spin, Toast } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { readContract } from '@wagmi/core';
import { parseAbi, type Address } from 'viem';
import { wagmiConfig } from '../config/wallet';
import { ContractService } from '../services';
import type { Channel, SubscriptionNFT } from '../types/contracts';
import { DurationTier } from '../types/contracts';
import './ChannelSubscribeModal.less';

const { Title, Text } = Typography;

// NFT contract ABI
const CHANNEL_NFT_ABI = parseAbi([
  'function getSubscription(uint256 tokenId) view returns ((uint256 channelId, uint256 expiresAt, uint8 tier, address subscriber, uint256 mintedAt) subscription)',
  'function isSubscriptionValid(uint256 tokenId) view returns (bool)',
  'function getTimeRemaining(uint256 tokenId) view returns (uint256)',
  'function getUserValidSubscriptions(address user) view returns (uint256[])',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)'
]);

// Get subscription info from NFT contract
async function getSubscriptionFromNFTContract(nftContractAddress: string, tokenId: bigint): Promise<SubscriptionNFT> {
  const result = await readContract(wagmiConfig, {
    address: nftContractAddress as Address,
    abi: CHANNEL_NFT_ABI,
    functionName: 'getSubscription',
    args: [tokenId]
  });
  
  return result as unknown as SubscriptionNFT;
}

// Check if subscription is valid from NFT contract
async function isSubscriptionValidFromNFTContract(nftContractAddress: string, tokenId: bigint): Promise<boolean> {
  const result = await readContract(wagmiConfig, {
    address: nftContractAddress as Address,
    abi: CHANNEL_NFT_ABI,
    functionName: 'isSubscriptionValid',
    args: [tokenId]
  });
  
  return result as boolean;
}

// Duration tier display name mapping
const TIER_NAMES: Record<DurationTier, string> = {
  [DurationTier.OneDay]: '1 Day',
  [DurationTier.Month]: '1 Month', 
  [DurationTier.Quarter]: '3 Months',
  [DurationTier.HalfYear]: '6 Months',
  [DurationTier.Year]: '1 Year'
};

// Duration tier descriptions
const TIER_DESCRIPTIONS: Record<DurationTier, string> = {
  [DurationTier.OneDay]: 'Trial Subscription',
  [DurationTier.Month]: 'Monthly Subscription',
  [DurationTier.Quarter]: 'Quarterly Subscription',
  [DurationTier.HalfYear]: 'Half-Year Subscription',
  [DurationTier.Year]: 'Annual Subscription'
};

export interface ChannelSubscribeModalProps {
    channelId: bigint;
}

export default function ChannelSubscribeModal({ channelId }: ChannelSubscribeModalProps) {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [channelInfo, setChannelInfo] = useState<Channel | null>(null);
    const [subscribing, setSubscribing] = useState<DurationTier | null>(null);
    const [userSubscriptions, setUserSubscriptions] = useState<Map<DurationTier, any>>(new Map());
    const { address: userAddress, isConnected } = useAccount();
    const { data: balance, isLoading: balanceLoading } = useBalance({
        address: userAddress,
    });

    // Format ETH display
    const formatEthPrice = (wei: bigint): string => {
        if (wei === 0n) return '0';
        const eth = Number(wei) / 1e18;
        return eth.toFixed(4);
    };

    // Format balance display
    const formatBalance = (): string => {
        if (!balance) return '0.0000';
        return formatEthPrice(balance.value);
    };

    // Format timestamp
    const formatTimestamp = (timestamp: bigint): string => {
        const date = new Date(Number(timestamp) * 1000);
        return date.toLocaleString('en-US');
    };

    function handleOk(){
        setVisible(false);
    }
    
    function handleAfterClose(){
        setVisible(false);
    }
    
    function handleCancel(){
        setVisible(false);
    }

    async function loadChannelInfo(){
        try {
            setLoading(true);
            setError(null);
            const channel = await ContractService.getChannel(channelId);
            setChannelInfo(channel);
            console.log('Channel info loaded:', channel);
            
            // If user is connected, load user subscription info
            if (isConnected && userAddress && channel.nftContract) {
                await loadUserSubscriptions(channel.nftContract);
            }
        } catch (err) {
            console.error('Failed to load channel info:', err);
            setError('Failed to load channel info, please try again');
        } finally {
            setLoading(false);
        }
    }

    async function loadUserSubscriptions(nftContractAddress: string) {
        try {
            if (!userAddress) return;
            
            console.log('Loading user subscriptions for NFT contract:', nftContractAddress);
            
            // Get user's valid subscription NFT tokenIds
            const tokenIds = await ContractService.getUserValidSubscriptions(nftContractAddress, userAddress);
            console.log('User valid subscriptions tokenIds:', tokenIds);
            
            const subscriptions = new Map<DurationTier, any>();
            
            // Iterate through each tokenId, check if it belongs to current channel and is valid
            for (const tokenId of tokenIds) {
                try {
                    // Use NFT contract address to directly get subscription info
                    const subscription = await getSubscriptionFromNFTContract(nftContractAddress, tokenId);
                    console.log('Subscription details for tokenId', tokenId.toString(), ':', subscription);
                    
                    // Check if belongs to current channel
                    if (subscription.channelId === channelId) {
                        // Check if subscription is still valid (not expired)
                        const isValid = await isSubscriptionValidFromNFTContract(nftContractAddress, tokenId);
                        console.log(`TokenId ${tokenId.toString()} is valid:`, isValid);
                        
                        if (isValid) {
                            // Ensure tier is correct type
                            const tier = Number(subscription.tier) as DurationTier;
                            subscriptions.set(tier, {
                                ...subscription,
                                tokenId,
                                isValid,
                                expiresAt: subscription.expiresAt
                            });
                            console.log(`Added valid subscription for tier ${tier}`);
                        }
                    }
                } catch (err) {
                    console.warn('Failed to get subscription details for tokenId', tokenId.toString(), ':', err);
                }
            }
            
            setUserSubscriptions(subscriptions);
            console.log('Final user subscriptions loaded:', Array.from(subscriptions.entries()));
        } catch (err) {
            console.error('Failed to load user subscriptions:', err);
        }
    }

    async function openModal(){
        setVisible(true);
        await loadChannelInfo();
    }

    // Subscription handler function
    const handleSubscribe = async (tier: DurationTier) => {
        if (!isConnected) {
            Toast.error('Please connect wallet first');
            return;
        }

        if (!channelInfo) {
            Toast.error('Channel info loading failed');
            return;
        }

        // Find corresponding tier info
        const tierInfo = channelInfo.tiers.find(t => t.tier === tier);
        if (!tierInfo) {
            Toast.error('Cannot find corresponding subscription tier');
            return;
        }

        // Check if balance is sufficient
        if (balance && balance.value < tierInfo.price) {
            Toast.error('Insufficient wallet balance, cannot complete subscription');
            return;
        }

        try {
            setSubscribing(tier);
            const paymentAmount = formatEthPrice(tierInfo.price);
            
            console.log('Starting subscription:', {
                channelId: channelId.toString(),
                tier,
                paymentAmount,
                tierName: TIER_NAMES[tier]
            });

            const result = await ContractService.subscribe(
                channelId,
                tier,
                paymentAmount
            );

            if (result.success) {
                Toast.success(`Successfully subscribed to ${TIER_NAMES[tier]} tier!`);
                // Refresh channel info and user subscription info
                await loadChannelInfo();
            } else {
                Toast.error(`Subscription failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Subscription failed:', error);
            Toast.error(`Subscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSubscribing(null);
        }
    };

    // Render subscription tier cards
    const renderTierCard = (tier: any) => {
        const tierName = TIER_NAMES[tier.tier as DurationTier] || `Tier ${tier.tier}`;
        const tierDescription = TIER_DESCRIPTIONS[tier.tier as DurationTier] || 'Subscription Plan';
        const tierKey = Number(tier.tier) as DurationTier;
        const userSubscription = userSubscriptions.get(tierKey);
        const hasValidSubscription = userSubscription && userSubscription.isValid;
        
        // Debug info
        console.log('Rendering tier card:', {
            tier: tier.tier,
            tierKey,
            tierName,
            userSubscription,
            hasValidSubscription,
            userSubscriptions: Array.from(userSubscriptions.entries())
        });
        
        return (
            <Card 
                key={tier.tier}
                className="tier-card"
                bodyStyle={{ padding: '20px' }}
            >
                <div className="tier-header">
                    <Title heading={5} style={{ margin: 0 }}>
                        {tierName}
                    </Title>
                    <Text type="secondary" size="small">
                        {tierDescription}
                    </Text>
                </div>

                <Divider margin="16px" />

                <div className="tier-content">
                    <div className="price-display">
                        <span className="price-amount">
                            {formatEthPrice(tier.price)}
                        </span>
                        <span className="price-unit">ETH</span>
                    </div>
                    
                    {/* Owned subscription info */}
                    {hasValidSubscription && (
                        <div className="subscription-info" style={{ marginTop: '8px', textAlign: 'center' }}>
                            <Text type="success" size="small" strong>
                                ✓ Already own this tier subscription
                            </Text>
                            <div style={{ marginTop: '4px' }}>
                                <Text type="secondary" size="small">
                                    Expires at: {formatTimestamp(userSubscription.expiresAt)}
                                </Text>
                            </div>
                        </div>
                    )}
                    
                    {/* Balance check prompt */}
                    {!hasValidSubscription && isConnected && balance && (
                        <div className="balance-check" style={{ marginTop: '8px', textAlign: 'center' }}>
                            {balance.value >= tier.price ? (
                                <Text type="success" size="small">
                                    ✓ Sufficient balance
                                </Text>
                            ) : (
                                <Text type="danger" size="small">
                                    ✗ Insufficient balance
                                </Text>
                            )}
                        </div>
                    )}
                    
                    <Button 
                        theme={hasValidSubscription ? "borderless" : "solid"}
                        type={hasValidSubscription ? "tertiary" : "primary"}
                        onClick={() => handleSubscribe(tier.tier)}
                        loading={subscribing === tier.tier}
                        disabled={hasValidSubscription || subscribing !== null || !isConnected || (balance && balance.value < tier.price)}
                        style={{ 
                            width: '100%', 
                            marginTop: '16px',
                            opacity: hasValidSubscription ? 0.6 : 1
                        }}
                    >
                        {hasValidSubscription ? 'Subscribed' :
                         !isConnected ? 'Please connect wallet first' : 
                         subscribing === tier.tier ? 'Subscribing...' : 
                         (balance && balance.value < tier.price) ? 'Insufficient balance' : 'Subscribe Now'}
                    </Button>
                </div>
            </Card>
        );
    };

    return (
        <>
            <Modal
                title="Channel Subscription"
                visible={visible}
                onOk={handleOk}
                afterClose={handleAfterClose}
                onCancel={handleCancel}
                closeOnEsc={true}
                width={800}
                style={{ maxHeight: '80vh' }}
            >
                <div className="channel-subscribe-modal">
                    {loading && (
                        <div className="loading-container">
                            <Spin size="large" />
                            <Text style={{ marginTop: '16px' }}>Loading channel info...</Text>
                        </div>
                    )}

                    {error && (
                        <div 
                            style={{ 
                                marginBottom: '16px',
                                padding: '12px',
                                backgroundColor: 'var(--semi-color-danger-light-1)',
                                border: '1px solid var(--semi-color-danger)',
                                borderRadius: '6px',
                                color: 'var(--semi-color-danger)'
                            }}
                        >
                            <Text type="danger">Loading failed: {error}</Text>
                        </div>
                    )}

                    {channelInfo && !loading && (
                        <div className="channel-info">
                            <div className="channel-header">
                                <Title heading={4}>Channel Info</Title>
                                <div className="channel-details">
                                    <Text type="secondary">
                                        Channel ID: {channelInfo.channelId.toString()}
                                    </Text>
                                    <Text type="secondary">
                                        Created at: {formatTimestamp(channelInfo.createdAt)}
                                    </Text>
                                    <Text type="secondary">
                                        Current wallet: {isConnected ? userAddress : 'Wallet not connected'}
                                    </Text>
                                    <Text type="secondary">
                                        Wallet balance: {isConnected ? (balanceLoading ? 'Loading...' : `${formatBalance()} ETH`) : 'Wallet not connected'}
                                    </Text>
                                </div>
                            </div>

                            <Divider margin="24px" />

                            <div className="subscription-tiers">
                                <Title heading={5} style={{ marginBottom: '16px' }}>
                                    Subscription Tiers
                                </Title>
                                
                                {channelInfo.tiers && channelInfo.tiers.length > 0 ? (
                                    <div className="tiers-grid">
                                        {channelInfo.tiers.map(renderTierCard)}
                                    </div>
                                ) : (
                                    <div 
                                        style={{ 
                                            padding: '12px',
                                            backgroundColor: 'var(--semi-color-warning-light-1)',
                                            border: '1px solid var(--semi-color-warning)',
                                            borderRadius: '6px',
                                            color: 'var(--semi-color-warning)'
                                        }}
                                    >
                                        <Text type="warning">No subscription tiers - This channel has not set up subscription tiers yet</Text>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
            
            <Button theme='solid' type='primary' onClick={() => openModal()}>
                Subscribe
            </Button>
        </>
    );
}