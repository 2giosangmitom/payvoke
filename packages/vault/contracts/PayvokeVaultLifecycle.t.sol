// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {PayvokeVaultFinanceFixture} from "./PayvokeVaultFinance.t.sol";
import {PayvokeVault} from "./PayvokeVault.sol";

/// @dev Stateful fuzzing: check liabilities, wallets and every hold after each randomized
/// action, including failed calls, both funding sources, multiple buyers, clock advances,
/// blacklisting, revocation and terminal replay.
contract PayvokeVaultLifecycleTest is PayvokeVaultFinanceFixture {
    uint256 otherKey = 0xB1B;
    address otherBuyer;
    bytes32[] ids;
    mapping(bytes32 => PayvokeVault.InvocationQuote) originalQuotes;
    mapping(bytes32 => bytes) originalSignatures;
    mapping(bytes32 => PayvokeVault.DebitAuthorization) originalAuthorizations;
    mapping(bytes32 => bool) closedSeen;
    mapping(address => uint256) expectedSpent;
    address[] accounts;
    uint256 minted;
    uint256 donations;

    function setUp() public override {
        super.setUp();
        otherBuyer = vm.addr(otherKey);
        ids.push(holdId);
        originalQuotes[holdId] = quote(holdId, 10000);
        originalSignatures[holdId] = receiveSignature(originalQuotes[holdId], buyerKey);
        token.mint(otherBuyer, FUNDS);
        setGrant(otherKey, otherBuyer, grantId, config(), GRANT_TOTAL);
        minted = 2 * FUNDS;
        accounts.push(buyer);
        accounts.push(otherBuyer);
        accounts.push(provider);
        accounts.push(feeRecipient);
    }

    function keyOf(address account) internal view returns (uint256) {
        return account == buyer ? buyerKey : otherKey;
    }

    function attempt(address caller, bytes memory data) internal returns (bool success) {
        vm.prank(caller);
        (success,) = address(vault).call(data);
    }

    function assertAllInvariants() internal {
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
        uint256 claimable;
        uint256 wallets;
        for (uint256 i; i < accounts.length; i++) {
            claimable += vault.claimable(accounts[i]);
            wallets += token.balanceOf(accounts[i]);
        }
        assertEq(vault.totalClaimable(), claimable);
        assertEq(token.balanceOf(address(vault)), vault.totalHeld() + vault.totalClaimable() + donations);
        // Nothing is created or lost: every minted unit is in a wallet or the vault.
        assertEq(wallets + token.balanceOf(address(vault)), minted + donations);
    }

    function testFuzz_LifecycleActionSequence(uint256 seed) public {
        for (uint256 i; i < 64; i++) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 action = seed % 16;
            address actor = seed & 256 == 0 ? buyer : otherBuyer;
            bytes32 id = ids[(seed >> 16) % ids.length];
            PayvokeVault.HoldView memory h = vault.getHold(id);
            if (action == 0 || action == 1) {
                bytes32 nextId = keccak256(abi.encode("random-hold", i));
                PayvokeVault.InvocationQuote memory q = quote(nextId, 1 + (seed >> 32) % 100000);
                q.buyer = actor;
                bool ok;
                if (action == 0) {
                    bytes memory signature = receiveSignature(q, keyOf(actor));
                    ok = attempt(address(this), abi.encodeCall(vault.fundWithAuthorization, (q, signature)));
                    if (ok) originalSignatures[nextId] = signature;
                } else {
                    PayvokeVault.DebitAuthorization memory a = PayvokeVault.DebitAuthorization(
                        vault.hashQuote(q), grantId, vault.getGrant(actor, grantId).epoch);
                    bytes memory signature = sign(signerKey, vault.hashAuthorization(a));
                    ok = attempt(address(this), abi.encodeCall(vault.fundWithGrant, (q, a, signature)));
                    if (ok) {
                        originalSignatures[nextId] = signature;
                        originalAuthorizations[nextId] = a;
                        expectedSpent[actor] += q.grossAmount;
                    }
                }
                if (ok) {
                    ids.push(nextId);
                    originalQuotes[nextId] = q;
                }
            } else if (action == 2) {
                uint256 amount = 1 + (seed >> 32) % 1000;
                if (!token.isBlacklisted(actor)) {
                    token.mint(actor, amount);
                    minted += amount;
                }
            } else if (action == 3 || action == 4) {
                uint256 refund = (seed >> 32) % (h.remaining + 2);
                PayvokeVault.ResolutionDecision memory d = PayvokeVault.ResolutionDecision(
                    id, keccak256(abi.encode(seed, "decision")), h.version, refund,
                    action == 4, uint48(vm.getBlockTimestamp() + 100));
                bytes memory signature = signDecision(d);
                attempt(seed & 1024 == 0 ? actor : executor,
                    abi.encodeCall(vault.applyDecision, (d, vm.addr(approverKey), signature)));
            } else if (action == 5 || action == 6) {
                attempt(actor, abi.encodeCall(vault.reclaim, (id)));
            } else if (action == 7) {
                address account = accounts[(seed >> 32) % accounts.length];
                bool listed = token.isBlacklisted(account);
                token.setBlacklisted(account, !listed);
            } else if (action == 8) {
                address account = accounts[(seed >> 32) % accounts.length];
                attempt(account, abi.encodeCall(vault.claim, (account)));
            } else if (action == 9) {
                vm.warp(vm.getBlockTimestamp() + (seed >> 32) % 100);
            } else if (action == 10) {
                if (vault.paused()) vault.unpause();
                else vault.pause();
            } else if (action == 11) {
                // Replaying the original funding call never changes a hold.
                PayvokeVault.InvocationQuote memory q = originalQuotes[id];
                bool ok = h.source == vault.SOURCE_AUTHORIZATION()
                    ? attempt(address(this), abi.encodeCall(vault.fundWithAuthorization, (q, originalSignatures[id])))
                    : attempt(address(this), abi.encodeCall(vault.fundWithGrant, (q, originalAuthorizations[id], originalSignatures[id])));
                assertTrue(ok);
                assertEq(keccak256(abi.encode(vault.getHold(id))), keccak256(abi.encode(h)));
            } else if (action == 12) {
                PayvokeVault.GrantConfig memory cfg = config();
                cfg.expiresAt = uint48(vm.getBlockTimestamp() + 1000);
                cfg.maxTotal = 1 + (seed >> 32) % 500000;
                cfg.maxPerPeriod = 1 + (seed >> 64) % cfg.maxTotal;
                cfg.maxPerCall = 1 + (seed >> 96) % cfg.maxPerPeriod;
                uint48 deadline = uint48(vm.getBlockTimestamp() + 1000);
                bytes memory signature = setupSignature(keyOf(actor), actor, grantId, cfg, deadline);
                PayvokeVault.Permit memory permit = permitFor(keyOf(actor), actor, cfg.maxTotal);
                attempt(address(this), abi.encodeCall(vault.setGrantWithSig, (actor, grantId, cfg, deadline, signature, permit)));
            } else if (action == 13) {
                attempt(actor, abi.encodeCall(vault.revokeGrant, (grantId)));
            } else if (action == 14) {
                // A wallet spending its USDC elsewhere between quote and funding.
                uint256 amount = (seed >> 32) % (token.balanceOf(actor) + 1);
                if (!token.isBlacklisted(actor) && !token.isBlacklisted(otherBuyer == actor ? buyer : otherBuyer)) {
                    vm.prank(actor);
                    token.transfer(otherBuyer == actor ? buyer : otherBuyer, amount);
                }
            } else {
                uint256 amount = 1 + (seed >> 32) % 1000;
                token.mint(address(vault), amount);
                donations += amount;
            }
            assertAllInvariants();
        }
    }
}
