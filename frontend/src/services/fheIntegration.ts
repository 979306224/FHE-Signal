/**
 * FHE（全同态加密）集成服务
 * 
 * 本文件提供了与ZAMA FHE库的集成，用于加密和解密数据
 */

import { BrowserProvider } from 'ethers';
import { getPublicKey, initFhevm, createInstance } from '@zama-fhe/relayer-sdk';
import type { FhevmInstance } from '@zama-fhe/relayer-sdk';

/**
 * FHE服务类
 */
export class FHEService {
  private static instance: FHEService;
  private fhevmInstance: FhevmInstance | null = null;
  private isInitialized = false;

  private constructor() {}

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
      await initFhevm();

      // 获取网络信息
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // 创建FHE实例
      this.fhevmInstance = await createInstance({
        chainId,
        networkUrl: provider.connection?.url || 'https://sepolia.infura.io/v3/your-project-id',
        gatewayUrl: 'https://gateway.zama.ai/' // Zama网关URL
      });

      this.isInitialized = true;
      console.log('FHE初始化成功');

    } catch (error) {
      console.error('FHE初始化失败:', error);
      throw new Error('FHE初始化失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
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
   * 加密uint8值
   */
  async encryptUint8(value: number, contractAddress: string): Promise<{
    data: string;
    proof: string;
  }> {
    try {
      if (!this.isReady()) {
        throw new Error('FHE尚未初始化');
      }

      if (value < 0 || value > 255) {
        throw new Error('值必须在0-255范围内');
      }

      const instance = this.getFhevmInstance();
      
      // 获取合约的公钥
      const publicKey = await getPublicKey(contractAddress);
      
      // 加密值
      const encrypted = await instance.encrypt8(value, publicKey);
      
      return {
        data: '0x' + encrypted.data,
        proof: '0x' + encrypted.proof
      };

    } catch (error) {
      console.error('加密失败:', error);
      throw new Error('加密失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 解密uint8值
   */
  async decryptUint8(
    encryptedValue: string,
    contractAddress: string,
    userAddress: string
  ): Promise<number> {
    try {
      if (!this.isReady()) {
        throw new Error('FHE尚未初始化');
      }

      const instance = this.getFhevmInstance();
      
      // 解密值
      const decrypted = await instance.decrypt8({
        contractAddress,
        ciphertext: encryptedValue,
        userAddress
      });
      
      return decrypted;

    } catch (error) {
      console.error('解密失败:', error);
      throw new Error('解密失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 解密uint64值
   */
  async decryptUint64(
    encryptedValue: string,
    contractAddress: string,
    userAddress: string
  ): Promise<bigint> {
    try {
      if (!this.isReady()) {
        throw new Error('FHE尚未初始化');
      }

      const instance = this.getFhevmInstance();
      
      // 解密值
      const decrypted = await instance.decrypt64({
        contractAddress,
        ciphertext: encryptedValue,
        userAddress
      });
      
      return BigInt(decrypted);

    } catch (error) {
      console.error('解密失败:', error);
      throw new Error('解密失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 批量加密uint8值
   */
  async batchEncryptUint8(
    values: number[],
    contractAddress: string
  ): Promise<Array<{
    data: string;
    proof: string;
  }>> {
    try {
      const results = [];
      
      for (const value of values) {
        const encrypted = await this.encryptUint8(value, contractAddress);
        results.push(encrypted);
      }
      
      return results;

    } catch (error) {
      console.error('批量加密失败:', error);
      throw error;
    }
  }

  /**
   * 验证值是否在有效范围内
   */
  validateUint8Range(value: number, min: number = 0, max: number = 255): boolean {
    return value >= min && value <= max && Number.isInteger(value);
  }

  /**
   * 生成随机的uint8值（用于测试）
   */
  generateRandomUint8(min: number = 0, max: number = 255): number {
    if (min < 0 || max > 255 || min > max) {
      throw new Error('无效的范围参数');
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
   * 快速加密信号值
   */
  async encryptSignalValue(
    value: number,
    contractAddress: string,
    min: number = 0,
    max: number = 255
  ): Promise<{ data: string; proof: string }> {
    const service = FHEService.getInstance();
    
    if (!service.isReady()) {
      throw new Error('FHE服务尚未初始化');
    }

    if (!service.validateUint8Range(value, min, max)) {
      throw new Error(`值${value}不在有效范围[${min}, ${max}]内`);
    }

    return await service.encryptUint8(value, contractAddress);
  },

  /**
   * 快速解密平均值
   */
  async decryptAverageValue(
    encryptedAverage: string,
    contractAddress: string,
    userAddress: string
  ): Promise<number> {
    const service = FHEService.getInstance();
    
    if (!service.isReady()) {
      throw new Error('FHE服务尚未初始化');
    }

    // 平均值存储为uint64，但实际值应该在uint8范围内
    const decryptedBigInt = await service.decryptUint64(encryptedAverage, contractAddress, userAddress);
    return Number(decryptedBigInt);
  },

  /**
   * 格式化加密数据用于显示
   */
  formatEncryptedData(data: string, proof: string): string {
    return `数据: ${data.substring(0, 10)}...\n证明: ${proof.substring(0, 10)}...`;
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
