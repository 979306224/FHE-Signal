import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("Deploying contracts with the account:", deployer);
  
  // 首先部署NFTFactory
  console.log("\n=== Deploying NFTFactory ===");
  const deployedNFTFactory = await deploy("NFTFactory", {
    from: deployer,
    log: true,
    waitConfirmations: hre.network.name === "hardhat" ? 1 : 5, // 在测试网上等待更多确认
  });

  console.log(`NFTFactory deployed to: ${deployedNFTFactory.address}`);

  // 然后部署FHESubscriptionManager
  console.log("\n=== Deploying FHESubscriptionManager ===");
  const deployedFHESubscription = await deploy("FHESubscriptionManager", {
    from: deployer,
    log: true,
    waitConfirmations: hre.network.name === "hardhat" ? 1 : 5, // 在测试网上等待更多确认
  });

  console.log(`FHESubscriptionManager deployed to: ${deployedFHESubscription.address}`);

  // 在测试网上进行合约验证
  if (hre.network.name !== "hardhat" && hre.network.name !== "anvil") {
    console.log("\n=== Verifying contracts on Etherscan ===");
    
    try {
      console.log("Verifying NFTFactory...");
      await hre.run("verify:verify", {
        address: deployedNFTFactory.address,
        constructorArguments: [],
      });
      console.log("NFTFactory verified successfully!");
    } catch (error: any) {
      if (error.message.toLowerCase().includes("already verified")) {
        console.log("NFTFactory already verified!");
      } else {
        console.error("Error verifying NFTFactory:", error.message);
      }
    }

    try {
      console.log("Verifying FHESubscriptionManager...");
      await hre.run("verify:verify", {
        address: deployedFHESubscription.address,
        constructorArguments: [],
      });
      console.log("FHESubscriptionManager verified successfully!");
    } catch (error: any) {
      if (error.message.toLowerCase().includes("already verified")) {
        console.log("FHESubscriptionManager already verified!");
      } else {
        console.error("Error verifying FHESubscriptionManager:", error.message);
      }
    }
  }

  console.log("\n=== Deployment Summary ===");
  console.log(`Network: ${hre.network.name}`);
  console.log(`Deployer: ${deployer}`);
  console.log(`NFTFactory: ${deployedNFTFactory.address}`);
  console.log(`FHESubscriptionManager: ${deployedFHESubscription.address}`);
  
  // 保存合约地址到文件
  const fs = require("fs");
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer,
    contracts: {
      NFTFactory: deployedNFTFactory.address,
      FHESubscriptionManager: deployedFHESubscription.address,
    },
    blockNumber: deployedFHESubscription.receipt?.blockNumber,
    timestamp: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    `deployments-${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`Deployment info saved to deployments-${hre.network.name}.json`);
};

export default func;
func.id = "deploy_fhe_subscription"; // id required to prevent reexecution
func.tags = ["FHESubscription", "NFTFactory"];
