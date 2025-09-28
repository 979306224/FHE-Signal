import { initSDK, createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/bundle";
import type { FhevmInstance, DecryptedResults } from "@zama-fhe/relayer-sdk/bundle";
import type { Signer } from "ethers";
import type { WalletClient } from "viem";

// Extend Window interface
declare global {
  interface Window {
    ethereum?: any;
  }
}

let fheInstance: FhevmInstance | null = null;

function getFheInstance(): FhevmInstance {
  if (!fheInstance) {
    throw new Error("FHE instance not initialized");
  }
  return fheInstance;
}

export class FHEService {
  private static instance: FHEService;
  private isInitialized = false;
  private hasFailed = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): FHEService {
    if (!FHEService.instance) {
      FHEService.instance = new FHEService();
    }
    return FHEService.instance;
  }

  /** Initialize FHE SDK and connect MetaMask to Sepolia */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    const initPromise = this.performInitialization();
    this.initializationPromise = initPromise;

    try {
      await initPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async performInitialization(): Promise<void> {
    this.hasFailed = false;

    try {
      console.log('[FHE] Starting FHE SDK initialization...');
      await initSDK();

      const hasWindow = typeof window !== 'undefined';
      if (!hasWindow) {
        console.log('[FHE] Browser environment not detected, creating basic FHE instance...');
        // Create basic instance in non-browser environment
        const config = SepoliaConfig;
        fheInstance = await createInstance(config);
        this.isInitialized = true;
        console.log('[FHE] FHE basic instance initialization completed');
        return;
      }

      const ethereumProvider = window.ethereum;

      if (!ethereumProvider) {
        console.log('[FHE] Ethereum provider not detected, creating basic FHE instance...');
        // Create basic instance when no wallet
        const config = SepoliaConfig;
        fheInstance = await createInstance(config);
        this.isInitialized = true;
        console.log('[FHE] FHE basic instance initialization completed');
        return;
      }

      try {
        await ethereumProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await ethereumProvider.request({
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
          console.warn('[FHE] Network switch failed, might already be on other network?', switchError);
        }
      }

      const config = { ...SepoliaConfig, network: ethereumProvider };
      fheInstance = await createInstance(config);

      this.isInitialized = true;
      console.log('[FHE] FHE SDK initialization completed');
    } catch (err) {
      console.error('[FHE] FHE SDK initialization failed', err);
      this.hasFailed = true;
      throw err;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.initialize();

    if (!this.isInitialized) {
      throw new Error("FHE service not initialized");
    }
  }

  /** Create encrypted input instance */
  createEncryptedInput(contractAddress: string, userAddress: string) {
    if (!this.isInitialized) throw new Error("FHE service not initialized");
    return getFheInstance().createEncryptedInput(contractAddress, userAddress);
  }

  /**
   * Use ethers Signer to sign and decrypt multiple ciphertext handles
   * @param handles Array of ciphertext handles
   * @param contractAddress Contract address
   * @param signer ethers Signer instance (with address)
   */
  async decryptMultipleValues(
    handles: string[],
    contractAddress: string,
    signer: Signer
  ): Promise<DecryptedResults> {
    await this.ensureInitialized();

    const instance = getFheInstance();

    // 1. Generate user temporary keypair
    const keypair = instance.generateKeypair();
    const publicKey = keypair.publicKey;
    const privateKey = keypair.privateKey;

    // 2. Construct EIP-712 signature request
    const startTimestamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "10"; // Can be adjusted as needed
    const contractAddresses = [contractAddress];
    const eip712 = instance.createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays
    );

    // 3. Use ethers Signer to sign (signTypedData)
    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message
    );
    // Remove 0x prefix
    const sig = signature.replace(/^0x/, "");

    // 4. Call FHEVM SDK for decryption
    const handlePairs = handles.map(handle => ({ handle, contractAddress }));
    const results = await instance.userDecrypt(
      handlePairs,
      privateKey,
      publicKey,
      sig,
      contractAddresses,
      await signer.getAddress(),
      startTimestamp,
      durationDays
    );

    return results;
  }

  /**
   * Decrypt single ciphertext handle
   * @param handle Ciphertext handle
   * @param contractAddress Contract address
   * @param signer ethers Signer instance
   */
  async decryptSingleValue(
    handle: string,
    contractAddress: string,
    signer: Signer
  ): Promise<any> {
    const results = await this.decryptMultipleValues([handle], contractAddress, signer);
    return results[handle];
  }

  /**
   * Use WalletClient to decrypt multiple ciphertext handles
   * @param handles Array of ciphertext handles
   * @param contractAddress Contract address
   * @param walletClient wagmi WalletClient instance
   */
  async decryptMultipleValuesWithWalletClient(
    handles: string[],
    contractAddress: string,
    walletClient: WalletClient
  ): Promise<DecryptedResults> {
    if (!walletClient.account) throw new Error("Wallet account not connected");

    await this.ensureInitialized();

    const instance = getFheInstance();

    // 1. Generate user temporary keypair
    const keypair = instance.generateKeypair();
    const publicKey = keypair.publicKey;
    const privateKey = keypair.privateKey;

    // 2. Construct EIP-712 signature request
    const startTimestamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "10"; // Can be adjusted as needed
    const contractAddresses = [contractAddress];
    const eip712 = instance.createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays
    );
    
    // 3. Use WalletClient to sign
    const signature = await walletClient.signTypedData({
      account: walletClient.account,
      domain: {
        ...eip712.domain,
        verifyingContract: eip712.domain.verifyingContract as `0x${string}`,
      },
      types: eip712.types,
      primaryType: 'UserDecryptRequestVerification',
      message: eip712.message,
    });
    
    // Remove 0x prefix
    const sig = signature.replace(/^0x/, "");
    
    // 4. Call FHEVM SDK for decryption
    const handlePairs = handles.map(handle => ({ handle, contractAddress }));
    const results = await instance.userDecrypt(
      handlePairs,
      privateKey,
      publicKey,
      sig,
      contractAddresses,
      walletClient.account?.address || '',
      startTimestamp,
      durationDays
    );

    return results;
  }

  isReady(): boolean {
    return this.isInitialized && fheInstance !== null;
  }
  
  hasInitializationFailed(): boolean {
    return this.hasFailed;
  }

  getInstance(): FhevmInstance | null {
    return fheInstance;
  }

  /**
   * Encrypt signal value
   * @param value Value to encrypt
   * @param contractAddress Contract address
   * @param userAddress User address
   */
  async encryptSignalValue(
    value: number,
    contractAddress: string,
    userAddress: string
  ): Promise<{ encryptedValue: any; proof: any }> {
    await this.ensureInitialized();

    const instance = getFheInstance();
    
    try {
      // Create encrypted input instance
      const encryptedInput = await this.createEncryptedInput(contractAddress, userAddress)
                                  .add8(value)
                                  .encrypt()


      const encryptedValue = encryptedInput.handles[0]
      
      const proof = encryptedInput.inputProof
      
      return {
        encryptedValue: encryptedValue,
        proof: proof
      };
    } catch (error) {
      console.error('FHE encryption failed:', error);
      throw new Error(`FHE encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton
export const fheService = FHEService.getInstance();
