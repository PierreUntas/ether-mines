// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Seal} from "../src/Seal.sol";
import {IERC5192} from "../src/IERC5192.sol";

contract SealTest is Test {
    Seal seal;
    address admin = makeAddr("admin");
    address operator = makeAddr("operator");
    address player = makeAddr("player");
    address other = makeAddr("other");

    event Locked(uint256 tokenId);
    event SealForged(
        uint256 indexed tokenId, address indexed to, string world, int32 x, int32 y, int32 z, uint64 forgedAt
    );

    function setUp() public {
        seal = new Seal(admin);
        bytes32 operatorRole = seal.OPERATOR_ROLE(); // evaluated before the prank: grantRole() itself is correctly called as admin
        vm.prank(admin);
        seal.grantRole(operatorRole, operator);
    }

    function _mint(address to, string memory world, int32 x, int32 y, int32 z, uint64 forgedAt)
        internal
        returns (uint256)
    {
        vm.prank(operator);
        return seal.mint(to, world, x, y, z, forgedAt);
    }

    // ---------- minting ----------

    function test_mint_toTheRightOwnerWithTheRightTokenId() public {
        uint256 id = _mint(player, "main", 46, 33, -14, 1000);
        assertEq(id, seal.computeTokenId("main", 46, 33, -14));
        assertEq(seal.ownerOf(id), player);
        (string memory world, int32 x, int32 y, int32 z, uint64 forgedAt) = seal.validators(id);
        assertEq(world, "main");
        assertEq(x, 46);
        assertEq(y, 33);
        assertEq(z, -14);
        assertEq(forgedAt, 1000);
    }

    function test_mint_emitsLockedAndSealForged() public {
        uint256 id = seal.computeTokenId("main", 1, 2, 3);
        vm.expectEmit(true, true, true, true, address(seal));
        emit Locked(id);
        vm.expectEmit(true, true, true, true, address(seal));
        emit SealForged(id, player, "main", 1, 2, 3, 42);
        _mint(player, "main", 1, 2, 3, 42);
    }

    function test_refuse_mintByAnyoneWhoIsNotOperator() public {
        bytes32 operatorRole = seal.OPERATOR_ROLE();
        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, other, operatorRole)
        );
        seal.mint(player, "main", 0, 0, 0, 0);
    }

    function test_refuse_doubleMintOfTheSameValidator() public {
        _mint(player, "main", 5, 5, 5, 1);
        vm.expectRevert();
        _mint(other, "main", 5, 5, 5, 2); // same (world, x, y, z): same tokenId
    }

    function test_differentWorlds_sameCoordinates_differentTokenIds() public {
        uint256 id1 = _mint(player, "main", 5, 5, 5, 1);
        uint256 id2 = _mint(player, "test", 5, 5, 5, 1);
        assertTrue(id1 != id2);
    }

    // ---------- ERC-5192: lock ----------

    function test_locked_trueRightAfterMinting() public {
        uint256 id = _mint(player, "main", 0, 0, 0, 0);
        assertTrue(seal.locked(id));
    }

    function test_refuse_lockedOnNonexistentToken() public {
        vm.expectRevert();
        seal.locked(999);
    }

    function test_refuse_transferFrom() public {
        uint256 id = _mint(player, "main", 0, 0, 0, 0);
        vm.prank(player);
        vm.expectRevert(Seal.TokenLocked.selector);
        seal.transferFrom(player, other, id);
    }

    function test_refuse_safeTransferFrom() public {
        uint256 id = _mint(player, "main", 0, 0, 0, 0);
        vm.prank(player);
        vm.expectRevert(Seal.TokenLocked.selector);
        seal.safeTransferFrom(player, other, id);
    }

    function test_refuse_approve() public {
        uint256 id = _mint(player, "main", 0, 0, 0, 0);
        vm.prank(player);
        vm.expectRevert(Seal.TokenLocked.selector);
        seal.approve(other, id);
    }

    function test_refuse_setApprovalForAll() public {
        vm.prank(player);
        vm.expectRevert(Seal.TokenLocked.selector);
        seal.setApprovalForAll(other, true);
    }

    function test_supportsInterface_ierc5192AndErc721AndAccessControl() public view {
        assertTrue(seal.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(seal.supportsInterface(0x80ac58cd)); // IERC721
        assertTrue(seal.supportsInterface(type(IAccessControl).interfaceId));
    }

    // ---------- onchain metadata ----------

    function test_tokenURI_startsWithTheRightSchema() public {
        uint256 id = _mint(player, "main", 1, -2, 3, 123456);
        string memory uri = seal.tokenURI(id);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_refuse_tokenURIOnNonexistentToken() public {
        vm.expectRevert();
        seal.tokenURI(999);
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

    function testFuzz_computeTokenId_deterministicAndSensitiveToEachCoordinate(
        string memory world,
        int32 x,
        int32 y,
        int32 z
    ) public view {
        uint256 id = seal.computeTokenId(world, x, y, z);
        assertEq(id, seal.computeTokenId(world, x, y, z)); // deterministic
        if (x != type(int32).max) assertTrue(id != seal.computeTokenId(world, x + 1, y, z));
        if (y != type(int32).max) assertTrue(id != seal.computeTokenId(world, x, y + 1, z));
        if (z != type(int32).max) assertTrue(id != seal.computeTokenId(world, x, y, z + 1));
    }

    function testFuzz_mint_extremeCoordinates_neverRevertsInTokenURI(int32 x, int32 y, int32 z, uint64 forgedAt)
        public
    {
        uint256 id = _mint(player, "main", x, y, z, forgedAt);
        string memory uri = seal.tokenURI(id); // must never revert, even at the bounds of int32/uint64
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function testFuzz_refuse_transferNoMatterWhoCalls(address caller, address recipient) public {
        vm.assume(recipient != address(0));
        uint256 id = _mint(player, "main", 7, 7, 7, 7);
        vm.prank(caller);
        vm.expectRevert(); // neither the owner, nor the operator, nor anyone can transfer a seal
        seal.transferFrom(player, recipient, id);
    }

    function testFuzz_refuse_mintByAnyoneExceptOperator(address caller) public {
        vm.assume(caller != operator);
        vm.prank(caller);
        vm.expectRevert();
        seal.mint(player, "main", 0, 0, 0, 0);
    }
}
