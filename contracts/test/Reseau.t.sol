// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Sceau} from "../src/Sceau.sol";
import {Reseau} from "../src/Reseau.sol";

contract ReseauTest is Test {
    Sceau sceau;
    Reseau reseau;
    address admin = makeAddr("admin");
    address operator = makeAddr("operator");
    address joueurA = makeAddr("joueurA");
    address joueurB = makeAddr("joueurB");

    uint256 constant EMISSION = 1 ether; // base ronde, pratique pour vérifier les montants à la main

    function setUp() public {
        sceau = new Sceau(admin);
        reseau = new Reseau(admin, address(sceau), EMISSION);
        bytes32 sceauOperatorRole = sceau.OPERATOR_ROLE();
        bytes32 reseauOperatorRole = reseau.OPERATOR_ROLE();
        vm.prank(admin);
        sceau.grantRole(sceauOperatorRole, operator);
        vm.prank(admin);
        reseau.grantRole(reseauOperatorRole, operator);
        vm.deal(address(reseau), 1_000_000 ether); // solde confortable pour les tests, pas une hypothèse de design
    }

    function _mint(address to, int32 x) internal returns (uint256) {
        vm.prank(operator);
        return sceau.mint(to, "principal", x, 0, 0, uint64(block.timestamp));
    }

    function _attester(uint256 tokenId) internal {
        vm.prank(operator);
        reseau.attester(tokenId);
    }

    function _reclamer(uint256 tokenId, uint256 epoque) internal {
        vm.prank(operator);
        reseau.reclamer(tokenId, epoque);
    }

    // ---------- époques ----------

    function test_epoqueActuelle_commenceA0EtAvanceAvecLeTemps() public {
        assertEq(reseau.epoqueActuelle(), 0);
        skip(reseau.EPOCH_DURATION());
        assertEq(reseau.epoqueActuelle(), 1);
        skip(reseau.EPOCH_DURATION() * 5);
        assertEq(reseau.epoqueActuelle(), 6);
    }

    // ---------- attestation ----------

    function test_attester_compteUnSceauUneFoisParEpoque() public {
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        assertEq(reseau.attestationsCount(0), 1);
        assertTrue(reseau.aAttest(0, id));
    }

    function test_refuse_doubleAttestationMemeEpoque() public {
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        vm.prank(operator);
        vm.expectRevert(Reseau.DejaAttesteCetteEpoque.selector);
        reseau.attester(id);
    }

    function test_attester_denouveauApresChangementDepoque() public {
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        skip(reseau.EPOCH_DURATION());
        _attester(id); // nouvelle époque : à nouveau permis
        assertEq(reseau.attestationsCount(1), 1);
    }

    function test_refuse_attesterUnSceauInexistant() public {
        vm.prank(operator);
        vm.expectRevert();
        reseau.attester(999);
    }

    function test_refuse_attesterParQuelqu_unQuiNestPasOperateur() public {
        uint256 id = _mint(joueurA, 1);
        bytes32 role = reseau.OPERATOR_ROLE();
        vm.prank(joueurA);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, joueurA, role));
        reseau.attester(id);
    }

    // ---------- courbe de récompense ----------

    function test_recompense_unSeulSceau_recoitLemissionDeBaseEntiere() public {
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        assertEq(reseau.recompense(0), EMISSION); // n = 1 : 1/√1 = 1
    }

    function test_recompense_quatreSceaux_recoitLaMoitie() public {
        for (int32 i = 0; i < 4; i++) {
            _attester(_mint(joueurA, i));
        }
        // n = 4 : 1/√4 = 1/2, à 0,1 % près (précision entière de la racine)
        assertApproxEqRel(reseau.recompense(0), EMISSION / 2, 0.001e18);
    }

    function test_recompense_neufSceaux_recoitUnTiers() public {
        for (int32 i = 0; i < 9; i++) {
            _attester(_mint(joueurA, i));
        }
        assertApproxEqRel(reseau.recompense(0), EMISSION / 3, 0.001e18);
    }

    function test_recompense_zeroAttestant_estNulle() public view {
        assertEq(reseau.recompense(0), 0);
    }

    function test_recompense_plusDeSceaux_recompenseParSceauPlusPetite_maisTotalPlusGrand() public {
        uint256 id1 = _mint(joueurA, 1);
        _attester(id1);
        uint256 r1 = reseau.recompense(0);

        uint256 id2 = _mint(joueurB, 2);
        _attester(id2);
        uint256 r2 = reseau.recompense(0); // même époque, n est passé de 1 à 2

        assertLt(r2, r1); // la part de chacun diminue...
        assertGt(r2 * 2, r1); // ...mais l'émission totale (r2 × n) augmente tout de même
    }

    // ---------- réclamation ----------

    function test_refuse_reclamerAvantClotureDeLepoque() public {
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        vm.prank(operator);
        vm.expectRevert(Reseau.EpoqueNonCloturee.selector);
        reseau.reclamer(id, 0);
    }

    function test_reclamer_verseAuDetenteurReelPasALOperateur() public {
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        skip(reseau.EPOCH_DURATION());
        uint256 avant = joueurA.balance;
        uint256 avantOperateur = operator.balance;
        _reclamer(id, 0);
        assertEq(joueurA.balance, avant + EMISSION);
        assertEq(operator.balance, avantOperateur); // l'opérateur ne reçoit jamais rien lui-même
    }

    function test_refuse_reclamerDeuxFoisLaMemeEpoque() public {
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        skip(reseau.EPOCH_DURATION());
        _reclamer(id, 0);
        vm.prank(operator);
        vm.expectRevert(Reseau.DejaReclame.selector);
        reseau.reclamer(id, 0);
    }

    function test_refuse_reclamerUneEpoqueNonAttestee() public {
        uint256 id = _mint(joueurA, 1);
        skip(reseau.EPOCH_DURATION());
        vm.prank(operator);
        vm.expectRevert(Reseau.PasAttesteCetteEpoque.selector);
        reseau.reclamer(id, 0);
    }

    function test_refuse_versementSiSoldeInsuffisant() public {
        // un Réseau tout neuf, sans le dépôt confortable de setUp()
        Reseau vide = new Reseau(admin, address(sceau), EMISSION);
        bytes32 role = vide.OPERATOR_ROLE();
        vm.prank(admin);
        vide.grantRole(role, operator);
        uint256 id = _mint(joueurA, 1);
        vm.prank(operator);
        vide.attester(id);
        skip(vide.EPOCH_DURATION());
        vm.prank(operator);
        vm.expectRevert(Reseau.VersementEchoue.selector);
        vide.reclamer(id, 0);
        assertFalse(vide.reclame(0, id)); // rien marqué réclamé : on peut retenter après réapprovisionnement
    }

    function test_refuse_reclamerParQuelqu_unQuiNestPasOperateur() public {
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        skip(reseau.EPOCH_DURATION());
        bytes32 role = reseau.OPERATOR_ROLE();
        vm.prank(joueurA);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, joueurA, role));
        reseau.reclamer(id, 0);
    }

    // ---------- approvisionnement ----------

    function test_approvisionnement_parSimpleEnvoiDether() public {
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(reseau).call{value: 1 ether}("");
        assertTrue(ok);
    }

    // ---------- fuzzing ----------

    /// @notice Invariant central : jamais plus que sa part, quel que soit le nombre d'attestants.
    function testFuzz_recompense_jamaisPlusQueLemissionDeBase(uint8 nAttestants) public {
        vm.assume(nAttestants > 0);
        for (uint256 i = 0; i < nAttestants; i++) {
            _attester(_mint(joueurA, int32(uint32(i))));
        }
        uint256 r = reseau.recompense(0);
        assertLe(r, EMISSION); // 1/√n ≤ 1 dès que n ≥ 1
    }

    /// @notice La somme versée à tous les attestants d'une époque ne dépasse jamais n × récompense unitaire
    ///         (donc jamais plus que ce que la courbe prévoit, arrondis compris).
    function testFuzz_sommeDesReclamations_neDepasseJamaisLemissionTotalePrevue(uint8 nAttestants) public {
        vm.assume(nAttestants > 0 && nAttestants <= 50);
        uint256[] memory ids = new uint256[](nAttestants);
        for (uint256 i = 0; i < nAttestants; i++) {
            ids[i] = _mint(address(uint160(0x1000 + i)), int32(uint32(i)));
            _attester(ids[i]);
        }
        uint256 parSceau = reseau.recompense(0);
        skip(reseau.EPOCH_DURATION());
        uint256 total = 0;
        for (uint256 i = 0; i < nAttestants; i++) {
            uint256 avant = address(uint160(0x1000 + i)).balance;
            _reclamer(ids[i], 0);
            total += address(uint160(0x1000 + i)).balance - avant;
        }
        assertLe(total, parSceau * nAttestants);
        assertLe(total, EMISSION * nAttestants); // jamais plus que si chacun recevait la part d'un sceau seul
    }

    function testFuzz_recompense_croissanteQuandNDecroit(uint8 n1, uint8 n2) public {
        vm.assume(n1 > 0 && n2 > 0 && n1 < n2 && n2 <= 60);
        for (uint256 i = 0; i < n1; i++) {
            _attester(_mint(joueurA, int32(uint32(i))));
        }
        uint256 r1 = reseau.recompense(0);
        for (uint256 i = n1; i < n2; i++) {
            _attester(_mint(joueurA, int32(uint32(i))));
        }
        uint256 r2 = reseau.recompense(0);
        assertLe(r2, r1); // plus d'attestants cette époque-là ⇒ part par sceau plus petite ou égale
    }

    function testFuzz_refuse_reclamerAvantClotureQuelQueSoitLInstant(uint32 decalage) public {
        vm.assume(decalage < reseau.EPOCH_DURATION());
        uint256 id = _mint(joueurA, 1);
        _attester(id);
        skip(decalage); // reste dans l'époque 0 : jamais close
        vm.prank(operator);
        vm.expectRevert(Reseau.EpoqueNonCloturee.selector);
        reseau.reclamer(id, 0);
    }
}
