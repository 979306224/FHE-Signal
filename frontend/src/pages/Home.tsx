import { Button, Typography } from '@douyinfe/semi-ui';
import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconLock, IconUserGroup, IconHistogram } from '@douyinfe/semi-icons';
import './Home.less';

const { Title, Text, Paragraph } = Typography;

function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-container">
      <div className="animated-orb orb-1"></div>
      <div className="animated-orb orb-2"></div>
      <div className="animated-orb orb-3"></div>
      <div className="animated-orb orb-4"></div>

      <div className="content-wrapper">
        <div className="hero-section">
          <h1 className="hero-title">
            FHE-Signal
          </h1>
          <h3 className="hero-subtitle">
            Privacy-Preserving Signal Subscription Platform
          </h3>
          <p className="hero-description">
            Through Fully Homomorphic Encryption (FHE) technology, signal providers can contribute data
            while maintaining complete privacy protection. Subscribers only receive encrypted aggregated
            results without knowing individual signal values.
          </p>
          <Button
            type="primary"
            size="large"
            style={{ padding: '12px 40px', fontSize: '16px' }}
            onClick={() => navigate('/channelList')}
          >
            Explore Channels
          </Button>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <IconLock size="extra-large" style={{ color: '#FFD208' }} />
            </div>
            <Title heading={4} className="feature-title">Complete Privacy Protection</Title>
            <Text className="feature-description">
              Using FHE encryption technology, data between signal senders is completely isolated,
              ensuring individual privacy is never compromised
            </Text>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <IconUserGroup size="extra-large" style={{ color: '#FFD208' }} />
            </div>
            <Title heading={4} className="feature-title">Weighted Voting Mechanism</Title>
            <Text className="feature-description">
              Channel owners can set weights for different users, enabling more flexible
              signal aggregation methods
            </Text>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <IconHistogram size="extra-large" style={{ color: '#FFD208' }} />
            </div>
            <Title heading={4} className="feature-title">Encrypted Aggregated Results</Title>
            <Text className="feature-description">
              Subscribers receive encrypted computed averages that protect privacy
              while providing valuable insights
            </Text>
          </div>
        </div>

        <div className="workflow-section">
          <Title heading={3} className="workflow-title">How It Works</Title>
          <div className="workflow-grid">
            <div className="workflow-step">
              <Title heading={5} className="step-title">1. Create Channels & Topics</Title>
              <Paragraph className="step-description">
                Channel owners create channels and publish topics, setting signal value ranges and default values
              </Paragraph>
            </div>
            <div className="workflow-step">
              <Title heading={5} className="step-title">2. Submit Encrypted Signals</Title>
              <Paragraph className="step-description">
                Whitelist users submit signals using FHE encryption technology, keeping data encrypted on-chain
              </Paragraph>
            </div>
            <div className="workflow-step">
              <Title heading={5} className="step-title">3. On-Chain Encrypted Computation</Title>
              <Paragraph className="step-description">
                Smart contracts compute weighted averages in encrypted state without decrypting original data
              </Paragraph>
            </div>
            <div className="workflow-step">
              <Title heading={5} className="step-title">4. Subscribe to Get Results</Title>
              <Paragraph className="step-description">
                Subscribers access aggregated results through NFT credentials, gaining valuable collective wisdom
              </Paragraph>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(Home);
