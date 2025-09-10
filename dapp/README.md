# ZAMA FHE Bundle Sale

基于FHEVM的加密Bundle销售智能合约，支持CIDv0格式的IPFS内容标识符。

## 项目概述

这个项目演示了如何在FHEVM环境中处理CIDv0格式的IPFS内容标识符，包括：
- 将CIDv0转换为uint256格式
- 在智能合约中存储加密的uint256值
- 将存储的值转换回CIDv0格式

## 技术栈

- **Solidity**: ^0.8.24
- **FHEVM**: 用于全同态加密
- **Hardhat**: 开发框架
- **TypeScript**: 测试和部署脚本
- **CID**: IPFS内容标识符处理

## 项目结构

```
dapp/
├── contracts/
│   ├── FHEBundleSale.sol    # 主要的Bundle销售合约（待实现）
│   └── Test.sol             # 测试合约，演示CIDv0转换功能
├── test/
│   └── Test.ts              # 测试文件
├── deploy/
│   └── deploy.ts            # 部署脚本
└── tasks/                   # Hardhat任务
```

## 功能特性

### Test.sol
- 存储和检索加密的uint256值
- 支持FHEVM加密操作
- 完整的访问控制

### Test.ts
- CIDv0与uint256之间的双向转换
- 加密存储和检索测试
- 完整的测试覆盖

## 安装和运行

### 前置要求
- Node.js >= 20
- npm >= 7.0.0

### 安装依赖
```bash
npm install
```

### 编译合约
```bash
npm run compile
```

### 运行测试
```bash
npm test
```

### 在Sepolia测试网运行测试
```bash
npm run test:sepolia
```

## 核心功能

### CIDv0转换

项目实现了CIDv0与uint256之间的转换功能：

1. **CIDv0 → uint256**: 解析CIDv0，提取哈希值，转换为BigInt
2. **uint256 → CIDv0**: 将BigInt转换回CIDv0格式

### 加密存储

使用FHEVM实现：
- 加密存储uint256值
- 安全的访问控制
- 支持解密和验证

## 测试说明

测试文件 `Test.ts` 包含一个完整的测试用例，演示：

1. 解析CIDv0格式
2. 转换为uint256并加密存储
3. 从合约中检索并解密
4. 转换回CIDv0格式并验证

## 开发指南

### 添加新功能
1. 在 `contracts/` 目录下创建新的Solidity文件
2. 在 `test/` 目录下创建对应的测试文件
3. 更新部署脚本（如需要）

### 代码规范
- 使用TypeScript进行类型安全
- 遵循Solidity最佳实践
- 添加完整的JSDoc注释

## 许可证

BSD-3-Clause-Clear

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。

## 相关链接

- [FHEVM文档](https://docs.fhevm.org/)
- [Zama官网](https://zama.ai/)
- [IPFS CID规范](https://github.com/multiformats/cid)