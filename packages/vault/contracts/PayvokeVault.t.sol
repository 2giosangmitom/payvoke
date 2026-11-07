// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {PayvokeVault} from "./PayvokeVault.sol";
import {MockUSDC} from "./test/MockUSDC.sol";
import {ContractApprover} from "./test/ContractApprover.sol";

abstract contract PayvokeVaultFixture is Test {
    PayvokeVault vault;
    MockUSDC token;
    uint256 buyerKey = 0xB0B;
    address buyer;
    uint256 signerKey = 0xA11CE;
    bytes32 grantId = keccak256("grant");
    uint256 constant FUNDS = 1000000;
    uint256 constant GRANT_TOTAL = 300000;

    function setUp() public virtual {
        vm.warp(1800000000);
        buyer = vm.addr(buyerKey);
        token = createToken();
        vault = new PayvokeVault(address(token), address(this), 100, 500, 3600, 30 days);
        vault.grantRole(vault.RELAYER_ROLE(), address(this));
        vault.grantRole(vault.PAUSER_ROLE(), address(this));
        token.mint(buyer, FUNDS);
        setGrant(buyerKey, buyer, grantId, config(), GRANT_TOTAL);
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

    function sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function usdcDigest(bytes32 structHash) internal view returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(token.DOMAIN_SEPARATOR(), structHash);
    }

    // -- EIP-3009 funding

    function receiveSignature(PayvokeVault.InvocationQuote memory q, uint256 key) internal view returns (bytes memory) {
        return sign(key, usdcDigest(vault.hashReceiveAuthorization(q)));
    }

    function fundAuth(bytes32 id, uint256 amount) internal returns (PayvokeVault.InvocationQuote memory q) {
        q = quote(id, amount);
        vault.fundWithAuthorization(q, receiveSignature(q, buyerKey));
    }

    // -- grant funding

    function authorize(PayvokeVault.InvocationQuote memory q) internal view returns (PayvokeVault.DebitAuthorization memory a, bytes memory signature) {
        a = PayvokeVault.DebitAuthorization(vault.hashQuote(q), grantId, vault.getGrant(q.buyer, grantId).epoch);
        signature = sign(signerKey, vault.hashAuthorization(a));
    }

    function fundGrant(bytes32 id, uint256 amount) internal returns (PayvokeVault.InvocationQuote memory q) {
        q = quote(id, amount);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vault.fundWithGrant(q, a, signature);
    }

    // -- grant administration

    function permitFor(uint256 key, address owner, uint256 value) internal view returns (PayvokeVault.Permit memory) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(token.PERMIT_TYPEHASH(), owner, address(vault), value, token.nonces(owner), deadline));
        return PayvokeVault.Permit(value, deadline, sign(key, usdcDigest(structHash)));
    }

    function noPermit() internal pure returns (PayvokeVault.Permit memory) {
        return PayvokeVault.Permit(0, 0, "");
    }

    function setupSignature(uint256 key, address owner, bytes32 id, PayvokeVault.GrantConfig memory cfg, uint48 deadline)
        internal view returns (bytes memory)
    {
        return sign(key, vault.hashGrantSetup(owner, id, cfg, vault.grantNonces(owner), deadline));
    }

    function setGrant(uint256 key, address owner, bytes32 id, PayvokeVault.GrantConfig memory cfg, uint256 allowance) internal {
        uint48 deadline = uint48(block.timestamp + 1 hours);
        vault.setGrantWithSig(owner, id, cfg, deadline, setupSignature(key, owner, id, cfg, deadline), permitFor(key, owner, allowance));
    }

    function revokeSignature(uint256 key, address owner, bytes32 id, uint48 deadline) internal view returns (bytes memory) {
        return sign(key, vault.hashGrantRevoke(owner, id, vault.grantNonces(owner), deadline));
    }
}

contract PayvokeVaultAuthorizationTest is PayvokeVaultFixture {
    function test_FundsOneJobFromTheWallet() public {
        PayvokeVault.InvocationQuote memory q = fundAuth(keccak256("one"), 10000);
        PayvokeVault.HoldView memory hold = vault.getHold(q.invocationKey);
        assertEq(hold.remaining, 10000);
        assertEq(hold.source, vault.SOURCE_AUTHORIZATION());
        assertEq(hold.grantId, bytes32(0));
        assertEq(hold.authorizationDigest, vault.hashReceiveAuthorization(q));
        assertEq(hold.quoteDigest, vault.hashQuote(q));
        assertEq(token.balanceOf(buyer), FUNDS - 10000);
        assertEq(token.balanceOf(address(vault)), 10000);
        assertEq(vault.totalHeld(), 10000);
        assertTrue(token.authorizationState(buyer, vault.hashQuote(q)));
        // The grant and the allowance are untouched by a direct payment.
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 0);
        assertEq(token.allowance(buyer, address(vault)), GRANT_TOTAL);
    }

    function test_ReplayAfterExpiryAndPauseReturnsSameHold() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        bytes memory signature = receiveSignature(q, buyerKey);
        vault.fundWithAuthorization(q, signature);
        vault.pause();
        vm.warp(block.timestamp + 20 days);
        vm.recordLogs();
        assertEq(vault.fundWithAuthorization(q, signature), q.invocationKey);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(token.balanceOf(buyer), FUNDS - 10000);
    }

    function test_WrongSignerIsRejected() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        bytes memory signature = receiveSignature(q, 0xBAD);
        vm.expectRevert(PayvokeVault.AuthorizationRejected.selector);
        vault.fundWithAuthorization(q, signature);
        assertEq(vault.totalHeld(), 0);
    }

    function test_SignatureCannotFundAChangedQuote() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        bytes memory signature = receiveSignature(q, buyerKey);
        PayvokeVault.InvocationQuote memory changed = quote(keccak256("one"), 10000);
        changed.provider = address(0xBAD);
        vm.expectRevert(PayvokeVault.AuthorizationRejected.selector);
        vault.fundWithAuthorization(changed, signature);
        changed = quote(keccak256("one"), 10001);
        vm.expectRevert(PayvokeVault.AuthorizationRejected.selector);
        vault.fundWithAuthorization(changed, signature);
        vault.fundWithAuthorization(q, signature);
        assertEq(vault.totalHeld(), 10000);
    }

    function test_LowBalanceKeepsTheSignatureUsable() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        bytes memory signature = receiveSignature(q, buyerKey);
        vm.prank(buyer);
        token.transfer(address(0xCAFE), FUNDS - 5000);
        vm.expectRevert(PayvokeVault.InsufficientBalance.selector);
        vault.fundWithAuthorization(q, signature);
        assertFalse(token.authorizationState(buyer, vault.hashQuote(q)));
        token.mint(buyer, 5000);
        vault.fundWithAuthorization(q, signature);
        assertEq(token.balanceOf(buyer), 0);
    }

    function test_CancelledAuthorizationCannotFund() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        bytes memory signature = receiveSignature(q, buyerKey);
        bytes32 nonce = vault.hashQuote(q);
        bytes32 cancel = keccak256(abi.encode(token.CANCEL_AUTHORIZATION_TYPEHASH(), buyer, nonce));
        token.cancelAuthorization(buyer, nonce, sign(buyerKey, usdcDigest(cancel)));
        vm.expectRevert(PayvokeVault.AuthorizationUsed.selector);
        vault.fundWithAuthorization(q, signature);
    }

    function test_OnlyTheVaultCanRedeemTheAuthorization() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        bytes memory signature = receiveSignature(q, buyerKey);
        bytes32 nonce = vault.hashQuote(q);
        vm.expectRevert(bytes("FiatTokenV2: caller must be the payee"));
        token.receiveWithAuthorization(buyer, address(vault), 10000, 0, q.validUntil, nonce, signature);
        // The same signature is not a TransferWithAuthorization either.
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        token.transferWithAuthorization(buyer, address(vault), 10000, 0, q.validUntil, nonce, signature);
        vault.fundWithAuthorization(q, signature);
        assertEq(vault.totalHeld(), 10000);
    }

    function test_ContractWalletBuyerUsesERC1271() public {
        uint256 ownerKey = 0xC0FFEE;
        ContractApprover wallet = new ContractApprover(vm.addr(ownerKey));
        token.mint(address(wallet), 50000);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("wallet"), 20000);
        q.buyer = address(wallet);
        vault.fundWithAuthorization(q, receiveSignature(q, ownerKey));
        assertEq(vault.getHold(q.invocationKey).buyer, address(wallet));
        assertEq(token.balanceOf(address(wallet)), 30000);
    }

    function test_OnlyRelayerCanFund() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        bytes memory signature = receiveSignature(q, buyerKey);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.fundWithAuthorization(q, signature);
    }

    function test_PauseBlocksNewFunding() public {
        vault.pause();
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        bytes memory signature = receiveSignature(q, buyerKey);
        vm.expectRevert(bytes4(keccak256("EnforcedPause()")));
        vault.fundWithAuthorization(q, signature);
    }

    function test_AJobCannotBeFundedTwiceAcrossSources() public {
        PayvokeVault.InvocationQuote memory q = fundAuth(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.InvocationConflict.selector);
        vault.fundWithGrant(q, a, signature);
        q = fundGrant(keccak256("two"), 10000);
        bytes memory buyerSignature = receiveSignature(q, buyerKey);
        vm.expectRevert(PayvokeVault.InvocationConflict.selector);
        vault.fundWithAuthorization(q, buyerSignature);
        assertEq(vault.totalHeld(), 20000);
    }

    function expectFailure(PayvokeVault.InvocationQuote memory q, bytes4 error) internal {
        bytes memory signature = receiveSignature(q, buyerKey);
        vm.expectRevert(error);
        vault.fundWithAuthorization(q, signature);
        assertEq(vault.totalHeld(), 0);
        assertEq(token.balanceOf(buyer), FUNDS);
        assertEq(vault.getHold(q.invocationKey).buyer, address(0));
    }

    function test_InvalidAsset() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.asset = address(1);
        expectFailure(q, PayvokeVault.InvalidAsset.selector);
    }

    function test_ZeroAmount() public {
        expectFailure(quote(keccak256("one"), 0), PayvokeVault.InvalidAmount.selector);
    }

    function test_ZeroProvider() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.provider = address(0);
        expectFailure(q, PayvokeVault.InvalidConfiguration.selector);
    }

    function test_FeeCap() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.feeBps = 501;
        expectFailure(q, PayvokeVault.FeeCapExceeded.selector);
    }

    function test_ExpiredQuoteAtExactDeadline() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.validUntil = uint48(block.timestamp);
        expectFailure(q, PayvokeVault.QuoteExpired.selector);
    }

    function test_InvalidDeadlineOrder() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.deliveryDeadline = q.validUntil;
        expectFailure(q, PayvokeVault.DeadlineInvalid.selector);
    }

    function test_HoldDurationCap() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.resolveBy = uint48(block.timestamp + 31 days);
        expectFailure(q, PayvokeVault.DeadlineInvalid.selector);
    }

    function test_QuoteLifetimeCap() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.validUntil = uint48(block.timestamp + 3601);
        q.deliveryDeadline = q.validUntil + 1;
        q.releaseNotBefore = q.deliveryDeadline;
        q.resolveBy = q.releaseNotBefore + 1;
        expectFailure(q, PayvokeVault.DeadlineInvalid.selector);
    }

    function test_DonationIsNotALiability() public {
        token.mint(address(vault), 500);
        fundAuth(keccak256("one"), 10000);
        assertEq(token.balanceOf(address(vault)), vault.totalHeld() + vault.totalClaimable() + 500);
    }

    function testFuzz_FundsExactlyTheQuotedAmount(uint96 raw) public {
        uint256 amount = bound(raw, 1, FUNDS);
        fundAuth(keccak256("one"), amount);
        assertEq(token.balanceOf(address(vault)), amount);
        assertEq(token.balanceOf(buyer) + vault.totalHeld(), FUNDS);
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
}

contract PayvokeVaultGrantFundingTest is PayvokeVaultFixture {
    function test_GrantPullsFromTheAllowance() public {
        PayvokeVault.InvocationQuote memory q = fundGrant(keccak256("one"), 10000);
        PayvokeVault.HoldView memory hold = vault.getHold(q.invocationKey);
        assertEq(hold.source, vault.SOURCE_GRANT());
        assertEq(hold.grantId, grantId);
        assertEq(token.allowance(buyer, address(vault)), GRANT_TOTAL - 10000);
        assertEq(token.balanceOf(buyer), FUNDS - 10000);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
        assertEq(vault.totalHeld(), 10000);
    }

    function test_ReplayAfterExpiryRevocationAndPauseReturnsSameHold() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vault.fundWithGrant(q, a, signature);
        vm.prank(buyer);
        vault.revokeGrant(grantId);
        vault.pause();
        vm.warp(block.timestamp + 20 days);
        vm.recordLogs();
        assertEq(vault.fundWithGrant(q, a, signature), q.invocationKey);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
    }

    function test_ChangedQuoteCannotChargeSameInvocation() public {
        bytes32 id = keccak256("one");
        fundGrant(id, 10000);
        PayvokeVault.InvocationQuote memory q = quote(id, 20000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.InvocationConflict.selector);
        vault.fundWithGrant(q, a, signature);
        assertEq(vault.totalHeld(), 10000);
    }

    function test_GrantUpdateKeepsCountersAndInvalidatesPendingSignature() public {
        fundGrant(keccak256("one"), 10000);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("two"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        setGrant(buyerKey, buyer, grantId, config(), GRANT_TOTAL);
        assertEq(vault.getGrant(buyer, grantId).epoch, 2);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 10000);
        assertEq(vault.getGrant(buyer, grantId).spentInPeriod, 10000);
        vm.expectRevert(PayvokeVault.GrantEpochMismatch.selector);
        vault.fundWithGrant(q, a, signature);
    }

    function test_PerCallCap() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 100001);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.PerCallLimitExceeded.selector);
        vault.fundWithGrant(q, a, signature);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 0);
    }

    function test_PeriodBoundaryAndLifetimeCap() public {
        fundGrant(keccak256("one"), 100000);
        fundGrant(keccak256("two"), 100000);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("three"), 1);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.PeriodLimitExceeded.selector);
        vault.fundWithGrant(q, a, signature);
        vm.warp((block.timestamp / 86400 + 1) * 86400);
        fundGrant(keccak256("three"), 100000);
        assertEq(vault.getGrant(buyer, grantId).spentInPeriod, 100000);
        q = quote(keccak256("four"), 1);
        (a, signature) = authorize(q);
        vm.expectRevert(PayvokeVault.TotalLimitExceeded.selector);
        vault.fundWithGrant(q, a, signature);
        assertEq(token.allowance(buyer, address(vault)), 0);
    }

    function test_LoweringCapsBelowSpentDoesNotUnderflowOrReset() public {
        fundGrant(keccak256("one"), 100000);
        PayvokeVault.GrantConfig memory cfg = config();
        cfg.maxPerCall = 10;
        cfg.maxPerPeriod = 20;
        cfg.maxTotal = 30;
        setGrant(buyerKey, buyer, grantId, cfg, 30);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 100000);
        PayvokeVault.InvocationQuote memory q = quote(keccak256("two"), 1);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(PayvokeVault.PeriodLimitExceeded.selector);
        vault.fundWithGrant(q, a, signature);
        vm.warp((block.timestamp / 86400 + 1) * 86400);
        q = quote(keccak256("two"), 1);
        (a, signature) = authorize(q);
        vm.expectRevert(PayvokeVault.TotalLimitExceeded.selector);
        vault.fundWithGrant(q, a, signature);
    }

    function test_InsufficientAllowanceAndBalance() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.prank(buyer);
        token.approve(address(vault), 9999);
        vm.expectRevert(PayvokeVault.InsufficientAllowance.selector);
        vault.fundWithGrant(q, a, signature);
        vm.startPrank(buyer);
        token.approve(address(vault), GRANT_TOTAL);
        token.transfer(address(0xCAFE), FUNDS - 9999);
        vm.stopPrank();
        vm.expectRevert(PayvokeVault.InsufficientBalance.selector);
        vault.fundWithGrant(q, a, signature);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 0);
        assertEq(vault.totalHeld(), 0);
    }

    function expectFailure(PayvokeVault.InvocationQuote memory q, bytes4 error) internal {
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.expectRevert(error);
        vault.fundWithGrant(q, a, signature);
        assertEq(vault.totalHeld(), 0);
        assertEq(vault.getGrant(buyer, grantId).spentTotal, 0);
    }

    function test_ExpiredGrantAtExactDeadline() public {
        vm.warp(block.timestamp + 10 days);
        expectFailure(quote(keccak256("one"), 10000), PayvokeVault.GrantExpired.selector);
    }

    function test_RevokeBeforeFundWins() public {
        vm.prank(buyer);
        vault.revokeGrant(grantId);
        expectFailure(quote(keccak256("one"), 10000), PayvokeVault.GrantRevoked.selector);
    }

    function test_QuoteChecksApplyToGrantsToo() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        q.feeBps = 501;
        expectFailure(q, PayvokeVault.FeeCapExceeded.selector);
    }

    function test_MissingGrantCannotFund() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        PayvokeVault.DebitAuthorization memory a = PayvokeVault.DebitAuthorization(vault.hashQuote(q), keccak256("missing"), 1);
        vm.expectRevert(PayvokeVault.GrantNotFound.selector);
        vault.fundWithGrant(q, a, hex"abcd");
    }

    function test_OnlyRelayerCanFund() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.fundWithGrant(q, a, signature);
    }

    function test_MalformedAndWrongSignatures() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a,) = authorize(q);
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.fundWithGrant(q, a, hex"abcd");
        bytes memory wrong = sign(0xBAD, vault.hashAuthorization(a));
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.fundWithGrant(q, a, wrong);
    }

    function test_SignatureCannotAuthorizeChangedAmount() public {
        PayvokeVault.InvocationQuote memory q = quote(keccak256("one"), 10000);
        (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
        q.grossAmount += 1;
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.fundWithGrant(q, a, signature);
    }

    function test_NewGrantCannotChargeExistingInvocation() public {
        bytes32 id = keccak256("one");
        fundGrant(id, 10000);
        bytes32 other = keccak256("other-grant");
        setGrant(buyerKey, buyer, other, config(), GRANT_TOTAL);
        PayvokeVault.InvocationQuote memory q = quote(id, 10000);
        PayvokeVault.DebitAuthorization memory a = PayvokeVault.DebitAuthorization(vault.hashQuote(q), other, 1);
        bytes memory signature = sign(signerKey, vault.hashAuthorization(a));
        vm.expectRevert(PayvokeVault.InvocationConflict.selector);
        vault.fundWithGrant(q, a, signature);
        assertEq(vault.getGrant(buyer, other).spentTotal, 0);
    }

    function testFuzz_AdmissionSequenceStopsAtPeriodCap(uint8 count) public {
        uint256 successes = 0;
        uint256 attempts = bound(count, 1, 30);
        for (uint256 i = 0; i < attempts; i++) {
            PayvokeVault.InvocationQuote memory q = quote(keccak256(abi.encode(i)), 10000);
            (PayvokeVault.DebitAuthorization memory a, bytes memory signature) = authorize(q);
            if (i >= 20) vm.expectRevert(PayvokeVault.PeriodLimitExceeded.selector);
            else successes++;
            vault.fundWithGrant(q, a, signature);
        }
        assertEq(vault.getGrant(buyer, grantId).spentInPeriod, successes * 10000);
        assertEq(vault.totalHeld(), successes * 10000);
        assertEq(token.balanceOf(address(vault)), vault.totalHeld());
        assertEq(token.balanceOf(buyer) + vault.totalHeld(), FUNDS);
    }
}

contract PayvokeVaultGrantAdminTest is PayvokeVaultFixture {
    function test_SetupRegistersTheGrantAndTheAllowance() public view {
        PayvokeVault.GrantView memory grant = vault.getGrant(buyer, grantId);
        assertEq(grant.epoch, 1);
        assertEq(grant.config.signer, vm.addr(signerKey));
        assertEq(token.allowance(buyer, address(vault)), GRANT_TOTAL);
        assertEq(vault.grantNonces(buyer), 1);
    }

    function test_SetupSignatureCannotBeReplayedOrForged() public {
        PayvokeVault.GrantConfig memory cfg = config();
        bytes32 id = keccak256("second");
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = setupSignature(buyerKey, buyer, id, cfg, deadline);
        bytes memory forged = setupSignature(0xBAD, buyer, id, cfg, deadline);
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.setGrantWithSig(buyer, id, cfg, deadline, forged, noPermit());
        cfg.maxTotal += 1;
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.setGrantWithSig(buyer, id, cfg, deadline, signature, noPermit());
        cfg.maxTotal -= 1;
        vault.setGrantWithSig(buyer, id, cfg, deadline, signature, noPermit());
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.setGrantWithSig(buyer, id, cfg, deadline, signature, noPermit());
        assertEq(vault.getGrant(buyer, id).epoch, 1);
    }

    function test_SetupExpiresAtItsDeadline() public {
        PayvokeVault.GrantConfig memory cfg = config();
        uint48 deadline = uint48(block.timestamp);
        bytes memory signature = setupSignature(buyerKey, buyer, keccak256("x"), cfg, deadline);
        vm.expectRevert(PayvokeVault.SignatureExpired.selector);
        vault.setGrantWithSig(buyer, keccak256("x"), cfg, deadline, signature, noPermit());
    }

    function test_OnlyRelayerSubmitsGrantChanges() public {
        PayvokeVault.GrantConfig memory cfg = config();
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = setupSignature(buyerKey, buyer, keccak256("x"), cfg, deadline);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.setGrantWithSig(buyer, keccak256("x"), cfg, deadline, signature, noPermit());
        bytes memory revoke = revokeSignature(buyerKey, buyer, grantId, deadline);
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.Unauthorized.selector);
        vault.revokeGrantWithSig(buyer, grantId, deadline, revoke, noPermit());
    }

    function test_FrontRunPermitStillSetsTheGrant() public {
        PayvokeVault.GrantConfig memory cfg = config();
        bytes32 id = keccak256("second");
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = setupSignature(buyerKey, buyer, id, cfg, deadline);
        PayvokeVault.Permit memory permit = permitFor(buyerKey, buyer, 500000);
        token.permit(buyer, address(vault), permit.value, permit.deadline, permit.signature);
        vault.setGrantWithSig(buyer, id, cfg, deadline, signature, permit);
        assertEq(token.allowance(buyer, address(vault)), 500000);
        assertEq(vault.getGrant(buyer, id).epoch, 1);
    }

    function test_BadPermitRollsBackTheGrant() public {
        PayvokeVault.GrantConfig memory cfg = config();
        bytes32 id = keccak256("second");
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = setupSignature(buyerKey, buyer, id, cfg, deadline);
        PayvokeVault.Permit memory permit = permitFor(0xBAD, buyer, 500000);
        vm.expectRevert(PayvokeVault.PermitFailed.selector);
        vault.setGrantWithSig(buyer, id, cfg, deadline, signature, permit);
        assertEq(vault.getGrant(buyer, id).epoch, 0);
        assertEq(vault.grantNonces(buyer), 1);
    }

    function test_ContractWalletCanSetAGrant() public {
        uint256 ownerKey = 0xC0FFEE;
        ContractApprover wallet = new ContractApprover(vm.addr(ownerKey));
        setGrant(ownerKey, address(wallet), grantId, config(), 1000);
        assertEq(vault.getGrant(address(wallet), grantId).epoch, 1);
        assertEq(token.allowance(address(wallet), address(vault)), 1000);
    }

    function test_RevokeWithSignatureLowersTheAllowance() public {
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = revokeSignature(buyerKey, buyer, grantId, deadline);
        vault.revokeGrantWithSig(buyer, grantId, deadline, signature, permitFor(buyerKey, buyer, 0));
        assertTrue(vault.getGrant(buyer, grantId).revoked);
        assertEq(vault.getGrant(buyer, grantId).epoch, 2);
        assertEq(token.allowance(buyer, address(vault)), 0);
        vm.expectRevert(PayvokeVault.InvalidSignature.selector);
        vault.revokeGrantWithSig(buyer, grantId, deadline, signature, noPermit());
    }

    function test_RevokedGrantIdCannotBeReused() public {
        vm.prank(buyer);
        vault.revokeGrant(grantId);
        PayvokeVault.GrantConfig memory cfg = config();
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = setupSignature(buyerKey, buyer, grantId, cfg, deadline);
        vm.expectRevert(PayvokeVault.GrantRevoked.selector);
        vault.setGrantWithSig(buyer, grantId, cfg, deadline, signature, noPermit());
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.GrantRevoked.selector);
        vault.revokeGrant(grantId);
    }

    function test_MissingGrantCannotBeRevoked() public {
        vm.prank(buyer);
        vm.expectRevert(PayvokeVault.GrantNotFound.selector);
        vault.revokeGrant(keccak256("missing"));
    }

    function test_GrantPeriodCannotChange() public {
        PayvokeVault.GrantConfig memory cfg = config();
        cfg.periodSeconds += 1;
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = setupSignature(buyerKey, buyer, grantId, cfg, deadline);
        vm.expectRevert(PayvokeVault.InvalidConfiguration.selector);
        vault.setGrantWithSig(buyer, grantId, cfg, deadline, signature, noPermit());
    }

    function test_PauseBlocksSetupButNotRevoke() public {
        vault.pause();
        PayvokeVault.GrantConfig memory cfg = config();
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = setupSignature(buyerKey, buyer, keccak256("x"), cfg, deadline);
        vm.expectRevert(bytes4(keccak256("EnforcedPause()")));
        vault.setGrantWithSig(buyer, keccak256("x"), cfg, deadline, signature, noPermit());
        signature = revokeSignature(buyerKey, buyer, grantId, deadline);
        vault.revokeGrantWithSig(buyer, grantId, deadline, signature, noPermit());
        assertTrue(vault.getGrant(buyer, grantId).revoked);
    }

    function test_InvalidGrantConfiguration() public {
        PayvokeVault.GrantConfig memory cfg = config();
        cfg.signer = address(0);
        expectInvalidGrant(cfg);
        cfg = config();
        cfg.signer = address(vault);
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
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes memory signature = setupSignature(buyerKey, buyer, id, cfg, deadline);
        vm.expectRevert(PayvokeVault.InvalidConfiguration.selector);
        vault.setGrantWithSig(buyer, id, cfg, deadline, signature, noPermit());
        assertEq(vault.getGrant(buyer, id).epoch, 0);
    }
}
