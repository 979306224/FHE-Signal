import '@rainbow-me/rainbowkit/styles.css';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { RainbowKitProvider,darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import './App.css';
import Navigation from './components/Navigation';

import { wagmiConfig } from './config/wallet';
import { FHEProvider } from './FHE/fheContext';

// 页面缓存组件
function CachedPage({ children, path }: { children: React.ReactNode; path: string }) {
  const location = useLocation();
  const isActive = location.pathname === path;
  
  return (
    <div style={{ display: isActive ? 'block' : 'none' }}>
      {children}
    </div>
  );
}
import Home from './pages/Home';
import Channel from './pages/Channel';
import { ChannelList } from './pages/ChannelList';
function AppContent() {
  // 使用useMemo缓存页面组件，避免重复创建
  const cachedPages = useMemo(() => ({
    home: <Home />,
    channel: <Channel />,
    channelList: <ChannelList />,
    // about: <About />,
    // contact: <Contact />
  }), []);

  return (
    <div>
      <Navigation />
      <CachedPage path="/">{cachedPages.home}</CachedPage>
      <CachedPage path="/channel">{cachedPages.channel}</CachedPage>
      <CachedPage path="/channelList">{cachedPages.channelList}</CachedPage>
      {/* <CachedPage path="/about">{cachedPages.about}</CachedPage>
      <CachedPage path="/contact">{cachedPages.contact}</CachedPage> */}
    </div>
  );
}

// 创建 QueryClient 实例
const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <FHEProvider>
            <Router>
              <AppContent />
            </Router>
          </FHEProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
