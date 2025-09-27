import { useCallback } from 'react';
import { InputNumber, Card, Typography, Space, Divider } from '@douyinfe/semi-ui';
import { DurationTier, type TierPrice } from '../types/contracts';
import './SubscriptionPlanSelector.less';

const { Title, Text } = Typography;

// 时长等级显示名称映射
const TIER_NAMES: Record<DurationTier, string> = {
  [DurationTier.OneDay]: '1天',
  [DurationTier.Month]: '1个月', 
  [DurationTier.Quarter]: '3个月',
  [DurationTier.HalfYear]: '6个月',
  [DurationTier.Year]: '1年'
};

// 时长等级描述
const TIER_DESCRIPTIONS: Record<DurationTier, string> = {
  [DurationTier.OneDay]: '体验订阅',
  [DurationTier.Month]: '月度订阅',
  [DurationTier.Quarter]: '季度订阅',
  [DurationTier.HalfYear]: '半年订阅',
  [DurationTier.Year]: '年度订阅'
};

// 推荐标签
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

  // 获取指定等级的价格，如果不存在则返回默认值
  const getTierPrice = useCallback((tier: DurationTier): TierPrice => {
    const existing = tiers.find(t => t.tier === tier);
    return existing || {
      tier,
      price: 0n,
      subscribers: 0n
    };
  }, [tiers]);

  // 更新指定等级的价格
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
      // 价格为0时移除该等级
      if (existingIndex >= 0) {
        newTiers.splice(existingIndex, 1);
      }
    }
    
    onChange(newTiers);
  }, [tiers, onChange]);


  // 格式化ETH显示
  const formatEthPrice = useCallback((wei: bigint): string => {
    if (wei === 0n) return '0';
    const eth = Number(wei) / 1e18;
    return eth.toFixed(4);
  }, []);

  // 将ETH转换为wei
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
                    设置价格 (ETH)
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
                    留空或设为0将不启用此计划
                  </Text>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {tiers.length > 0 && (
        <div className="plan-summary">
          <Title heading={6}>已配置的订阅计划</Title>
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
