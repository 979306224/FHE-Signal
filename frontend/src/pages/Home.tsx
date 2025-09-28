import { Button, Card, Typography } from '@douyinfe/semi-ui';
import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconLock, IconUserGroup, IconHistogram } from '@douyinfe/semi-icons';

const { Title, Text, Paragraph } = Typography;

function Home() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <Title heading={1} style={{ fontSize: '48px', marginBottom: '20px', color: 'var(--semi-color-text-0)' }}>
          FHE Signal Platform
        </Title>
        <Title heading={3} style={{ fontWeight: 'normal', color: 'var(--semi-color-text-2)', marginBottom: '30px' }}>
          隐私保护的信号订阅平台
        </Title>
        <Paragraph style={{ fontSize: '18px', color: 'var(--semi-color-text-2)', maxWidth: '700px', margin: '0 auto 40px' }}>
          通过全同态加密(FHE)技术，让信号提供者能够在完全保护隐私的情况下贡献数据。
          订阅者只能获得加密后的聚合结果，无法知道单个信号的具体值。
        </Paragraph>
        <Button
          type="primary"
          size="large"
          style={{ padding: '12px 40px', fontSize: '16px' }}
          onClick={() => navigate('/channelList')}
        >
          探索频道
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px', marginBottom: '60px' }}>
        <Card
          style={{ padding: '30px', textAlign: 'center' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <IconLock size="extra-large" style={{ color: '#1890ff', marginBottom: '20px' }} />
          <Title heading={4}>完全隐私保护</Title>
          <Text style={{ color: '#666', marginTop: '10px' }}>
            使用FHE加密技术，信号发送者之间的数据完全隔离，确保个体隐私不被泄露
          </Text>
        </Card>

        <Card
          style={{ padding: '30px', textAlign: 'center' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <IconUserGroup size="extra-large" style={{ color: '#52c41a', marginBottom: '20px' }} />
          <Title heading={4}>权重投票机制</Title>
          <Text style={{ color: '#666', marginTop: '10px' }}>
            频道所有者可以为不同用户设置权重，实现更灵活的信号聚合方式
          </Text>
        </Card>

        <Card
          style={{ padding: '30px', textAlign: 'center' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <IconHistogram size="extra-large" style={{ color: '#fa8c16', marginBottom: '20px' }} />
          <Title heading={4}>加密聚合结果</Title>
          <Text style={{ color: '#666', marginTop: '10px' }}>
            订阅者获得的是经过加密计算的平均值，既保护隐私又提供有价值的洞察
          </Text>
        </Card>
      </div>

      <div style={{ background: '#f0f2f5', padding: '40px', borderRadius: '8px' }}>
        <Title heading={3} style={{ marginBottom: '20px' }}>工作原理</Title>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          <div>
            <Title heading={5}>1. 创建频道与主题</Title>
            <Paragraph style={{ color: '#666' }}>
              频道所有者创建频道并发布主题(Topic)，设置信号值的范围和默认值
            </Paragraph>
          </div>
          <div>
            <Title heading={5}>2. 提交加密信号</Title>
            <Paragraph style={{ color: '#666' }}>
              白名单用户使用FHE加密技术提交信号，数据在链上保持加密状态
            </Paragraph>
          </div>
          <div>
            <Title heading={5}>3. 链上加密计算</Title>
            <Paragraph style={{ color: '#666' }}>
              智能合约在密文状态下计算加权平均值，无需解密原始数据
            </Paragraph>
          </div>
          <div>
            <Title heading={5}>4. 订阅获取结果</Title>
            <Paragraph style={{ color: '#666' }}>
              订阅用户通过NFT凭证访问聚合结果，获得有价值的集体智慧
            </Paragraph>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(Home);
