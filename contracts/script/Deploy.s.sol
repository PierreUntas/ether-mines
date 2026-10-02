// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Sceau} from "../src/Sceau.sol";
import {Reseau} from "../src/Reseau.sol";

/// @notice Déploie Sceau et Réseau, et donne le rôle opérateur à l'adresse de l'Edge Function — jamais sa
/// clé privée, seulement son adresse publique (OPERATOR_ADDRESS). L'administration (rôle par défaut) revient
/// au déployeur (DEPLOYER_PRIVATE_KEY) : une clé différente, gardée hors ligne après ce déploiement.
///
/// Usage (voir le README pour le détail des variables) :
///   forge script script/Deploy.s.sol:Deploy --rpc-url $SEPOLIA_RPC_URL --broadcast \
///     --verify --etherscan-api-key $ETHERSCAN_API_KEY
contract Deploy is Script {
    function run() external returns (Sceau sceau, Reseau reseau) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(deployerKey);
        address operateur = vm.envAddress("OPERATOR_ADDRESS");
        uint256 emissionBase = vm.envOr("EMISSION_BASE_WEI", uint256(1e15)); // 0,001 ETH par défaut, pour n = 1

        vm.startBroadcast(deployerKey);
        sceau = new Sceau(admin);
        reseau = new Reseau(admin, address(sceau), emissionBase);
        sceau.grantRole(sceau.OPERATOR_ROLE(), operateur);
        reseau.grantRole(reseau.OPERATOR_ROLE(), operateur);
        vm.stopBroadcast();

        console.log("admin (defaut)   :", admin);
        console.log("operateur        :", operateur);
        console.log("Sceau            :", address(sceau));
        console.log("Reseau           :", address(reseau));
        console.log("emission de base :", emissionBase, "wei");
    }
}
