// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {PayvokeVaultFinanceFixture} from "./PayvokeVaultFinance.t.sol";
import {PayvokeVault} from "./PayvokeVault.sol";
import {MockUSDC} from "./test/MockUSDC.sol";
import {AdversarialUSDC} from "./test/AdversarialUSDC.sol";

contract PayvokeVaultAdversarialTest is PayvokeVaultFinanceFixture {
    function createToken() internal override returns (MockUSDC) { return new AdversarialUSDC(); }

    function assertReentryBlocked() internal view {
        AdversarialUSDC evil = AdversarialUSDC(address(token));
        assertFalse(evil.lastReentrySucceeded());
        assertEq(evil.lastReentryError(), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertConservation();
    }

    function test_ReentrantTokenCannotReenterAnyTransferPath() public {
        AdversarialUSDC evil = AdversarialUSDC(address(token));
        evil.setCallback(address(vault), abi.encodeCall(vault.deposit, (1)));
        token.mint(buyer, 10);
        vm.prank(buyer);
        vault.deposit(10);
        assertReentryBlocked();
        vm.prank(buyer);
        vault.withdrawAvailable(10);
        assertReentryBlocked();
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        vm.prank(address(0xF0));
        vault.withdrawProvider(1);
        assertReentryBlocked();
        vm.prank(address(0xFE));
        vault.withdrawPlatform(1);
        assertReentryBlocked();
    }

    function test_FalseERC20ReturnCannotCreateCreditOrEraseWithdrawals() public {
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        AdversarialUSDC(address(token)).setReturnFalse(true);
        bytes4 error = bytes4(keccak256("SafeERC20FailedOperation(address)"));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(error, address(token)));
        vault.deposit(100);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(error, address(token)));
        vault.withdrawAvailable(100);
        vm.prank(address(0xF0));
        vm.expectRevert(abi.encodeWithSelector(error, address(token)));
        vault.withdrawProvider(100);
        vm.prank(address(0xFE));
        vm.expectRevert(abi.encodeWithSelector(error, address(token)));
        vault.withdrawPlatform(100);
        assertEq(vault.availableBalance(buyer), 990000);
        assertEq(vault.providerClaimable(address(0xF0)), 9800);
        assertEq(vault.platformClaimable(address(0xFE)), 200);
        assertConservation();
    }

    function test_FeeOnTransferCannotInflateAvailable() public {
        token.mint(buyer, 100);
        AdversarialUSDC(address(token)).setChargeTransferFee(true);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.InvalidAsset.selector);
        vault.deposit(100);
        assertEq(vault.availableBalance(buyer), 990000);
        assertEq(token.balanceOf(buyer), 100);
        assertConservation();
    }
}
