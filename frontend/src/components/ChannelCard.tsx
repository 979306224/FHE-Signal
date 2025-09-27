import { Card, Avatar, Tag, Typography, Space, Button } from '@douyinfe/semi-ui';
import { IconUser, IconCalendar } from '@douyinfe/semi-icons';
import { useMemo, useState } from 'react';
import './ChannelCard.less';
import ChannelDetailModal from './ChannelDetailModal';
import type { Channel } from '../types/contracts';
import type { IPFSChannel } from '../types/ipfs';
import { ContractService } from '../services';

const { Text } = Typography;

interface ChannelCardProps {
  channel: Channel;
  ipfsData?: IPFSChannel;
  onViewDetails?: (channelId: bigint) => void;
  onSubscribe?: (channelId: bigint) => void;
}

export default function ChannelCard({ channel, ipfsData, onViewDetails, onSubscribe }: ChannelCardProps) {
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  const formattedCreatedAt = useMemo(() => {
    return ContractService.formatTimestamp(channel.createdAt);
  }, [channel.createdAt]);

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

  const handleViewDetails = () => {
    setShowDetailModal(true);
    onViewDetails?.(channel.channelId);
  };

  const handleSubscribe = () => {
    onSubscribe?.(channel.channelId);
  };

  return (
    <>
    <div
      style={{ 
        width: '100%', 
        minHeight: 200,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={handleViewDetails}
    >
    <Card
      style={{ 
        border: '1px solid var(--semi-color-border)',
        height: '100%'
      }}
      bodyStyle={{ padding: 16 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 头部信息 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
          <Avatar 
            size="large"
            src={ipfsData?.logo ? ipfsData.logo.replace('ipfs://', 'https://ipfs.io/ipfs/') : undefined}
            style={{ 
              marginRight: 12,
              flexShrink: 0,
              backgroundColor: !ipfsData?.logo ? 'var(--semi-color-primary)' : undefined
            }}
          >
            {!ipfsData?.logo && ipfsData?.name ? ipfsData.name.charAt(0).toUpperCase() : 'C'}
          </Avatar>
          
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Typography.Title 
              heading={4} 
              style={{ 
                margin: 0, 
                marginBottom: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '18px',
                fontWeight: 'bold'
              }}
            >
              {ipfsData?.name || `频道 ${channel.channelId.toString()}`}
            </Typography.Title>
            
            <Text 
              type="tertiary" 
              size="small"
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
                lineHeight: '1.4'
              }}
            >
              {ipfsData?.description || '暂无描述'}
            </Text>
          </div>
        </div>

        {/* 统计信息 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Tag size="small" color="blue">
            <IconUser style={{ marginRight: 4 }} />
            {totalSubscribers.toString()} 订阅者
          </Tag>
          
          <Tag size="small" color="green">
            {channel.topicIds?.length || 0} Topic
          </Tag>
          
          {tierInfo.tierCount > 0 && (
            <Tag size="small" color="orange">
              {tierInfo.minPrice === tierInfo.maxPrice 
                ? `${tierInfo.minPrice} ETH`
                : `${tierInfo.minPrice} - ${tierInfo.maxPrice} ETH`
              }
            </Tag>
          )}
        </div>

        {/* 底部信息 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginTop: 'auto',
          paddingTop: 8
        }}>
          <Space align="center">
            <IconCalendar size="small" style={{ color: 'var(--semi-color-text-3)' }} />
            <Text type="tertiary" size="small">
              {formattedCreatedAt}
            </Text>
          </Space>

          <div onClick={(e) => e.stopPropagation()}>
            <Button 
              theme="borderless" 
              type="primary" 
              size="small"
              onClick={handleSubscribe}
            >
              订阅
            </Button>
          </div>
        </div>
      </div>
    </Card>
    </div>
    
    {/* 频道详情弹窗 */}
    <ChannelDetailModal
      visible={showDetailModal}
      onClose={() => setShowDetailModal(false)}
      channel={channel}
      ipfsData={ipfsData}
    />
  </>
  );
}
