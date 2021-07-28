// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import "./EthAccounting.sol";

contract PactFact is EthAccounting {

    // State //

    uint256 public immutable timeout;
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
        // true-true, true-false, false-true, false-false
        Payout[4] payoutMatrix;
        string tags;
        bytes32 answer1Hash;
        bool answer2;
        uint answer2Timestamp;
        bool answer1;
        bytes32 answer1Salt;
        PactState state;
    }


    // Events //

    event ProposePact(
      address p1,
      address p2,
      uint256 p1Deposit,
      uint256 p2Deposit,
      Payout payoutTT,
      Payout payoutTF,
      Payout payoutFT,
      Payout payoutFF,
      string tags,
      PactState state,
      uint256 pactId
    );
    event CancelPact(uint256 pactId, PactState state);
    event SealPact(uint256 pactId, PactState state);
    event SubmitAnswer1Hash(uint256 pactId, bytes32 answerHash, PactState state);
    event SubmitAnswer2(uint256 pactId, bool answer, uint timestamp, PactState state);
    event InvalidAnswer(uint256 pactId, bool answer, bytes32 salt);
    event TimeoutPact(uint256 pactId, PactState state);
    event ResolveValidPact(uint256 pactId, bool answer, bytes32 salt, PactState state);


    // External functions //

    constructor(uint256 timeoutDays) {
        timeout = timeoutDays * 1 days;
    }

    function proposePact(
        address p2,
        uint256 p1Deposit,
        uint256 p2Deposit,
        Payout calldata payoutTT,
        Payout calldata payoutTF,
        Payout calldata payoutFT,
        Payout calldata payoutFF,
        string calldata tags
    ) payable external {
        require(p2 != address(0), "PactFact: p2 is 0 address.");
        require(msg.value == p1Deposit, "PactFact: Message value not equal to party 1 deposit.");
        validateMatrix(
            p1Deposit, 
            p2Deposit, 
            payoutTT,
            payoutTF,
            payoutFT,
            payoutFF
        );

        Pact storage pact = pacts[pactCount];
        pact.p1 = msg.sender;
        pact.p2 = p2;
        pact.p1Deposit = p1Deposit;
        pact.p2Deposit = p2Deposit;
        pact.payoutMatrix[0] = payoutTT;
        pact.payoutMatrix[1] = payoutTF;
        pact.payoutMatrix[2] = payoutFT;
        pact.payoutMatrix[3] = payoutFF;
        pact.tags = tags;
        pact.state = PactState.Proposed;

        emit ProposePact(
          pact.p1,
          pact.p2,
          pact.p1Deposit,
          pact.p2Deposit,
          pact.payoutMatrix[0],
          pact.payoutMatrix[1],
          pact.payoutMatrix[2],
          pact.payoutMatrix[3],
          pact.tags,
          pact.state,
          pactCount
        );

        pactCount++;
    }

    function cancelPact(uint256 pactId) 
        external 
        pactExists(pactId)
    {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Proposed, "PactFact: Pact must be proposed.");
        require(pact.p1 == msg.sender, "PactFact: Message sender must be party 1.");

        pact.state = PactState.Canceled;
        _increaseAccountBalance(pact.p1, pact.p1Deposit);

        emit CancelPact(pactId, pact.state);
    }

    function sealPact(uint256 pactId) payable external pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Proposed, "PactFact: Pact must be proposed.");
        require(pact.p2 == msg.sender, "PactFact: Message sender must be party 2.");
        require(msg.value == pact.p2Deposit, "PactFact: Message value not equal to party 2 deposit.");

        pact.state = PactState.Sealed;

        emit SealPact(pactId, pact.state);
    }

    function submitAnswer1Hash(
        uint256 pactId, 
        bytes32 answerHash
    ) external pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Sealed, "PactFact: Pact must be sealed.");
        require(pact.p1 == msg.sender, "PactFact: Message sender must be party 1.");

        pact.answer1Hash = answerHash;
        pact.state = PactState.Answer1HashSubmitted;

        emit SubmitAnswer1Hash(pactId, pact.answer1Hash, pact.state);
    }

    function submitAnswer2(uint256 pactId, bool answer) external pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(
            pact.state == PactState.Answer1HashSubmitted, 
            "PactFact: Pact must have answer 1 hash submitted."
        );
        require(pact.p2 == msg.sender, "PactFact: Message sender must be party 2.");

        pact.answer2 = answer;
        pact.answer2Timestamp = block.timestamp;
        pact.state = PactState.Answer2Submitted;

        emit SubmitAnswer2(pactId, pact.answer2, pact.answer2Timestamp, pact.state);
    }

    function submitAnswer1(
        uint256 pactId, 
        bool answer, 
        bytes32 salt
    ) external pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Answer2Submitted, "PactFact: Pact must have answer 2 submitted.");
        require(msg.sender == pact.p1, "PactFact: Message sender must be party 1.");
        require(
            block.timestamp < pact.answer2Timestamp + timeout, 
            "PactFact: Block must be less than answer 2 block timestamp + timeout."
        );

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

    function timeoutPact(uint256 pactId) external pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(pact.state == PactState.Answer2Submitted, "PactFact: Pact must have answer 2 submitted.");  
        require(
            block.timestamp >= pact.answer2Timestamp + timeout,
            "PactFact: Block must be greater than or equal to answer 2 block timestamp + timeout."
        );

        pact.state = PactState.TimedOut;
        _resolveTimeout(pactId);
        emit TimeoutPact(pactId, pact.state);
    }

    function getPayoutMatrix(uint256 pactId) 
        view 
        external 
        pactExists(pactId) 
        returns(Payout memory, Payout memory, Payout memory, Payout memory)
    {
        Pact memory pact = pacts[pactId];
        return (
            pact.payoutMatrix[0], 
            pact.payoutMatrix[1], 
            pact.payoutMatrix[2], 
            pact.payoutMatrix[3]
        );
    }


    // Public functions //

    function hashAnswer(bool answer, bytes32 salt) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(answer, salt));
    }

    function validateMatrix(
        uint256 p1Deposit,
        uint256 p2Deposit,
        Payout calldata payoutTT,
        Payout calldata payoutTF,
        Payout calldata payoutFT,
        Payout calldata payoutFF
    ) pure public {
        uint256 depositTotal = p1Deposit + p2Deposit;
        require(
            depositTotal == payoutTT.p1 + payoutTT.p2 + payoutTT.burn, 
            "Deposit total does not equal TT payout total."
        );
        require(
            depositTotal == payoutTF.p1 + payoutTF.p2 + payoutTF.burn, 
            "Deposit total does not equal TF payout total."
        );
        require(
            depositTotal == payoutFT.p1 + payoutFT.p2 + payoutFT.burn, 
            "Deposit total does not equal FT payout total."
        );
        require(
            depositTotal == payoutFF.p1 + payoutFF.p2 + payoutFF.burn, 
            "Deposit total does not equal FF payout total."
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
        revert("getPayoutIndex (unreachable): Failed to find payout index.");
    }


    // Modifiers //
    
    modifier pactExists(uint256 pactId) {
        require(pacts[pactId].p1 != address(0), "PactFact: p1 is 0 address.");
        _;
    }
}
