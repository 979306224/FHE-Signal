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
          text: 'FHE未初始化',
          description: 'FHE SDK尚未初始化'
        };
      case FHEStatus.LOADING:
        return {
          color: 'blue' as any,
          icon: <IconRefresh spin />,
          text: 'FHE初始化中',
          description: '正在加载FHE SDK...'
        };
      case FHEStatus.READY:
        return {
          color: 'teal' as any,
          icon: <IconTick />,
          text: 'FHE已就绪',
          description: 'FHE SDK已成功初始化'
        };
      case FHEStatus.ERROR:
        return {
          color: 'red' as any,
          icon: <IconClose  />,
          text: 'FHE初始化失败',
          description: error || '初始化过程中发生错误'
        };
      default:
        return {
          color: 'grey',
          icon: <IconClock />,
          text: '未知状态',
          description: '无法确定FHE状态'
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
