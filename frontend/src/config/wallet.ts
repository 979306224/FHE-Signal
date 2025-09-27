import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { http } from 'wagmi';

// 配置钱包连接
export const wagmiConfig = getDefaultConfig({
  appName: 'ZAMA-FHE-IPFShare',
  projectId: '553e815ac742126fab535609dc9b5850', // 请从 WalletConnect Cloud 获取
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
  ssr: false, 
});
