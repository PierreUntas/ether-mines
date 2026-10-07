// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EIP-5192: Minimal Soulbound NFTs.
/// @notice A "locked" token can never change owner after it is minted.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    /// @notice True if the token is locked (non-transferable). Must revert if the token doesn't exist.
    function locked(uint256 tokenId) external view returns (bool);
}
