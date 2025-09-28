import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { FhevmInstance } from '@zama-fhe/relayer-sdk/bundle';
import { fheService } from './fheService';

// Extend Window interface
declare global {
  interface Window {
    ethereum?: any;
  }
}

// FHE status enum
export const FHEStatus = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
} as const;

export type FHEStatusType = typeof FHEStatus[keyof typeof FHEStatus];

// FHE context type definition
interface FHEContextType {
  status: FHEStatusType;
  instance: FhevmInstance | null;
  error: string | null;
  initializeFHE: () => Promise<void>;
  isReady: () => boolean;
}

// Create context
const FHEContext = createContext<FHEContextType | undefined>(undefined);

// FHE Provider component
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
      console.log('[FHE] Preparing to initialize service...');
      await fheService.initialize();

      const serviceInstance = fheService.getInstance();
      if (!serviceInstance) {
        throw new Error('FHE service not initialized');
      }

      setInstance(serviceInstance);
      setStatus(FHEStatus.READY);
      console.log('[FHE] Service initialization completed');
    } catch (err) {
      console.error('[FHE] Initialization failed', err);
      setInstance(null);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus(FHEStatus.ERROR);
    }
  };

  const isReady = () => {
    return fheService.isReady();
  };

  // Auto initialization
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

// Custom hook
export function useFHE() {
  const context = useContext(FHEContext);
  if (context === undefined) {
    throw new Error('useFHE must be used inside FHEProvider');
  }
  return context;
}
