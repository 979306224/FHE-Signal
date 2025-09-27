import { PinataSDK } from "pinata";


const pinata = new PinataSDK({
  pinataJwt: getJwt(),
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY,
  
});


interface UploadMetadataParams {
  projectName: string;
  description: string;
}

interface UploadMetadataResult {
  cid: string;
  ipfsGatewayUrl: string;
  ipfsUri: string;
}

function getJwt(): string {
  const jwt = import.meta.env.VITE_PINATA_JWT;
  if (!jwt) {
    throw new Error('未配置 Pinata JWT，请在 .env 中设置 VITE_PINATA_JWT');
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
  static async uploadChannelMetadata(params: UploadMetadataParams): Promise<UploadMetadataResult> {
    const payload = {
      projectName: params.projectName,
      description: params.description,
      createdAt: new Date().toISOString()
    };

    const groupId = getPublicGroupId();
    
    let builder = pinata.upload.public.json(payload, {
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
        throw new Error('Pinata 上传失败，未返回 CID');
      }

      const { cid } = upload;

      return {
        cid,
        ipfsGatewayUrl: buildGatewayUrl(cid),
        ipfsUri: `ipfs://${cid}`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Pinata 上传失败: ${message}`);
    }
  }
}
