#!/usr/bin/env bash
# Deploys Seal and Network to Sepolia. Run from contracts/, after exporting:
#   DEPLOYER_PRIVATE_KEY, OPERATOR_ADDRESS, ETHERSCAN_API_KEY
set -euo pipefail
: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY first}"
: "${OPERATOR_ADDRESS:?set OPERATOR_ADDRESS first}"
: "${ETHERSCAN_API_KEY:?set ETHERSCAN_API_KEY first}"

forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --gas-estimate-multiplier 1000
