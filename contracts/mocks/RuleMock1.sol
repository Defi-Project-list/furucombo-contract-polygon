// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../rules/RuleBase.sol";

contract RuleMock1 is RuleBase {
    uint256 public constant override DISCOUNT = (BASE * 90) / 100;
    address public constant COMBO = 0x6DdB31002abC64e1479Fc439692F7eA061e78165;

    function verify(address usr) public view override returns (bool) {
        return IERC20(COMBO).balanceOf(usr) >= 50e18;
    }

    function calDiscount(address usr) external view override returns (uint256) {
        return verify(usr) ? DISCOUNT : BASE;
    }
}
