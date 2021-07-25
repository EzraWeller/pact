// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import "./EthAccounting.sol";

contract PactFact is EthAccounting {

    // State //

    uint256 public immutable TIMEOUT;
    uint256 public pactCount;
    mapping(uint256 => Pact) public pacts;


    // Types //

    struct Payout {
        uint256 p1;
        uint256 p2;
        uint256 burn;
    }

    enum PactState { 
        Proposed, 
        Canceled,
        Sealed, 
        Answer1HashSubmitted,
        Answer2Submitted,
        TimedOut,
        Resolved
    }

    struct Pact {
        address p1;
        address p2;
        uint256 p1Deposit;
        uint256 p2Deposit;
        // yes-yes, yes-no, no-yes, no-no
        Payout[4] payoutMatrix;
        string tags;
        bytes32 answer1Hash;
        bool answer2;
        uint answer2Block;
        bool answer1;
        bytes32 answer1Salt;
        PactState state;
    }


    // Events //

    event ProposePact(Pact pact);
    event CancelPact(uint256 pactId, PactState state);
    event SealPact(uint256 pactId, PactState state);
    event SubmitAnswer1Hash(uint256 pactId, bytes32 answerHash, PactState state);
    event SubmitAnswer2(uint256 pactId, bool answer, uint block, PactState state);
    event InvalidAnswer(uint256 pactId, bool answer, bytes32 salt);
    event TimeoutPact(uint256 pactId, PactState state);
    event ResolveValidPact(uint256 pactId, bool answer, bytes32 salt, PactState state);

    // External functions //

    constructor(uint256 timeoutDays) {
        TIMEOUT = timeoutDays * 1 days;
    }

    function proposePact(
        address p2,
        uint256 p1Deposit,
        uint256 p2Deposit,
        Payout calldata payoutYY,
        Payout calldata payoutYN,
        Payout calldata payoutNY,
        Payout calldata payoutNN,
        string calldata tags
    ) payable external {
        require(msg.value == p1Deposit, "Message value not equal to party 1 deposit.");
        validateMatrix(
            p1Deposit, 
            p2Deposit, 
            payoutYY,
            payoutYN,
            payoutNY,
            payoutNN
        );

        Pact storage pact = pacts[pactCount];
        pact.p1 = msg.sender;
        pact.p2 = p2;
        pact.p1Deposit = p1Deposit;
        pact.p2Deposit = p2Deposit;
        pact.payoutMatrix[0] = payoutYY;
        pact.payoutMatrix[1] = payoutYN;
        pact.payoutMatrix[2] = payoutNY;
        pact.payoutMatrix[3] = payoutNN;
        pact.tags = tags;
        pact.state = PactState.Proposed;
        pactCount++;

        emit ProposePact(pact);
    }

    function cancelPact(uint256 pactId) external {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Proposed, "cancelPact: Pact must be proposed.");
        require(pact.p1 == msg.sender, "cancelPact: Message sender must be party 1.");

        pact.state = PactState.Canceled;
        _increaseAccountBalance(pact.p1, pact.p1Deposit);

        emit CancelPact(pactId, pact.state);
    }

    function sealPact(uint256 pactId) payable external {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Proposed, "sealPact: Pact must be proposed.");
        require(pact.p2 == msg.sender, "sealPact: Message sender must be party 2.");
        require(msg.value == pact.p2Deposit, "sealPact: Message value not equal to party 2 deposit.");

        pact.state = PactState.Sealed;

        emit SealPact(pactId, pact.state);
    }

    function submitAnswer1Hash(uint256 pactId, bytes32 answerHash) external {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Sealed, "submitAnswer1Hash: Pact must be sealed.");
        require(pact.p1 == msg.sender, "submitAnswer1Hash: Message sender must be party 1.");

        pact.answer1Hash = answerHash;
        pact.state = PactState.Answer1HashSubmitted;

        emit SubmitAnswer1Hash(pactId, pact.answer1Hash, pact.state);
    }

    function submitAnswer2(uint256 pactId, bool answer) external {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Answer1HashSubmitted, "submitAnswer2: Pact must have answer 1 hash submitted.");
        require(pact.p2 == msg.sender, "submitAnswer2: Message sender must be party 2.");

        pact.answer2 = answer;
        pact.answer2Block = block.number;
        pact.state = PactState.Answer2Submitted;

        emit SubmitAnswer2(pactId, pact.answer2, pact.answer2Block, pact.state);
    }

    function submitAnswer1(uint256 pactId, bool answer, bytes32 salt) external {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Answer2Submitted, "submitAnswer1: Pact must have answer 2 submitted.");
        require(msg.sender == pact.p1, "submitAnswer1: Message sender must be party 1."); 

        pact.answer1 = answer;
        pact.answer1Salt = salt;
        bytes32 answerHash = hashAnswer(answer, salt);

        if (answerHash != pact.answer1Hash) {
            emit InvalidAnswer(pactId, pact.answer1, pact.answer1Salt);
        } else {
            pact.state = PactState.Resolved;
            _resolveValidPact(pactId);
            emit ResolveValidPact(pactId, pact.answer1, pact.answer1Salt, pact.state);
        }
    }

    function timeOutPact(uint256 pactId) external {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Answer2Submitted, "timeoutPact: Pact must have answer 2 submitted."); 
        require(msg.sender == pact.p2, "timeoutPact: Message sender must be party 2."); 
        require(
            block.number >= pact.answer2Block + TIMEOUT, 
            "timeoutPact: Block must be greater than or equal to answer 2 block + timeout."
        );

        pact.state = PactState.TimedOut;
        _resolveTimeout(pactId);
        emit TimeoutPact(pactId, pact.state);
    }


    // Public functions //

    function hashAnswer(bool answer, bytes32 salt) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(answer, salt));
    }

    function validateMatrix(
        uint256 p1Deposit,
        uint256 p2Deposit,
        Payout calldata payoutYY,
        Payout calldata payoutYN,
        Payout calldata payoutNY,
        Payout calldata payoutNN
    ) pure public {
        uint256 depositTotal = p1Deposit + p2Deposit;
        require(
            depositTotal == payoutYY.p1 + payoutYY.p2 + payoutYY.burn, 
            "Deposit total does not equal YY payout total."
        );
        require(
            depositTotal == payoutYN.p1 + payoutYN.p2 + payoutYN.burn, 
            "Deposit total does not equal YN payout total."
        );
        require(
            depositTotal == payoutNY.p1 + payoutNY.p2 + payoutNY.burn, 
            "Deposit total does not equal NY payout total."
        );
        require(
            depositTotal == payoutNN.p1 + payoutNN.p2 + payoutNN.burn, 
            "Deposit total does not equal NN payout total."
        );
    }


    // Internal functions //

    function _resolveTimeout(uint256 pactId) internal {
        Pact memory pact = pacts[pactId];
        _increaseAccountBalance(pact.p2, pact.p1Deposit + pact.p2Deposit);
    }

    function _resolveValidPact(uint256 pactId) internal {
        Pact memory pact = pacts[pactId];
        
        uint8 payoutIndex = _getPayoutIndex(pact.answer1, pact.answer2);
        
        Payout memory payout = pact.payoutMatrix[payoutIndex];
        _increaseAccountBalance(pact.p1, payout.p1);
        _increaseAccountBalance(pact.p2, payout.p2);
    }

    function _getPayoutIndex(bool answer1, bool answer2) pure internal returns(uint8) {
        if (answer1 == true && answer2 == true) {
            return 0;
        }
        if (answer1 == true && answer2 == false) {
            return 1;
        }
        if (answer1 == false && answer2 == true) {
            return 2;
        }
        if (answer1 == false && answer2 == false) {
            return 3;
        }
        revert("Failed to find payout index.");
    }
}