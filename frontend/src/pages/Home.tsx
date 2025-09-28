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
          FHE-Signal
        </Title>
        <Title heading={3} style={{ fontWeight: 'normal', color: 'var(--semi-color-text-2)', marginBottom: '30px' }}>
          Privacy-Preserving Signal Subscription Platform
        </Title>
        <Paragraph style={{ fontSize: '18px', color: 'var(--semi-color-text-2)', maxWidth: '700px', margin: '0 auto 40px' }}>
          Through Fully Homomorphic Encryption (FHE) technology, signal providers can contribute data
          while maintaining complete privacy protection. Subscribers only receive encrypted aggregated
          results without knowing individual signal values.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          style={{ padding: '12px 40px', fontSize: '16px' }}
          onClick={() => navigate('/channelList')}
        >
          Explore Channels
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px', marginBottom: '60px' }}>
        <Card
          style={{ padding: '30px', textAlign: 'center', background: 'var(--semi-color-bg-1)', border: '1px solid var(--semi-color-border)' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <IconLock size="extra-large" style={{ color: 'var(--semi-color-primary)', marginBottom: '20px' }} />
          <Title heading={4}>Complete Privacy Protection</Title>
          <Text style={{ color: 'var(--semi-color-text-2)', marginTop: '10px' }}>
            Using FHE encryption technology, data between signal senders is completely isolated,
            ensuring individual privacy is never compromised
          </Text>
        </Card>

        <Card
          style={{ padding: '30px', textAlign: 'center', background: 'var(--semi-color-bg-1)', border: '1px solid var(--semi-color-border)' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <IconUserGroup size="extra-large" style={{ color: 'var(--semi-color-success)', marginBottom: '20px' }} />
          <Title heading={4}>Weighted Voting Mechanism</Title>
          <Text style={{ color: 'var(--semi-color-text-2)', marginTop: '10px' }}>
            Channel owners can set weights for different users, enabling more flexible
            signal aggregation methods
          </Text>
        </Card>

        <Card
          style={{ padding: '30px', textAlign: 'center', background: 'var(--semi-color-bg-1)', border: '1px solid var(--semi-color-border)' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <IconHistogram size="extra-large" style={{ color: 'var(--semi-color-warning)', marginBottom: '20px' }} />
          <Title heading={4}>Encrypted Aggregated Results</Title>
          <Text style={{ color: 'var(--semi-color-text-2)', marginTop: '10px' }}>
            Subscribers receive encrypted computed averages that protect privacy
            while providing valuable insights
          </Text>
        </Card>
      </div>

      <div style={{ background: 'var(--semi-color-bg-2)', padding: '40px', borderRadius: '8px', border: '1px solid var(--semi-color-border)' }}>
        <Title heading={3} style={{ marginBottom: '20px', color: 'var(--semi-color-text-0)' }}>How It Works</Title>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          <div>
            <Title heading={5}>1. Create Channels & Topics</Title>
            <Paragraph style={{ color: 'var(--semi-color-text-2)' }}>
              Channel owners create channels and publish topics, setting signal value ranges and default values
            </Paragraph>
          </div>
          <div>
            <Title heading={5}>2. Submit Encrypted Signals</Title>
            <Paragraph style={{ color: 'var(--semi-color-text-2)' }}>
              Whitelist users submit signals using FHE encryption technology, keeping data encrypted on-chain
            </Paragraph>
          </div>
          <div>
            <Title heading={5}>3. On-Chain Encrypted Computation</Title>
            <Paragraph style={{ color: 'var(--semi-color-text-2)' }}>
              Smart contracts compute weighted averages in encrypted state without decrypting original data
            </Paragraph>
          </div>
          <div>
            <Title heading={5}>4. Subscribe to Get Results</Title>
            <Paragraph style={{ color: 'var(--semi-color-text-2)' }}>
              Subscribers access aggregated results through NFT credentials, gaining valuable collective wisdom
            </Paragraph>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(Home);
