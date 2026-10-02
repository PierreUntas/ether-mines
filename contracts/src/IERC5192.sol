// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EIP-5192 : Minimal Soulbound NFTs.
/// @notice Un jeton « locked » ne peut jamais changer de propriétaire après sa frappe.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    /// @notice Vrai si le jeton est verrouillé (non transférable). Doit échouer si le jeton n'existe pas.
    function locked(uint256 tokenId) external view returns (bool);
}
