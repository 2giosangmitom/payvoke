// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @dev Test double for Circle's FiatToken v2.2: same EIP-712 domain ("USD Coin", "2"),
/// same EIP-3009/EIP-2612 typehashes and revert strings, and SignatureChecker-routed
/// `bytes` signatures. Unrestricted mint/freeze/blacklist is for isolated tests only.
contract MockUSDC is ERC20, EIP712 {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");
    bytes32 public constant PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    bool public frozen;
    mapping(address => bool) public isBlacklisted;
    mapping(address => uint256) public nonces;
    mapping(address => mapping(bytes32 => bool)) private authorizations;

    constructor() ERC20("USD Coin", "USDC") EIP712("USD Coin", "2") {}

    function decimals() public pure override returns (uint8) { return 6; }
    function version() external pure returns (string memory) { return "2"; }
    function DOMAIN_SEPARATOR() external view returns (bytes32) { return _domainSeparatorV4(); }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setFrozen(bool value) external { frozen = value; }
    function setBlacklisted(address account, bool value) external { isBlacklisted[account] = value; }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return authorizations[authorizer][nonce];
    }

    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore,
        bytes32 nonce, bytes memory signature) external
    {
        _authorize(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, signature);
        _transfer(from, to, value);
    }

    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore,
        bytes32 nonce, bytes memory signature) external
    {
        require(to == msg.sender, "FiatTokenV2: caller must be the payee");
        _authorize(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, signature);
        _transfer(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, bytes memory signature) external {
        require(!authorizations[authorizer][nonce], "FiatTokenV2: authorization is used or canceled");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)));
        require(SignatureChecker.isValidSignatureNow(authorizer, digest, signature), "FiatTokenV2: invalid signature");
        authorizations[authorizer][nonce] = true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, bytes memory signature) external {
        require(deadline >= block.timestamp, "FiatTokenV2: permit is expired");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline)));
        require(SignatureChecker.isValidSignatureNow(owner, digest, signature), "EIP2612: invalid signature");
        _approve(owner, spender, value);
    }

    function _authorize(bytes32 typehash, address from, address to, uint256 value, uint256 validAfter, uint256 validBefore,
        bytes32 nonce, bytes memory signature) private
    {
        require(block.timestamp > validAfter, "FiatTokenV2: authorization is not yet valid");
        require(block.timestamp < validBefore, "FiatTokenV2: authorization is expired");
        require(!authorizations[from][nonce], "FiatTokenV2: authorization is used or canceled");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(typehash, from, to, value, validAfter, validBefore, nonce)));
        require(SignatureChecker.isValidSignatureNow(from, digest, signature), "FiatTokenV2: invalid signature");
        authorizations[from][nonce] = true;
    }

    function _update(address from, address to, uint256 amount) internal virtual override {
        require(!frozen, "USDC frozen");
        require(!isBlacklisted[from] && !isBlacklisted[to], "Blacklistable: account is blacklisted");
        super._update(from, to, amount);
    }
}
