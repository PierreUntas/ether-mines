// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Sceau} from "../src/Sceau.sol";
import {IERC5192} from "../src/IERC5192.sol";

contract SceauTest is Test {
    Sceau sceau;
    address admin = makeAddr("admin");
    address operator = makeAddr("operator");
    address joueur = makeAddr("joueur");
    address autre = makeAddr("autre");

    event Locked(uint256 tokenId);
    event SceauForge(
        uint256 indexed tokenId, address indexed to, string monde, int32 x, int32 y, int32 z, uint64 forgedAt
    );

    function setUp() public {
        sceau = new Sceau(admin);
        bytes32 operatorRole = sceau.OPERATOR_ROLE(); // évalué avant le prank : grantRole() est, lui, bien appelé en tant qu'admin
        vm.prank(admin);
        sceau.grantRole(operatorRole, operator);
    }

    function _mint(address to, string memory monde, int32 x, int32 y, int32 z, uint64 forgedAt)
        internal
        returns (uint256)
    {
        vm.prank(operator);
        return sceau.mint(to, monde, x, y, z, forgedAt);
    }

    // ---------- frappe ----------

    function test_mint_versLeBonProprietaireAvecLeBonTokenId() public {
        uint256 id = _mint(joueur, "principal", 46, 33, -14, 1000);
        assertEq(id, sceau.computeTokenId("principal", 46, 33, -14));
        assertEq(sceau.ownerOf(id), joueur);
        (string memory monde, int32 x, int32 y, int32 z, uint64 forgedAt) = sceau.validateurs(id);
        assertEq(monde, "principal");
        assertEq(x, 46);
        assertEq(y, 33);
        assertEq(z, -14);
        assertEq(forgedAt, 1000);
    }

    function test_mint_emetLockedEtSceauForge() public {
        uint256 id = sceau.computeTokenId("principal", 1, 2, 3);
        vm.expectEmit(true, true, true, true, address(sceau));
        emit Locked(id);
        vm.expectEmit(true, true, true, true, address(sceau));
        emit SceauForge(id, joueur, "principal", 1, 2, 3, 42);
        _mint(joueur, "principal", 1, 2, 3, 42);
    }

    function test_refuse_mintParQuelqu_unQuiNestPasOperateur() public {
        bytes32 operatorRole = sceau.OPERATOR_ROLE();
        vm.prank(autre);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, autre, operatorRole)
        );
        sceau.mint(joueur, "principal", 0, 0, 0, 0);
    }

    function test_refuse_doubleFrappeDuMemeValidateur() public {
        _mint(joueur, "principal", 5, 5, 5, 1);
        vm.expectRevert();
        _mint(autre, "principal", 5, 5, 5, 2); // même (monde, x, y, z) : même tokenId
    }

    function test_mondesDifferents_memesCoordonnees_tokenIdsDifferents() public {
        uint256 id1 = _mint(joueur, "principal", 5, 5, 5, 1);
        uint256 id2 = _mint(joueur, "test", 5, 5, 5, 1);
        assertTrue(id1 != id2);
    }

    // ---------- ERC-5192 : verrou ----------

    function test_locked_vraiJustaApresLaFrappe() public {
        uint256 id = _mint(joueur, "principal", 0, 0, 0, 0);
        assertTrue(sceau.locked(id));
    }

    function test_refuse_lockedSurJetonInexistant() public {
        vm.expectRevert();
        sceau.locked(999);
    }

    function test_refuse_transferFrom() public {
        uint256 id = _mint(joueur, "principal", 0, 0, 0, 0);
        vm.prank(joueur);
        vm.expectRevert(Sceau.TokenLocked.selector);
        sceau.transferFrom(joueur, autre, id);
    }

    function test_refuse_safeTransferFrom() public {
        uint256 id = _mint(joueur, "principal", 0, 0, 0, 0);
        vm.prank(joueur);
        vm.expectRevert(Sceau.TokenLocked.selector);
        sceau.safeTransferFrom(joueur, autre, id);
    }

    function test_refuse_approve() public {
        uint256 id = _mint(joueur, "principal", 0, 0, 0, 0);
        vm.prank(joueur);
        vm.expectRevert(Sceau.TokenLocked.selector);
        sceau.approve(autre, id);
    }

    function test_refuse_setApprovalForAll() public {
        vm.prank(joueur);
        vm.expectRevert(Sceau.TokenLocked.selector);
        sceau.setApprovalForAll(autre, true);
    }

    function test_supportsInterface_ierc5192EtErc721EtAccessControl() public view {
        assertTrue(sceau.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(sceau.supportsInterface(0x80ac58cd)); // IERC721
        assertTrue(sceau.supportsInterface(type(IAccessControl).interfaceId));
    }

    // ---------- métadonnées onchain ----------

    function test_tokenURI_commenceParLeBonSchema() public {
        uint256 id = _mint(joueur, "principal", 1, -2, 3, 123456);
        string memory uri = sceau.tokenURI(id);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_refuse_tokenURISurJetonInexistant() public {
        vm.expectRevert();
        sceau.tokenURI(999);
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory sb = bytes(s);
        bytes memory pb = bytes(prefix);
        if (sb.length < pb.length) return false;
        for (uint256 i = 0; i < pb.length; i++) {
            if (sb[i] != pb[i]) return false;
        }
        return true;
    }

    // ---------- fuzzing ----------

    function testFuzz_computeTokenId_deterministeEtSensibleAChaqueCoordonnee(
        string memory monde,
        int32 x,
        int32 y,
        int32 z
    ) public view {
        uint256 id = sceau.computeTokenId(monde, x, y, z);
        assertEq(id, sceau.computeTokenId(monde, x, y, z)); // déterministe
        if (x != type(int32).max) assertTrue(id != sceau.computeTokenId(monde, x + 1, y, z));
        if (y != type(int32).max) assertTrue(id != sceau.computeTokenId(monde, x, y + 1, z));
        if (z != type(int32).max) assertTrue(id != sceau.computeTokenId(monde, x, y, z + 1));
    }

    function testFuzz_mint_coordonneesExtremes_jamaisDeRevertDansTokenURI(int32 x, int32 y, int32 z, uint64 forgedAt)
        public
    {
        uint256 id = _mint(joueur, "principal", x, y, z, forgedAt);
        string memory uri = sceau.tokenURI(id); // ne doit jamais revert, même aux bornes de int32/uint64
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function testFuzz_refuse_transfertQuelQueSoitLAppelant(address appelant, address destinataire) public {
        vm.assume(destinataire != address(0));
        uint256 id = _mint(joueur, "principal", 7, 7, 7, 7);
        vm.prank(appelant);
        vm.expectRevert(); // ni le propriétaire, ni l'opérateur, ni personne ne peut transférer un sceau
        sceau.transferFrom(joueur, destinataire, id);
    }

    function testFuzz_refuse_mintParNImporteQuiSaufOperateur(address appelant) public {
        vm.assume(appelant != operator);
        vm.prank(appelant);
        vm.expectRevert();
        sceau.mint(joueur, "principal", 0, 0, 0, 0);
    }
}
