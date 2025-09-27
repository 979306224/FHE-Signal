import { Modal, Typography, Space, Button, Card, Tag, Avatar, List, Empty, Spin, Toast, Form } from '@douyinfe/semi-ui';
import { IconUser, IconCalendar, IconPlus } from '@douyinfe/semi-icons';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import type { Channel, Topic } from '../types/contracts';
import type { IPFSChannel } from '../types/ipfs';
import { ContractService, PinataService } from '../services';
import { fheService } from '../FHE/fheService';
import { useFHE } from '../FHE/fheContext';
import './ChannelDetailModal.less';

const { Title, Text } = Typography;

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
  const { isReady: fheReady } = useFHE();
  const [topics, setTopics] = useState<TopicWithIPFS[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isInAllowlist, setIsInAllowlist] = useState(false);
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [showSubmitSignal, setShowSubmitSignal] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<bigint | null>(null);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [submittingSignal, setSubmittingSignal] = useState(false);
  const [signalValue, setSignalValue] = useState<string>('');

  // 检查用户权限
  useEffect(() => {
    if (!userAddress || !isConnected) {
      setIsOwner(false);
      setIsInAllowlist(false);
      return;
    }

    const checkPermissions = async () => {
      try {
        // 检查是否是频道拥有者
        const ownerStatus = channel.owner.toLowerCase() === userAddress.toLowerCase();
        setIsOwner(ownerStatus);

        // 检查是否在白名单中
        if (!ownerStatus) {
          const allowlistStatus = await ContractService.isInAllowlist(channel.channelId, userAddress);
          setIsInAllowlist(allowlistStatus);
        } else {
          setIsInAllowlist(true); // 拥有者默认在白名单中
        }
      } catch (error) {
        console.error('检查用户权限失败:', error);
      }
    };

    if (visible) {
      checkPermissions();
    }
  }, [channel, userAddress, isConnected, visible]);

  // 加载频道的所有topics
  const loadTopics = useCallback(async () => {
    if (!visible) return;
    
    setLoadingTopics(true);
    try {
      const topicData = await ContractService.getChannelTopics(channel.channelId);
      
      // 并行获取IPFS数据
      const topicsWithIPFS = await Promise.allSettled(
        topicData.map(async (topic) => {
          try {
            const ipfsData = await PinataService.fetchJson<{ title: string; description: string }>(topic.ipfs);
            return { ...topic, ipfsData };
          } catch (ipfsError) {
            console.warn(`Topic ${topic.topicId} IPFS数据获取失败:`, ipfsError);
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

      // 按创建时间倒序排列
      validTopics.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      setTopics(validTopics);
    } catch (error) {
      console.error('加载topics失败:', error);
      Toast.error('加载话题列表失败');
    } finally {
      setLoadingTopics(false);
    }
  }, [channel.channelId, visible]);

  useEffect(() => {
    if (visible) {
      loadTopics();
    }
  }, [visible, loadTopics]);

  const handleCreateTopic = useCallback(async (values: any) => {
    if (!userAddress || creatingTopic) return;

    setCreatingTopic(true);
    try {
      // 上传topic信息到IPFS
      const topicInfo = {
        title: values.title,
        description: values.description
      };
      
      const ipfsResult = await PinataService.uploadJson(topicInfo);
      
      // 创建topic
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
        Toast.success('话题创建成功！');
        setShowCreateTopic(false);
        loadTopics(); // 重新加载topics
      } else {
        Toast.error(`创建话题失败: ${result.error}`);
      }
    } catch (error) {
      console.error('创建话题失败:', error);
      Toast.error('创建话题失败');
    } finally {
      setCreatingTopic(false);
    }
  }, [userAddress, channel.channelId, creatingTopic, loadTopics]);

  const handleSubmitSignal = useCallback(async (values?: any) => {
    if (!userAddress || !selectedTopicId || submittingSignal) return;

    setSubmittingSignal(true);
    try {
      // 使用传入的值或当前状态中的值
      const value = values?.value || signalValue;
      if (!value) {
        Toast.error('请输入信号值');
        return;
      }

      const numericValue = Number(value);
      if (isNaN(numericValue)) {
        Toast.error('请输入有效的数值');
        return;
      }

      // 检查FHE是否就绪
      if (!fheReady) {
        Toast.error('FHE服务未就绪，请稍后重试');
        return;
      }

      // 获取合约地址
      const contractAddresses = ContractService.getContractAddresses();
      const contractAddress = contractAddresses.FHESubscriptionManager;

      // 使用FHE加密信号值
      console.log('开始FHE加密信号值:', numericValue);
      const { encryptedValue, proof } = await fheService.encryptSignalValue(
        numericValue,
        contractAddress,
        userAddress
      );

      console.log('FHE加密完成:', { encryptedValue, proof });
      
      // 提交加密后的信号
      const result = await ContractService.submitSignal(
        selectedTopicId,
        encryptedValue,
        proof
      );

      if (result.success) {
        Toast.success('信号提交成功！');
        setShowSubmitSignal(false);
        setSelectedTopicId(null);
        setSignalValue('');
      } else {
        Toast.error(`提交信号失败: ${result.error}`);
      }
    } catch (error) {
      console.error('提交信号失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      Toast.error(`提交信号失败: ${errorMessage}`);
    } finally {
      setSubmittingSignal(false);
    }
  }, [userAddress, selectedTopicId, submittingSignal, signalValue, fheReady]);

  // 点击话题提交信号
  const handleTopicClick = useCallback((topic: TopicWithIPFS) => {
    if (!isOwner && !isInAllowlist) {
      Toast.warning('您没有权限提交信号');
      return;
    }

    // 检查话题是否已过期
    if (new Date(Number(topic.endDate) * 1000) <= new Date()) {
      Toast.warning('该话题已过期，无法提交信号');
      return;
    }

    // 检查FHE是否就绪
    if (!fheReady) {
      Toast.warning('FHE服务未就绪，请等待FHE初始化完成');
      return;
    }

    setSelectedTopicId(topic.topicId);
    setShowSubmitSignal(true);
  }, [isOwner, isInAllowlist, fheReady]);

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
      title="频道详情"
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      style={{ maxWidth: '90vw' }}
      bodyStyle={{ maxHeight: '80vh', overflowY: 'auto' }}
    >
      <div className="channel-detail-modal">
        {/* 频道基本信息 */}
        <Card style={{ marginBottom: 16 }}>
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
              <Title heading={4} style={{ margin: 0, marginBottom: 8 }}>
                {ipfsData?.name || `频道 ${channel.channelId.toString()}`}
              </Title>
              
              <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
                {ipfsData?.description || '暂无描述'}
              </Text>

              <Space wrap>
                <Tag color="blue">
                  <IconUser style={{ marginRight: 4 }} />
                  {totalSubscribers.toString()} 订阅者
                </Tag>
                
                <Tag color="green">
                  {topics.length} 话题
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
              </Space>

              <div style={{ marginTop: 12 }}>
                <Text type="tertiary" size="small">
                  <IconCalendar style={{ marginRight: 4 }} />
                  创建于 {ContractService.formatTimestamp(channel.createdAt)}
                </Text>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          {isConnected && isOwner && (
            <Space>
              <Button 
                type="primary" 
                icon={<IconPlus />}
                onClick={() => setShowCreateTopic(true)}
              >
                创建话题
              </Button>
            </Space>
          )}
        </Card>

        {/* 话题列表 */}
        <Card title="历史话题">
          {loadingTopics ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : topics.length === 0 ? (
            <Empty 
              title="暂无话题"
              description="该频道还没有创建任何话题"
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
                          {topic.ipfsData?.title || `话题 ${topic.topicId.toString()}`}
                        </Title>
                        <Space>
                          <Tag size="small" color="cyan">
                            ID: {topic.topicId.toString()}
                          </Tag>
                          <Tag size="small" color={isExpired ? 'red' : 'green'}>
                            {isExpired ? '已结束' : '进行中'}
                          </Tag>
                        {canSubmit && (
                          <Tag size="small" color="blue">
                            点击提交信号
                          </Tag>
                        )}
                        {!canSubmit && !isExpired && (isOwner || isInAllowlist) && !fheReady && (
                          <Tag size="small" color="orange">
                            FHE未就绪
                          </Tag>
                        )}
                        {!canSubmit && !isExpired && !(isOwner || isInAllowlist) && (
                          <Tag size="small" color="grey">
                            无权限
                          </Tag>
                        )}
                        </Space>
                      </div>
                      
                      <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
                        {topic.ipfsData?.description || '暂无描述'}
                      </Text>
                      
                      <Space wrap>
                        <Text size="small" type="tertiary">
                          提交数: {topic.submissionCount.toString()}
                        </Text>
                        <Text size="small" type="tertiary">
                          范围: {topic.minValue} - {topic.maxValue}
                        </Text>
                        <Text size="small" type="tertiary">
                          截止: {new Date(Number(topic.endDate) * 1000).toLocaleString('zh-CN')}
                        </Text>
                      </Space>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Card>

        {/* 创建话题弹窗 */}
        <Modal
          title="创建新话题"
          visible={showCreateTopic}
          onCancel={() => setShowCreateTopic(false)}
          footer={null}
          width={600}
        >
          <Form onSubmit={handleCreateTopic}>
            <Form.Input
              field="title"
              label="话题标题"
              placeholder="请输入话题标题"
              rules={[{ required: true, message: '请输入话题标题' }]}
            />
            
            <Form.Input
              field="description"
              label="话题描述"
              placeholder="请输入话题描述"
            />
            
            <Form.Input
              field="endDate"
              label="截止时间"
              type="datetime-local"
              placeholder="请选择截止时间"
              rules={[{ required: true, message: '请选择截止时间' }]}
              initValue={(() => {
                // 默认设置为1个星期后
                const oneWeekLater = new Date();
                oneWeekLater.setDate(oneWeekLater.getDate() + 7);
                // 格式化为 datetime-local 需要的格式 (YYYY-MM-DDTHH:MM)
                return oneWeekLater.toISOString().slice(0, 16);
              })()}
            />
            
            <Form.InputNumber
              field="minValue"
              label="最小值"
              placeholder="请输入最小值"
              rules={[{ required: true, message: '请输入最小值' }]}
              style={{ width: '100%' }}
              initValue={1}
              min={1}
            />
            
            <Form.InputNumber
              field="maxValue"
              label="最大值"
              placeholder="请输入最大值"
              rules={[{ required: true, message: '请输入最大值' }]}
              style={{ width: '100%' }}
              initValue={100}
              min={1}
            />
            
            <Form.InputNumber
              field="defaultValue"
              label="默认值"
              placeholder="请输入默认值"
              rules={[{ required: true, message: '请输入默认值' }]}
              style={{ width: '100%' }}
              initValue={50}
              min={1}
              max={100}
            />
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Button onClick={() => setShowCreateTopic(false)}>
                取消
              </Button>
              <Button htmlType="submit" type="primary" loading={creatingTopic}>
                创建话题
              </Button>
            </div>
          </Form>
        </Modal>

        {/* 提交信号弹窗 */}
        <Modal
          title="提交信号"
          visible={showSubmitSignal}
          onCancel={() => {
            setShowSubmitSignal(false);
            setSelectedTopicId(null);
            setSignalValue('');
          }}
          footer={null}
          width={500}
        >
          {selectedTopicId && (
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--semi-color-fill-0)', borderRadius: 6 }}>
              <Text type="secondary" size="small">正在为以下话题提交信号：</Text>
              <div style={{ marginTop: 4 }}>
                {(() => {
                  const topic = topics.find(t => t.topicId === selectedTopicId);
                  return topic ? (
                    <Text strong>
                      {topic.ipfsData?.title || `话题 ${topic.topicId.toString()}`}
                    </Text>
                  ) : null;
                })()}
              </div>
              {!fheReady && (
                <div style={{ marginTop: 8, padding: 8, backgroundColor: 'var(--semi-color-warning-light-default)', borderRadius: 4 }}>
                  <Text type="warning" size="small">
                    ⚠️ FHE服务未就绪，无法提交加密信号
                  </Text>
                </div>
              )}
            </div>
          )}
          
          <Form onSubmit={handleSubmitSignal}>
            <Form.InputNumber
              field="value"
              label="信号值"
              placeholder="请输入信号值"
              rules={[{ required: true, message: '请输入信号值' }]}
              style={{ width: '100%' }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Button onClick={() => {
                setShowSubmitSignal(false);
                setSelectedTopicId(null);
                setSignalValue('');
              }}>
                取消
              </Button>
              <Button 
                htmlType="submit" 
                type="primary" 
                loading={submittingSignal}
                disabled={!signalValue || !fheReady}
              >
                {!fheReady ? 'FHE未就绪' : '提交信号'}
              </Button>
            </div>
          </Form>
        </Modal>
      </div>
    </Modal>
  );
}
