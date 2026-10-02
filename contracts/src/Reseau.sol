// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Réseau — Mines d'Éther
/// @notice Distribue aux détenteurs de sceaux une récompense en vrai Sepolia ETH, par époque, suivant
///         la même forme que la courbe d'émission d'Ethereum : émission totale d'une époque ∝ √n,
///         donc récompense par sceau en 1/√n (n = nombre de sceaux ayant attesté cette époque-là).
///         Le solde du contrat est alimenté à la main (README) : aucun dépôt de joueur, jamais de garde.
///         `attester` et `reclamer` sont réservés à l'opérateur ; le versement va toujours au détenteur
///         réel du sceau (lu sur le contrat Sceau), jamais à l'appelant.
contract Reseau is AccessControl, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant EPOCH_DURATION = 1 days;
    uint256 private constant PRECISION = 1e9;

    error EpoqueNonCloturee();
    error DejaAttesteCetteEpoque();
    error PasAttesteCetteEpoque();
    error DejaReclame();
    error VersementEchoue();

    IERC721 public immutable sceau;
    uint256 public immutable startTime;
    uint256 public emissionBase; // récompense d'un sceau seul (n = 1), en wei ; réglable par l'admin

    mapping(uint256 => uint256) public attestationsCount; // époque => n
    mapping(uint256 => mapping(uint256 => bool)) public aAttest; // époque => tokenId => a attesté
    mapping(uint256 => mapping(uint256 => bool)) public reclame; // époque => tokenId => déjà réclamée

    event Atteste(uint256 indexed tokenId, uint256 indexed epoque, uint256 n);
    event Reclame(uint256 indexed tokenId, uint256 indexed epoque, address indexed beneficiaire, uint256 montant);
    event Approvisionne(address indexed de, uint256 montant);
    event EmissionChangee(uint256 ancienne, uint256 nouvelle);

    constructor(address admin, address sceauAddress, uint256 emissionBaseInitiale) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        sceau = IERC721(sceauAddress);
        startTime = block.timestamp;
        emissionBase = emissionBaseInitiale;
    }

    /// @notice Réapprovisionnement du solde des récompenses (fait à la main, voir README).
    receive() external payable {
        emit Approvisionne(msg.sender, msg.value);
    }

    /// @notice Règle l'émission de base (en wei, pour un sceau seul), à adapter selon ce qui est disponible.
    function setEmissionBase(uint256 nouvelle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 ancienne = emissionBase;
        emissionBase = nouvelle;
        emit EmissionChangee(ancienne, nouvelle);
    }

    function epoqueActuelle() public view returns (uint256) {
        return (block.timestamp - startTime) / EPOCH_DURATION;
    }

    /// @notice Enregistre la participation d'un sceau à l'époque en cours (une fois par époque). Réservé à
    ///         l'opérateur, qui agit pour le compte du joueur — posséder le sceau n'est vérifié que par son
    ///         existence sur le contrat Sceau, jamais par qui appelle ici.
    function attester(uint256 tokenId) external onlyRole(OPERATOR_ROLE) {
        // forge-lint: disable-next-line(unused-return) -- seul le revert sur jeton inexistant nous intéresse ici
        sceau.ownerOf(tokenId);
        uint256 epoque = epoqueActuelle();
        if (aAttest[epoque][tokenId]) revert DejaAttesteCetteEpoque();
        aAttest[epoque][tokenId] = true;
        uint256 n = ++attestationsCount[epoque];
        emit Atteste(tokenId, epoque, n);
    }

    /// @notice Récompense d'un sceau pour une époque, en wei, selon son nombre d'attestants (0 si aucun).
    ///         Pour une époque en cours, c'est une estimation qui bouge encore ; seule une époque close est figée.
    function recompense(uint256 epoque) public view returns (uint256) {
        uint256 n = attestationsCount[epoque];
        if (n == 0) return 0;
        uint256 racine = Math.sqrt(n * PRECISION * PRECISION); // ≈ √n × PRECISION, pour un peu de précision
        return (emissionBase * PRECISION) / racine;
    }

    /// @notice Verse la récompense d'une époque close à qui détient encore ce sceau. Échoue proprement si le
    ///         solde du contrat est insuffisant : rien n'est marqué réclamé, on peut retenter après réapprovisionnement.
    function reclamer(uint256 tokenId, uint256 epoque) external nonReentrant onlyRole(OPERATOR_ROLE) {
        if (epoque >= epoqueActuelle()) revert EpoqueNonCloturee();
        if (!aAttest[epoque][tokenId]) revert PasAttesteCetteEpoque();
        if (reclame[epoque][tokenId]) revert DejaReclame();
        reclame[epoque][tokenId] = true;
        uint256 montant = recompense(epoque);
        // sceau.ownerOf est un simple appel en lecture sur notre propre contrat ERC-721 (OZ, non modifiable
        // par le destinataire) : aucun risque de réentrance malgré l'appel externe qui suit.
        address beneficiaire = sceau.ownerOf(tokenId);
        // forge-lint: disable-next-line(reentrancy-events) -- ownerOf ci-dessus est une lecture pure côté Sceau, pas un point de réentrance
        emit Reclame(tokenId, epoque, beneficiaire, montant);
        // forge-lint: disable-next-line(arbitrary-send-eth) -- beneficiaire est le détenteur réel du sceau, pas une adresse libre
        (bool ok,) = beneficiaire.call{value: montant}("");
        if (!ok) revert VersementEchoue();
    }
}
