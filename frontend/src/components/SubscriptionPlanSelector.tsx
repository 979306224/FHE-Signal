import { useCallback } from 'react';
import { InputNumber, Card, Typography, Space, Divider } from '@douyinfe/semi-ui';
import { DurationTier, type TierPrice } from '../types/contracts';
import './SubscriptionPlanSelector.less';

const { Title, Text } = Typography;

// Duration tier display name mapping
const TIER_NAMES: Record<DurationTier, string> = {
  [DurationTier.OneDay]: '1 Day',
  [DurationTier.Month]: '1 Month', 
  [DurationTier.Quarter]: '3 Months',
  [DurationTier.HalfYear]: '6 Months',
  [DurationTier.Year]: '1 Year'
};

// Duration tier descriptions
const TIER_DESCRIPTIONS: Record<DurationTier, string> = {
  [DurationTier.OneDay]: 'Trial Subscription',
  [DurationTier.Month]: 'Monthly Subscription',
  [DurationTier.Quarter]: 'Quarterly Subscription',
  [DurationTier.HalfYear]: 'Half-Year Subscription',
  [DurationTier.Year]: 'Annual Subscription'
};

// Recommended badges
const TIER_BADGES: Record<DurationTier, string | null> = {
  [DurationTier.OneDay]: null,
  [DurationTier.Month]: null,
  [DurationTier.Quarter]: null,
  [DurationTier.HalfYear]: null,
  [DurationTier.Year]: null
};

interface SubscriptionPlanSelectorProps {
  tiers: TierPrice[];
  onChange: (tiers: TierPrice[]) => void;
}

export default function SubscriptionPlanSelector({ tiers, onChange }: SubscriptionPlanSelectorProps) {

  // Get price for specified tier, return default if not exists
  const getTierPrice = useCallback((tier: DurationTier): TierPrice => {
    const existing = tiers.find(t => t.tier === tier);
    return existing || {
      tier,
      price: 0n,
      subscribers: 0n
    };
  }, [tiers]);

  // Update price for specified tier
  const updateTierPrice = useCallback((tier: DurationTier, price: bigint) => {
    const newTiers = [...tiers];
    const existingIndex = newTiers.findIndex(t => t.tier === tier);
    
    if (price > 0n) {
      const tierPrice: TierPrice = {
        tier,
        price,
        subscribers: 0n
      };
      
      if (existingIndex >= 0) {
        newTiers[existingIndex] = tierPrice;
      } else {
        newTiers.push(tierPrice);
      }
    } else {
      // Remove tier when price is 0
      if (existingIndex >= 0) {
        newTiers.splice(existingIndex, 1);
      }
    }
    
    onChange(newTiers);
  }, [tiers, onChange]);


  // Format ETH display
  const formatEthPrice = useCallback((wei: bigint): string => {
    if (wei === 0n) return '0';
    const eth = Number(wei) / 1e18;
    return eth.toFixed(4);
  }, []);

  // Convert ETH to wei
  const ethToWei = useCallback((eth: number): bigint => {
    return BigInt(Math.floor(eth * 1e18));
  }, []);

  return (
    <div className="subscription-plan-selector">
      <div className="plan-grid">
        {Object.values(DurationTier).map((tier) => {
          if (typeof tier !== 'number') return null;
          
          const tierPrice = getTierPrice(tier);
          const hasPrice = tierPrice.price > 0n;
          const badge = TIER_BADGES[tier];

          return (
            <Card 
              key={tier}
              className={`plan-card ${hasPrice ? 'active' : 'inactive'}`}
              bodyStyle={{ padding: '20px' }}
            >
              <div className="plan-header">
                <div className="plan-title-section">
                  <Title heading={5} style={{ margin: 0 }}>
                    {TIER_NAMES[tier]}
                  </Title>
                  {badge && (
                    <span className="plan-badge">{badge}</span>
                  )}
                </div>
                <Text type="secondary" size="small">
                  {TIER_DESCRIPTIONS[tier]}
                </Text>
              </div>

              <Divider margin="16px" />

              <div className="plan-content">
                {hasPrice && (
                  <div className="price-display">
                    <span className="price-amount">
                      {formatEthPrice(tierPrice.price)}
                    </span>
                    <span className="price-unit">ETH</span>
                  </div>
                )}
                
                <div className="price-input-section">
                  <Text type="secondary" size="small" style={{ marginBottom: 8, display: 'block' }}>
                    Set Price (ETH)
                  </Text>
                  <InputNumber
                    value={hasPrice ? Number(formatEthPrice(tierPrice.price)) : undefined}
                    onChange={(value) => {
                      if (typeof value === 'number' && value >= 0) {
                        updateTierPrice(tier, ethToWei(value));
                      } else if (value === null || value === undefined) {
                        updateTierPrice(tier, 0n);
                      }
                    }}
                    step={0.001}
                    min={0}
                    max={100}
                    precision={4}
                    placeholder="0.0000"
                    style={{ width: '100%' }}
                    suffix="ETH"
                  />
                  <Text type="tertiary" size="small" style={{ marginTop: 4, display: 'block' }}>
                    Leave empty or set to 0 to disable this plan
                  </Text>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {tiers.length > 0 && (
        <div className="plan-summary">
          <Title heading={6}>Configured Subscription Plans</Title>
          <Space wrap>
            {tiers.map((tierPrice) => (
              <div key={tierPrice.tier} className="summary-item">
                <Text strong>{TIER_NAMES[tierPrice.tier]}</Text>
                <Text type="secondary"> - {formatEthPrice(tierPrice.price)} ETH</Text>
              </div>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
}
