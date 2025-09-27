import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { FhevmInstance } from '@zama-fhe/relayer-sdk/bundle';
import { fheService } from './fheService';

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

    setStatus(FHEStatus.LOADING);
    setError(null);

    try {
      console.log('[FHE] 准备初始化服务...');
      await fheService.initialize();

      const serviceInstance = fheService.getInstance();
      if (!serviceInstance) {
        throw new Error('FHE服务未初始化');
      }

      setInstance(serviceInstance);
      setStatus(FHEStatus.READY);
      console.log('[FHE] 服务初始化完成');
    } catch (err) {
      console.error('[FHE] 初始化失败', err);
      setInstance(null);
      setError(err instanceof Error ? err.message : '未知错误');
      setStatus(FHEStatus.ERROR);
    }
  };

  const isReady = () => {
    return fheService.isReady();
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
