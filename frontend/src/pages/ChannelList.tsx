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
    // 触发刷新
    setRefreshKey(prev => prev + 1);
    console.log('频道创建成功，触发列表刷新');
  }, []);

  const loadChannels = useCallback(async () => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('开始加载频道列表...');
      
      // 获取所有频道基本信息
      const channelData = await ContractService.getChannels();
      console.log(`成功获取 ${channelData.length} 个频道`);
      
      if (channelData.length === 0) {
        setChannels([]);
        return;
      }

      // 并行获取IPFS数据
      const channelsWithIPFS = await Promise.allSettled(
        channelData.map(async (channel) => {
          try {
            const ipfsData = await PinataService.fetchJson<IPFSChannel>(channel.info);
            return { ...channel, ipfsData };
          } catch (ipfsError) {
            console.warn(`频道 ${channel.channelId} IPFS数据获取失败:`, ipfsError);
            return { ...channel, ipfsData: undefined };
          }
        })
      );

      // 处理结果
      const validChannels: ChannelWithIPFS[] = [];
      channelsWithIPFS.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          validChannels.push(result.value);
        } else {
          console.warn(`频道 ${channelData[index].channelId} 处理失败:`, result.reason);
          validChannels.push({ ...channelData[index], ipfsData: undefined });
        }
      });

      setChannels(validChannels);
      console.log('频道列表加载完成');
      
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      console.error('加载频道列表失败:', err);
      setError(message);
      Toast.error(`加载频道列表失败: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleViewDetails = useCallback((channelId: bigint) => {

  }, []);

  const handleSubscribe = useCallback((channelId: bigint) => {
    console.log('订阅频道:', channelId.toString());
    // TODO: 实现订阅逻辑
    Toast.info(`订阅频道 ${channelId.toString()}`);
  }, []);


  // 监听refreshKey变化，重新加载数据
  useEffect(() => {
    loadChannels();
  }, [refreshKey]); // 移除loadChannels依赖避免无限循环

  // 初始加载
  useEffect(() => {
    loadChannels();
  }, []); // 空依赖数组，仅在组件挂载时执行

  return (
    <div className="channel-list-container">
      <div className="channel-list-header">
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title heading={3} style={{ margin: 0 }}>
            频道列表
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
                正在加载频道列表...
              </Typography.Text>
            </div>
          </div>
        ) : error ? (
          <div className="channel-list-error">
            <Empty
              title="加载失败"
              description={`加载频道列表时出错: ${error}`}
              image={<IconRefresh size="large" />}
              style={{ marginTop: 40 }}
            />
          </div>
        ) : channels.length === 0 ? (
          <div className="channel-list-empty">
            <Empty
              title="暂无频道"
              description="还没有任何频道，快来创建第一个频道吧！"
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