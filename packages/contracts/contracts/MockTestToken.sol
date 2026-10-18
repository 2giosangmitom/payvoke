// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local test fixture only; never treat it as a supported Fuji payment asset.
contract MockTestToken is ERC20 {
    constructor() ERC20("Mock Test Token", "MTT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
