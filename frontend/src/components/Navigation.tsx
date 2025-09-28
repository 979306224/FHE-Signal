import { Nav } from '@douyinfe/semi-ui';
import { IconHome, IconInfoCircle, IconPhone } from '@douyinfe/semi-icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FHEStatusIndicator } from '../FHE/FHEStatusIndicator'

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();

  // 使用useMemo缓存导航项配置
  const items = useMemo(() => [
    {
      itemKey: '/',
      text: '首页',
      icon: <IconHome />,
      to: '/'
    },
    {
      itemKey: '/channelList',
      text: 'Channel列表',
      icon: <IconInfoCircle />,
      to: '/channelList'
    }
  ], []);

  // 移除 to 属性，因为 Nav 组件不识别这个属性
  const navItems = useMemo(() => 
    items.map(({ to, ...item }) => item), [items]);

  return (
    <Nav
      mode="horizontal"
      selectedKeys={[location.pathname]}
      items={navItems}
      onSelect={(data) => {
        const item = items.find(item => item.itemKey === data.itemKey);
        if (item?.to) {
          navigate(item.to);
        }
      }}
      header={{
        text: 'FHE-Signal'
      }}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FHEStatusIndicator />
          <ConnectButton />
        </div>
      }
    />
  );
}

export default Navigation;
