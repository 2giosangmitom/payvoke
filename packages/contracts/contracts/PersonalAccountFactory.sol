// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PersonalAccount} from "./PersonalAccount.sol";

contract PersonalAccountFactory {
    mapping(address => address) public accountOf;

    event AccountCreated(address indexed owner, address indexed account);

    function createAccount() external returns (address account) {
        require(accountOf[msg.sender] == address(0), "account exists");
        account = address(new PersonalAccount(msg.sender));
        accountOf[msg.sender] = account;
        emit AccountCreated(msg.sender, account);
    }
}
