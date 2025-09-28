import { Avatar, Button, Card, Divider, List, Modal, Skeleton, Space, Tag, Typography } from '@douyinfe/semi-ui';
import { IconHash } from '@douyinfe/semi-icons';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import CreateChannelCard from '../components/CreateChannelCard';
import { ContractService } from '../services';
import type { Channel as ChannelType } from '../types/contracts';

type ChannelMetadata = {
  projectName: string;
  description: string;
  createdAt?: string;
};

type ChannelListItem = {
  channel: ChannelType;
  metadata?: ChannelMetadata;
  metadataError?: string;
};

async function fetchChannel(channelId: number): Promise<ChannelListItem | null> {
  try {
    const channel = await ContractService.getChannel(BigInt(channelId));
    if (!channel?.info) {
      return null;
    }

    let metadata: ChannelMetadata | undefined;
    let metadataError: string | undefined;

    try {
      const response = await fetch(channel.info.replace('ipfs://', 'https://ipfs.io/ipfs/'));
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      metadata = await response.json();
    } catch (error) {
      metadataError = error instanceof Error ? error.message : String(error);
    }

    return { channel, metadata, metadataError };
  } catch (error) {
    console.error(`Failed to fetch channel ${channelId}:`, error);
    return null;
  }
}

type ChannelListProps = {
  refreshKey: number;
};

function ChannelList({ refreshKey }: ChannelListProps) {
  const [items, setItems] = useState<ChannelListItem[]>([]);
  const [loadingIds, setLoadingIds] = useState<number[]>([]);
  const refresh = useCallback(async () => {
    const pendingIds = Array.from({ length: 100 }, (_, index) => index + 1);
    setLoadingIds(pendingIds);

    const results = await Promise.all(pendingIds.map(id => fetchChannel(id)));
    const filtered = results.filter((item): item is ChannelListItem => Boolean(item));

    setItems(filtered);
    setLoadingIds([]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const content = useMemo(() => {
    if (loadingIds.length === 0 && items.length === 0) {
      return <Typography.Text>No channels available.</Typography.Text>;
    }

    if (items.length === 0) {
      return (
        <Space vertical style={{ width: '100%' }}>
          {loadingIds.map(id => (
            <Card key={`skeleton-${id}`}>
              <Skeleton placeholder={<Skeleton.Paragraph rows={3} />} loading />
            </Card>
          ))}
        </Space>
      );
    }

    return (
      <List
        dataSource={items}
        renderItem={({ channel, metadata, metadataError }) => {
          const tierCount = Number(channel.tierCount ?? 0n);
          const createdAt = metadata?.createdAt
            ? new Date(metadata.createdAt).toLocaleString('zh-CN')
            : ContractService.formatTimestamp(channel.createdAt);

          return (
            <List.Item key={channel.channelId.toString()}>
              <Card
                title={metadata?.projectName ?? `Channel #${channel.channelId.toString()}`}
                headerExtraContent={<Tag type="solid">#{channel.channelId.toString()}</Tag>}
              >
                <Space align="start" spacing="medium">
                  <Avatar size="large" color="light-blue">
                    <IconHash />
                  </Avatar>
                  <Space vertical spacing="small" style={{ width: '100%' }}>
                    <Typography.Text type="tertiary">Created: {createdAt}</Typography.Text>
                    <Typography.Paragraph ellipsis={{ rows: 3 }}>
                      {metadata?.description ?? 'IPFS metadata not found, displaying raw contract information.'}
                    </Typography.Paragraph>
                    {metadataError && (
                      <Typography.Text type="danger">Failed to load IPFS metadata: {metadataError}</Typography.Text>
                    )}
                    <Divider margin="12px 0">Subscription Tiers</Divider>
                    {tierCount === 0 && <Typography.Text>No subscription information available</Typography.Text>}
                    <Space wrap>
                      {channel.tiers.slice(0, tierCount || channel.tiers.length).map(tier => (
                        <Tag key={`${channel.channelId.toString()}-${tier.tier}`}>
                          {ContractService.getDurationTierName(tier.tier)} · {ContractService.weiToEther(tier.price)} ETH
                        </Tag>
                      ))}
                    </Space>
                  </Space>
                </Space>
              </Card>
            </List.Item>
          );
        }}
      />
    );
  }, [items, loadingIds]);

  return (
    <div style={{ width: '100%' }}>
      <Typography.Title heading={4}>Channel List</Typography.Title>
      {content}
    </div>
  );
}

function Channel() {
  const [visible, setVisible] = useState(false);
  const [shouldRefresh, setShouldRefresh] = useState(0);

  const handleCreateSuccess = useCallback(() => {
    setVisible(false);
    setShouldRefresh(prev => prev + 1);
  }, []);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title heading={3}>Channel Management</Typography.Title>
        <Button type="primary" theme="solid" onClick={() => setVisible(true)}>
          Create Channel
        </Button>
      </Space>
      <ChannelList refreshKey={shouldRefresh} />
      <Modal
        visible={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        closeOnEsc
        maskClosable
        width={800}
      >
        <CreateChannelCard onSuccess={handleCreateSuccess} />
      </Modal>
    </div>
  );
}

export default memo(Channel);
