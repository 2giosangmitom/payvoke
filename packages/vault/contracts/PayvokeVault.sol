// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFiatTokenV2_2} from "./interfaces/IFiatTokenV2_2.sol";

library VaultEvents {
    event GrantRevoked(address indexed buyer, bytes32 indexed grantId, uint64 epoch);
}

/// @notice Per-job USDC escrow. Buyers never keep a balance here: each job is funded
/// straight from the buyer's wallet, either by an EIP-3009 authorization the buyer signs
/// for that one quote, or by a spending grant that pulls within its limits through the
/// buyer's allowance. Settlement pays out to wallets directly.
/// @dev Approvers attest offchain delivery/review eligibility; the vault enforces signed earliest deadlines.
contract PayvokeVault is AccessControlDefaultAdminRules, EIP712, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant FINANCE_EXECUTOR_ROLE = keccak256("FINANCE_EXECUTOR_ROLE");
    bytes32 public constant REFUND_APPROVER_ROLE = keccak256("REFUND_APPROVER_ROLE");
    bytes32 public constant RELEASE_APPROVER_ROLE = keccak256("RELEASE_APPROVER_ROLE");
    bytes32 private constant QUOTE_TYPEHASH = keccak256("InvocationQuote(bytes32 invocationKey,bytes32 quoteKey,address buyer,bytes32 usageSessionKey,bytes32 productKey,uint64 productVersion,bytes32 commandKey,bytes32 inputHash,bytes32 termsHash,bytes32 policyHash,address provider,address asset,uint256 grossAmount,uint16 feeBps,address feeRecipient,uint48 validUntil,uint48 deliveryDeadline,uint48 releaseNotBefore,uint48 resolveBy)");
    bytes32 private constant AUTHORIZATION_TYPEHASH = keccak256("DebitAuthorization(bytes32 quoteDigest,bytes32 grantId,uint64 grantEpoch)");
    bytes32 private constant DECISION_TYPEHASH = keccak256("ResolutionDecision(bytes32 holdId,bytes32 decisionId,uint64 expectedVersion,uint256 refundAmount,bool releaseRemainder,uint48 validUntil)");
    bytes32 private constant GRANT_SETUP_TYPEHASH = keccak256("GrantSetup(address buyer,bytes32 grantId,address signer,uint48 expiresAt,uint256 maxPerCall,uint32 periodSeconds,uint256 maxPerPeriod,uint256 maxTotal,uint256 nonce,uint48 deadline)");
    bytes32 private constant GRANT_REVOKE_TYPEHASH = keccak256("GrantRevoke(address buyer,bytes32 grantId,uint256 nonce,uint48 deadline)");
    /// @dev FiatToken v2's typehash; the vault rebuilds every field, so a buyer's signature
    /// can only ever fund the one quote whose digest is its nonce.
    bytes32 private constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    uint8 public constant SOURCE_AUTHORIZATION = 1;
    uint8 public constant SOURCE_GRANT = 2;

    struct InvocationQuote {
        bytes32 invocationKey;
        bytes32 quoteKey;
        address buyer;
        bytes32 usageSessionKey;
        bytes32 productKey;
        uint64 productVersion;
        bytes32 commandKey;
        bytes32 inputHash;
        bytes32 termsHash;
        bytes32 policyHash;
        address provider;
        address asset;
        uint256 grossAmount;
        uint16 feeBps;
        address feeRecipient;
        uint48 validUntil;
        uint48 deliveryDeadline;
        uint48 releaseNotBefore;
        uint48 resolveBy;
    }

    struct DebitAuthorization {
        bytes32 quoteDigest;
        bytes32 grantId;
        uint64 grantEpoch;
    }

    struct GrantConfig {
        address signer;
        uint48 expiresAt;
        uint256 maxPerCall;
        uint32 periodSeconds;
        uint256 maxPerPeriod;
        uint256 maxTotal;
    }

    /// @dev An EIP-2612 permit for the vault, applied with a grant change. An empty
    /// signature leaves the allowance alone.
    struct Permit {
        uint256 value;
        uint256 deadline;
        bytes signature;
    }

    struct ResolutionDecision {
        bytes32 holdId;
        bytes32 decisionId;
        uint64 expectedVersion;
        uint256 refundAmount;
        bool releaseRemainder;
        uint48 validUntil;
    }

    struct GrantView {
        GrantConfig config;
        uint64 epoch;
        uint256 spentTotal;
        uint256 spentInPeriod;
        uint64 currentPeriod;
        bool revoked;
    }

    struct HoldView {
        bytes32 quoteDigest;
        bytes32 authorizationDigest;
        address buyer;
        address provider;
        address feeRecipient;
        uint256 gross;
        uint256 refunded;
        uint256 remaining;
        uint256 providerReleased;
        uint256 feeReleased;
        uint16 feeBps;
        uint48 deliveryDeadline;
        uint48 releaseNotBefore;
        uint48 resolveBy;
        bool closed;
        uint64 version;
        bytes32 grantId;
        uint8 source;
    }

    IERC20 public immutable asset;
    uint16 public immutable feeCapBps;
    uint48 public immutable maxQuoteLifetimeSeconds;
    uint48 public immutable maxHoldSeconds;
    uint256 public totalHeld;
    uint256 public totalClaimable;

    mapping(address => uint256) public claimable;
    mapping(address => uint256) public grantNonces;
    mapping(bytes32 => bool) public usedDecisionIds;
    mapping(address => mapping(bytes32 => GrantView)) private grants;
    mapping(bytes32 => HoldView) private holds;

    error InvalidAsset();
    error InvalidConfiguration();
    error InvalidAmount();
    error InvalidSignature();
    error SignatureExpired();
    error GrantNotFound();
    error GrantExpired();
    error GrantRevoked();
    error GrantEpochMismatch();
    error InsufficientAllowance();
    error InsufficientBalance();
    error AuthorizationUsed();
    error AuthorizationRejected();
    error PermitFailed();
    error PerCallLimitExceeded();
    error PeriodLimitExceeded();
    error TotalLimitExceeded();
    error QuoteExpired();
    error DeadlineInvalid();
    error FeeCapExceeded();
    error InvocationConflict();
    error Unauthorized();
    error HoldNotFound();
    error HoldClosed();
    error DecisionReplay();
    error HoldVersionMismatch();
    error ReleaseTooEarly();
    error ResolutionExpired();
    error ReclaimTooEarly();
    error InsufficientClaimable();
    error NoEffect();

    event GrantSet(address indexed buyer, bytes32 indexed grantId, uint64 epoch);
    event HoldFunded(bytes32 indexed holdId, address indexed buyer, bytes32 quoteDigest, bytes32 authorizationDigest, uint256 gross, uint8 source);
    event DecisionApplied(bytes32 indexed holdId, bytes32 indexed decisionId, uint64 version, uint256 refundAmount, uint256 providerAmount, uint256 feeAmount);
    event HoldReclaimed(bytes32 indexed holdId, address indexed buyer, uint256 amount);
    event PaymentDeferred(bytes32 indexed holdId, address indexed account, uint256 amount);
    event Claimed(address indexed account, address indexed to, uint256 amount);

    constructor(address token, address admin, uint48 adminDelay, uint16 feeCap, uint48 maxQuoteLifetime, uint48 maxHold)
        AccessControlDefaultAdminRules(adminDelay, admin)
        EIP712("PayvokeVault", "2")
    {
        if (token.code.length == 0 || IERC20Metadata(token).decimals() != 6) revert InvalidAsset();
        if (adminDelay == 0 || feeCap > 10000 || maxQuoteLifetime == 0 || maxHold <= maxQuoteLifetime) {
            revert InvalidConfiguration();
        }
        asset = IERC20(token);
        feeCapBps = feeCap;
        maxQuoteLifetimeSeconds = maxQuoteLifetime;
        maxHoldSeconds = maxHold;
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ---------------------------------------------------------------- funding

    /// @notice Funds one job from the buyer's wallet with the EIP-3009 authorization the
    /// buyer signed for exactly this quote: to this vault, for the gross amount, valid
    /// until the quote expires, with the quote digest as its nonce.
    function fundWithAuthorization(InvocationQuote calldata quote, bytes calldata signature)
        external nonReentrant returns (bytes32 holdId)
    {
        if (!hasRole(RELAYER_ROLE, msg.sender)) revert Unauthorized();
        bytes32 quoteDigest = hashQuote(quote);
        bytes32 digest = hashReceiveAuthorization(quote);
        holdId = quote.invocationKey;
        // Existing receipts remain readable after expiry and pause.
        if (_existing(holdId, digest)) return holdId;
        _requireNotPaused();
        _validateQuote(quote);
        IFiatTokenV2_2 usdc = IFiatTokenV2_2(address(asset));
        uint256 gross = quote.grossAmount;
        if (usdc.authorizationState(quote.buyer, quoteDigest)) revert AuthorizationUsed();
        if (asset.balanceOf(quote.buyer) < gross) revert InsufficientBalance();
        uint256 beforeBalance = asset.balanceOf(address(this));
        try usdc.receiveWithAuthorization(quote.buyer, address(this), gross, 0, quote.validUntil, quoteDigest, signature) {}
        catch { revert AuthorizationRejected(); }
        if (asset.balanceOf(address(this)) - beforeBalance != gross) revert InvalidAsset();
        _openHold(quote, quoteDigest, digest, bytes32(0), SOURCE_AUTHORIZATION);
    }

    /// @notice Funds one job by pulling from the buyer's allowance, within a grant's
    /// limits, on a debit its signer signed for this quote.
    function fundWithGrant(InvocationQuote calldata quote, DebitAuthorization calldata authorization, bytes calldata signature)
        external nonReentrant returns (bytes32 holdId)
    {
        if (!hasRole(RELAYER_ROLE, msg.sender)) revert Unauthorized();
        bytes32 quoteDigest = hashQuote(quote);
        if (authorization.quoteDigest != quoteDigest) revert InvalidSignature();
        bytes32 digest = hashAuthorization(authorization);
        holdId = quote.invocationKey;
        if (_existing(holdId, digest)) return holdId;
        _requireNotPaused();
        _validateQuote(quote);
        GrantView storage grant = grants[quote.buyer][authorization.grantId];
        if (grant.epoch == 0) revert GrantNotFound();
        if (grant.revoked) revert GrantRevoked();
        if (block.timestamp >= grant.config.expiresAt) revert GrantExpired();
        if (authorization.grantEpoch != grant.epoch) revert GrantEpochMismatch();
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signature);
        if (error != ECDSA.RecoverError.NoError || recovered != grant.config.signer) revert InvalidSignature();
        uint256 gross = quote.grossAmount;
        if (gross > grant.config.maxPerCall) revert PerCallLimitExceeded();
        uint64 period = uint64(block.timestamp / grant.config.periodSeconds);
        uint256 periodSpent = grant.currentPeriod == period ? grant.spentInPeriod : 0;
        // Compare before subtraction: lowering a cap below spent never underflows.
        if (periodSpent > grant.config.maxPerPeriod || gross > grant.config.maxPerPeriod - periodSpent) revert PeriodLimitExceeded();
        if (grant.spentTotal > grant.config.maxTotal || gross > grant.config.maxTotal - grant.spentTotal) revert TotalLimitExceeded();
        if (asset.allowance(quote.buyer, address(this)) < gross) revert InsufficientAllowance();
        if (asset.balanceOf(quote.buyer) < gross) revert InsufficientBalance();

        grant.currentPeriod = period;
        grant.spentInPeriod = periodSpent + gross;
        grant.spentTotal += gross;
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(quote.buyer, address(this), gross);
        if (asset.balanceOf(address(this)) - beforeBalance != gross) revert InvalidAsset();
        _openHold(quote, quoteDigest, digest, authorization.grantId, SOURCE_GRANT);
    }

    function _existing(bytes32 holdId, bytes32 authorizationDigest) private view returns (bool) {
        HoldView storage hold = holds[holdId];
        if (hold.buyer == address(0)) return false;
        if (hold.authorizationDigest != authorizationDigest) revert InvocationConflict();
        return true;
    }

    function _openHold(InvocationQuote calldata quote, bytes32 quoteDigest, bytes32 digest, bytes32 grantId, uint8 source) private {
        uint256 gross = quote.grossAmount;
        totalHeld += gross;
        holds[quote.invocationKey] = HoldView(quoteDigest, digest, quote.buyer, quote.provider, quote.feeRecipient,
            gross, 0, gross, 0, 0, quote.feeBps, quote.deliveryDeadline, quote.releaseNotBefore, quote.resolveBy,
            false, 1, grantId, source);
        emit HoldFunded(quote.invocationKey, quote.buyer, quoteDigest, digest, gross, source);
    }

    // ----------------------------------------------------------------- grants

    /// @notice Creates or updates a buyer's grant from the buyer's signature, and sets the
    /// buyer's allowance for the vault from an optional permit in the same call.
    function setGrantWithSig(address buyer, bytes32 grantId, GrantConfig calldata config, uint48 deadline,
        bytes calldata signature, Permit calldata permit) external nonReentrant whenNotPaused
    {
        if (!hasRole(RELAYER_ROLE, msg.sender)) revert Unauthorized();
        _consumeBuyerSignature(buyer, hashGrantSetup(buyer, grantId, config, grantNonces[buyer], deadline), deadline, signature);
        _validateGrant(config);
        GrantView storage grant = grants[buyer][grantId];
        if (grant.revoked) revert GrantRevoked();
        if (grant.epoch == 0) {
            grant.currentPeriod = uint64(block.timestamp / config.periodSeconds);
        } else if (config.periodSeconds != grant.config.periodSeconds) {
            revert InvalidConfiguration();
        }
        grant.config = config;
        grant.epoch += 1;
        _applyPermit(buyer, permit);
        emit GrantSet(buyer, grantId, grant.epoch);
    }

    /// @notice Revokes a grant from the buyer's signature, optionally lowering the allowance.
    function revokeGrantWithSig(address buyer, bytes32 grantId, uint48 deadline, bytes calldata signature,
        Permit calldata permit) external nonReentrant
    {
        if (!hasRole(RELAYER_ROLE, msg.sender)) revert Unauthorized();
        _consumeBuyerSignature(buyer, hashGrantRevoke(buyer, grantId, grantNonces[buyer], deadline), deadline, signature);
        _revoke(buyer, grantId);
        _applyPermit(buyer, permit);
    }

    /// @notice The buyer's own escape hatch: revoke without the relayer.
    function revokeGrant(bytes32 grantId) external {
        _revoke(msg.sender, grantId);
    }

    function _revoke(address buyer, bytes32 grantId) private {
        GrantView storage grant = grants[buyer][grantId];
        if (grant.epoch == 0) revert GrantNotFound();
        if (grant.revoked) revert GrantRevoked();
        grant.revoked = true;
        grant.epoch += 1;
        emit VaultEvents.GrantRevoked(buyer, grantId, grant.epoch);
    }

    function _consumeBuyerSignature(address buyer, bytes32 digest, uint48 deadline, bytes calldata signature) private {
        if (buyer == address(0)) revert InvalidConfiguration();
        if (block.timestamp >= deadline) revert SignatureExpired();
        if (!SignatureChecker.isValidSignatureNow(buyer, digest, signature)) revert InvalidSignature();
        grantNonces[buyer] += 1;
    }

    /// @dev Anyone can submit a permit seen in the mempool first, so a failed call is fine
    /// as long as the allowance it asked for is in place.
    function _applyPermit(address buyer, Permit calldata permit) private {
        if (permit.signature.length == 0) return;
        try IFiatTokenV2_2(address(asset)).permit(buyer, address(this), permit.value, permit.deadline, permit.signature) {}
        catch {}
        if (asset.allowance(buyer, address(this)) != permit.value) revert PermitFailed();
    }

    function _validateGrant(GrantConfig calldata config) private view {
        if (config.signer == address(0) || config.signer.code.length != 0 || config.expiresAt <= block.timestamp ||
            config.periodSeconds == 0 || config.maxPerCall == 0 || config.maxPerCall > config.maxPerPeriod ||
            config.maxPerPeriod > config.maxTotal) revert InvalidConfiguration();
    }

    // ------------------------------------------------------------- settlement

    function applyDecision(ResolutionDecision calldata decision, address approver, bytes calldata approvalSignature)
        external nonReentrant
    {
        if (!hasRole(FINANCE_EXECUTOR_ROLE, msg.sender) || approver == msg.sender) revert Unauthorized();
        if (usedDecisionIds[decision.decisionId]) revert DecisionReplay();
        HoldView storage hold = _activeHold(decision.holdId);
        if (decision.expectedVersion != hold.version) revert HoldVersionMismatch();
        if (block.timestamp >= decision.validUntil || block.timestamp >= hold.resolveBy) revert ResolutionExpired();
        if (decision.refundAmount > hold.remaining) revert InvalidAmount();
        if (decision.refundAmount == 0 && !decision.releaseRemainder) revert NoEffect();
        if (decision.refundAmount > 0 && !hasRole(REFUND_APPROVER_ROLE, approver)) revert Unauthorized();
        if (decision.releaseRemainder && !hasRole(RELEASE_APPROVER_ROLE, approver)) revert Unauthorized();
        if (decision.releaseRemainder && block.timestamp < hold.releaseNotBefore) revert ReleaseTooEarly();
        if (!SignatureChecker.isValidSignatureNow(approver, hashDecision(decision), approvalSignature)) revert InvalidSignature();

        usedDecisionIds[decision.decisionId] = true;
        hold.version += 1;
        uint256 refund = decision.refundAmount;
        if (refund > 0) {
            hold.refunded += refund;
            hold.remaining -= refund;
            totalHeld -= refund;
        }
        uint256 providerAmount;
        uint256 feeAmount;
        if (decision.releaseRemainder) {
            uint256 net = hold.remaining;
            // mulDiv avoids overflowing gross * feeBps for large uint256 balances.
            feeAmount = Math.mulDiv(net, hold.feeBps, 10000);
            providerAmount = net - feeAmount;
            hold.remaining = 0;
            totalHeld -= net;
            hold.providerReleased = providerAmount;
            hold.feeReleased = feeAmount;
        }
        if (hold.remaining == 0) hold.closed = true;
        emit DecisionApplied(decision.holdId, decision.decisionId, hold.version, refund, providerAmount, feeAmount);
        _pay(decision.holdId, hold.buyer, refund);
        _pay(decision.holdId, hold.provider, providerAmount);
        _pay(decision.holdId, hold.feeRecipient, feeAmount);
    }

    function reclaim(bytes32 holdId) external nonReentrant {
        HoldView storage hold = _activeHold(holdId);
        if (msg.sender != hold.buyer) revert Unauthorized();
        if (block.timestamp < hold.resolveBy) revert ReclaimTooEarly();
        uint256 amount = hold.remaining;
        hold.remaining = 0;
        hold.refunded += amount;
        hold.closed = true;
        hold.version += 1;
        totalHeld -= amount;
        emit HoldReclaimed(holdId, hold.buyer, amount);
        _pay(holdId, hold.buyer, amount);
    }

    /// @notice Withdraws a payout the vault could not deliver, to any address.
    function claim(address to) external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0 || to == address(0)) revert InsufficientClaimable();
        claimable[msg.sender] = 0;
        totalClaimable -= amount;
        asset.safeTransfer(to, amount);
        emit Claimed(msg.sender, to, amount);
    }

    /// @dev Pushes a payout. A recipient USDC refuses (e.g. blacklisted) must not block
    /// settlement for the other party, so the amount stays claimable instead.
    function _pay(bytes32 holdId, address to, uint256 amount) private {
        if (amount == 0) return;
        if (asset.trySafeTransfer(to, amount)) return;
        claimable[to] += amount;
        totalClaimable += amount;
        emit PaymentDeferred(holdId, to, amount);
    }

    function _activeHold(bytes32 holdId) private view returns (HoldView storage hold) {
        hold = holds[holdId];
        if (hold.buyer == address(0)) revert HoldNotFound();
        if (hold.closed) revert HoldClosed();
    }

    function _validateQuote(InvocationQuote calldata quote) private view {
        if (quote.asset != address(asset)) revert InvalidAsset();
        if (quote.buyer == address(0) || quote.provider == address(0) || quote.feeRecipient == address(0)) revert InvalidConfiguration();
        if (quote.grossAmount == 0) revert InvalidAmount();
        if (quote.feeBps > feeCapBps) revert FeeCapExceeded();
        if (block.timestamp >= quote.validUntil) revert QuoteExpired();
        if (quote.validUntil >= quote.deliveryDeadline || quote.deliveryDeadline > quote.releaseNotBefore ||
            quote.releaseNotBefore >= quote.resolveBy || quote.validUntil - block.timestamp > maxQuoteLifetimeSeconds ||
            quote.resolveBy - block.timestamp > maxHoldSeconds) revert DeadlineInvalid();
    }

    // ------------------------------------------------------------------ views

    function getGrant(address buyer, bytes32 grantId) external view returns (GrantView memory) {
        return grants[buyer][grantId];
    }

    function getHold(bytes32 holdId) external view returns (HoldView memory) { return holds[holdId]; }

    function hashQuote(InvocationQuote memory quote) public view returns (bytes32) {
        // All quote members are static ABI types; encoding the tuple preserves S02 field order.
        return _hashTypedDataV4(keccak256(abi.encode(QUOTE_TYPEHASH, quote)));
    }

    function hashAuthorization(DebitAuthorization memory authorization) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(AUTHORIZATION_TYPEHASH, authorization)));
    }

    function hashDecision(ResolutionDecision memory decision) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(DECISION_TYPEHASH, decision)));
    }

    function hashGrantSetup(address buyer, bytes32 grantId, GrantConfig memory config, uint256 nonce, uint48 deadline)
        public view returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(GRANT_SETUP_TYPEHASH, buyer, grantId, config.signer, config.expiresAt,
            config.maxPerCall, config.periodSeconds, config.maxPerPeriod, config.maxTotal, nonce, deadline)));
    }

    function hashGrantRevoke(address buyer, bytes32 grantId, uint256 nonce, uint48 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(GRANT_REVOKE_TYPEHASH, buyer, grantId, nonce, deadline)));
    }

    /// @notice The EIP-712 struct hash of the USDC authorization that funds `quote`; it is
    /// the hold's authorization digest for authorization-funded holds.
    function hashReceiveAuthorization(InvocationQuote memory quote) public view returns (bytes32) {
        return keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, quote.buyer, address(this), quote.grossAmount,
            uint256(0), uint256(quote.validUntil), hashQuote(quote)));
    }
}
