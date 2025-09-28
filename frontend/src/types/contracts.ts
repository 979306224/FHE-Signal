// TypeScript type definitions, corresponding to structs and enums in Solidity contracts

// Subscription duration tier enum
export const DurationTier = {
  OneDay: 0,
  Month: 1,
  Quarter: 2,
  HalfYear: 3,
  Year: 4
} as const;

export type DurationTier = typeof DurationTier[keyof typeof DurationTier];

// Tier price struct
export interface TierPrice {
  tier: DurationTier;
  price: bigint;
  subscribers: bigint;
}

// Channel struct
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

// Topic struct
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
  // FHE encrypted handles (bytes32)
  totalWeightedValue: string;  // Total weighted value handle
  average: string;             // Average value handle
  totalWeight: bigint;
  submissionCount: bigint;
  signalIds: bigint[];
}

// Allowlist entry struct
export interface AllowlistEntry {
  user: string;
  weight: bigint;
  exists: boolean;
}

// Signal struct
export interface Signal {
  signalId: bigint;
  channelId: bigint;
  topicId: bigint;
  submitter: string;
  // Note: value is FHE encrypted, cannot be read directly
  submittedAt: bigint;
}

// Subscription NFT struct
export interface SubscriptionNFT {
  channelId: bigint;
  expiresAt: bigint;
  tier: DurationTier;
  subscriber: string;
  mintedAt: bigint;
}

// Contract address configuration
export interface ContractAddresses {
  FHESubscriptionManager: string;
  NFTFactory: string;
}

// Paginated query result
export interface PaginatedResult<T> {
  items: T[];
  total: bigint;
  offset: number;
  limit: number;
}

// Transaction result
export interface TransactionResult {
  hash: string;
  blockNumber?: bigint;
  gasUsed?: bigint;
  success: boolean;
  error?: string;
}

// Event filter parameters
export interface EventFilter {
  fromBlock?: bigint;
  toBlock?: bigint;
  address?: string;
}

// Batch operation parameters
export interface BatchAllowlistParams {
  channelId: bigint;
  users: string[];
  weights: bigint[];
}

export interface BatchRemoveParams {
  channelId: bigint;
  users: string[];
}
