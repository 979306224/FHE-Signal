import { Card, Avatar, Tag, Typography, Button, Tooltip } from '@douyinfe/semi-ui';
import { IconUser, IconCalendar, IconEyeOpened } from '@douyinfe/semi-icons';
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

  const handleSubscribe = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSubscribe?.(channel.channelId);
  };

  const channelName = ipfsData?.name || `Channel ${channel.channelId.toString()}`;
  const channelDescription = ipfsData?.description || 'No description';

  return (
    <>
      <div className="channel-card-wrapper" onClick={handleViewDetails}>
        <Card className="channel-card" bodyStyle={{ padding: 0, height: '100%' }}>
          {/* Card header - avatar and title area */}
          <div className="card-header">
            <div className="avatar-section">
              <Avatar 
                size="large"
                src={ipfsData?.logo ? ipfsData.logo.replace('ipfs://', 'https://ipfs.io/ipfs/') : undefined}
                className="channel-avatar"
              >
                {!ipfsData?.logo && ipfsData?.name ? ipfsData.name.charAt(0).toUpperCase() : 'C'}
              </Avatar>
            </div>
            
            <div className="title-section">
              <Tooltip content={channelName} position="top">
                <Typography.Title 
                  heading={4} 
                  className="channel-title"
                  ellipsis={{ showTooltip: false }}
                >
                  {channelName}
                </Typography.Title>
              </Tooltip>
              
              <Tooltip content={channelDescription} position="top">
                <Text 
                  type="tertiary" 
                  size="small"
                  className="channel-description"
                  ellipsis={{ showTooltip: false, rows: 2 }}
                >
                  {channelDescription}
                </Text>
              </Tooltip>
            </div>
          </div>

          {/* Statistics tags area */}
          <div className="stats-section">
            <div className="stats-container">
              <Tooltip content={`Total subscribers: ${totalSubscribers.toString()}`} position="top">
                <Tag size="small" color="blue" className="stat-tag">
                  <IconUser className="stat-icon" />
                  <span className="stat-text">{totalSubscribers.toString()}</span>
                </Tag>
              </Tooltip>
              
              <Tooltip content={`Topic count: ${channel.topicIds?.length || 0}`} position="top">
                <Tag size="small" color="green" className="stat-tag">
                  <IconEyeOpened className="stat-icon" />
                  <span className="stat-text">{channel.topicIds?.length || 0}</span>
                </Tag>
              </Tooltip>
              
              {tierInfo.tierCount > 0 && (
                <Tooltip 
                  content={
                    tierInfo.minPrice === tierInfo.maxPrice 
                      ? `Subscription price: ${tierInfo.minPrice} ETH`
                      : `Subscription price range: ${tierInfo.minPrice} - ${tierInfo.maxPrice} ETH`
                  } 
                  position="top"
                >
                  <Tag size="small" color="orange" className="stat-tag">
                    <span className="stat-text">
                      {tierInfo.minPrice === tierInfo.maxPrice 
                        ? `${tierInfo.minPrice} ETH`
                        : `${tierInfo.minPrice}-${tierInfo.maxPrice} ETH`
                      }
                    </span>
                  </Tag>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Card footer - time and action buttons */}
          <div className="card-footer">
            <div className="footer-left">
              <IconCalendar className="footer-icon" />
              <Text type="tertiary" size="small" className="footer-text">
                {formattedCreatedAt}
              </Text>
            </div>

            <div className="footer-right">
              <Button 
                type="primary" 
                size="small"
                className="subscribe-button"
                onClick={handleSubscribe}
              >
                View
              </Button>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Channel detail modal */}
      <ChannelDetailModal
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        channel={channel}
        ipfsData={ipfsData}
      />
    </>
  );
}
