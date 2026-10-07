// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Seal} from "../src/Seal.sol";
import {Network} from "../src/Network.sol";

/// @notice Deploys Seal and Network, and grants the operator role to the Edge Function's address — never
/// its private key, only its public address (OPERATOR_ADDRESS). Administration (default role) stays with
/// the deployer (DEPLOYER_PRIVATE_KEY): a different key, kept offline after this deployment.
///
/// Usage (see the README for the variables in detail):
///   forge script script/Deploy.s.sol:Deploy --rpc-url $SEPOLIA_RPC_URL --broadcast \
///     --verify --etherscan-api-key $ETHERSCAN_API_KEY
contract Deploy is Script {
    function run() external returns (Seal seal, Network network) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(deployerKey);
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        uint256 baseEmission = vm.envOr("EMISSION_BASE_WEI", uint256(1e15)); // 0.001 ETH by default, for n = 1

        vm.startBroadcast(deployerKey);
        seal = new Seal(admin);
        network = new Network(admin, address(seal), baseEmission);
        seal.grantRole(seal.OPERATOR_ROLE(), operator);
        network.grantRole(network.OPERATOR_ROLE(), operator);
        vm.stopBroadcast();

        console.log("admin (default)  :", admin);
        console.log("operator         :", operator);
        console.log("Seal             :", address(seal));
        console.log("Network          :", address(network));
        console.log("base emission    :", baseEmission, "wei");
    }
}
