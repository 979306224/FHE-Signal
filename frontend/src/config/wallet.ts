import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { http } from 'wagmi';

// Configure wallet connection
export const wagmiConfig = getDefaultConfig({
  appName: 'FHE-Signal',
  projectId: '553e815ac742126fab535609dc9b5850', // Please get from WalletConnect Cloud
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
  ssr: false, 
});
