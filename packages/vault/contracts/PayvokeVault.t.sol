// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {PayvokeVault} from "./PayvokeVault.sol";
import {MockUSDC} from "./test/MockUSDC.sol";

abstract contract PayvokeVaultFixture is Test {
    PayvokeVault vault;
    MockUSDC token;
    address buyer = address(0xB0);
    uint256 signerKey = 0xA11CE;
    bytes32 grantId = keccak256("grant");

    function setUp() public virtual {
        vm.warp(1800000000);
        token = createToken();
        vault = new PayvokeVault(address(token), address(this), 100, 500, 3600, 30 days);
        vault.grantRole(vault.RELAYER_ROLE(), address(this));
        vault.grantRole(vault.PAUSER_ROLE(), address(this));
        token.mint(buyer, 1000000);
        vm.startPrank(buyer);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1000000);
        vault.registerGrant(grantId, config());
        vm.stopPrank();
    }

    function createToken() internal virtual returns (MockUSDC) {
        return new MockUSDC();
    }

    function config() internal view returns (PayvokeVault.GrantConfig memory) {
        return PayvokeVault.GrantConfig(vm.addr(signerKey), uint48(block.timestamp + 10 days), 100000, 86400, 200000, 300000);
    }

    function quote(bytes32 id, uint256 amount) internal view returns (PayvokeVault.InvocationQuote memory q) {
        uint256 now_ = vm.getBlockTimestamp();
        q = PayvokeVault.InvocationQuote(id, keccak256(abi.encode(id)), buyer, keccak256("session"), keccak256("product"), 1,
            keccak256("command"), keccak256("input"), keccak256("terms"), keccak256("policy"), address(0xF0), address(token),
            amount, 200, address(0xFE), uint48(now_ + 60), uint48(now_ + 120),
            uint48(now_ + 180), uint48(now_ + 240));
    }

    function authorize(PayvokeVault.InvocationQuote memory q) internal view returns (PayvokeVault.DebitAuthorization memory a, bytes memory signature) {
        a = PayvokeVault.DebitAuthorization(vault.hashQuote(q), grantId, vault.getGrant(buyer, grantId).epoch);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, vault.hashAuthorization(a));
        signature = abi.encodePacked(r, s, v);
    }

    function reserve(bytes32 id, uint256 amount) internal {
        PayvokeVault.InvocationQuote memory q = quote(id, amount);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vault.reserveHold(q, a, signature);
    }
}

contract PayvokeVaultTest is PayvokeVaultFixture {
    function test_DepositGrantHold() public {
        reserve(keccak256("one"), 10000);
        assertEq(vault.availableBalance(buyer), 990000);
        assertEq(vault.totalHeld(), 10000);
        assertEq(vault.getHold(keccak256("one")).remaining, 10000);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
        assertEq(token.balanceOf(address(vault)), 1000000);
    }

    function test_ReplayAfterExpiryRevocationAndPauseReturnsSameHold() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vault.reserveHold(q, a, signature);
        vm.prank(buyer);
        vault.revokeGrant(grantId);
        vault.pause();
        vm.warp(block.timestamp + 20 days);
        vm.recordLogs();
        assertEq(vault.reserveHold(q, a, signature), q.invocationKey);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(vault.availableBalance(buyer), 990000);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
    }

    function test_ChangedQuoteCannotChargeSameInvocation() public {
        bytes32 id = keccak256("one");
        reserve(id, 10000);
        PayvokeVault.InvocationQuote memory q = quote(id, 20000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.InvocationConflict.selector);
        vault.reserveHold(q, a, signature);
        assertEq(vault.totalHeld(), 10000);
    }

    function test_GrantUpdateKeepsCountersAndInvalidatesPendingSignature() public {
        reserve(keccak256("one"), 10000);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("two"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.prank(buyer);
        vault.updateGrant(grantId, config());
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
        assertEq(vault.getGrant(buyer, grantId).spentInPeriod, 10000);
        vm.expectRevert(PayvokeVault.GrantEpochMismatch.selector);
        vault.reserveHold(q, a, signature);
    }

    function test_PerCallCap() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 100001);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.PerCallLimitExceeded.selector);
        vault.reserveHold(q, a, signature);
        assertEq(vault.totalHeld(), 0);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 0);
    }

    function test_PeriodBoundaryAndLifetimeCap() public {
        reserve(keccak256("one"), 100000);
        reserve(keccak256("two"), 100000);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("three"), 1);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.PeriodLimitExceeded.selector);
        vault.reserveHold(q, a, signature);
        vm.warp((block.timestamp / 86400 + 1) * 86400);
        reserve(keccak256("three"), 100000);
        assertEq(vault.getGrant(buyer, grantId).spentInPeriod, 100000);
        q = quote(keccak256("four"), 1);
        (a, signature) = authorize(q);
        vm.expectRevert(PayvokeVault.TotalLimitExceeded.selector);
        vault.reserveHold(q, a, signature);
    }

    function testFuzz_ConservesAvailableAndHeld(uint96 raw) public {
        uint256 amount = bound(raw, 1, 100000);
        reserve(keccak256("one"), amount);
        assertEq(vault.availableBalance(buyer) + vault.totalHeld(), token.balanceOf(address(vault)));
        assertEq(vault.getHold(keccak256("one")).gross, amount);
    }

    function expectAdmissionFailure(PayvokeVault.InvocationQuote memory q, bytes4 error) internal {
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(error);
        vault.reserveHold(q, a, signature);
        assertEq(vault.totalHeld(), 0);
        assertEq(vault.availableBalance(buyer), 1000000);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 0);
        assertEq(vault.getHold(q.invocationKey).buyer, address(0));
    }

    function test_InvalidAsset() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.asset = address(1);
        expectAdmissionFailure(q, PayvokeVault.InvalidAsset.selector);
    }

    function test_ZeroAmount() public {
        expectAdmissionFailure(quote(keccak256("one"), 0), PayvokeVault.InvalidAmount.selector);
    }

    function test_ZeroDepositAndWithdrawal() public {
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.InvalidAmount.selector);
        vault.deposit(0);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.InvalidAmount.selector);
        vault.withdrawAvailable(0);
    }

    function test_MissingGrantCannotReserveOrRevoke() public {
        bytes32 missing = keccak256("missing-grant");
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.GrantNotFound.selector);
        vault.revokeGrant(missing);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        PayvokeVault.DebitAuthorization memory a = PayvokeVault.DebitAuthorization(vault.hashQuote(q), missing, 1);
        vm.expectRevert(PayvokeVault.GrantNotFound.selector);
        vault.reserveHold(q, a, hex"abcd");
        assertEq(vault.totalHeld(), 0);
    }

    function test_ZeroProvider() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.provider = address(0);
        expectAdmissionFailure(q, PayvokeVault.InvalidConfiguration.selector);
    }

    function test_FeeCap() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.feeBps = 501;
        expectAdmissionFailure(q, PayvokeVault.FeeCapExceeded.selector);
    }

    function test_ExpiredQuoteAtExactDeadline() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.validUntil = uint48(block.timestamp);
        expectAdmissionFailure(q, PayvokeVault.QuoteExpired.selector);
    }

    function test_InvalidDeadlineOrder() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.deliveryDeadline = q.validUntil;
        expectAdmissionFailure(q, PayvokeVault.DeadlineInvalid.selector);
    }

    function test_HoldDurationCap() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.resolveBy = uint48(block.timestamp + 31 days);
        expectAdmissionFailure(q, PayvokeVault.DeadlineInvalid.selector);
    }

    function test_QuoteLifetimeCap() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.validUntil = uint48(block.timestamp + 3601);
        q.deliveryDeadline = q.validUntil + 1;
        q.releaseNotBefore = q.deliveryDeadline;
        q.resolveBy = q.releaseNotBefore + 1;
        expectAdmissionFailure(q, PayvokeVault.DeadlineInvalid.selector);
    }

    function test_ExpiredGrantAtExactDeadline() public {
        vm.warp(block.timestamp + 10 days);
        expectAdmissionFailure(quote(keccak256("one"), 10000), PayvokeVault.GrantExpired.selector);
    }

    function test_RevokeBeforeReserveWins() public {
        vm.prank(buyer);
        vault.revokeGrant(grantId);
        expectAdmissionFailure(quote(keccak256("one"), 10000), PayvokeVault.GrantRevoked.selector);
    }

    function test_WithdrawBeforeReserveWins() public {
        vm.prank(buyer);
        vault.withdrawAvailable(1000000);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.InsufficientAvailable.selector);
        vault.reserveHold(q, a, signature);
        assertEq(vault.totalHeld(), 0);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 0);
    }

    function test_ReserveBeforeWithdrawWins() public {
        reserve(keccak256("one"), 10000);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.InsufficientAvailable.selector);
        vault.withdrawAvailable(1000000);
        assertEq(vault.totalAvailable(), 990000);
    }

    function test_OnlyRelayerCanReserve() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.reserveHold(q, a, signature);
    }

    function test_MalformedSignature() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a,) = authorize(q);
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.reserveHold(q, a, hex"abcd");
    }

    function test_WrongSigner() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a,) = authorize(q);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, vault.hashAuthorization(a));
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.reserveHold(q, a, abi.encodePacked(r, s, v));
    }

    function test_SignatureCannotAuthorizeChangedAmount() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        q.grossAmount += 1;
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.reserveHold(q, a, signature);
    }

    function test_GrantOwnershipAndIdCannotBeReused() public {
        PayvokeVault.GrantConfig memory cfg = config();
        vm.expectRevert(PayvokeVault.GrantNotFound.selector);
        vault.updateGrant(grantId, cfg);
        vm.prank(buyer);
        vault.revokeGrant(grantId);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.GrantAlreadyExists.selector);
        vault.registerGrant(grantId, cfg);
    }

    function test_GrantPeriodCannotChange() public {
        PayvokeVault.GrantConfig memory cfg = config();
        cfg.periodSeconds += 1;
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.InvalidConfiguration.selector);
        vault.updateGrant(grantId, cfg);
    }

    function test_LoweringCapsBelowSpentDoesNotUnderflowOrReset() public {
        reserve(keccak256("one"), 100000);
        PayvokeVault.GrantConfig memory cfg = config();
        cfg.maxPerCall = 10;
        cfg.maxPerPeriod = 20;
        cfg.maxTotal = 30;
        vm.prank(buyer);
        vault.updateGrant(grantId, cfg);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 100000);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("two"), 1);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.PeriodLimitExceeded.selector);
        vault.reserveHold(q, a, signature);
        vm.warp((block.timestamp / 86400 + 1) * 86400);
        q = quote(keccak256("two"), 1);
        (a, signature) = authorize(q);
        vm.expectRevert(PayvokeVault.TotalLimitExceeded.selector);
        vault.reserveHold(q, a, signature);
    }

    function test_PauseBlocksNewHoldsButNotRevokeOrAvailableWithdrawal() public {
        vault.pause();
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(bytes4(keccak256("EnforcedPause()")));
        vault.reserveHold(q, a, signature);
        vm.startPrank(buyer);
        vault.revokeGrant(grantId);
        vault.withdrawAvailable(1000000);
        vm.stopPrank();
        assertEq(token.balanceOf(buyer), 1000000);
    }

    function test_FrozenTransferRollsBackWithdrawalAndDeposit() public {
        token.setFrozen(true);
        vm.prank(buyer);
        vm.expectRevert(bytes("USDC frozen"));
        vault.withdrawAvailable(100);
        assertEq(vault.totalAvailable(), 1000000);
        assertEq(vault.availableBalance(buyer), 1000000);
        vm.prank(buyer);
        vm.expectRevert(bytes("USDC frozen"));
        vault.deposit(100);
        assertEq(vault.totalAvailable(), 1000000);
    }

    function test_DonationDoesNotCreditBuyer() public {
        token.mint(address(vault), 500);
        assertEq(vault.availableBalance(buyer), 1000000);
        assertEq(token.balanceOf(address(vault)), vault.totalAvailable() + vault.totalHeld() + 500);
    }

    function test_NewGrantCannotChargeExistingInvocation() public {
        bytes32 id = keccak256("one");
        reserve(id, 10000);
        PayvokeVault.GrantConfig memory cfg = config();
        bytes32 other = keccak256("other-grant");
        vm.prank(buyer);
        vault.registerGrant(other, cfg);
        PayvokeVault.InvocationQuote memory q = quote(id, 10000);
        PayvokeVault.DebitAuthorization memory a = PayvokeVault.DebitAuthorization(vault.hashQuote(q), other, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, vault.hashAuthorization(a));
        vm.expectRevert(PayvokeVault.InvocationConflict.selector);
        vault.reserveHold(q, a, abi.encodePacked(r, s, v));
        assertEq(vault.getGrant(buyer, other).spentTotal, 0);
    }

    function test_InvalidGrantConfiguration() public {
        PayvokeVault.GrantConfig memory cfg = config();
        cfg.signer = address(0);
        expectInvalidGrant(cfg);
        cfg = config();
        cfg.expiresAt = uint48(block.timestamp);
        expectInvalidGrant(cfg);
        cfg = config();
        cfg.periodSeconds = 0;
        expectInvalidGrant(cfg);
        cfg = config();
        cfg.maxPerCall = 0;
        expectInvalidGrant(cfg);
        cfg = config();
        cfg.maxPerCall = cfg.maxPerPeriod + 1;
        expectInvalidGrant(cfg);
        cfg = config();
        cfg.maxPerPeriod = cfg.maxTotal + 1;
        expectInvalidGrant(cfg);
    }

    function expectInvalidGrant(PayvokeVault.GrantConfig memory cfg) internal {
        bytes32 id = keccak256("invalid-grant");
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.InvalidConfiguration.selector);
        vault.registerGrant(id, cfg);
        assertEq(vault.getGrant(buyer, id).epoch, 0);
    }

    function test_ConstructorRejectsInvalidAssetAndCaps() public {
        vm.expectRevert(PayvokeVault.InvalidAsset.selector);
        new PayvokeVault(address(0), address(this), 100, 500, 3600, 30 days);
        vm.expectRevert(PayvokeVault.InvalidConfiguration.selector);
        new PayvokeVault(address(token), address(this), 100, 10001, 3600, 30 days);
        vm.expectRevert(PayvokeVault.InvalidConfiguration.selector);
        new PayvokeVault(address(token), address(this), 100, 500, 0, 30 days);
        vm.expectRevert(PayvokeVault.InvalidConfiguration.selector);
        new PayvokeVault(address(token), address(this), 100, 500, 3600, 3600);
        vm.expectRevert(PayvokeVault.InvalidConfiguration.selector);
        new PayvokeVault(address(token), address(this), 0, 500, 3600, 30 days);
    }

    function test_AnotherBuyerCannotWithdrawAvailable() public {
        vm.expectRevert(PayvokeVault.InsufficientAvailable.selector);
        vault.withdrawAvailable(1);
        assertEq(vault.availableBalance(buyer), 1000000);
    }

    function testFuzz_AdmissionSequenceStopsAtPeriodCap(uint8 count) public {
        uint256 successes = 0;
        uint256 attempts = bound(count, 1, 30);
        for (uint256 i = 0; i < attempts; i++) {
            PayvokeVault.InvocationQuote memory q = quote(keccak256(abi.encode(i)), 10000);
            (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
            if (i >= 20) vm.expectRevert(PayvokeVault.PeriodLimitExceeded.selector);
            else successes++;
            vault.reserveHold(q, a, signature);
        }
        assertEq(vault.getGrant(buyer, grantId).spentInPeriod, successes * 10000);
        assertEq(vault.totalHeld(), successes * 10000);
        assertEq(vault.totalAvailable() + vault.totalHeld(), token.balanceOf(address(vault)));
    }
}
