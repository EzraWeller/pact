// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

contract EthAccounting {

    // State //
    
    mapping(address => uint256) public accountBalances;


    // Events //

    event ReceiveEther(address from, uint256 amount);
    event WithdrawEther(address to, uint256 amount);
    event IncreaseAccountBalance(address account, uint256 amount);


    // External functions //

    function withdraw(address to) external {
        uint256 balance = accountBalances[to];
        require(balance != 0, "withdraw: to address balance is 0.");
        accountBalances[to] = 0;
        payable(to).transfer(balance);
        emit WithdrawEther(to, balance);
    }

    receive() payable external {
        emit ReceiveEther(msg.sender, msg.value);
    }


    // Internal functions //

    function _increaseAccountBalance(address account, uint256 amount) internal {
        accountBalances[account] += amount;
        emit IncreaseAccountBalance(account, amount);
    }
    
}