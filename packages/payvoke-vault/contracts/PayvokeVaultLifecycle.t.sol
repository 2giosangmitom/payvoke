// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {PayvokeVaultFinanceFixture} from "./PayvokeVaultFinance.t.sol";
import {PayvokeVault} from "./PayvokeVault.sol";

/// @dev Stateful fuzzing: check liabilities and every hold after each randomized action,
/// including failed calls, multiple buyers, clock advances, revocation and terminal replay.
contract PayvokeVaultLifecycleTest is PayvokeVaultFinanceFixture {
    address otherBuyer = address(0xB1);
    bytes32[] ids;
    mapping(bytes32 => PayvokeVault.InvocationQuote) originalQuotes;
    mapping(bytes32 => PayvokeVault.DebitAuthorization) originalAuthorizations;
    mapping(bytes32 => bool) closedSeen;
    mapping(address => uint256) expectedSpent;
    uint256 donations;

    function setUp() public override {
        super.setUp();
        ids.push(holdId);
        originalQuotes[holdId] = quote(holdId, 10000);
        originalAuthorizations[holdId] = PayvokeVault.DebitAuthorization(vault.hashQuote(originalQuotes[holdId]), grantId, 1);
        expectedSpent[buyer] = 10000;
        token.mint(otherBuyer, 1000000);
        PayvokeVault.GrantConfig memory cfg = config();
        vm.startPrank(otherBuyer);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1000000);
        vault.registerGrant(grantId, cfg);
        vm.stopPrank();
    }

    function signatureFor(bytes32 digest, uint256 key) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function attempt(address caller, bytes memory data) internal returns (bool success) {
        vm.prank(caller);
        (success,) = address(vault).call(data);
    }

    function assertAllInvariants() internal {
        assertEq(vault.totalAvailable(), vault.availableBalance(buyer) + vault.availableBalance(otherBuyer));
        assertEq(vault.totalProviderClaimable(), vault.providerClaimable(address(0xF0)));
        assertEq(vault.totalPlatformClaimable(), vault.platformClaimable(address(0xFE)));
        assertEq(vault.getGrant(buyer, grantId).spentTotal, expectedSpent[buyer]);
        assertEq(vault.getGrant(otherBuyer, grantId).spentTotal, expectedSpent[otherBuyer]);
        uint256 held;
        for (uint256 i; i < ids.length; i++) {
            PayvokeVault.HoldView memory h = vault.getHold(ids[i]);
            assertEq(h.gross, h.refunded + h.remaining + h.providerReleased + h.feeReleased);
            held += h.remaining;
            if (h.providerReleased + h.feeReleased > 0) {
                assertGe(vm.getBlockTimestamp(), h.releaseNotBefore);
                assertEq(h.feeReleased, (h.gross - h.refunded) * h.feeBps / 10000);
                assertTrue(h.closed);
            }
            if (closedSeen[ids[i]]) assertTrue(h.closed);
            if (h.closed) {
                assertEq(h.remaining, 0);
                closedSeen[ids[i]] = true;
            }
        }
        assertEq(vault.totalHeld(), held);
        assertEq(token.balanceOf(address(vault)), vault.totalAvailable() + vault.totalHeld() +
            vault.totalProviderClaimable() + vault.totalPlatformClaimable() + donations);
    }

    function testFuzz_LifecycleActionSequence(uint256 seed) public {
        for (uint256 i; i < 64; i++) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 action = seed % 15;
            address actor = seed & 256 == 0 ? buyer : otherBuyer;
            bytes32 id = ids[(seed >> 16) % ids.length];
            PayvokeVault.HoldView memory h = vault.getHold(id);
            if (action == 0) {
                bytes32 nextId = keccak256(abi.encode("random-hold", i));
                PayvokeVault.InvocationQuote memory q = quote(nextId, 1 + (seed >> 32) % 100000);
                q.buyer = actor;
                PayvokeVault.DebitAuthorization memory a = PayvokeVault.DebitAuthorization(
                    vault.hashQuote(q), grantId, vault.getGrant(actor, grantId).epoch);
                bytes memory signature = signatureFor(vault.hashAuthorization(a), signerKey);
                if (attempt(address(this), abi.encodeCall(vault.reserveHold, (q, a, signature)))) {
                    ids.push(nextId);
                    originalQuotes[nextId] = q;
                    originalAuthorizations[nextId] = a;
                    expectedSpent[actor] += q.grossAmount;
                }
            } else if (action == 1) {
                uint256 amount = 1 + (seed >> 32) % 1000;
                token.mint(actor, amount);
                attempt(actor, abi.encodeCall(vault.deposit, (amount)));
            } else if (action == 2) {
                attempt(actor, abi.encodeCall(vault.withdrawAvailable, (1 + (seed >> 32) % 100000)));
            } else if (action == 3 || action == 4) {
                uint256 refund = (seed >> 32) % (h.remaining + 2);
                PayvokeVault.ResolutionDecision memory d = PayvokeVault.ResolutionDecision(
                    id, keccak256(abi.encode(seed, "decision")), h.version, refund,
                    action == 4, seed & 512 != 0, uint48(vm.getBlockTimestamp() + 100));
                bytes memory signature = signDecision(d);
                attempt(seed & 1024 == 0 ? actor : executor,
                    abi.encodeCall(vault.applyDecision, (d, vm.addr(approverKey), signature)));
            } else if (action == 5) {
                attempt(actor, abi.encodeCall(vault.openDispute, (id, bytes32(seed))));
            } else if (action == 6) {
                attempt(actor, abi.encodeCall(vault.reclaim, (id)));
            } else if (action == 7) {
                attempt(seed & 1024 == 0 ? actor : address(0xF0),
                    abi.encodeCall(vault.withdrawProvider, (1 + (seed >> 32) % 100000)));
            } else if (action == 8) {
                attempt(seed & 1024 == 0 ? actor : address(0xFE),
                    abi.encodeCall(vault.withdrawPlatform, (1 + (seed >> 32) % 1000)));
            } else if (action == 9) {
                vm.warp(vm.getBlockTimestamp() + (seed >> 32) % 100);
            } else if (action == 10) {
                if (vault.paused()) vault.unpause();
                else vault.pause();
            } else if (action == 11) {
                PayvokeVault.InvocationQuote memory q = originalQuotes[id];
                PayvokeVault.DebitAuthorization memory a = originalAuthorizations[id];
                bytes memory signature = signatureFor(vault.hashAuthorization(a), signerKey);
                assertTrue(attempt(address(this), abi.encodeCall(vault.reserveHold, (q, a, signature))));
                assertEq(keccak256(abi.encode(vault.getHold(id))), keccak256(abi.encode(h)));
            } else if (action == 12) {
                PayvokeVault.GrantConfig memory cfg = config();
                cfg.expiresAt = uint48(vm.getBlockTimestamp() + 1000);
                cfg.maxTotal = 1 + (seed >> 32) % 500000;
                cfg.maxPerPeriod = 1 + (seed >> 64) % cfg.maxTotal;
                cfg.maxPerCall = 1 + (seed >> 96) % cfg.maxPerPeriod;
                attempt(actor, abi.encodeCall(vault.updateGrant, (grantId, cfg)));
            } else if (action == 13) {
                attempt(actor, abi.encodeCall(vault.revokeGrant, (grantId)));
            } else {
                uint256 amount = 1 + (seed >> 32) % 1000;
                token.mint(address(vault), amount);
                donations += amount;
            }
            assertAllInvariants();
        }
    }
}
