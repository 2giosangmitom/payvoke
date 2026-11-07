// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Vm} from "forge-std/Vm.sol";
import {PayvokeVaultFixture} from "./PayvokeVault.t.sol";
import {PayvokeVault} from "./PayvokeVault.sol";
import {ContractApprover} from "./test/ContractApprover.sol";

abstract contract PayvokeVaultFinanceFixture is PayvokeVaultFixture {
    uint256 approverKey = 0xA990;
    address executor = address(0xE0);
    address provider = address(0xF0);
    address feeRecipient = address(0xFE);
    bytes32 holdId = keccak256("finance-hold");

    function setUp() public virtual override {
        super.setUp();
        vault.grantRole(vault.FINANCE_EXECUTOR_ROLE(), executor);
        address approver = vm.addr(approverKey);
        vault.grantRole(vault.REFUND_APPROVER_ROLE(), approver);
        vault.grantRole(vault.RELEASE_APPROVER_ROLE(), approver);
        fundAuth(holdId, 10000);
    }

    function decision(uint256 refund, bool release) internal view returns (PayvokeVault.ResolutionDecision memory) {
        PayvokeVault.HoldView memory hold = vault.getHold(holdId);
        return PayvokeVault.ResolutionDecision(holdId, keccak256(abi.encode(holdId, hold.version)), hold.version,
            refund, release, hold.resolveBy);
    }

    function signDecision(PayvokeVault.ResolutionDecision memory d) internal view returns (bytes memory) {
        return sign(approverKey, vault.hashDecision(d));
    }

    function executeDecision(PayvokeVault.ResolutionDecision memory d) internal {
        bytes memory signature = signDecision(d);
        vm.prank(executor);
        vault.applyDecision(d, vm.addr(approverKey), signature);
    }

    function assertConservation() internal view {
        PayvokeVault.HoldView memory hold = vault.getHold(holdId);
        assertEq(hold.gross, hold.refunded + hold.remaining + hold.providerReleased + hold.feeReleased);
        assertGe(token.balanceOf(address(vault)), vault.totalHeld() + vault.totalClaimable());
    }
}

contract PayvokeVaultFinanceTest is PayvokeVaultFinanceFixture {
    function test_PartialRefundsThenReleasePayWalletsDirectly() public {
        executeDecision(decision(1111, false));
        executeDecision(decision(2222, false));
        assertEq(token.balanceOf(buyer), FUNDS - 10000 + 3333);
        assertEq(token.balanceOf(provider), 0);
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        PayvokeVault.HoldView memory hold = vault.getHold(holdId);
        assertEq(hold.remaining, 0);
        assertEq(hold.refunded, 3333);
        assertEq(hold.feeReleased, 133);
        assertEq(hold.providerReleased, 6534);
        assertTrue(hold.closed);
        assertEq(token.balanceOf(feeRecipient), 133);
        assertEq(token.balanceOf(provider), 6534);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(vault.totalClaimable(), 0);
        assertConservation();
    }

    function test_FullRefundReturnsToTheWallet() public {
        executeDecision(decision(10000, false));
        assertTrue(vault.getHold(holdId).closed);
        assertEq(token.balanceOf(buyer), FUNDS);
        assertEq(vault.totalHeld(), 0);
        assertConservation();
    }

    function test_GrantFundedRefundKeepsGrantCounters() public {
        holdId = keccak256("grant-hold");
        fundGrant(holdId, 10000);
        executeDecision(decision(10000, false));
        assertEq(token.balanceOf(buyer), FUNDS - 10000);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
        assertEq(vault.getGrant(buyer, grantId).spentInPeriod, 10000);
        // The refund lands in the wallet; the spent allowance is not restored.
        assertEq(token.allowance(buyer, address(vault)), GRANT_TOTAL - 10000);
        assertConservation();
    }

    function test_ReclaimAtDeadlineWhilePaused() public {
        vault.pause();
        vm.warp(vault.getHold(holdId).resolveBy);
        vm.prank(buyer);
        vault.reclaim(holdId);
        assertTrue(vault.getHold(holdId).closed);
        assertEq(token.balanceOf(buyer), FUNDS);
        assertConservation();
    }

    function expectDecisionFailure(PayvokeVault.ResolutionDecision memory d, bytes4 error) internal {
        bytes memory signature = signDecision(d);
        PayvokeVault.HoldView memory beforeHold = vault.getHold(d.holdId);
        uint256 beforeVault = token.balanceOf(address(vault));
        uint256 beforeHeld = vault.totalHeld();
        vm.prank(executor);
        vm.expectRevert(error);
        vault.applyDecision(d, vm.addr(approverKey), signature);
        assertEq(keccak256(abi.encode(vault.getHold(d.holdId))), keccak256(abi.encode(beforeHold)));
        assertEq(token.balanceOf(address(vault)), beforeVault);
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
        assertEq(token.balanceOf(buyer), FUNDS - 9900);
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
        fundAuth(other, 5000);
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

    function test_NoEffectDecisionRejected() public {
        expectDecisionFailure(decision(0, false), PayvokeVault.NoEffect.selector);
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
        assertEq(token.balanceOf(buyer), FUNDS);
        assertConservation();
    }

    function test_OnlyBuyerCanReclaim() public {
        vm.warp(vault.getHold(holdId).resolveBy);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.reclaim(holdId);
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
        assertEq(token.balanceOf(buyer), FUNDS);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.HoldClosed.selector);
        vault.reclaim(holdId);
        assertConservation();
    }

    function test_NonexistentHoldIsNotARealHold() public {
        bytes32 missing = keccak256("missing");
        vm.expectRevert(PayvokeVault.HoldNotFound.selector);
        vault.reclaim(missing);
        PayvokeVault.ResolutionDecision memory d = decision(1, false);
        d.holdId = missing;
        expectDecisionFailure(d, PayvokeVault.HoldNotFound.selector);
    }

    function test_ReplayingFundingAfterTerminalDoesNotReopenHold() public {
        PayvokeVault.InvocationQuote memory q = quote(holdId, 10000);
        bytes memory signature = receiveSignature(q, buyerKey);
        executeDecision(decision(10000, false));
        vault.fundWithAuthorization(q, signature);
        assertTrue(vault.getHold(holdId).closed);
        assertEq(vault.totalHeld(), 0);
        assertEq(token.balanceOf(buyer), FUNDS);

        holdId = keccak256("grant-hold");
        q = quote(holdId, 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory grantSignature) = authorize(q);
        vault.fundWithGrant(q, a, grantSignature);
        executeDecision(decision(10000, false));
        vault.fundWithGrant(q, a, grantSignature);
        assertTrue(vault.getHold(holdId).closed);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
    }

    function test_BlacklistedProviderIsDeferredWithoutBlockingTheBuyer() public {
        token.setBlacklisted(provider, true);
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        vm.recordLogs();
        executeDecision(decision(1000, true));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool deferred;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == PayvokeVault.PaymentDeferred.selector) deferred = true;
        }
        assertTrue(deferred);
        assertEq(token.balanceOf(buyer), FUNDS - 9000);
        assertEq(token.balanceOf(feeRecipient), 180);
        assertEq(vault.claimable(provider), 8820);
        assertEq(vault.totalClaimable(), 8820);
        assertEq(token.balanceOf(address(vault)), 8820);
        // Still blacklisted: the provider claims to another address.
        vm.prank(provider);
        vault.claim(address(0xF1));
        assertEq(token.balanceOf(address(0xF1)), 8820);
        assertEq(vault.totalClaimable(), 0);
        assertConservation();
    }

    function test_BlacklistedBuyerRefundIsClaimable() public {
        token.setBlacklisted(buyer, true);
        executeDecision(decision(10000, false));
        assertTrue(vault.getHold(holdId).closed);
        assertEq(vault.claimable(buyer), 10000);
        token.setBlacklisted(buyer, false);
        vm.prank(buyer);
        vault.claim(buyer);
        assertEq(token.balanceOf(buyer), FUNDS);
        assertConservation();
    }

    function test_ClaimNeedsABalanceAndARecipient() public {
        vm.expectRevert(PayvokeVault.InsufficientClaimable.selector);
        vault.claim(address(this));
        token.setBlacklisted(buyer, true);
        executeDecision(decision(10, false));
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.InsufficientClaimable.selector);
        vault.claim(address(0));
    }

    function test_FrozenTokenDefersPayoutsAndClaimRollsBack() public {
        token.setFrozen(true);
        executeDecision(decision(1000, false));
        vm.warp(vault.getHold(holdId).releaseNotBefore);
        executeDecision(decision(0, true));
        assertEq(vault.claimable(buyer), 1000);
        assertEq(vault.claimable(provider), 8820);
        assertEq(vault.claimable(feeRecipient), 180);
        vm.prank(provider);
        vm.expectRevert(bytes("USDC frozen"));
        vault.claim(provider);
        assertEq(vault.totalClaimable(), 10000);
        token.setFrozen(false);
        vm.prank(provider);
        vault.claim(provider);
        assertEq(token.balanceOf(provider), 8820);
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
        vault.fundWithAuthorization(q, receiveSignature(q, buyerKey));
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
        assertEq(token.balanceOf(provider), hold.providerReleased);
        assertEq(token.balanceOf(feeRecipient), hold.feeReleased);
        assertEq(token.balanceOf(buyer), FUNDS - 10000 - net);
        assertConservation();
    }

    function test_FeeCalculationDoesNotOverflowUint256Product() public {
        uint256 gross = uint256(1) << 250;
        token.mint(buyer, gross);
        holdId = keccak256("large-hold");
        PayvokeVault.InvocationQuote memory q = quote(holdId, gross);
        q.feeBps = 500;
        vault.fundWithAuthorization(q, receiveSignature(q, buyerKey));
        vm.warp(q.releaseNotBefore);
        executeDecision(decision(0, true));
        assertEq(vault.getHold(holdId).feeReleased, gross / 20);
        assertEq(vault.getHold(holdId).providerReleased, gross - gross / 20);
        assertEq(token.balanceOf(feeRecipient), gross / 20);
        assertConservation();
    }
}
