# ZAMA FHE Signal Subscription Platform

A decentralized signal subscription platform built with Fully Homomorphic Encryption (FHE) technology, enabling privacy-preserving signal aggregation and distribution.

## 🌟 Overview

This platform allows users to subscribe to channels that aggregate signals from various sources. Each signal is encrypted using Fully Homomorphic Encryption (FHE), ensuring that individual submissions remain private while still enabling accurate weighted average calculations on encrypted data.

### Key Features

- **🔐 Privacy-Preserving Signal Aggregation**: All signals are encrypted using ZAMA's FHE technology before submission
- **📊 Weighted Average Calculation**: Compute accurate weighted averages on encrypted data without revealing individual values
- **💎 NFT-Based Subscriptions**: Time-based subscription tiers using NFTs (1 Day, 1 Month, 3 Months, 6 Months, 1 Year)
- **🔑 Access Control**: Only subscribers and channel owners can decrypt aggregated results
- **👥 Allowlist Management**: Channel owners can manage signal contributors with custom weights
- **⏰ Time-Limited Topics**: Create topics with expiration dates for timely signal collection

## 🏗️ Architecture

### Smart Contracts (Solidity)

- **FHESubscriptionManager**: Main contract managing channels, topics, signals, and subscriptions
- **ChannelNFT**: ERC-721 NFT contract for subscription management
- **NFTFactory**: Factory contract for deploying channel-specific NFT contracts

### Frontend (React + TypeScript)

- Built with Vite, React 18, and TypeScript
- Uses wagmi for blockchain interactions
- Integrates ZAMA's fhevmjs library for FHE operations
- Semi Design UI components

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18
- npm or yarn
- MetaMask or compatible Web3 wallet
- Access to a ZAMA-compatible blockchain network

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ZAMA-FHE-IPFShare.git
cd ZAMA-FHE-IPFShare
```

2. Install frontend dependencies:
```bash
cd frontend
npm install
```

3. Install contract dependencies:
```bash
cd ../dapp
npm install
```

### Configuration

1. Configure your blockchain network in `frontend/src/config/wallet.ts`
2. Update contract addresses in `frontend/src/services/contractService.ts` after deployment

### Running the Application

#### Development Mode

```bash
cd frontend
npm run dev
```

The application will be available at `http://localhost:5173`

#### Build for Production

```bash
cd frontend
npm run build
```

### Deploying Contracts

```bash
cd dapp
# Configure your deployment settings in hardhat.config.js
npx hardhat run scripts/deploy.js --network <your-network>
```

## 📖 How It Works

### For Channel Owners

1. **Create a Channel**: Set up a new channel with subscription tiers and pricing
2. **Create Topics**: Define specific topics with value ranges and deadlines
3. **Manage Allowlist**: Add contributors with custom weights for signal submissions
4. **Monitor Results**: Access encrypted aggregated results

### For Signal Contributors

1. **Join Allowlist**: Get added to a channel's allowlist by the owner
2. **Submit Signals**: Submit encrypted signals to active topics
3. **Privacy Guaranteed**: Your individual submissions remain encrypted and private

### For Subscribers

1. **Browse Channels**: Explore available channels and topics
2. **Purchase Subscription**: Buy time-based subscription NFTs
3. **Access Results**: Decrypt and view aggregated signal results
4. **Manage NFTs**: View and manage your subscription NFTs

## 🔒 Privacy & Security

### FHE Technology

This platform leverages ZAMA's Fully Homomorphic Encryption to ensure:

- **Signal Privacy**: Individual signal values are never revealed
- **Computation on Encrypted Data**: Weighted averages are calculated on encrypted values
- **Secure Decryption**: Only authorized users (subscribers and channel owners) can decrypt aggregated results

### Access Control

- **Owner Privileges**: Full control over channel, topics, and allowlist
- **Subscriber Access**: Decrypt topic results based on valid NFT ownership
- **Contributor Rights**: Submit encrypted signals to topics they're allowlisted for

## 🛠️ Technology Stack

### Blockchain & Smart Contracts

- Solidity ^0.8.24
- ZAMA fhEVM for FHE operations
- OpenZeppelin contracts for security standards
- Hardhat for development and testing

### Frontend

- React 18 with TypeScript
- Vite for build tooling
- wagmi for Ethereum interactions
- fhevmjs for FHE client operations
- Semi Design for UI components
- Pinata for IPFS storage

## 📝 Smart Contract Functions

### Channel Management

- `createChannel(info, tiers)`: Create a new signal channel
- `getChannel(channelId)`: Get channel information
- `subscribe(channelId, tier)`: Subscribe to a channel

### Topic Management

- `createTopic(channelId, ipfs, endDate, minValue, maxValue, defaultValue)`: Create a new topic
- `getTopic(topicId)`: Get topic information
- `submitSignal(topicId, encryptedValue, proof)`: Submit encrypted signal

### Access Control

- `batchAddToAllowlist(channelId, users, weights)`: Add multiple users to allowlist
- `batchRemoveFromAllowlist(channelId, users)`: Remove users from allowlist
- `accessTopicResult(channelId, topicId, tokenId)`: Request access to decrypt topic results

## 🎯 Use Cases

- **Market Predictions**: Aggregate price predictions from multiple analysts
- **Survey Aggregation**: Collect sensitive survey responses privately
- **Risk Assessment**: Gather confidential risk scores from various evaluators
- **Sentiment Analysis**: Aggregate sentiment signals while preserving privacy
- **Forecasting**: Collect and aggregate forecasts from multiple sources

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT


## 📧 Contact

For questions and support, please open an issue on GitHub.

