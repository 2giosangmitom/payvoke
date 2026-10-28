// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Unrestricted toggling is a test fixture for time-dependent ERC1271 validity.
contract ContractApprover is IERC1271 {
    address immutable signer;
    bool public enabled = true;

    constructor(address signer_) { signer = signer_; }
    function setEnabled(bool value) external { enabled = value; }

    function isValidSignature(bytes32 digest, bytes memory signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signature);
        return enabled && error == ECDSA.RecoverError.NoError && recovered == signer
            ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}
