// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "../Proxy.sol";
import "./debug/GasProfiler.sol";
import "hardhat/console.sol";

contract ProxyMock is Proxy, GasProfiler {
    using LibStack for bytes32[];

    constructor(address registry) Proxy(registry) {}

    event RecordHandlerResult(bytes value);

    function execMock(address to, bytes memory data)
        external
        payable
        returns (bytes memory result)
    {
        console.log("to: %s", to);
        _preProcess();
        _setBase();
        result = _exec(to, data);
        _setPostProcess(to);
        _deltaGas("Gas");
        _postProcess();
        emit RecordHandlerResult(result);
        return result;
    }

    function _preProcess() internal override isCubeCounterZero {
        // Set the sender.
        _setSender();
    }

    function updateTokenMock(address token) public {
        stack.setAddress(token);
    }
}
