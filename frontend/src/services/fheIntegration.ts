/**
 * FHE（全同态加密）集成服务
 * 
 * 本文件提供了与ZAMA FHE库的集成，用于加密和解密数据
 */

import { BrowserProvider } from 'ethers';
import { initSDK, createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk/bundle';
import type { FhevmInstance } from '@zama-fhe/relayer-sdk/bundle';
import contractService from "./contractService"
/**
 * FHE服务类
 */
export class FHEService {
  private static instance: FHEService;
  private fhevmInstance: FhevmInstance | null = null;
  private isInitialized = false;

  private constructor() { }

  /**
   * 获取FHE服务单例
   */
  static getInstance(): FHEService {
    if (!FHEService.instance) {
      FHEService.instance = new FHEService();
    }
    return FHEService.instance;
  }

  /**
   * 初始化FHE实例
   */
  async initialize(provider: BrowserProvider): Promise<void> {
    try {
      if (this.isInitialized && this.fhevmInstance) {
        return;
      }

      console.log('正在初始化FHE...');

      // 初始化FHEVM
      await initSDK();

      // 获取网络信息
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // 创建FHE实例
      this.fhevmInstance = await createInstance({
        ...SepoliaConfig,
        network: window.ethereum
      });

      this.isInitialized = true;
      console.log('FHE初始化成功');

    } catch (error) {
      console.error('FHE初始化失败:', error);
      throw new Error('FHE初始化失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
  /** Create encrypted input instance */
  createEncryptedInput(userAddress: string) {
    if (!this.isInitialized) throw new Error("FHE service not initialized");
    return this.getFhevmInstance().createEncryptedInput(contractService.getContractAddresses().FHESubscriptionManager, userAddress);
  }

  /**
   * 获取FHE实例
   */
  getFhevmInstance(): FhevmInstance {
    if (!this.fhevmInstance || !this.isInitialized) {
      throw new Error('FHE尚未初始化，请先调用initialize()');
    }
    return this.fhevmInstance;
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized && this.fhevmInstance !== null;
  }



  /**
   * 重置FHE实例
   */
  reset(): void {
    this.fhevmInstance = null;
    this.isInitialized = false;
    console.log('FHE实例已重置');
  }
}

/**
 * FHE辅助函数
 */
export const FHEHelpers = {
  /**
   * 创建并初始化FHE服务
   */
  async createAndInitialize(provider: BrowserProvider): Promise<FHEService> {
    const service = FHEService.getInstance();
    await service.initialize(provider);
    return service;
  },


  /**
   * 检查FHE服务状态
   */
  getStatus(): {
    isReady: boolean;
    message: string;
  } {
    const service = FHEService.getInstance();
    const isReady = service.isReady();

    return {
      isReady,
      message: isReady ? 'FHE服务已就绪' : 'FHE服务尚未初始化'
    };
  }
};

// 导出默认实例
export default FHEService;
