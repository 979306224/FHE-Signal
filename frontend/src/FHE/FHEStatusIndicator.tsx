import { Tag, Tooltip, Button } from '@douyinfe/semi-ui';
import { IconRefresh, IconClock ,IconTick,IconClose} from '@douyinfe/semi-icons';
import { useFHE, FHEStatus } from './fheContext';

interface FHEStatusIndicatorProps {
  showLabel?: boolean;
  size?: 'small' | 'large';
}

export function FHEStatusIndicator({ showLabel = true, size = 'small' }: FHEStatusIndicatorProps) {
  const { status, error, initializeFHE } = useFHE();

  const getStatusConfig = () => {
    switch (status) {
      case FHEStatus.IDLE:
        return {
          color: 'grey' as any,
          icon: <IconClock />,
          text: 'FHE Not Initialized',
          description: 'FHE SDK not yet initialized'
        };
      case FHEStatus.LOADING:
        return {
          color: 'blue' as any,
          icon: <IconRefresh spin />,
          text: 'FHE Initializing',
          description: 'Loading FHE SDK...'
        };
      case FHEStatus.READY:
        return {
          color: 'teal' as any,
          icon: <IconTick />,
          text: 'FHE Ready',
          description: 'FHE SDK successfully initialized'
        };
      case FHEStatus.ERROR:
        return {
          color: 'red' as any,
          icon: <IconClose  />,
          text: 'FHE Initialization Failed',
          description: error || 'Error occurred during initialization'
        };
      default:
        return {
          color: 'grey',
          icon: <IconClock />,
          text: 'Unknown Status',
          description: 'Unable to determine FHE status'
        };
    }
  };

  const config = getStatusConfig();
  const isError = status === FHEStatus.ERROR;

  const statusElement = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Tag 
        color={config.color}
        size={size}
        prefixIcon={config.icon}
      >
        {showLabel && config.text}
      </Tag>
      {isError && (
        <Button
          type="tertiary"
          theme="borderless"
          icon={<IconRefresh />}
          size="small"
          onClick={initializeFHE}
          style={{ padding: '4px' }}
        />
      )}
    </div>
  );

  return (
    <Tooltip content={config.description} position="bottom">
      {statusElement}
    </Tooltip>
  );
}
