import { Modal, Typography, Space, Button, Card, Tag, Avatar, List, Empty, Spin, Toast, Form } from '@douyinfe/semi-ui';
import { IconUser, IconCalendar, IconPlus } from '@douyinfe/semi-icons';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import type { Channel, Topic } from '../types/contracts';
import type { IPFSChannel } from '../types/ipfs';
import { ContractService, PinataService } from '../services';
import { fheService } from '../FHE/fheService';
import { useFHE, FHEStatus } from '../FHE/fheContext';
import { FHEStatusIndicator } from '../FHE/FHEStatusIndicator';
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
  const { status: fheStatus, isReady } = useFHE();
  const fheReady = fheStatus === FHEStatus.READY && isReady();
  
  // 调试FHE状态
  useEffect(() => {
    console.log('FHE状态调试:', {
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
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [showSubmitSignal, setShowSubmitSignal] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<bigint | null>(null);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [submittingSignal, setSubmittingSignal] = useState(false);
  const [signalValue, setSignalValue] = useState<string>('');
  const [formApiRef, setFormApiRef] = useState<any>(null);

  // 使用 useWriteContract hook
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  
  // 等待交易确认
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: pendingTxHash as `0x${string}` | undefined,
  });

  // 处理交易状态变化
  useEffect(() => {
    if (isConfirmed && receipt) {
      console.log('交易确认结果:', receipt);
      if (receipt.status === 'success') {
        Toast.success('信号提交成功！');
        setShowSubmitSignal(false);
        setSelectedTopicId(null);
        setSignalValue('');
        setPendingTxHash(null);
        // 重新加载话题列表
        loadTopics();
      } else {
        console.error('交易失败，receipt:', receipt);
        Toast.error('交易失败，请查看控制台了解详情');
        setPendingTxHash(null);
      }
      setSubmittingSignal(false);
    }
  }, [isConfirmed, receipt]);

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
    if (!userAddress || !selectedTopicId || submittingSignal || isWritePending) return;

    setSubmittingSignal(true);
    try {
      // 使用传入的值或当前状态中的值
      const value = values?.value || signalValue;
      if (!value) {
        Toast.error('请输入信号值');
        setSubmittingSignal(false);
        return;
      }

      const numericValue = Number(value);
      if (isNaN(numericValue)) {
        Toast.error('请输入有效的数值');
        setSubmittingSignal(false);
        return;
      }

      // 检查FHE是否就绪
      if (!fheReady) {
        Toast.error('FHE服务未就绪，请稍后重试');
        setSubmittingSignal(false);
        return;
      }

      // 预检查：验证话题是否存在且未过期
      try {
        const topic = await ContractService.getTopic(selectedTopicId);
        console.log('话题信息:', topic);
        
        const now = Math.floor(Date.now() / 1000);
        if (Number(topic.endDate) <= now) {
          Toast.error('话题已过期，无法提交信号');
          setSubmittingSignal(false);
          return;
        }
        
        // 检查是否已经提交过
        const hasSubmitted = await ContractService.hasSubmitted(selectedTopicId, userAddress);
        if (hasSubmitted) {
          Toast.error('您已经提交过信号了');
          setSubmittingSignal(false);
          return;
        }
        
        // 检查是否在白名单中
        const isInAllowlist = await ContractService.isInAllowlist(topic.channelId, userAddress);
        if (!isInAllowlist) {
          Toast.error('您不在白名单中，无法提交信号');
          setSubmittingSignal(false);
          return;
        }
      } catch (error) {
        console.error('预检查失败:', error);
        Toast.error('无法验证话题信息，请稍后重试');
        setSubmittingSignal(false);
        return;
      }

      // 获取合约地址
      const contractAddresses = ContractService.getContractAddresses();
      const contractAddress = contractAddresses.FHESubscriptionManager;

      // 使用FHE加密信号值 - 按照参考模式
      console.log('开始FHE加密信号值:', {
        value: numericValue,
        contractAddress,
        userAddress,
        topicId: selectedTopicId.toString()
      });
      
      // 验证 FHE 服务状态
      if (!fheService.isReady()) {
        Toast.error('FHE 服务未就绪');
        setSubmittingSignal(false);
        return;
      }
      
      const encryptedInput = fheService.createEncryptedInput(contractAddress, userAddress);
      encryptedInput.add8(numericValue);
      
      const encryptedResult = await encryptedInput.encrypt();
      const encryptedValueHandle = encryptedResult.handles[0];
      const proof = encryptedResult.inputProof;
      
      // 验证加密结果
      if (!encryptedValueHandle || !proof) {
        Toast.error('FHE 加密失败：缺少加密数据或证明');
        setSubmittingSignal(false);
        return;
      }

      // 使用相同的转换函数
      const uint8ArrayToHex = (array: Uint8Array): `0x${string}` => {
        return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
      };

      console.log('FHE加密完成:', { 
        encryptedValue: `Uint8Array(${encryptedValueHandle.length})`,
        proof: `Uint8Array(${proof.length})`,
        encryptedValueHex: uint8ArrayToHex(encryptedValueHandle),
        proofHex: uint8ArrayToHex(proof)
      });
      
      // 获取合约调用配置
      const contractConfig = ContractService.getSubmitSignalConfig(
        selectedTopicId,
        encryptedValueHandle,
        proof
      );

      // 使用 useWriteContract 执行交易
      console.log('提交交易配置:', contractConfig);
      const hash = await writeContractAsync(contractConfig);
      console.log('交易哈希:', hash);
      setPendingTxHash(hash);
      
      Toast.info('交易已提交，等待确认...');
    } catch (error) {
      console.error('提交信号失败:', error);
      
      // 详细的错误信息处理
      let errorMessage = '未知错误';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // 检查常见的合约错误
        if (error.message.includes('TopicNotFound')) {
          errorMessage = '话题不存在';
        } else if (error.message.includes('TopicExpired')) {
          errorMessage = '话题已过期';
        } else if (error.message.includes('NotInAllowlist')) {
          errorMessage = '您不在白名单中，无法提交信号';
        } else if (error.message.includes('AlreadySubmitted')) {
          errorMessage = '您已经提交过信号了';
        } else if (error.message.includes('revert')) {
          errorMessage = '合约调用失败，请检查权限和参数';
        }
      }
      
      Toast.error(`提交信号失败: ${errorMessage}`);
      setSubmittingSignal(false);
    }
  }, [userAddress, selectedTopicId, submittingSignal, signalValue, fheReady, isWritePending, writeContractAsync, loadTopics]);

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
          <Form 
            onSubmit={handleCreateTopic}
            getFormApi={(formApi) => setFormApiRef(formApi)}
          >
            <Form.Input
              field="title"
              label="话题标题"
              placeholder="请输入话题标题"
              rules={[{ required: true, message: '请输入话题标题' }]}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                为话题起一个简洁明了的标题，让用户快速了解话题内容
              </Text>
            </div>
            
            <Form.Input
              field="description"
              label="话题描述"
              placeholder="请输入话题描述"
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                详细描述话题的背景、目的和参与方式，帮助用户理解话题
              </Text>
            </div>
            
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
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                设置话题的结束时间，到期后用户将无法再提交信号
              </Text>
            </div>
            
            <Form.InputNumber
              field="minValue"
              label="最小值"
              placeholder="请输入最小值"
              rules={[{ required: true, message: '请输入最小值' }]}
              style={{ width: '100%' }}
              initValue={1}
              min={1}
              max={100}
              onChange={(value) => {
                // 如果输入值超出1-100范围，自动改为1
                const numValue = Number(value);
                if (value && (numValue < 1 || numValue > 100)) {
                  formApiRef?.setValue('minValue', 1);
                  Toast.warning('最小值超出范围，已自动调整为1');
                }
              }}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                用户可提交信号的最小值，超出范围将自动调整为 默认值
              </Text>
            </div>
            
            <Form.InputNumber
              field="maxValue"
              label="最大值"
              placeholder="请输入最大值"
              rules={[{ required: true, message: '请输入最大值' }]}
              style={{ width: '100%' }}
              initValue={100}
              min={1}
              max={100}
              onChange={(value) => {
                // 如果输入值超出1-100范围，自动改为100
                const numValue = Number(value);
                if (value && (numValue < 1 || numValue > 100)) {
                  formApiRef?.setValue('maxValue', 100);
                  Toast.warning('最大值超出范围，已自动调整为100');
                }
              }}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                用户可提交信号的最大值，超出范围将自动调整为 默认值
              </Text>
            </div>
            
            <Form.InputNumber
              field="defaultValue"
              label="默认值"
              placeholder="请输入默认值"
              rules={[{ required: true, message: '请输入默认值' }]}
              style={{ width: '100%' }}
              initValue={50}
              min={1}
              max={100}
              onChange={(value) => {
                // 如果输入值超出1-100范围，自动改为50
                const numValue = Number(value);
                if (value && (numValue < 1 || numValue > 100)) {
                  formApiRef?.setValue('defaultValue', 50);
                  Toast.warning('默认值超出范围，已自动调整为50');
                }
              }}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                用户提交信号时,如果超出范围会调整到的默认值
              </Text>
            </div>
            
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
              <div style={{ marginTop: 8, padding: 8, backgroundColor: 'var(--semi-color-fill-0)', borderRadius: 4 }}>
                <Space align="center">
                  <Text type="secondary" size="small">FHE状态：</Text>
                  <FHEStatusIndicator showLabel={true} size="small" />
                </Space>
              </div>
            </div>
          )}
          
          <Form onSubmit={handleSubmitSignal}>
            <Form.InputNumber
              field="value"
              label="信号值"
              placeholder="请输入正整数"
              rules={[
                { required: true, message: '请输入信号值' },
                { 
                  validator: (_, value) => {
                    if (value && (value <= 0 || !Number.isInteger(value))) {
                      return new Error('请输入正整数');
                    }
                    return true;
                  }
                }
              ]}
              style={{ width: '100%' }}
              min={1}
              step={1}
              precision={0}
              onChange={(value) => setSignalValue(value ? value.toString() : '')}
            />
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <Text type="tertiary" size="small">
                请输入符合topic设定的正整数，超出范围将自动调整
              </Text>
            </div>
            
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
                loading={submittingSignal || isWritePending || isConfirming}
                disabled={!signalValue || !fheReady || submittingSignal || isWritePending}
              >
                {!fheReady ? 'FHE未就绪' : 
                 isWritePending ? '提交中...' : 
                 isConfirming ? '确认中...' : 
                 '提交信号'}
              </Button>
            </div>
          </Form>
        </Modal>
      </div>
    </Modal>
  );
}
