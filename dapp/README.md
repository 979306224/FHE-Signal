# ZAMA FHE Bundle Sale

Encrypted Bundle Sale smart contract based on FHEVM, supporting CIDv0 format IPFS content identifiers.

## Project Overview

This project demonstrates how to handle CIDv0 format IPFS content identifiers in the FHEVM environment, including:
- Converting CIDv0 to uint256 format
- Storing encrypted uint256 values in smart contracts
- Converting stored values back to CIDv0 format

## Tech Stack

- **Solidity**: ^0.8.24
- **FHEVM**: For Fully Homomorphic Encryption
- **Hardhat**: Development framework
- **TypeScript**: Testing and deployment scripts
- **CID**: IPFS content identifier processing

## Project Structure

```
dapp/
├── contracts/
│   ├── FHEBundleSale.sol    # Main Bundle Sale contract (to be implemented)
│   └── Test.sol             # Test contract demonstrating CIDv0 conversion
├── test/
│   └── Test.ts              # Test files
├── deploy/
│   └── deploy.ts            # Deployment scripts
└── tasks/                   # Hardhat tasks
```

## Features

### Test.sol
- Store and retrieve encrypted uint256 values
- Support FHEVM encryption operations
- Complete access control

### Test.ts
- Bidirectional conversion between CIDv0 and uint256
- Encrypted storage and retrieval testing
- Complete test coverage

## Installation and Running

### Prerequisites
- Node.js >= 20
- npm >= 7.0.0

### Install Dependencies
```bash
npm install
```

### Compile Contracts
```bash
npm run compile
```

### Run Tests
```bash
npm test
```

### Run Tests on Sepolia Testnet
```bash
npm run test:sepolia
```

## Core Features

### CIDv0 Conversion

The project implements conversion functionality between CIDv0 and uint256:

1. **CIDv0 → uint256**: Parse CIDv0, extract hash value, convert to BigInt
2. **uint256 → CIDv0**: Convert BigInt back to CIDv0 format

### Encrypted Storage

Implemented using FHEVM:
- Encrypted storage of uint256 values
- Secure access control
- Support for decryption and verification

## Testing Description

The test file `Test.ts` contains a complete test case demonstrating:

1. Parsing CIDv0 format
2. Converting to uint256 and storing encrypted
3. Retrieving from contract and decrypting
4. Converting back to CIDv0 format and verifying

## Development Guide

### Adding New Features
1. Create new Solidity files in the `contracts/` directory
2. Create corresponding test files in the `test/` directory
3. Update deployment scripts (if needed)

### Code Standards
- Use TypeScript for type safety
- Follow Solidity best practices
- Add complete JSDoc comments

## License

BSD-3-Clause-Clear

## Contributing

Issues and Pull Requests are welcome to improve this project.

## Related Links

- [FHEVM Documentation](https://docs.fhevm.org/)
- [Zama Official Site](https://zama.ai/)
- [IPFS CID Specification](https://github.com/multiformats/cid)