import { useState, useCallback, useEffect } from "react";
import { Row, Col, Spin, Empty, Typography, Space, Toast } from "@douyinfe/semi-ui";
import { IconRefresh } from "@douyinfe/semi-icons";

import "./ChannelList.less";
import CreateChannelDialog from "../components/CreateChannelDialog";
import ChannelCard from "../components/ChannelCard";
import { ContractService, PinataService } from "../services";
import type { Channel } from "../types/contracts";
import type { IPFSChannel } from "../types/ipfs";

const { Title } = Typography;

interface ChannelWithIPFS extends Channel {
  ipfsData?: IPFSChannel;
}

export function ChannelList() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [channels, setChannels] = useState<ChannelWithIPFS[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChannelCreated = useCallback(() => {
    // Trigger refresh
    setRefreshKey(prev => prev + 1);
    console.log('Channel created successfully, triggering list refresh');
  }, []);

  const loadChannels = useCallback(async () => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Starting to load channel list...');
      
      // Get all channel basic information
      const channelData = await ContractService.getChannels();
      console.log(`Successfully fetched ${channelData.length} channels`);
      
      if (channelData.length === 0) {
        setChannels([]);
        return;
      }

      // Fetch IPFS data in parallel
      const channelsWithIPFS = await Promise.allSettled(
        channelData.map(async (channel) => {
          try {
            const ipfsData = await PinataService.fetchJson<IPFSChannel>(channel.info);
            return { ...channel, ipfsData };
          } catch (ipfsError) {
            console.warn(`Channel ${channel.channelId} IPFS data fetch failed:`, ipfsError);
            return { ...channel, ipfsData: undefined };
          }
        })
      );

      // Process results
      const validChannels: ChannelWithIPFS[] = [];
      channelsWithIPFS.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          validChannels.push(result.value);
        } else {
          console.warn(`Channel ${channelData[index].channelId} processing failed:`, result.reason);
          validChannels.push({ ...channelData[index], ipfsData: undefined });
        }
      });

      setChannels(validChannels);
      console.log('Channel list loading completed');
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to load channel list:', err);
      setError(message);
      Toast.error(`Failed to load channel list: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleViewDetails = useCallback((channelId: bigint) => {

  }, []);

  const handleSubscribe = useCallback((channelId: bigint) => {
    console.log('Subscribe to channel:', channelId.toString());
    // TODO: Implement subscription logic
    Toast.info(`Subscribe to channel ${channelId.toString()}`);
  }, []);


  // Listen for refreshKey changes, reload data
  useEffect(() => {
    loadChannels();
  }, [refreshKey]); // Remove loadChannels dependency to avoid infinite loop

  // Initial load
  useEffect(() => {
    loadChannels();
  }, []); // Empty dependency array, only execute when component mounts

  return (
    <div className="channel-list-container">
      <div className="channel-list-header">
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title heading={3} style={{ margin: 0 }}>
            Channel List
          </Title>
          <Space>
            <CreateChannelDialog onSuccess={handleChannelCreated} />
          </Space>
        </Space>
      </div>

      <div className="channel-list-content">
        {loading ? (
          <div className="channel-list-loading">
            <Spin size="large" />
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Typography.Text type="secondary">
                Loading channel list...
              </Typography.Text>
            </div>
          </div>
        ) : error ? (
          <div className="channel-list-error">
            <Empty
              title="Loading Failed"
              description={`Error loading channel list: ${error}`}
              image={<IconRefresh size="large" />}
              style={{ marginTop: 40 }}
            />
          </div>
        ) : channels.length === 0 ? (
          <div className="channel-list-empty">
            <Empty
              title="No Channels"
              description="No channels yet, create the first one!"
              style={{ marginTop: 40 }}
            />
          </div>
        ) : (
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            {channels.map((channel) => (
              <Col 
                key={channel.channelId.toString()} 
                xs={24} 
                sm={12} 
                md={8} 
                lg={6} 
                xl={6}
              >
                <ChannelCard
                  channel={channel}
                  ipfsData={channel.ipfsData}
                  onViewDetails={handleViewDetails}
                  onSubscribe={handleSubscribe}
                />
              </Col>
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}