import { PinataSDK } from "pinata";


const pinata = new PinataSDK({
  pinataJwt: getJwt(),
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY,
  
});


interface UploadResult {
  cid: string;
  ipfsGatewayUrl: string;
  ipfsUri: string;
}

function getJwt(): string {
  const jwt = import.meta.env.VITE_PINATA_JWT;
  if (!jwt) {
    throw new Error('Pinata JWT not configured, please set VITE_PINATA_JWT in .env');
  }
  return jwt;
}

function buildGatewayUrl(cid: string): string {
  return `https://ipfs.io/ipfs/${cid}`;
}

function getPublicGroupId(): string | undefined {
  return import.meta.env.VITE_PINATA_PUBLIC_GROUP_ID;
}

function generateMetadataFileName(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${crypto.randomUUID()}.json`;
  }

  const fallbackId = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `${fallbackId}.json`;
}

export default class PinataService {
  /**
   * Fetch JSON data from IPFS
   */
  static async fetchJson<T = any>(ipfsUri: string): Promise<T> {
    try {
      // Convert ipfs:// URI to gateway URL
      const cid = ipfsUri.replace('ipfs://', '');
      const gatewayUrl = buildGatewayUrl(cid);
      
      const response = await fetch(gatewayUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch data from IPFS: ${message}`);
    }
  }

  static async uploadJson(data: Record<string, unknown>): Promise<UploadResult> {
    const groupId = getPublicGroupId();
    
    let builder = pinata.upload.public.json(data, {
      metadata: {
        name: generateMetadataFileName()
      }
    });

  
    
    if (groupId) {
      // builder = builder.group(groupId);
    }

    try {
      const upload = await builder;

      if (!upload?.cid) {
        throw new Error('Pinata upload failed, no CID returned');
      }

      const { cid } = upload;

      return {
        cid,
        ipfsGatewayUrl: buildGatewayUrl(cid),
        ipfsUri: `ipfs://${cid}`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Pinata upload failed: ${message}`);
    }
  }

  static async uploadFile(file: File, onProgress?: (percent: number) => void): Promise<UploadResult> {
    if (!(file instanceof File)) {
      throw new Error('Invalid file instance');
    }

    const groupId = getPublicGroupId();

    let builder = pinata.upload.public.file(file, {
      metadata: {
        name: file.name
      }
    });

    if (groupId) {
      // builder = builder.group(groupId);
    }

    onProgress?.(0);

    try {
      const upload = await builder;

      if (!upload?.cid) {
        throw new Error('Pinata upload failed, no CID returned');
      }

      const { cid } = upload;

      onProgress?.(100);

      return {
        cid,
        ipfsGatewayUrl: buildGatewayUrl(cid),
        ipfsUri: `ipfs://${cid}`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Pinata upload failed: ${message}`);
    }
  }
}
