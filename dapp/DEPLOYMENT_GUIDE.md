# 部署指南

## 环境变量设置

在部署之前，您需要设置以下环境变量：

### 1. 设置助记词 (MNEMONIC)
```bash
npx hardhat vars set MNEMONIC
```
输入您的钱包助记词（请确保该钱包有足够的ETH用于部署）

### 2. 设置Infura API Key (INFURA_API_KEY)
```bash
npx hardhat vars set INFURA_API_KEY
```
输入您的Infura API密钥（用于连接Sepolia测试网）

### 3. 设置Etherscan API Key (ETHERSCAN_API_KEY)
```bash
npx hardhat vars set ETHERSCAN_API_KEY
```
输入您的Etherscan API密钥（用于合约验证）

## 获取API密钥

### Infura API Key
1. 访问 https://infura.io/
2. 注册账户并创建新项目
3. 复制项目的API Key

### Etherscan API Key
1. 访问 https://etherscan.io/apis
2. 注册账户并创建API Key
3. 复制生成的API Key

## 部署命令

### 部署到Sepolia测试网
```bash
npx hardhat deploy --network sepolia
```

### 本地测试部署
```bash
npx hardhat deploy --network hardhat
```

## 部署后的文件

部署成功后，会生成以下文件：
- `deployments-sepolia.json` - 包含所有部署的合约地址和相关信息
- `deployments/sepolia/` - Hardhat Deploy生成的部署记录

## 验证合约

如果自动验证失败，您可以手动验证：

### 验证NFTFactory
```bash
npx hardhat verify --network sepolia <NFTFactory_ADDRESS>
```

### 验证FHESubscriptionManager
```bash
npx hardhat verify --network sepolia <FHESubscriptionManager_ADDRESS>
```

## 注意事项

1. 确保部署钱包有足够的ETH支付gas费用
2. Sepolia测试网ETH可以从水龙头获取：https://sepoliafaucet.com/
3. 部署过程中请保持网络连接稳定
4. 合约验证可能需要几分钟时间

## 支持的网络

- `hardhat` - 本地Hardhat网络
- `anvil` - 本地Anvil网络
- `sepolia` - Sepolia测试网

## 故障排除

如果遇到问题：
1. 检查环境变量是否正确设置
2. 确认网络连接正常
3. 验证钱包余额充足
4. 查看具体错误信息并对应解决
