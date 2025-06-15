// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

interface IOracle {
    function requestDecryption(
        uint32 value,
        bytes4 callbackSelector,
        bytes32 requestId,
        uint256 deadline
    ) external returns (uint256);
}

contract MockOracle is IOracle {
    function requestDecryption(
        uint32 value,
        bytes4 callbackSelector,
        bytes32 requestId,
        uint256 deadline
    ) external override returns (uint256) {
        // Simulate successful decryption
        return 1;
    }

    function simulateDecryptionCallback(address target, bytes32 requestId, bool isMatch) external {
        // Call the target contract's handleMatchDecryption function
        (bool success, ) = target.call(
            abi.encodeWithSignature("handleMatchDecryption(bytes32,bool)", requestId, isMatch)
        );
        require(success, "Decryption callback failed");
    }
}
