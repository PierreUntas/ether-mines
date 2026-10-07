// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Network — Ether Mines
/// @notice Distributes a reward in real Sepolia ETH to seal holders, per epoch, following the same shape
///         as Ethereum's own emission curve: an epoch's total emission ∝ √n, so the reward per seal is
///         in 1/√n (n = number of seals that attested that epoch).
///         The contract's balance is topped up by hand (see README): no player deposit, ever, no custody.
///         `attest` and `claim` are operator-only; the payout always goes to the seal's real holder
///         (read from the Seal contract), never to the caller.
contract Network is AccessControl, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant EPOCH_DURATION = 1 days;
    uint256 private constant PRECISION = 1e9;

    error EpochNotClosed();
    error AlreadyAttestedThisEpoch();
    error NotAttestedThisEpoch();
    error AlreadyClaimed();
    error PayoutFailed();

    IERC721 public immutable seal;
    uint256 public immutable startTime;
    uint256 public baseEmission; // reward for a single seal (n = 1), in wei; adjustable by the admin

    mapping(uint256 => uint256) public attestationCount; // epoch => n
    mapping(uint256 => mapping(uint256 => bool)) public hasAttested; // epoch => tokenId => has attested
    mapping(uint256 => mapping(uint256 => bool)) public claimed; // epoch => tokenId => already claimed

    event Attested(uint256 indexed tokenId, uint256 indexed epoch, uint256 n);
    event Claimed(uint256 indexed tokenId, uint256 indexed epoch, address indexed beneficiary, uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event EmissionChanged(uint256 previous, uint256 current);

    constructor(address admin, address sealAddress, uint256 initialBaseEmission) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        seal = IERC721(sealAddress);
        startTime = block.timestamp;
        baseEmission = initialBaseEmission;
    }

    /// @notice Top-up of the reward balance (done by hand, see README).
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Sets the base emission (in wei, for a single seal), tuned to what's available.
    function setBaseEmission(uint256 current) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 previous = baseEmission;
        baseEmission = current;
        emit EmissionChanged(previous, current);
    }

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - startTime) / EPOCH_DURATION;
    }

    /// @notice Records a seal's participation in the current epoch (once per epoch). Operator-only, who
    ///         acts on behalf of the player — holding the seal is only checked by its existence on the
    ///         Seal contract, never by who calls this function.
    function attest(uint256 tokenId) external onlyRole(OPERATOR_ROLE) {
        // forge-lint: disable-next-line(unused-return) -- we only care about the revert on a nonexistent token
        seal.ownerOf(tokenId);
        uint256 epoch = currentEpoch();
        if (hasAttested[epoch][tokenId]) revert AlreadyAttestedThisEpoch();
        hasAttested[epoch][tokenId] = true;
        uint256 n = ++attestationCount[epoch];
        emit Attested(tokenId, epoch, n);
    }

    /// @notice A seal's reward for an epoch, in wei, based on its number of attestants (0 if none).
    ///         For an ongoing epoch this is a moving estimate; only a closed epoch's reward is final.
    function reward(uint256 epoch) public view returns (uint256) {
        uint256 n = attestationCount[epoch];
        if (n == 0) return 0;
        uint256 root = Math.sqrt(n * PRECISION * PRECISION); // ≈ √n × PRECISION, for a bit of precision
        return (baseEmission * PRECISION) / root;
    }

    /// @notice Pays out a closed epoch's reward to whoever still holds that seal. Fails cleanly if the
    ///         contract's balance is insufficient: nothing gets marked claimed, so it can be retried after a top-up.
    function claim(uint256 tokenId, uint256 epoch) external nonReentrant onlyRole(OPERATOR_ROLE) {
        if (epoch >= currentEpoch()) revert EpochNotClosed();
        if (!hasAttested[epoch][tokenId]) revert NotAttestedThisEpoch();
        if (claimed[epoch][tokenId]) revert AlreadyClaimed();
        claimed[epoch][tokenId] = true;
        uint256 amount = reward(epoch);
        // seal.ownerOf is a plain read call on our own ERC-721 contract (OZ, not modifiable by the
        // recipient): no reentrancy risk despite the external call that follows.
        address beneficiary = seal.ownerOf(tokenId);
        // forge-lint: disable-next-line(reentrancy-events) -- ownerOf above is a pure read on Seal, not a reentrancy point
        emit Claimed(tokenId, epoch, beneficiary, amount);
        // forge-lint: disable-next-line(arbitrary-send-eth) -- beneficiary is the seal's real holder, not a free-form address
        (bool ok,) = beneficiary.call{value: amount}("");
        if (!ok) revert PayoutFailed();
    }
}
