// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {PayvokeVaultFinanceFixture} from "./PayvokeVaultFinance.t.sol";
import {PayvokeVault} from "./PayvokeVault.sol";
import {MockUSDC} from "./test/MockUSDC.sol";
import {AdversarialUSDC} from "./test/AdversarialUSDC.sol";

contract PayvokeVaultAdversarialTest is PayvokeVaultFinanceFixture {
    function createToken() internal override returns (MockUSDC) { return new AdversarialUSDC(); }

    function evil() internal view returns (AdversarialUSDC) { return AdversarialUSDC(address(token)); }

    function assertReentryBlocked() internal view {
        assertFalse(evil().lastReentrySucceeded());
        assertEq(evil().lastReentryError(), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertConservation();
    }

    function test_ReentrantTokenCannotReenterAnyTransferPath() public {
        evil().setCallback(address(vault), abi.encodeCall(vault.claim, (address(1))));
        fundAuth(keccak256("auth"), 10);
        assertReentryBlocked();
        fundGrant(keccak256("grant"), 10);
        assertReentryBlocked();
        executeDecision(decision(1, false));
        assertReentryBlocked();
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        assertReentryBlocked();
        holdId = keccak256("auth");
        vm.warp(vault.getHold(holdId).resolveBy);
        vm.prank(buyer);
        vault.reclaim(holdId);
        assertReentryBlocked();
    }

    function test_ReentrantTokenCannotReenterClaim() public {
        evil().setReturnFalse(true);
        executeDecision(decision(100, false));
        assertEq(vault.claimable(buyer), 100);
        evil().setReturnFalse(false);
        evil().setCallback(address(vault), abi.encodeCall(vault.claim, (address(1))));
        vm.prank(buyer);
        vault.claim(buyer);
        assertReentryBlocked();
    }

    function test_FalseERC20ReturnDefersPayoutsAndCannotFundAGrant() public {
        evil().setReturnFalse(true);
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(1000, true));
        assertEq(vault.claimable(buyer), 1000);
        assertEq(vault.claimable(provider), 8820);
        assertEq(vault.claimable(feeRecipient), 180);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("grant"), 10);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("SafeERC20FailedOperation(address)")), address(token)));
        vault.fundWithGrant(q, a, signature);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("SafeERC20FailedOperation(address)")), address(token)));
        vault.claim(provider);
        assertEq(vault.totalClaimable(), 10000);
        assertConservation();
    }

    function test_FeeOnTransferCannotCreateAnUnderfundedHold() public {
        evil().setChargeTransferFee(true);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("auth"), 100);
        bytes memory signature = receiveSignature(q, buyerKey);
        vm.expectRevert(PayvokeVault.InvalidAsset.selector);
        vault.fundWithAuthorization(q, signature);
        q = quote(keccak256("grant"), 100);
        (PayvokeVault.DebitAuthorization memory a, bytes memory grantSignature) = authorize(q);
        vm.expectRevert(PayvokeVault.InvalidAsset.selector);
        vault.fundWithGrant(q, a, grantSignature);
        assertEq(vault.totalHeld(), 10000);
        assertConservation();
    }
}
