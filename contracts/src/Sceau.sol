// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC5192} from "./IERC5192.sol";

/// @title Sceau de validateur — Mines d'Éther
/// @notice ERC-721 non transférable (ERC-5192). Frappé uniquement par l'opérateur du jeu, quand un joueur
///         rallume un validateur ancien dans le jeu — la base sait quand c'est vrai, pas la chaîne.
///         Un sceau par validateur : son identifiant est dérivé de ses coordonnées, jamais choisi à la main.
///         Rien d'autre que ce fait (monde, lieu, date) n'est onchain : pas de garde, pas de dépôt réel.
contract Sceau is ERC721, AccessControl, IERC5192 {
    using Strings for uint256;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    error TokenLocked();

    struct Validateur {
        string monde;
        int32 x;
        int32 y;
        int32 z;
        uint64 forgedAt; // date de rallumage en jeu (timestamp unix), pas la date de frappe
    }

    mapping(uint256 => Validateur) public validateurs;

    event SceauForge(
        uint256 indexed tokenId, address indexed to, string monde, int32 x, int32 y, int32 z, uint64 forgedAt
    );

    constructor(address admin) ERC721("Sceau de validateur - Mines d'Ether", "SCEAU") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Identifiant du jeton pour un validateur donné, sans le frapper — utile côté serveur et tests.
    function computeTokenId(string memory monde, int32 x, int32 y, int32 z) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(monde, x, y, z)));
    }

    /// @notice Frappe le sceau d'un validateur rallumé, vers l'adresse liée au joueur. Réservé à l'opérateur :
    ///         seule la base du jeu sait qu'un validateur a vraiment été rallumé par ce joueur. Échoue si ce
    ///         validateur a déjà son sceau (un seul par (monde, x, y, z), pour toujours).
    function mint(address to, string calldata monde, int32 x, int32 y, int32 z, uint64 forgedAt)
        external
        onlyRole(OPERATOR_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = computeTokenId(monde, x, y, z);
        validateurs[tokenId] = Validateur(monde, x, y, z, forgedAt);
        emit Locked(tokenId);
        emit SceauForge(tokenId, to, monde, x, y, z, forgedAt);
        _safeMint(to, tokenId); // après les events : si le destinataire fait échouer l'appel, tout revient en arrière ensemble
    }

    // ---------- ERC-5192 : verrouillé pour toujours, dès la frappe ----------

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
        if (from != address(0) && to != address(0)) revert TokenLocked(); // mint (from = 0) seul chemin permis
        return super._update(to, tokenId, auth);
    }

    // ---------- métadonnées et image, entièrement onchain ----------

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireOwned(tokenId);
        Validateur memory v = validateurs[tokenId];
        string memory json = string.concat(
            '{"name":"Sceau de validateur #',
            tokenId.toString(),
            '","description":"Preuve non transferable qu un validateur ancien de Mines d Ether a ete rallume.",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(v))),
            '","attributes":[',
            '{"trait_type":"Monde","value":"',
            v.monde,
            '"},{"trait_type":"x","value":',
            _itoa(v.x),
            '},{"trait_type":"y","value":',
            _itoa(v.y),
            '},{"trait_type":"z","value":',
            _itoa(v.z),
            '},{"trait_type":"Rallume le","display_type":"date","value":',
            uint256(v.forgedAt).toString(),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _svg(Validateur memory v) private pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">',
            '<rect width="350" height="350" fill="#eaf6f1"/>',
            '<rect x="12" y="12" width="326" height="326" rx="18" fill="#f3efe3" stroke="#1b2a4a" stroke-width="3"/>',
            '<polygon points="175,70 210,140 175,180 140,140" fill="#8fd9c4" stroke="#1b2a4a" stroke-width="3"/>',
            '<text x="175" y="215" text-anchor="middle" font-family="monospace" font-size="16" fill="#1b2a4a">Sceau de validateur</text>',
            '<text x="175" y="245" text-anchor="middle" font-family="monospace" font-size="13" fill="#1b2a4a">',
            v.monde,
            '</text><text x="175" y="270" text-anchor="middle" font-family="monospace" font-size="13" fill="#1b2a4a">(',
            _itoa(v.x),
            ", ",
            _itoa(v.y),
            ", ",
            _itoa(v.z),
            ")</text></svg>"
        );
    }

    /// @dev Passe par int256 pour que la négation reste correcte même pour type(int32).min.
    function _itoa(int32 n) private pure returns (string memory) {
        if (n >= 0) {
            // forge-lint: disable-next-line(unsafe-typecast) -- n >= 0 et tient dans un int32, donc dans un uint32/uint256
            return uint256(uint32(n)).toString();
        }
        // forge-lint: disable-next-line(unsafe-typecast) -- n < 0 donc -int256(n) est positif et tient largement dans un uint256
        return string.concat("-", uint256(-int256(n)).toString());
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }
}
