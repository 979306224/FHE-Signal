/**
 * FHE (Fully Homomorphic Encryption) Integration Service
 * 
 * This file provides integration with ZAMA FHE library for encrypting and decrypting data
 */

import { BrowserProvider } from 'ethers';
import { initSDK, createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk/bundle';
import type { FhevmInstance } from '@zama-fhe/relayer-sdk/bundle';
import contractService from "./contractService"
/**
 * FHE Service Class
 */
export class FHEService {
  private static instance: FHEService;
  private fhevmInstance: FhevmInstance | null = null;
  private isInitialized = false;

  private constructor() { }

  /**
   * Get FHE service singleton
   */
  static getInstance(): FHEService {
    if (!FHEService.instance) {
      FHEService.instance = new FHEService();
    }
    return FHEService.instance;
  }

  /**
   * Initialize FHE instance
   */
  async initialize(provider: BrowserProvider): Promise<void> {
    try {
      if (this.isInitialized && this.fhevmInstance) {
        return;
      }

      console.log('Initializing FHE...');

      // Initialize FHEVM
      await initSDK();

      // Get network info
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Create FHE instance
      this.fhevmInstance = await createInstance({
        ...SepoliaConfig,
        network: window.ethereum
      });

      this.isInitialized = true;
      console.log('FHE initialization successful');

    } catch (error) {
      console.error('FHE initialization failed:', error);
      throw new Error('FHE initialization failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
  /** Create encrypted input instance */
  createEncryptedInput(userAddress: string) {
    if (!this.isInitialized) throw new Error("FHE service not initialized");
    return this.getFhevmInstance().createEncryptedInput(contractService.getContractAddresses().FHESubscriptionManager, userAddress);
  }

  /**
   * Get FHE instance
   */
  getFhevmInstance(): FhevmInstance {
    if (!this.fhevmInstance || !this.isInitialized) {
      throw new Error('FHE not initialized yet, please call initialize() first');
    }
    return this.fhevmInstance;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.fhevmInstance !== null;
  }



  /**
   * Reset FHE instance
   */
  reset(): void {
    this.fhevmInstance = null;
    this.isInitialized = false;
    console.log('FHE instance has been reset');
  }
}

/**
 * FHE Helper Functions
 */
export const FHEHelpers = {
  /**
   * Create and initialize FHE service
   */
  async createAndInitialize(provider: BrowserProvider): Promise<FHEService> {
    const service = FHEService.getInstance();
    await service.initialize(provider);
    return service;
  },


  /**
   * Check FHE service status
   */
  getStatus(): {
    isReady: boolean;
    message: string;
  } {
    const service = FHEService.getInstance();
    const isReady = service.isReady();

    return {
      isReady,
      message: isReady ? 'FHE service ready' : 'FHE service not initialized yet'
    };
  }
};

// Export default instance
export default FHEService;
