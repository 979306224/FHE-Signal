import { Nav } from '@douyinfe/semi-ui';
import { IconHome, IconInfoCircle, IconPhone } from '@douyinfe/semi-icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FHEStatusIndicator } from '../FHE/FHEStatusIndicator'

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();

  // Use useMemo to cache navigation item configuration
  const items = useMemo(() => [
    {
      itemKey: '/',
      text: 'Home',
      icon: <IconHome />,
      to: '/'
    },
    {
      itemKey: '/channelList',
      text: 'Channel',
      icon: <IconInfoCircle />,
      to: '/channelList'
    }
  ], []);

  // Remove 'to' property as Nav component doesn't recognize this attribute
  const navItems = useMemo(() => 
    items.map(({ to, ...item }) => item), [items]);

  return (
    <Nav
      style={{ position: 'relative', zIndex: 1000 }}
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
