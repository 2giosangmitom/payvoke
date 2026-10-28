// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Unrestricted mint/freeze is for isolated tests only.
contract MockUSDC is ERC20 {
    bool public frozen;

    constructor() ERC20("Mock USDC", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setFrozen(bool value) external { frozen = value; }

    function _update(address from, address to, uint256 amount) internal virtual override {
        require(!frozen, "USDC frozen");
        super._update(from, to, amount);
    }
}
