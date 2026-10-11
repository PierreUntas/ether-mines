// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Seal} from "../src/Seal.sol";
import {Network} from "../src/Network.sol";

contract NetworkTest is Test {
    Seal seal;
    Network network;
    address admin = makeAddr("admin");
    address operator = makeAddr("operator");
    address playerA = makeAddr("playerA");
    address playerB = makeAddr("playerB");

    uint256 constant EMISSION = 1 ether; // round base, convenient for checking amounts by hand

    function setUp() public {
        seal = new Seal(admin);
        network = new Network(admin, address(seal), EMISSION);
        bytes32 sealOperatorRole = seal.OPERATOR_ROLE();
        bytes32 networkOperatorRole = network.OPERATOR_ROLE();
        vm.prank(admin);
        seal.grantRole(sealOperatorRole, operator);
        vm.prank(admin);
        network.grantRole(networkOperatorRole, operator);
        vm.deal(address(network), 1_000_000 ether); // comfortable balance for tests, not a design assumption
    }

    function _mint(address to, int32 x) internal returns (uint256) {
        vm.prank(operator);
        return seal.mint(to, "main", x, 0, 0, uint64(block.timestamp));
    }

    function _attest(uint256 tokenId) internal {
        vm.prank(operator);
        network.attest(tokenId);
    }

    function _claim(uint256 tokenId, uint256 epoch) internal {
        vm.prank(operator);
        network.claim(tokenId, epoch);
    }

    // ---------- epochs ----------

    function test_currentEpoch_startsAt0AndAdvancesWithTime() public {
        assertEq(network.currentEpoch(), 0);
        skip(network.EPOCH_DURATION());
        assertEq(network.currentEpoch(), 1);
        skip(network.EPOCH_DURATION() * 5);
        assertEq(network.currentEpoch(), 6);
    }

    // ---------- attestation ----------

    function test_attest_countsOneSealOncePerEpoch() public {
        uint256 id = _mint(playerA, 1);
        _attest(id);
        assertEq(network.attestationCount(0), 1);
        assertTrue(network.hasAttested(0, id));
    }

    function test_refuse_doubleAttestationSameEpoch() public {
        uint256 id = _mint(playerA, 1);
        _attest(id);
        vm.prank(operator);
        vm.expectRevert(Network.AlreadyAttestedThisEpoch.selector);
        network.attest(id);
    }

    function test_attest_againAfterEpochChange() public {
        uint256 id = _mint(playerA, 1);
        _attest(id);
        skip(network.EPOCH_DURATION());
        _attest(id); // new epoch: allowed again
        assertEq(network.attestationCount(1), 1);
    }

    function test_refuse_attestNonexistentSeal() public {
        vm.prank(operator);
        vm.expectRevert();
        network.attest(999);
    }

    function test_refuse_attestByAnyoneWhoIsNotOperator() public {
        uint256 id = _mint(playerA, 1);
        bytes32 role = network.OPERATOR_ROLE();
        vm.prank(playerA);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, playerA, role));
        network.attest(id);
    }

    // ---------- reward curve ----------

    function test_reward_singleSeal_getsTheFullBaseEmission() public {
        uint256 id = _mint(playerA, 1);
        _attest(id);
        assertEq(network.reward(0), EMISSION); // n = 1: 1/√1 = 1
    }

    function test_reward_fourSeals_getsHalf() public {
        for (int32 i = 0; i < 4; i++) {
            _attest(_mint(playerA, i));
        }
        // n = 4: 1/√4 = 1/2, within 0.1% (integer precision of the square root)
        assertApproxEqRel(network.reward(0), EMISSION / 2, 0.001e18);
    }

    function test_reward_nineSeals_getsAThird() public {
        for (int32 i = 0; i < 9; i++) {
            _attest(_mint(playerA, i));
        }
        assertApproxEqRel(network.reward(0), EMISSION / 3, 0.001e18);
    }

    function test_reward_zeroAttestants_isZero() public view {
        assertEq(network.reward(0), 0);
    }

    function test_reward_moreSeals_smallerRewardPerSeal_butLargerTotal() public {
        uint256 id1 = _mint(playerA, 1);
        _attest(id1);
        uint256 r1 = network.reward(0);

        uint256 id2 = _mint(playerB, 2);
        _attest(id2);
        uint256 r2 = network.reward(0); // same epoch, n went from 1 to 2

        assertLt(r2, r1); // each one's share shrinks...
        assertGt(r2 * 2, r1); // ...but the total emission (r2 × n) still grows
    }

    // ---------- claiming ----------

    function test_refuse_claimBeforeEpochCloses() public {
        uint256 id = _mint(playerA, 1);
        _attest(id);
        vm.prank(operator);
        vm.expectRevert(Network.EpochNotClosed.selector);
        network.claim(id, 0);
    }

    function test_claim_paysTheRealHolderNotTheOperator() public {
        uint256 id = _mint(playerA, 1);
        _attest(id);
        skip(network.EPOCH_DURATION());
        uint256 before = playerA.balance;
        uint256 beforeOperator = operator.balance;
        _claim(id, 0);
        assertEq(playerA.balance, before + EMISSION);
        assertEq(operator.balance, beforeOperator); // the operator never receives anything itself
    }

    function test_refuse_claimTwiceForTheSameEpoch() public {
        uint256 id = _mint(playerA, 1);
        _attest(id);
        skip(network.EPOCH_DURATION());
        _claim(id, 0);
        vm.prank(operator);
        vm.expectRevert(Network.AlreadyClaimed.selector);
        network.claim(id, 0);
    }

    function test_refuse_claimAnUnattestedEpoch() public {
        uint256 id = _mint(playerA, 1);
        skip(network.EPOCH_DURATION());
        vm.prank(operator);
        vm.expectRevert(Network.NotAttestedThisEpoch.selector);
        network.claim(id, 0);
    }

    function test_refuse_payoutIfBalanceIsInsufficient() public {
        // a brand-new Network, without setUp()'s comfortable deposit
        Network empty = new Network(admin, address(seal), EMISSION);
        bytes32 role = empty.OPERATOR_ROLE();
        vm.prank(admin);
        empty.grantRole(role, operator);
        uint256 id = _mint(playerA, 1);
        vm.prank(operator);
        empty.attest(id);
        skip(empty.EPOCH_DURATION());
        vm.prank(operator);
        vm.expectRevert(Network.PayoutFailed.selector);
        empty.claim(id, 0);
        assertFalse(empty.claimed(0, id)); // nothing marked claimed: can retry after a top-up
    }

    function test_refuse_claimByAnyoneWhoIsNotOperator() public {
        uint256 id = _mint(playerA, 1);
        _attest(id);
        skip(network.EPOCH_DURATION());
        bytes32 role = network.OPERATOR_ROLE();
        vm.prank(playerA);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, playerA, role));
        network.claim(id, 0);
    }

    // ---------- funding ----------

    function test_funding_bySimplySendingEther() public {
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(network).call{value: 1 ether}("");
        assertTrue(ok);
    }

    // ---------- fuzzing ----------

    /// @notice Core invariant: never more than its share, no matter how many attestants there are.
    function testFuzz_reward_neverMoreThanTheBaseEmission(uint8 nAttestants) public {
        vm.assume(nAttestants > 0);
        for (uint256 i = 0; i < nAttestants; i++) {
            _attest(_mint(playerA, int32(uint32(i))));
        }
        uint256 r = network.reward(0);
        assertLe(r, EMISSION); // 1/√n ≤ 1 as soon as n ≥ 1
    }

    /// @notice The sum paid out to every attestant of an epoch never exceeds n × the per-seal reward
    ///         (so never more than what the curve predicts, rounding included).
    function testFuzz_sumOfClaims_neverExceedsTheExpectedTotalEmission(uint8 nAttestants) public {
        vm.assume(nAttestants > 0 && nAttestants <= 50);
        uint256[] memory ids = new uint256[](nAttestants);
        for (uint256 i = 0; i < nAttestants; i++) {
            ids[i] = _mint(address(uint160(0x1000 + i)), int32(uint32(i)));
            _attest(ids[i]);
        }
        uint256 perSeal = network.reward(0);
        skip(network.EPOCH_DURATION());
        uint256 total = 0;
        for (uint256 i = 0; i < nAttestants; i++) {
            uint256 before = address(uint160(0x1000 + i)).balance;
            _claim(ids[i], 0);
            total += address(uint160(0x1000 + i)).balance - before;
        }
        assertLe(total, perSeal * nAttestants);
        assertLe(total, EMISSION * nAttestants); // never more than if each one received a single seal's share
    }

    function testFuzz_reward_increasesAsNDecreases(uint8 n1, uint8 n2) public {
        vm.assume(n1 > 0 && n2 > 0 && n1 < n2 && n2 <= 60);
        for (uint256 i = 0; i < n1; i++) {
            _attest(_mint(playerA, int32(uint32(i))));
        }
        uint256 r1 = network.reward(0);
        for (uint256 i = n1; i < n2; i++) {
            _attest(_mint(playerA, int32(uint32(i))));
        }
        uint256 r2 = network.reward(0);
        assertLe(r2, r1); // more attestants that epoch => smaller or equal share per seal
    }

    function testFuzz_refuse_claimBeforeClosingNoMatterTheInstant(uint32 offset) public {
        vm.assume(offset < network.EPOCH_DURATION());
        uint256 id = _mint(playerA, 1);
        _attest(id);
        skip(offset); // stays within epoch 0: never closed
        vm.prank(operator);
        vm.expectRevert(Network.EpochNotClosed.selector);
        network.claim(id, 0);
    }
}
