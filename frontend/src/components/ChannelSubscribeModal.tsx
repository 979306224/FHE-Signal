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

// NFT合约ABI
const CHANNEL_NFT_ABI = parseAbi([
  'function getSubscription(uint256 tokenId) view returns ((uint256 channelId, uint256 expiresAt, uint8 tier, address subscriber, uint256 mintedAt) subscription)',
  'function isSubscriptionValid(uint256 tokenId) view returns (bool)',
  'function getTimeRemaining(uint256 tokenId) view returns (uint256)',
  'function getUserValidSubscriptions(address user) view returns (uint256[])',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)'
]);

// 从NFT合约获取订阅信息
async function getSubscriptionFromNFTContract(nftContractAddress: string, tokenId: bigint): Promise<SubscriptionNFT> {
  const result = await readContract(wagmiConfig, {
    address: nftContractAddress as Address,
    abi: CHANNEL_NFT_ABI,
    functionName: 'getSubscription',
    args: [tokenId]
  });
  
  return result as unknown as SubscriptionNFT;
}

// 从NFT合约检查订阅是否有效
async function isSubscriptionValidFromNFTContract(nftContractAddress: string, tokenId: bigint): Promise<boolean> {
  const result = await readContract(wagmiConfig, {
    address: nftContractAddress as Address,
    abi: CHANNEL_NFT_ABI,
    functionName: 'isSubscriptionValid',
    args: [tokenId]
  });
  
  return result as boolean;
}

// 时长等级显示名称映射
const TIER_NAMES: Record<DurationTier, string> = {
  [DurationTier.OneDay]: '1天',
  [DurationTier.Month]: '1个月', 
  [DurationTier.Quarter]: '3个月',
  [DurationTier.HalfYear]: '6个月',
  [DurationTier.Year]: '1年'
};

// 时长等级描述
const TIER_DESCRIPTIONS: Record<DurationTier, string> = {
  [DurationTier.OneDay]: '体验订阅',
  [DurationTier.Month]: '月度订阅',
  [DurationTier.Quarter]: '季度订阅',
  [DurationTier.HalfYear]: '半年订阅',
  [DurationTier.Year]: '年度订阅'
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

    // 格式化ETH显示
    const formatEthPrice = (wei: bigint): string => {
        if (wei === 0n) return '0';
        const eth = Number(wei) / 1e18;
        return eth.toFixed(4);
    };

    // 格式化余额显示
    const formatBalance = (): string => {
        if (!balance) return '0.0000';
        return formatEthPrice(balance.value);
    };

    // 格式化时间戳
    const formatTimestamp = (timestamp: bigint): string => {
        const date = new Date(Number(timestamp) * 1000);
        return date.toLocaleString('zh-CN');
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
            
            // 如果用户已连接，加载用户的订阅信息
            if (isConnected && userAddress && channel.nftContract) {
                await loadUserSubscriptions(channel.nftContract);
            }
        } catch (err) {
            console.error('Failed to load channel info:', err);
            setError('加载频道信息失败，请重试');
        } finally {
            setLoading(false);
        }
    }

    async function loadUserSubscriptions(nftContractAddress: string) {
        try {
            if (!userAddress) return;
            
            console.log('Loading user subscriptions for NFT contract:', nftContractAddress);
            
            // 获取用户的有效订阅NFT tokenIds
            const tokenIds = await ContractService.getUserValidSubscriptions(nftContractAddress, userAddress);
            console.log('User valid subscriptions tokenIds:', tokenIds);
            
            const subscriptions = new Map<DurationTier, any>();
            
            // 遍历每个tokenId，检查是否属于当前频道且有效
            for (const tokenId of tokenIds) {
                try {
                    // 使用NFT合约地址直接获取订阅信息
                    const subscription = await getSubscriptionFromNFTContract(nftContractAddress, tokenId);
                    console.log('Subscription details for tokenId', tokenId.toString(), ':', subscription);
                    
                    // 检查是否属于当前频道
                    if (subscription.channelId === channelId) {
                        // 检查订阅是否仍然有效（未过期）
                        const isValid = await isSubscriptionValidFromNFTContract(nftContractAddress, tokenId);
                        console.log(`TokenId ${tokenId.toString()} is valid:`, isValid);
                        
                        if (isValid) {
                            // 确保 tier 是正确的类型
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

    // 订阅处理函数
    const handleSubscribe = async (tier: DurationTier) => {
        if (!isConnected) {
            Toast.error('请先连接钱包');
            return;
        }

        if (!channelInfo) {
            Toast.error('频道信息加载失败');
            return;
        }

        // 找到对应的档位信息
        const tierInfo = channelInfo.tiers.find(t => t.tier === tier);
        if (!tierInfo) {
            Toast.error('找不到对应的订阅档位');
            return;
        }

        // 检查余额是否足够
        if (balance && balance.value < tierInfo.price) {
            Toast.error('钱包余额不足，无法完成订阅');
            return;
        }

        try {
            setSubscribing(tier);
            const paymentAmount = formatEthPrice(tierInfo.price);
            
            console.log('开始订阅:', {
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
                Toast.success(`成功订阅 ${TIER_NAMES[tier]} 档位！`);
                // 刷新频道信息和用户订阅信息
                await loadChannelInfo();
            } else {
                Toast.error(`订阅失败: ${result.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('订阅失败:', error);
            Toast.error(`订阅失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setSubscribing(null);
        }
    };

    // 渲染订阅档位卡片
    const renderTierCard = (tier: any) => {
        const tierName = TIER_NAMES[tier.tier as DurationTier] || `档位 ${tier.tier}`;
        const tierDescription = TIER_DESCRIPTIONS[tier.tier as DurationTier] || '订阅计划';
        const tierKey = Number(tier.tier) as DurationTier;
        const userSubscription = userSubscriptions.get(tierKey);
        const hasValidSubscription = userSubscription && userSubscription.isValid;
        
        // 调试信息
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
                    
                    {/* 已拥有订阅信息 */}
                    {hasValidSubscription && (
                        <div className="subscription-info" style={{ marginTop: '8px', textAlign: 'center' }}>
                            <Text type="success" size="small" strong>
                                ✓ 已拥有此档位订阅
                            </Text>
                            <div style={{ marginTop: '4px' }}>
                                <Text type="secondary" size="small">
                                    到期时间: {formatTimestamp(userSubscription.expiresAt)}
                                </Text>
                            </div>
                        </div>
                    )}
                    
                    {/* 余额检查提示 */}
                    {!hasValidSubscription && isConnected && balance && (
                        <div className="balance-check" style={{ marginTop: '8px', textAlign: 'center' }}>
                            {balance.value >= tier.price ? (
                                <Text type="success" size="small">
                                    ✓ 余额充足
                                </Text>
                            ) : (
                                <Text type="danger" size="small">
                                    ✗ 余额不足
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
                        {hasValidSubscription ? '已订阅' :
                         !isConnected ? '请先连接钱包' : 
                         subscribing === tier.tier ? '订阅中...' : 
                         (balance && balance.value < tier.price) ? '余额不足' : '立即订阅'}
                    </Button>
                </div>
            </Card>
        );
    };

    return (
        <>
            <Modal
                title="频道订阅"
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
                            <Text style={{ marginTop: '16px' }}>加载频道信息中...</Text>
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
                            <Text type="danger">加载失败: {error}</Text>
                        </div>
                    )}

                    {channelInfo && !loading && (
                        <div className="channel-info">
                            <div className="channel-header">
                                <Title heading={4}>频道信息</Title>
                                <div className="channel-details">
                                    <Text type="secondary">
                                        频道ID: {channelInfo.channelId.toString()}
                                    </Text>
                                    <Text type="secondary">
                                        创建时间: {formatTimestamp(channelInfo.createdAt)}
                                    </Text>
                                    <Text type="secondary">
                                        当前钱包: {isConnected ? userAddress : '未连接钱包'}
                                    </Text>
                                    <Text type="secondary">
                                        钱包余额: {isConnected ? (balanceLoading ? '加载中...' : `${formatBalance()} ETH`) : '未连接钱包'}
                                    </Text>
                                </div>
                            </div>

                            <Divider margin="24px" />

                            <div className="subscription-tiers">
                                <Title heading={5} style={{ marginBottom: '16px' }}>
                                    订阅档位
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
                                        <Text type="warning">暂无订阅档位 - 该频道暂未设置订阅档位</Text>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
            
            <Button theme='solid' type='primary' onClick={() => openModal()}>
                订阅
            </Button>
        </>
    );
}