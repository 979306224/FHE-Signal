import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { initSDK, createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk/bundle';
import type { FhevmInstance } from '@zama-fhe/relayer-sdk/bundle';

// 扩展Window接口
declare global {
  interface Window {
    ethereum?: any;
  }
}

// FHE状态枚举
export const FHEStatus = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
} as const;

export type FHEStatusType = typeof FHEStatus[keyof typeof FHEStatus];

// FHE上下文类型定义
interface FHEContextType {
  status: FHEStatusType;
  instance: FhevmInstance | null;
  error: string | null;
  initializeFHE: () => Promise<void>;
  isReady: () => boolean;
}

// 创建上下文
const FHEContext = createContext<FHEContextType | undefined>(undefined);

// FHE Provider组件
interface FHEProviderProps {
  children: ReactNode;
}

export function FHEProvider({ children }: FHEProviderProps) {
  const [status, setStatus] = useState<FHEStatusType>(FHEStatus.IDLE);
  const [instance, setInstance] = useState<FhevmInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initializeFHE = async () => {
    if (status === FHEStatus.LOADING || status === FHEStatus.READY) {
      return;
    }

    try {
      setStatus(FHEStatus.LOADING);
      setError(null);
      
      console.log('🔄 开始初始化FHE SDK...');
      
      // 初始化SDK
      await initSDK();
      console.log('✅ FHE SDK初始化完成');
      
      // 检查是否有以太坊提供者
      if (typeof window !== 'undefined' && window.ethereum) {
        console.log('🔗 检测到以太坊提供者，尝试切换到Sepolia网络...');
        
        // 尝试切换到Sepolia网络
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            // 网络不存在，添加Sepolia网络
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0xaa36a7",
                  chainName: "Sepolia",
                  nativeCurrency: { name: "Sepolia Ether", symbol: "SEP", decimals: 18 },
                  rpcUrls: ["https://rpc.sepolia.org"],
                  blockExplorerUrls: ["https://sepolia.etherscan.io"],
                },
              ],
            });
          } else {
            console.warn("网络切换失败，可能已经在其他网络上:", switchError);
          }
        }
        
        const config = { ...SepoliaConfig, network: window.ethereum };
        const fheInstance = await createInstance(config);
        setInstance(fheInstance);
        setStatus(FHEStatus.READY);
        console.log('✅ FHE实例创建成功（带以太坊提供者）');
      } else {
        console.log('⚠️ 未检测到以太坊提供者，创建基础FHE实例...');
        // 没有钱包连接时也可以初始化FHE，但功能有限
        const fheInstance = await createInstance(SepoliaConfig);
        setInstance(fheInstance);
        setStatus(FHEStatus.READY);
        console.log('✅ FHE基础实例创建成功');
      }
    } catch (err) {
      console.error('❌ FHE初始化失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
      setStatus(FHEStatus.ERROR);
    }
  };

  const isReady = () => {
    return status === FHEStatus.READY && instance !== null;
  };

  // 自动初始化
  useEffect(() => {
    initializeFHE();
  }, []);

  const value: FHEContextType = {
    status,
    instance,
    error,
    initializeFHE,
    isReady
  };

  return (
    <FHEContext.Provider value={value}>
      {children}
    </FHEContext.Provider>
  );
}

// 自定义hook
export function useFHE() {
  const context = useContext(FHEContext);
  if (context === undefined) {
    throw new Error('useFHE必须在FHEProvider内部使用');
  }
  return context;
}
