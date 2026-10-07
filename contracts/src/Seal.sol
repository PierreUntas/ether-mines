// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC5192} from "./IERC5192.sol";

/// @title Validator Seal — Ether Mines
/// @notice Non-transferable ERC-721 (ERC-5192). Minted only by the game's operator, when a player
///         relights an ancient validator in the game — the database knows when that's true, the chain doesn't.
///         One seal per validator: its id is derived from its coordinates, never chosen by hand.
///         Nothing but that fact (world, place, date) is onchain: no custody, no real deposit.
contract Seal is ERC721, AccessControl, IERC5192 {
    using Strings for uint256;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    error TokenLocked();

    struct Validator {
        string world;
        int32 x;
        int32 y;
        int32 z;
        uint64 forgedAt; // in-game relight time (unix timestamp), not the minting time
    }

    mapping(uint256 => Validator) public validators;

    event SealForged(
        uint256 indexed tokenId, address indexed to, string world, int32 x, int32 y, int32 z, uint64 forgedAt
    );

    constructor(address admin) ERC721("Validator Seal - Ether Mines", "SEAL") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Token id for a given validator, without minting it — useful server-side and in tests.
    function computeTokenId(string memory world, int32 x, int32 y, int32 z) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(world, x, y, z)));
    }

    /// @notice Mints the seal of a relit validator, to the address linked to the player. Operator-only:
    ///         only the game database knows whether a validator was truly relit by that player. Reverts if
    ///         this validator already has its seal (only one per (world, x, y, z), forever).
    function mint(address to, string calldata world, int32 x, int32 y, int32 z, uint64 forgedAt)
        external
        onlyRole(OPERATOR_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = computeTokenId(world, x, y, z);
        validators[tokenId] = Validator(world, x, y, z, forgedAt);
        emit Locked(tokenId);
        emit SealForged(tokenId, to, world, x, y, z, forgedAt);
        _safeMint(to, tokenId); // after the events: if the recipient makes the call fail, everything reverts together
    }

    // ---------- ERC-5192: locked forever, from the moment it's minted ----------

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function approve(address, uint256) public virtual override(ERC721) {
        revert TokenLocked();
    }

    function setApprovalForAll(address, bool) public virtual override(ERC721) {
        revert TokenLocked();
    }

    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert TokenLocked(); // mint (from = 0) is the only allowed path
        return super._update(to, tokenId, auth);
    }

    // ---------- metadata and image, fully onchain ----------

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireOwned(tokenId);
        Validator memory v = validators[tokenId];
        string memory json = string.concat(
            '{"name":"Validator Seal #',
            tokenId.toString(),
            '","description":"Non-transferable proof that an ancient validator of Ether Mines was relit.",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(v))),
            '","attributes":[',
            '{"trait_type":"World","value":"',
            v.world,
            '"},{"trait_type":"x","value":',
            _itoa(v.x),
            '},{"trait_type":"y","value":',
            _itoa(v.y),
            '},{"trait_type":"z","value":',
            _itoa(v.z),
            '},{"trait_type":"Relit on","display_type":"date","value":',
            uint256(v.forgedAt).toString(),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _svg(Validator memory v) private pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">',
            '<rect width="350" height="350" fill="#eaf6f1"/>',
            '<rect x="12" y="12" width="326" height="326" rx="18" fill="#f3efe3" stroke="#1b2a4a" stroke-width="3"/>',
            '<polygon points="175,70 210,140 175,180 140,140" fill="#8fd9c4" stroke="#1b2a4a" stroke-width="3"/>',
            '<text x="175" y="215" text-anchor="middle" font-family="monospace" font-size="16" fill="#1b2a4a">Validator Seal</text>',
            '<text x="175" y="245" text-anchor="middle" font-family="monospace" font-size="13" fill="#1b2a4a">',
            v.world,
            '</text><text x="175" y="270" text-anchor="middle" font-family="monospace" font-size="13" fill="#1b2a4a">(',
            _itoa(v.x),
            ", ",
            _itoa(v.y),
            ", ",
            _itoa(v.z),
            ")</text></svg>"
        );
    }

    /// @dev Goes through int256 so negation stays correct even for type(int32).min.
    function _itoa(int32 n) private pure returns (string memory) {
        if (n >= 0) {
            // forge-lint: disable-next-line(unsafe-typecast) -- n >= 0 and fits in an int32, so in a uint32/uint256
            return uint256(uint32(n)).toString();
        }
        // forge-lint: disable-next-line(unsafe-typecast) -- n < 0 so -int256(n) is positive and fits well within a uint256
        return string.concat("-", uint256(-int256(n)).toString());
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }
}
