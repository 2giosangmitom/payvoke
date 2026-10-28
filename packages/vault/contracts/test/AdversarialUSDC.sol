// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {MockUSDC} from "./MockUSDC.sol";

/// @dev Test-only token: simulate ERC20 false returns and a callback into the vault.
contract AdversarialUSDC is MockUSDC {
    bool public returnFalse;
    bool public chargeTransferFee;
    address public target;
    bytes public callback;
    bool public lastReentrySucceeded;
    bytes4 public lastReentryError;

    function setReturnFalse(bool value) external { returnFalse = value; }
    function setChargeTransferFee(bool value) external { chargeTransferFee = value; }
    function setCallback(address target_, bytes calldata data) external {
        target = target_;
        callback = data;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        return !returnFalse && super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        return !returnFalse && super.transferFrom(from, to, amount);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (chargeTransferFee && from != address(0) && to != address(0) && amount > 0) {
            super._update(from, address(0), 1);
            super._update(from, to, amount - 1);
        } else {
            super._update(from, to, amount);
        }
        if (from != address(0) && target != address(0)) {
            (bool success, bytes memory result) = target.call(callback);
            lastReentrySucceeded = success;
            lastReentryError = bytes4(result);
        }
    }
}
