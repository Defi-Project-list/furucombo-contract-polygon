pragma solidity ^0.6.0;

interface IWMATIC {
    fallback() external payable;
    function deposit() external payable;
    function withdraw(uint256 wad) external;
}
