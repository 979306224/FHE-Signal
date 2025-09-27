// TypeScript类型定义，对应Solidity合约中的结构体和枚举

// 订阅时长等级枚举
export const DurationTier = {
  OneDay: 0,
  Month: 1,
  Quarter: 2,
  HalfYear: 3,
  Year: 4
} as const;

export type DurationTier = typeof DurationTier[keyof typeof DurationTier];

// 等级价格结构体
export interface TierPrice {
  tier: DurationTier;
  price: bigint;
  subscribers: bigint;
}

// 频道结构体
export interface Channel {
  channelId: bigint;
  info: string;
  owner: string;
  tiers: TierPrice[];
  tierCount: bigint;
  nftContract: string;
  createdAt: bigint;
  lastPublishedAt: bigint;
  topicIds: bigint[];
}

// Topic结构体
export interface Topic {
  topicId: bigint;
  channelId: bigint;
  ipfs: string;
  endDate: bigint;
  creator: string;
  createdAt: bigint;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  // 注意：totalWeightedValue和average是FHE加密的，无法直接读取
  totalWeight: bigint;
  submissionCount: bigint;
  signalIds: bigint[];
}

// Allowlist条目结构体
export interface AllowlistEntry {
  user: string;
  weight: bigint;
  exists: boolean;
}

// Signal结构体
export interface Signal {
  signalId: bigint;
  channelId: bigint;
  topicId: bigint;
  submitter: string;
  // 注意：value是FHE加密的，无法直接读取
  submittedAt: bigint;
}

// 订阅NFT结构体
export interface SubscriptionNFT {
  channelId: bigint;
  expiresAt: bigint;
  tier: DurationTier;
  subscriber: string;
  mintedAt: bigint;
}

// 合约地址配置
export interface ContractAddresses {
  FHESubscriptionManager: string;
  NFTFactory: string;
}

// 分页查询结果
export interface PaginatedResult<T> {
  items: T[];
  total: bigint;
  offset: number;
  limit: number;
}

// 交易结果
export interface TransactionResult {
  hash: string;
  blockNumber?: bigint;
  gasUsed?: bigint;
  success: boolean;
  error?: string;
}

// 事件过滤器参数
export interface EventFilter {
  fromBlock?: bigint;
  toBlock?: bigint;
  address?: string;
}

// 批量操作参数
export interface BatchAllowlistParams {
  channelId: bigint;
  users: string[];
  weights: bigint[];
}

export interface BatchRemoveParams {
  channelId: bigint;
  users: string[];
}
