// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

/// @notice The parts of Circle's FiatToken v2.2 (USDC) the vault calls. The `bytes`
/// signature overloads route through SignatureChecker, so EOAs, ERC-1271 wallets and
/// EIP-7702 delegated accounts can all authorize.
interface IFiatTokenV2_2 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;

    function permit(address owner, address spender, uint256 value, uint256 deadline, bytes memory signature) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
