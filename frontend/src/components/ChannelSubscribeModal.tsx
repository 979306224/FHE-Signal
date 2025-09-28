import { Button, Modal, Card, Typography, Divider, Spin } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { ContractService } from '../services';
import type { Channel } from '../types/contracts';
import { DurationTier } from '../types/contracts';
import './ChannelSubscribeModal.less';

const { Title, Text } = Typography;

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
        } catch (err) {
            console.error('Failed to load channel info:', err);
            setError('加载频道信息失败，请重试');
        } finally {
            setLoading(false);
        }
    }

    async function openModal(){
        setVisible(true);
        await loadChannelInfo();
    }

    // 订阅处理函数
    const handleSubscribe = (tier: DurationTier) => {
        console.log(`订阅档位 ${TIER_NAMES[tier]}`);
        // TODO: 实现订阅逻辑
    };

    // 渲染订阅档位卡片
    const renderTierCard = (tier: any) => {
        const tierName = TIER_NAMES[tier.tier as DurationTier] || `档位 ${tier.tier}`;
        const tierDescription = TIER_DESCRIPTIONS[tier.tier as DurationTier] || '订阅计划';
        
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
                    
                    <Button 
                        theme="solid" 
                        type="primary" 
                        onClick={() => handleSubscribe(tier.tier)}
                        style={{ width: '100%', marginTop: '16px' }}
                    >
                        立即订阅
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