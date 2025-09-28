import { Button, Card, Checkbox, Input, Space, TextArea, Typography } from '@douyinfe/semi-ui';
import { memo, useCallback, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { ContractService, DurationTier, PinataService, type DurationTier as DurationTierValue } from '../services';

type CreateChannelCardProps = {
  onSuccess?: () => void;
};

type TierFormState = {
  tier: DurationTierValue;
  label: string;
  enabled: boolean;
  price: string;
};

type UploadResult = {
  cid: string;
  ipfsGatewayUrl: string;
  ipfsUri: string;
};

type FeedbackState = {
  type: 'success' | 'warning' | 'danger';
  message: string;
};

const FEEDBACK_COLORS = {
  success: {
    border: 'var(--semi-color-success-border-default, #3eaf7c)',
    background: 'var(--semi-color-success-light-default, rgba(62, 175, 124, 0.1))',
    text: 'var(--semi-color-success-text-default, #2a7a54)'
  },
  warning: {
    border: 'var(--semi-color-warning-border-default, #f5a623)',
    background: 'var(--semi-color-warning-light-default, rgba(245, 166, 35, 0.12))',
    text: 'var(--semi-color-warning-text-default, #915d10)'
  },
  danger: {
    border: 'var(--semi-color-danger-border-default, #ff6f6f)',
    background: 'var(--semi-color-danger-light-default, rgba(255, 111, 111, 0.12))',
    text: 'var(--semi-color-danger-text-default, #ae2e24)'
  }
} as const;

function createDefaultTierConfigs(): TierFormState[] {
  return [
    {
      tier: DurationTier.OneDay,
      label: ContractService.getDurationTierName(DurationTier.OneDay),
      enabled: false,
      price: ''
    },
    {
      tier: DurationTier.Month,
      label: ContractService.getDurationTierName(DurationTier.Month),
      enabled: false,
      price: ''
    },
    {
      tier: DurationTier.Quarter,
      label: ContractService.getDurationTierName(DurationTier.Quarter),
      enabled: false,
      price: ''
    },
    {
      tier: DurationTier.HalfYear,
      label: ContractService.getDurationTierName(DurationTier.HalfYear),
      enabled: false,
      price: ''
    },
    {
      tier: DurationTier.Year,
      label: ContractService.getDurationTierName(DurationTier.Year),
      enabled: false,
      price: ''
    }
  ];
}

function CreateChannelCard({ onSuccess }: CreateChannelCardProps) {
  const { isConnected } = useAccount();
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [tierConfigs, setTierConfigs] = useState<TierFormState[]>(() => createDefaultTierConfigs());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ipfsResult, setIpfsResult] = useState<UploadResult | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const feedbackStyle = useMemo(() => {
    if (!feedback) {
      return null;
    }
    return FEEDBACK_COLORS[feedback.type];
  }, [feedback]);

  const resetForm = useCallback(() => {
    setProjectName('');
    setDescription('');
    setTierConfigs(createDefaultTierConfigs());
  }, []);

  const handleTierToggle = useCallback((tier: DurationTierValue, enabled: boolean) => {
    setTierConfigs(prev => prev.map(item => {
      if (item.tier !== tier) {
        return item;
      }
      return {
        ...item,
        enabled,
        price: enabled ? item.price : ''
      };
    }));
  }, []);

  const handlePriceChange = useCallback((tier: DurationTierValue, value: string) => {
    setTierConfigs(prev => prev.map(item => (item.tier === tier ? { ...item, price: value } : item)));
  }, []);

  const handleCreateChannel = useCallback(async () => {
    if (!isConnected) {
      setFeedback({ type: 'warning', message: 'Please connect wallet first' });
      return;
    }

    const trimmedProjectName = projectName.trim();
    const trimmedDescription = description.trim();

    if (!trimmedProjectName) {
      setFeedback({ type: 'warning', message: 'Please enter project name' });
      return;
    }

    if (!trimmedDescription) {
      setFeedback({ type: 'warning', message: 'Please enter project description' });
      return;
    }

    const enabledTiers = tierConfigs.filter(item => item.enabled);
    if (enabledTiers.length === 0) {
      setFeedback({ type: 'warning', message: 'Please enable at least one subscription tier and set price' });
      return;
    }

    const invalidTier = enabledTiers.find(item => {
      if (!item.price.trim()) {
        return true;
      }
      const priceNumber = Number(item.price);
      return Number.isNaN(priceNumber) || priceNumber <= 0;
    });

    if (invalidTier) {
      setFeedback({ type: 'warning', message: 'Subscription price must be a number greater than 0' });
      return;
    }

    setIsSubmitting(true);
    setIpfsResult(null);
    setFeedback(null);

    try {
      const metadata = await PinataService.uploadJson({
        projectName: trimmedProjectName,
        description: trimmedDescription,
        createdAt: new Date().toISOString()
      });

      setIpfsResult(metadata);

      const tiers = enabledTiers.map(item => ({
        tier: item.tier,
        price: ContractService.etherToWei(item.price),
        subscribers: BigInt(0)
      }));

      const result = await ContractService.createChannel(metadata.ipfsUri, tiers);

      if (result.success) {
        setFeedback({ type: 'success', message: 'Channel created successfully, metadata uploaded to IPFS' });
        resetForm();
        onSuccess?.();
      } else {
        setFeedback({ type: 'danger', message: `Channel creation failed: ${result.error ?? 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Channel creation exception:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred during channel creation';
      setFeedback({ type: 'danger', message });
    } finally {
      setIsSubmitting(false);
    }
  }, [description, isConnected, onSuccess, projectName, resetForm, tierConfigs]);

  return (
    <Card
      title="Create Channel"
      style={{ width: '100%', maxWidth: 720 }}
      headerStyle={{ fontSize: 20 }}
    >
      <Space vertical style={{ width: '100%' }} size="large">
        {feedback && feedbackStyle && (
          <div
            style={{
              border: `1px solid ${feedbackStyle.border}`,
              background: feedbackStyle.background,
              color: feedbackStyle.text,
              padding: '12px 16px',
              borderRadius: 8
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>{feedback.message}</span>
              <button
                type="button"
                style={{
                  border: 'none',
                    background: 'transparent',
                  color: feedbackStyle.text,
                  cursor: 'pointer',
                  fontSize: 16
                }}
                onClick={() => setFeedback(null)}
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div>
          <Typography.Title heading={5} style={{ marginBottom: 12 }}>
            Channel Metadata
          </Typography.Title>
          <Input
            placeholder="Please enter project name, e.g.: AI Prediction Market"
            value={projectName}
            maxLength={80}
            showClear
            onChange={value => setProjectName(value)}
          />
          <TextArea
            placeholder="Please enter project description, will be uploaded to IPFS along with subscription info"
            value={description}
            rows={5}
            maxLength={500}
            showClear
            style={{ marginTop: 12 }}
            onChange={value => setDescription(value)}
          />
          <Typography.Text type="tertiary" style={{ marginTop: 8, display: 'block' }}>
            After submission, the above information will be uploaded to IPFS first, and the obtained address will be written to the contract.
          </Typography.Text>
        </div>

        <div>
          <Typography.Title heading={5}>Subscription Tiers</Typography.Title>
          <Space wrap>
            {tierConfigs.map(item => (
              <Card key={item.tier} type="inner" style={{ backgroundColor: 'var(--semi-color-fill-0)' }}>
                <Space vertical style={{ width: '100%' }}>
                  <Checkbox
                    checked={item.enabled}
                    onChange={event => handleTierToggle(item.tier, event.target.checked)}
                  >
                    Enable {item.label}
                  </Checkbox>
                  <Input
                    placeholder="Please enter unit price for this tier, e.g. 0.1"
                    suffix="ETH"
                    disabled={!item.enabled}
                    value={item.price}
                    onChange={value => handlePriceChange(item.tier, value)}
                  />
                </Space>
              </Card>
            ))}
          </Space>
        </div>

        <div>
          <Button
            theme="solid"
            type="primary"
            block
            loading={isSubmitting}
            disabled={!isConnected}
            onClick={handleCreateChannel}
          >
            {isConnected ? 'Upload and Create Channel' : 'Please connect wallet first'}
          </Button>
          {!isConnected && (
            <Typography.Text type="warning" style={{ marginTop: 8, display: 'block', textAlign: 'center' }}>
              Please use the button in the top right corner to connect wallet to create channel.
            </Typography.Text>
          )}
        </div>

        {ipfsResult && (
          <Card type="inner" title="IPFS Upload Result">
            <Space vertical style={{ width: '100%' }}>
              <Typography.Text>CID：{ipfsResult.cid}</Typography.Text>
              <Typography.Text>
                Gateway Address:
                <a href={ipfsResult.ipfsGatewayUrl} target="_blank" rel="noreferrer">
                  {ipfsResult.ipfsGatewayUrl}
                </a>
              </Typography.Text>
              <Typography.Text>URI：{ipfsResult.ipfsUri}</Typography.Text>
            </Space>
          </Card>
        )}
      </Space>
    </Card>
  );
}

export default memo(CreateChannelCard);

