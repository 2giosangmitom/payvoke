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

library VaultEvents {
    event GrantRevoked(address indexed buyer, bytes32 indexed grantId, uint64 epoch);
}

/// @notice USDC deposits, scoped session spending and per-invocation escrow.
/// @dev Approvers attest offchain delivery/review eligibility; the vault enforces signed earliest deadlines.
contract PayvokeVault is AccessControlDefaultAdminRules, EIP712, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant FINANCE_EXECUTOR_ROLE = keccak256("FINANCE_EXECUTOR_ROLE");
    bytes32 public constant REFUND_APPROVER_ROLE = keccak256("REFUND_APPROVER_ROLE");
    bytes32 public constant RELEASE_APPROVER_ROLE = keccak256("RELEASE_APPROVER_ROLE");
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");
    bytes32 private constant QUOTE_TYPEHASH = keccak256("InvocationQuote(bytes32 invocationKey,bytes32 quoteKey,address buyer,bytes32 usageSessionKey,bytes32 productKey,uint64 productVersion,bytes32 commandKey,bytes32 inputHash,bytes32 termsHash,bytes32 policyHash,address provider,address asset,uint256 grossAmount,uint16 feeBps,address feeRecipient,uint48 validUntil,uint48 deliveryDeadline,uint48 releaseNotBefore,uint48 resolveBy)");
    bytes32 private constant AUTHORIZATION_TYPEHASH = keccak256("DebitAuthorization(bytes32 quoteDigest,bytes32 grantId,uint64 grantEpoch)");
    bytes32 private constant DECISION_TYPEHASH = keccak256("ResolutionDecision(bytes32 holdId,bytes32 decisionId,uint64 expectedVersion,uint256 refundAmount,bool releaseRemainder,bool resolveDispute,uint48 validUntil)");

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

    struct ResolutionDecision {
        bytes32 holdId;
        bytes32 decisionId;
        uint64 expectedVersion;
        uint256 refundAmount;
        bool releaseRemainder;
        bool resolveDispute;
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
        bool disputed;
        bool closed;
        uint64 version;
        bytes32 grantId;
    }

    IERC20 public immutable asset;
    uint16 public immutable feeCapBps;
    uint48 public immutable maxQuoteLifetimeSeconds;
    uint48 public immutable maxHoldSeconds;
    uint256 public totalAvailable;
    uint256 public totalHeld;
    uint256 public totalProviderClaimable;
    uint256 public totalPlatformClaimable;

    mapping(address => uint256) public availableBalance;
    mapping(address => uint256) public providerClaimable;
    mapping(address => uint256) public platformClaimable;
    mapping(bytes32 => bool) public usedDecisionIds;
    mapping(address => mapping(bytes32 => GrantView)) private grants;
    mapping(bytes32 => HoldView) private holds;

    error InvalidAsset();
    error InvalidConfiguration();
    error InvalidAmount();
    error InvalidSignature();
    error GrantAlreadyExists();
    error GrantNotFound();
    error GrantExpired();
    error GrantRevoked();
    error GrantEpochMismatch();
    error InsufficientAvailable();
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
    error HoldDisputed();
    error DecisionReplay();
    error HoldVersionMismatch();
    error ReleaseTooEarly();
    error ResolutionExpired();
    error ReclaimTooEarly();
    error InsufficientClaimable();
    error NoEffect();

    event Deposited(address indexed buyer, uint256 amount);
    event AvailableWithdrawn(address indexed buyer, uint256 amount);
    event GrantRegistered(address indexed buyer, bytes32 indexed grantId, uint64 epoch);
    event GrantUpdated(address indexed buyer, bytes32 indexed grantId, uint64 epoch);
    event HoldReserved(bytes32 indexed holdId, address indexed buyer, bytes32 quoteDigest, bytes32 authorizationDigest, uint256 gross);
    event DisputeOpened(bytes32 indexed holdId, bytes32 evidenceHash);
    event DecisionApplied(bytes32 indexed holdId, bytes32 indexed decisionId, uint64 version, uint256 refundAmount, uint256 providerAmount, uint256 feeAmount);
    event HoldReclaimed(bytes32 indexed holdId, address indexed buyer, uint256 amount);
    event ProviderWithdrawn(address indexed provider, uint256 amount);
    event PlatformWithdrawn(address indexed recipient, uint256 amount);

    constructor(address token, address admin, uint48 adminDelay, uint16 feeCap, uint48 maxQuoteLifetime, uint48 maxHold)
        AccessControlDefaultAdminRules(adminDelay, admin)
        EIP712("PayvokeVault", "1")
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

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) - beforeBalance != amount) revert InvalidAsset();
        availableBalance[msg.sender] += amount;
        totalAvailable += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdrawAvailable(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (amount > availableBalance[msg.sender]) revert InsufficientAvailable();
        availableBalance[msg.sender] -= amount;
        totalAvailable -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit AvailableWithdrawn(msg.sender, amount);
    }

    function registerGrant(bytes32 grantId, GrantConfig calldata config) external whenNotPaused {
        GrantView storage grant = grants[msg.sender][grantId];
        if (grant.epoch != 0) revert GrantAlreadyExists();
        _validateGrant(config);
        grant.config = config;
        grant.epoch = 1;
        grant.currentPeriod = uint64(block.timestamp / config.periodSeconds);
        emit GrantRegistered(msg.sender, grantId, 1);
    }

    function updateGrant(bytes32 grantId, GrantConfig calldata config) external whenNotPaused {
        GrantView storage grant = grants[msg.sender][grantId];
        if (grant.epoch == 0) revert GrantNotFound();
        if (grant.revoked) revert GrantRevoked();
        _validateGrant(config);
        if (config.periodSeconds != grant.config.periodSeconds) revert InvalidConfiguration();
        grant.config = config;
        grant.epoch += 1;
        emit GrantUpdated(msg.sender, grantId, grant.epoch);
    }

    function revokeGrant(bytes32 grantId) external {
        GrantView storage grant = grants[msg.sender][grantId];
        if (grant.epoch == 0) revert GrantNotFound();
        if (grant.revoked) revert GrantRevoked();
        grant.revoked = true;
        grant.epoch += 1;
        emit VaultEvents.GrantRevoked(msg.sender, grantId, grant.epoch);
    }

    function _validateGrant(GrantConfig calldata config) private view {
        if (config.signer == address(0) || config.signer.code.length != 0 || config.expiresAt <= block.timestamp ||
            config.periodSeconds == 0 || config.maxPerCall == 0 || config.maxPerCall > config.maxPerPeriod ||
            config.maxPerPeriod > config.maxTotal) revert InvalidConfiguration();
    }

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

    function openDispute(bytes32 holdId, bytes32 evidenceHash) external nonReentrant {
        HoldView storage hold = _openHold(holdId);
        if (msg.sender != hold.buyer) revert Unauthorized();
        if (block.timestamp >= hold.resolveBy) revert ResolutionExpired();
        if (hold.disputed) revert HoldDisputed();
        hold.disputed = true;
        // Invalidate any ordinary approval signed before the dispute reached chain.
        hold.version += 1;
        emit DisputeOpened(holdId, evidenceHash);
    }

    function applyDecision(ResolutionDecision calldata decision, address approver, bytes calldata approvalSignature)
        external nonReentrant
    {
        if (!hasRole(FINANCE_EXECUTOR_ROLE, msg.sender) || approver == msg.sender) revert Unauthorized();
        if (usedDecisionIds[decision.decisionId]) revert DecisionReplay();
        HoldView storage hold = _openHold(decision.holdId);
        if (decision.expectedVersion != hold.version) revert HoldVersionMismatch();
        if (block.timestamp >= decision.validUntil || block.timestamp >= hold.resolveBy) revert ResolutionExpired();
        if (decision.refundAmount > hold.remaining) revert InvalidAmount();
        // A resolve flag alone must not clear a dispute without a financial resolution.
        if (decision.refundAmount == 0 && !decision.releaseRemainder) revert NoEffect();
        if (hold.disputed && !decision.resolveDispute) revert HoldDisputed();
        if (decision.refundAmount > 0 && !hasRole(REFUND_APPROVER_ROLE, approver)) revert Unauthorized();
        if (decision.releaseRemainder && !hasRole(RELEASE_APPROVER_ROLE, approver)) revert Unauthorized();
        if ((hold.disputed || decision.resolveDispute) && !hasRole(DISPUTE_RESOLVER_ROLE, approver)) revert Unauthorized();
        if (decision.releaseRemainder && block.timestamp < hold.releaseNotBefore) revert ReleaseTooEarly();
        if (!SignatureChecker.isValidSignatureNow(approver, hashDecision(decision), approvalSignature)) revert InvalidSignature();

        usedDecisionIds[decision.decisionId] = true;
        hold.version += 1;
        uint256 refund = decision.refundAmount;
        if (refund > 0) {
            hold.refunded += refund;
            hold.remaining -= refund;
            totalHeld -= refund;
            availableBalance[hold.buyer] += refund;
            totalAvailable += refund;
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
            providerClaimable[hold.provider] += providerAmount;
            platformClaimable[hold.feeRecipient] += feeAmount;
            totalProviderClaimable += providerAmount;
            totalPlatformClaimable += feeAmount;
        }
        if (hold.remaining == 0) {
            hold.closed = true;
            hold.disputed = false;
        }
        // Partial dispute refunds keep the dispute lock until terminal resolution/reclaim.
        emit DecisionApplied(decision.holdId, decision.decisionId, hold.version, refund, providerAmount, feeAmount);
    }

    function reclaim(bytes32 holdId) external nonReentrant {
        HoldView storage hold = _openHold(holdId);
        if (msg.sender != hold.buyer) revert Unauthorized();
        if (block.timestamp < hold.resolveBy) revert ReclaimTooEarly();
        uint256 amount = hold.remaining;
        hold.remaining = 0;
        hold.refunded += amount;
        hold.closed = true;
        hold.disputed = false;
        hold.version += 1;
        totalHeld -= amount;
        availableBalance[hold.buyer] += amount;
        totalAvailable += amount;
        emit HoldReclaimed(holdId, hold.buyer, amount);
    }

    function withdrawProvider(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (amount > providerClaimable[msg.sender]) revert InsufficientClaimable();
        providerClaimable[msg.sender] -= amount;
        totalProviderClaimable -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit ProviderWithdrawn(msg.sender, amount);
    }

    function withdrawPlatform(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (amount > platformClaimable[msg.sender]) revert InsufficientClaimable();
        platformClaimable[msg.sender] -= amount;
        totalPlatformClaimable -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit PlatformWithdrawn(msg.sender, amount);
    }

    function _openHold(bytes32 holdId) private view returns (HoldView storage hold) {
        hold = holds[holdId];
        if (hold.buyer == address(0)) revert HoldNotFound();
        if (hold.closed) revert HoldClosed();
    }

    function reserveHold(InvocationQuote calldata quote, DebitAuthorization calldata authorization, bytes calldata signature)
        external nonReentrant returns (bytes32 holdId)
    {
        if (!hasRole(RELAYER_ROLE, msg.sender)) revert Unauthorized();
        bytes32 quoteDigest = hashQuote(quote);
        if (authorization.quoteDigest != quoteDigest) revert InvalidSignature();
        bytes32 digest = hashAuthorization(authorization);
        holdId = quote.invocationKey;
        HoldView storage hold = holds[holdId];
        // Existing receipts remain readable after expiry, revocation and pause.
        if (hold.buyer != address(0)) {
            if (hold.authorizationDigest != digest) revert InvocationConflict();
            return holdId;
        }
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
        if (gross > availableBalance[quote.buyer]) revert InsufficientAvailable();
        if (gross > grant.config.maxPerCall) revert PerCallLimitExceeded();
        uint64 period = uint64(block.timestamp / grant.config.periodSeconds);
        uint256 periodSpent = grant.currentPeriod == period ? grant.spentInPeriod : 0;
        // Compare before subtraction: lowering a cap below spent never underflows.
        if (periodSpent > grant.config.maxPerPeriod || gross > grant.config.maxPerPeriod - periodSpent) revert PeriodLimitExceeded();
        if (grant.spentTotal > grant.config.maxTotal || gross > grant.config.maxTotal - grant.spentTotal) revert TotalLimitExceeded();

        grant.currentPeriod = period;
        grant.spentInPeriod = periodSpent + gross;
        grant.spentTotal += gross;
        availableBalance[quote.buyer] -= gross;
        totalAvailable -= gross;
        totalHeld += gross;
        holds[holdId] = HoldView(quoteDigest, digest, quote.buyer, quote.provider, quote.feeRecipient,
            gross, 0, gross, 0, 0, quote.feeBps, quote.deliveryDeadline, quote.releaseNotBefore, quote.resolveBy,
            false, false, 1, authorization.grantId);
        emit HoldReserved(holdId, quote.buyer, quoteDigest, digest, gross);
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
}
