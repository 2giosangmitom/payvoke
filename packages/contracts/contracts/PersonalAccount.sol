// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Owner-controlled testnet ERC20 account. A delegate may make exact, bounded payments only.
/// @dev A payment is immediate settlement to the fixed recipient, never an escrow or x402 proof.
contract PersonalAccount is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Policy {
        address delegate;
        address token;
        address recipient;
        bytes32 action;
        uint256 perOperationLimit;
        uint256 lifetimeLimit;
        uint256 spent;
        uint64 expiresAt;
        bool active;
    }

    uint256 public nextPolicyId = 1;
    mapping(uint256 => Policy) public policies;
    mapping(bytes32 => bool) public usedOperations;
    mapping(address => uint256) public reserved;

    event Deposited(address indexed token, address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event PolicyCreated(uint256 indexed policyId, address indexed delegate, address indexed recipient);
    event PolicyRevoked(uint256 indexed policyId);
    event Paid(uint256 indexed policyId, bytes32 indexed operationId, bytes32 indexed quoteDigest, address token, address recipient, bytes32 action, uint256 amount);

    constructor(address owner_) Ownable(owner_) {}

    // Factory ownership mapping must never become stale. Recovery needs a separate reviewed design.
    function transferOwnership(address) public override onlyOwner { revert("nontransferable account"); }
    function renounceOwnership() public override onlyOwner { revert("nontransferable account"); }

    function deposit(IERC20 token, uint256 amount) external nonReentrant {
        require(address(token) != address(0) && amount > 0, "invalid deposit");
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        require(token.balanceOf(address(this)) - beforeBalance == amount, "unsupported token");
        emit Deposited(address(token), msg.sender, amount);
    }

    function withdraw(IERC20 token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(address(token) != address(0) && to != address(0) && amount > 0, "invalid withdrawal");
        require(amount <= token.balanceOf(address(this)) - reserved[address(token)], "capacity reserved");
        token.safeTransfer(to, amount);
        emit Withdrawn(address(token), to, amount);
    }

    function createPolicy(
        address delegate,
        address token,
        address recipient,
        bytes32 action,
        uint256 perOperationLimit,
        uint256 lifetimeLimit,
        uint64 expiresAt
    ) external onlyOwner returns (uint256 policyId) {
        require(delegate != address(0) && token != address(0) && recipient != address(0) && recipient != address(this), "invalid address");
        require(action != bytes32(0) && perOperationLimit > 0 && lifetimeLimit >= perOperationLimit, "invalid limit");
        require(expiresAt > block.timestamp, "expired policy");
        require(lifetimeLimit <= IERC20(token).balanceOf(address(this)) - reserved[token], "insufficient capacity");
        policyId = nextPolicyId++;
        policies[policyId] = Policy(delegate, token, recipient, action, perOperationLimit, lifetimeLimit, 0, expiresAt, true);
        reserved[token] += lifetimeLimit;
        emit PolicyCreated(policyId, delegate, recipient);
    }

    function revokePolicy(uint256 policyId) external onlyOwner {
        Policy storage policy = policies[policyId];
        require(policy.active, "inactive policy");
        policy.active = false;
        reserved[policy.token] -= policy.lifetimeLimit - policy.spent;
        emit PolicyRevoked(policyId);
    }

    function pay(uint256 policyId, bytes32 operationId, bytes32 quoteDigest, bytes32 action, uint256 amount) external nonReentrant {
        Policy storage policy = policies[policyId];
        require(policy.active && msg.sender == policy.delegate && block.timestamp < policy.expiresAt, "unauthorized");
        require(operationId != bytes32(0) && quoteDigest != bytes32(0) && action == policy.action, "invalid commitment");
        require(!usedOperations[operationId], "operation used");
        require(amount > 0 && amount <= policy.perOperationLimit && amount <= policy.lifetimeLimit - policy.spent, "limit exceeded");
        usedOperations[operationId] = true;
        policy.spent += amount;
        reserved[policy.token] -= amount;
        uint256 beforeBalance = IERC20(policy.token).balanceOf(policy.recipient);
        IERC20(policy.token).safeTransfer(policy.recipient, amount);
        require(IERC20(policy.token).balanceOf(policy.recipient) - beforeBalance == amount, "unsupported token");
        emit Paid(policyId, operationId, quoteDigest, policy.token, policy.recipient, action, amount);
    }
}
