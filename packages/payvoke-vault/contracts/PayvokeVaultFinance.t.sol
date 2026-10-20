// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {PayvokeVaultFixture} from "./PayvokeVault.t.sol";
import {PayvokeVault} from "./PayvokeVault.sol";
import {ContractApprover} from "./test/ContractApprover.sol";

abstract contract PayvokeVaultFinanceFixture is PayvokeVaultFixture {
    uint256 approverKey = 0xA990;
    address executor = address(0xE0);
    bytes32 holdId = keccak256("finance-hold");

    function setUp() public virtual override {
        super.setUp();
        vault.grantRole(vault.FINANCE_EXECUTOR_ROLE(), executor);
        address approver = vm.addr(approverKey);
        vault.grantRole(vault.REFUND_APPROVER_ROLE(), approver);
        vault.grantRole(vault.RELEASE_APPROVER_ROLE(), approver);
        vault.grantRole(vault.DISPUTE_RESOLVER_ROLE(), approver);
        reserve(holdId, 10000);
    }

    function decision(uint256 refund, bool release) internal view returns (PayvokeVault.ResolutionDecision memory) {
        PayvokeVault.HoldView memory hold = vault.getHold(holdId);
        return PayvokeVault.ResolutionDecision(holdId, keccak256(abi.encode(holdId, hold.version)), hold.version,
            refund, release, false, hold.resolveBy);
    }

    function signDecision(PayvokeVault.ResolutionDecision memory d) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(approverKey, vault.hashDecision(d));
        return abi.encodePacked(r, s, v);
    }

    function executeDecision(PayvokeVault.ResolutionDecision memory d) internal {
        bytes memory signature = signDecision(d);
        vm.prank(executor);
        vault.applyDecision(d, vm.addr(approverKey), signature);
    }

    function assertConservation() internal view {
        PayvokeVault.HoldView memory hold = vault.getHold(holdId);
        assertEq(hold.gross, hold.refunded + hold.remaining + hold.providerReleased + hold.feeReleased);
        assertGe(token.balanceOf(address(vault)), vault.totalAvailable() + vault.totalHeld() +
            vault.totalProviderClaimable() + vault.totalPlatformClaimable());
    }
}

contract PayvokeVaultFinanceTest is PayvokeVaultFinanceFixture {
    function test_PartialRefundsThenReleaseOnNet() public {
        executeDecision(decision(1111, false));
        executeDecision(decision(2222, false));
        assertEq(vault.availableBalance(buyer), 993333);
        assertEq(vault.providerClaimable(address(0xF0)), 0);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        PayvokeVault.HoldView memory hold = vault.getHold(holdId);
        assertEq(hold.remaining, 0);
        assertEq(hold.refunded, 3333);
        assertEq(hold.feeReleased, 133);
        assertEq(hold.providerReleased, 6534);
        assertTrue(hold.closed);
        assertEq(vault.platformClaimable(address(0xFE)), 133);
        assertEq(vault.providerClaimable(address(0xF0)), 6534);
        assertConservation();
    }

    function test_FullRefundClosesWithoutResettingGrant() public {
        executeDecision(decision(10000, false));
        assertTrue(vault.getHold(holdId).closed);
        assertEq(vault.availableBalance(buyer), 1000000);
        assertEq(vault.totalHeld(), 0);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
        assertEq(vault.getGrant(buyer, grantId).spentInPeriod, 10000);
        assertConservation();
    }

    function test_ReclaimAtDeadlineWhilePausedAndDisputed() public {
        vm.prank(buyer);
        vault.openDispute(holdId, keccak256("evidence"));
        vault.pause();
        vm.warp(vault.getHold(holdId).resolveBy);
        vm.prank(buyer);
        vault.reclaim(holdId);
        assertTrue(vault.getHold(holdId).closed);
        assertEq(vault.availableBalance(buyer), 1000000);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
        assertConservation();
    }

    function expectDecisionFailure(PayvokeVault.ResolutionDecision memory d, bytes4 error) internal {
        bytes memory signature = signDecision(d);
        PayvokeVault.HoldView memory beforeHold = vault.getHold(d.holdId);
        uint256 beforeAvailable = vault.totalAvailable();
        uint256 beforeHeld = vault.totalHeld();
        vm.prank(executor);
        vm.expectRevert(error);
        vault.applyDecision(d, vm.addr(approverKey), signature);
        assertEq(keccak256(abi.encode(vault.getHold(d.holdId))), keccak256(abi.encode(beforeHold)));
        assertEq(vault.totalAvailable(), beforeAvailable);
        assertEq(vault.totalHeld(), beforeHeld);
        assertFalse(vault.usedDecisionIds(d.decisionId));
        assertConservation();
    }

    function test_ExecutorNeedsSeparateApproval() public {
        PayvokeVault.ResolutionDecision memory d = decision(100, false);
        bytes memory signature = signDecision(d);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.applyDecision(d, vm.addr(approverKey), signature);
        vm.prank(executor);
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.applyDecision(d, vm.addr(approverKey), hex"abcd");
        vault.grantRole(vault.REFUND_APPROVER_ROLE(), executor);
        vm.prank(executor);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.applyDecision(d, executor, signature);
        assertConservation();
    }

    function test_ApproverRoleRevokedAfterSigning() public {
        vault.revokeRole(vault.REFUND_APPROVER_ROLE(), vm.addr(approverKey));
        expectDecisionFailure(decision(100, false), PayvokeVault.Unauthorized.selector);
    }

    function test_CombinedRefundAndReleaseRequiresBothRoles() public {
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        vault.revokeRole(vault.RELEASE_APPROVER_ROLE(), vm.addr(approverKey));
        expectDecisionFailure(decision(100, true), PayvokeVault.Unauthorized.selector);
        vault.grantRole(vault.RELEASE_APPROVER_ROLE(), vm.addr(approverKey));
        vault.revokeRole(vault.REFUND_APPROVER_ROLE(), vm.addr(approverKey));
        expectDecisionFailure(decision(100, true), PayvokeVault.Unauthorized.selector);
        vault.grantRole(vault.REFUND_APPROVER_ROLE(), vm.addr(approverKey));
        executeDecision(decision(100, true));
        assertEq(vault.getHold(holdId).feeReleased, 198);
        assertEq(vault.getHold(holdId).providerReleased, 9702);
        assertConservation();
    }

    function test_DecisionReplayIsGlobalAcrossHolds() public {
        PayvokeVault.ResolutionDecision memory first = decision(100, false);
        bytes memory signature = signDecision(first);
        executeDecision(first);
        vm.prank(executor);
        vm.expectRevert(PayvokeVault.DecisionReplay.selector);
        vault.applyDecision(first, vm.addr(approverKey), signature);
        bytes32 other = keccak256("other");
        reserve(other, 5000);
        first.holdId = other;
        first.expectedVersion = 1;
        signature = signDecision(first);
        vm.prank(executor);
        vm.expectRevert(PayvokeVault.DecisionReplay.selector);
        vault.applyDecision(first, vm.addr(approverKey), signature);
        assertEq(vault.getHold(other).remaining, 5000);
        assertConservation();
    }

    function test_StaleApprovalAfterAnotherDecision() public {
        PayvokeVault.ResolutionDecision memory stale = decision(100, false);
        stale.decisionId = keccak256("stale");
        executeDecision(decision(200, false));
        expectDecisionFailure(stale, PayvokeVault.HoldVersionMismatch.selector);
    }

    function test_DisputeInvalidatesAlreadySignedApproval() public {
        PayvokeVault.ResolutionDecision memory stale = decision(0, true);
        vm.prank(buyer);
        vault.openDispute(holdId, keccak256("evidence"));
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        expectDecisionFailure(stale, PayvokeVault.HoldVersionMismatch.selector);
    }

    function test_DisputedHoldRequiresFlagAndResolverEvenForRefund() public {
        vm.prank(buyer);
        vault.openDispute(holdId, keccak256("evidence"));
        expectDecisionFailure(decision(100, false), PayvokeVault.HoldDisputed.selector);
        PayvokeVault.ResolutionDecision memory d = decision(100, false);
        d.resolveDispute = true;
        vault.revokeRole(vault.DISPUTE_RESOLVER_ROLE(), vm.addr(approverKey));
        expectDecisionFailure(d, PayvokeVault.Unauthorized.selector);
        vault.grantRole(vault.DISPUTE_RESOLVER_ROLE(), vm.addr(approverKey));
        executeDecision(d);
        assertTrue(vault.getHold(holdId).disputed);
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        d = decision(0, true);
        expectDecisionFailure(d, PayvokeVault.HoldDisputed.selector);
        d.resolveDispute = true;
        executeDecision(d);
        assertTrue(vault.getHold(holdId).closed);
        assertFalse(vault.getHold(holdId).disputed);
        assertConservation();
    }

    function test_ResolveFlagAlwaysRequiresResolver() public {
        PayvokeVault.ResolutionDecision memory d = decision(100, false);
        d.resolveDispute = true;
        vault.revokeRole(vault.DISPUTE_RESOLVER_ROLE(), vm.addr(approverKey));
        expectDecisionFailure(d, PayvokeVault.Unauthorized.selector);
    }

    function test_NoEffectDecisionRejected() public {
        expectDecisionFailure(decision(0, false), PayvokeVault.NoEffect.selector);
        PayvokeVault.ResolutionDecision memory d = decision(0, false);
        d.resolveDispute = true;
        expectDecisionFailure(d, PayvokeVault.NoEffect.selector);
    }

    function test_RefundCannotExceedRemaining() public {
        expectDecisionFailure(decision(10001, false), PayvokeVault.InvalidAmount.selector);
    }

    function test_ReleaseTooEarlyEvenWithValidApproval() public {
        vm.warp(vault.getHold(holdId).releaseNotBefore - 1);
        expectDecisionFailure(decision(0, true), PayvokeVault.ReleaseTooEarly.selector);
    }

    function test_ApprovalExpiredAtExactDeadline() public {
        PayvokeVault.ResolutionDecision memory d = decision(100, false);
        d.validUntil = uint48(vm.getBlockTimestamp());
        expectDecisionFailure(d, PayvokeVault.ResolutionExpired.selector);
    }

    function test_DecisionAtResolveDeadlineCannotCaptureBeforeReclaim() public {
        PayvokeVault.ResolutionDecision memory d = decision(0, true);
        d.validUntil += 100;
        vm.warp(vault.getHold(holdId).resolveBy);
        expectDecisionFailure(d, PayvokeVault.ResolutionExpired.selector);
        vm.prank(buyer);
        vault.reclaim(holdId);
        d = decision(1, false);
        d.decisionId = keccak256("late-refund");
        expectDecisionFailure(d, PayvokeVault.HoldClosed.selector);
    }

    function test_DecisionJustBeforeResolveDeadlineCanClose() public {
        vm.warp(vault.getHold(holdId).resolveBy - 1);
        executeDecision(decision(0, true));
        vm.warp(vault.getHold(holdId).resolveBy);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.HoldClosed.selector);
        vault.reclaim(holdId);
        assertConservation();
    }

    function test_RefundAfterReleaseOrFullRefundRejected() public {
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        expectDecisionFailure(decision(1, false), PayvokeVault.HoldClosed.selector);
        expectDecisionFailure(decision(0, true), PayvokeVault.HoldClosed.selector);
    }

    function test_FullRefundCanCloseDuringPause() public {
        vault.pause();
        executeDecision(decision(10000, false));
        expectDecisionFailure(decision(1, false), PayvokeVault.HoldClosed.selector);
        vm.prank(buyer);
        vault.withdrawAvailable(1000000);
        assertConservation();
    }

    function test_OnlyBuyerCanDisputeOrReclaim() public {
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.openDispute(holdId, bytes32(0));
        vm.warp(vault.getHold(holdId).resolveBy);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.reclaim(holdId);
    }

    function test_DisputeCannotReopenOrChangeEvidenceRepeatedly() public {
        vm.prank(buyer);
        vault.openDispute(holdId, keccak256("evidence"));
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.HoldDisputed.selector);
        vault.openDispute(holdId, keccak256("other-evidence"));
        PayvokeVault.ResolutionDecision memory d = decision(10000, false);
        d.resolveDispute = true;
        executeDecision(d);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.HoldClosed.selector);
        vault.openDispute(holdId, bytes32(0));
    }

    function test_DisputeAfterResolveDeadlineRejected() public {
        vm.warp(vault.getHold(holdId).resolveBy);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.ResolutionExpired.selector);
        vault.openDispute(holdId, bytes32(0));
    }

    function test_ReclaimTooEarlyAndThenOnlyRemaining() public {
        executeDecision(decision(1234, false));
        vm.warp(vault.getHold(holdId).resolveBy - 1);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.ReclaimTooEarly.selector);
        vault.reclaim(holdId);
        vm.warp(vault.getHold(holdId).resolveBy);
        vm.prank(buyer);
        vault.reclaim(holdId);
        assertEq(vault.getHold(holdId).refunded, 10000);
        assertEq(vault.availableBalance(buyer), 1000000);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.HoldClosed.selector);
        vault.reclaim(holdId);
        assertConservation();
    }

    function test_NonexistentHoldIsNotARealHold() public {
        bytes32 missing = keccak256("missing");
        vm.expectRevert(PayvokeVault.HoldNotFound.selector);
        vault.openDispute(missing, bytes32(0));
        vm.expectRevert(PayvokeVault.HoldNotFound.selector);
        vault.reclaim(missing);
        PayvokeVault.ResolutionDecision memory d = decision(1, false);
        d.holdId = missing;
        expectDecisionFailure(d, PayvokeVault.HoldNotFound.selector);
    }

    function test_ReplayingReserveAfterTerminalDoesNotReopenHold() public {
        PayvokeVault.InvocationQuote memory q = quote(holdId, 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        executeDecision(decision(10000, false));
        vault.reserveHold(q, a, signature);
        assertTrue(vault.getHold(holdId).closed);
        assertEq(vault.totalHeld(), 0);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
    }

    function test_WithdrawClaimablesOnlyToTheirOwnersAndWhilePaused() public {
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        vault.pause();
        vm.expectRevert(PayvokeVault.InsufficientClaimable.selector);
        vault.withdrawProvider(1);
        vm.expectRevert(PayvokeVault.InsufficientClaimable.selector);
        vault.withdrawPlatform(1);
        vm.prank(address(0xF0));
        vault.withdrawProvider(1000);
        vm.prank(address(0xF0));
        vault.withdrawProvider(8800);
        vm.prank(address(0xFE));
        vault.withdrawPlatform(200);
        assertEq(token.balanceOf(address(0xF0)), 9800);
        assertEq(token.balanceOf(address(0xFE)), 200);
        assertEq(vault.totalProviderClaimable(), 0);
        assertEq(vault.totalPlatformClaimable(), 0);
        vm.prank(address(0xF0));
        vm.expectRevert(PayvokeVault.InsufficientClaimable.selector);
        vault.withdrawProvider(1);
        assertConservation();
    }

    function test_ZeroWithdrawalsRejected() public {
        vm.expectRevert(PayvokeVault.InvalidAmount.selector);
        vault.withdrawProvider(0);
        vm.expectRevert(PayvokeVault.InvalidAmount.selector);
        vault.withdrawPlatform(0);
    }

    function test_FrozenTokenDoesNotBlockInternalRefundButRollsBackPayoutWithdrawals() public {
        token.setFrozen(true);
        executeDecision(decision(1000, false));
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        vm.prank(address(0xF0));
        vm.expectRevert(bytes("USDC frozen"));
        vault.withdrawProvider(8820);
        vm.prank(address(0xFE));
        vm.expectRevert(bytes("USDC frozen"));
        vault.withdrawPlatform(180);
        assertEq(vault.totalProviderClaimable(), 8820);
        assertEq(vault.totalPlatformClaimable(), 180);
        assertConservation();
    }

    function test_ContractWalletApproverUsesERC1271AndCanInvalidateApproval() public {
        ContractApprover approver = new ContractApprover(vm.addr(approverKey));
        vault.grantRole(vault.REFUND_APPROVER_ROLE(), address(approver));
        PayvokeVault.ResolutionDecision memory d = decision(123, false);
        bytes memory signature = signDecision(d);
        approver.setEnabled(false);
        vm.prank(executor);
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.applyDecision(d, address(approver), signature);
        approver.setEnabled(true);
        vm.prank(executor);
        vault.applyDecision(d, address(approver), signature);
        assertEq(vault.getHold(holdId).refunded, 123);
        assertConservation();
    }

    function testFuzz_PartialRefundsAndFeeRounding(uint96 rawGross, uint96 rawRefund, uint16 rawFee) public {
        uint256 gross = bound(rawGross, 1, 100000);
        uint256 refund = bound(rawRefund, 0, gross - 1);
        uint16 fee = uint16(bound(rawFee, 0, 500));
        bytes32 id = keccak256("fuzz-finance");
        PayvokeVault.InvocationQuote memory q = quote(id, gross);
        q.feeBps = fee;
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vault.reserveHold(q, a, signature);
        holdId = id;
        uint256 first = refund / 2;
        if (first > 0) executeDecision(decision(first, false));
        if (refund - first > 0) executeDecision(decision(refund - first, false));
        vm.warp(q.releaseNotBefore);
        executeDecision(decision(0, true));
        PayvokeVault.HoldView memory hold = vault.getHold(id);
        uint256 net = gross - refund;
        assertEq(hold.feeReleased, net * fee / 10000);
        assertEq(hold.providerReleased, net - hold.feeReleased);
        assertEq(hold.refunded, refund);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, gross + 10000);
        assertConservation();
    }

    function test_FeeCalculationDoesNotOverflowUint256Product() public {
        uint256 gross = uint256(1) << 250;
        token.mint(buyer, gross);
        PayvokeVault.GrantConfig memory cfg = config();
        cfg.maxPerCall = gross;
        cfg.maxPerPeriod = gross;
        cfg.maxTotal = gross;
        bytes32 largeGrant = keccak256("large-grant");
        vm.startPrank(buyer);
        vault.deposit(gross);
        vault.registerGrant(largeGrant, cfg);
        vm.stopPrank();
        holdId = keccak256("large-hold");
        PayvokeVault.InvocationQuote memory q = quote(holdId, gross);
        q.feeBps = 500;
        PayvokeVault.DebitAuthorization memory a = PayvokeVault.DebitAuthorization(vault.hashQuote(q), largeGrant, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, vault.hashAuthorization(a));
        vault.reserveHold(q, a, abi.encodePacked(r, s, v));
        vm.warp(q.releaseNotBefore);
        executeDecision(decision(0, true));
        assertEq(vault.getHold(holdId).feeReleased, gross / 20);
        assertEq(vault.getHold(holdId).providerReleased, gross - gross / 20);
        assertConservation();
    }
}
