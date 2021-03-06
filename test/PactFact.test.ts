import { ethers } from 'hardhat'
import { ethers as ethersTypes } from 'ethers'
import { assert, expect } from 'chai'
import { PactFact } from '../typechain/PactFact'
import { PactFact__factory } from '../typechain/factories/PactFact__factory'

/**
 * TEST SPEC:
 * - proposePact
 *   - fails if p2 is 0 address
 *   - fails if value isn't p1Deposit
 *   - fails if matrix isn't valid
 *   - stores a new pact, increments pactCount, emits ProposePact
 * 
 * - pactExists
 *   - cancelPact fails if pact doesn't exist
 * 
 * - cancelPact
 *   - fails if pact state isn't Proposed
 *   - fails if msg.sender isn't p1
 *   - changes pact state to Canceled, increases p1 account balance by p1Deposit, emits CancelPact
 * 
 * - sealPact
 *   - fails if pact state isn't Proposed
 *   - fails if msg.sender isn't p2
 *   - fails if value isn't p2Deposit
 *   - changes pact state to Sealed, emits SealPact
 * 
 * - submitAnswer1Hash
 *   - fails if pact state isn't Sealed
 *   - fails if msg.sender isn't p1
 *   - sets answer1Hash, changes pact state to Answer1HashSubmitted, emits SubmitAnswer1Hash
 * 
 * - submitAnswer2
 *   - fails if pact state isn't Answer1HashSubmitted
 *   - fails if msg.sender isn't p2
 *   - sets answer2 & answer2Timestamp, changes pact state to Answer2Submitted, emits SubmitAnswer2
 * 
 * - submitAnswer1
 *   - fails if pact state isn't Answer2Submitted
 *   - fails if msg.sender isn't p1
 *   - fails if timed out
 *   - if answer is invalid, emits InvalidAnswer, does not change state or account balances
 *   - if answer is valid, sets answer1 & answer1Salt, changes pact state to Resolved, emits ResolveValidPact, resolves TT properly 
 *   - if answer is valid, '', resolves TF properly
 *   - if answer is valid, '', resolves FT properly
 *   - if answer is valid, '', resolves FF properly
 * 
 * - timeoutPact
 *   - fails if pact state isn't Answer2Submitted
 *   - fails if timeout block hasn't been reached
 *   - changes pact state to TimedOut, increases p2 account balance by p1Dep + p2Dep, emits TimeoutPact
 * 
 * - hashAnswer
 *   - returns different values for different salts, same answer
 *   - returns different values for same salt, different answers
 * 
 * - validateMatrix
 *   - returns for valid matrix
 *   - throws for invalid matrix
 * 
 * - withdraw
 *   - fails if balance is 0
 *   - changes account balance to 0, transfers balance to account, emits WithdrawEther
 * 
 * - receive
 *   - emits ReceiveEther
 */

describe('PactFact', () => {
    let alice: ethersTypes.Signer
    let bob: ethersTypes.Signer
    let pactFactAlice: PactFact
    let pactFactBob: PactFact
    let defMatrix: [Payout, Payout, Payout, Payout]

    const TIMEOUT = 1
    const DEF_P1_DEP: ethersTypes.BigNumber = ethers.utils.parseEther('50')
    const DEF_P2_DEP: ethersTypes.BigNumber = ethers.utils.parseEther('50')
    const P1_SALT: ethersTypes.utils.BytesLike = ethers.utils.formatBytes32String('birthday')
    const DEF_TAGS = 'prisoner,dilemma,tags'
    const BYTES32_0 = '0x0000000000000000000000000000000000000000000000000000000000000000'

    interface Payout {
        p1: ethersTypes.BigNumber,
        p2: ethersTypes.BigNumber,
        burn: ethersTypes.BigNumber
    }

    function randomHalfScalar(): [number, number, number] {
        const a = Math.round(Math.random() * 10000)
        const b = Math.round(Math.random() * (10000 - a))
        const c = 10000 - a - b
        return [a, b, c]
    }

    function randomPayoutScalar(): [
        [number, number],
        [number, number],
        [number, number]
    ] {
        const p1Scalar = randomHalfScalar()
        const p2Scalar = randomHalfScalar()
        return [
            [p1Scalar[0], p2Scalar[0]],
            [p1Scalar[1], p2Scalar[1]],
            [p1Scalar[2], p2Scalar[2]]
        ]
    }

    const payoutScalars = [
        randomPayoutScalar(),
        randomPayoutScalar(),
        randomPayoutScalar(),
        randomPayoutScalar()
    ]

    function defPayoutMatrix(
        p1Deposit: ethersTypes.BigNumber, 
        p2Deposit: ethersTypes.BigNumber   
    ): [Payout, Payout, Payout, Payout] {
        const payoutYY: Payout = {
            p1: ( p1Deposit.mul(payoutScalars[0][0][0]).add(p2Deposit.mul(payoutScalars[0][0][1])) ).div(10000),
            p2: ( p1Deposit.mul(payoutScalars[0][1][0]).add(p2Deposit.mul(payoutScalars[0][1][1])) ).div(10000),
            burn: ( p1Deposit.mul(payoutScalars[0][2][0]).add(p2Deposit.mul(payoutScalars[0][2][1])) ).div(10000)
        }
        const payoutYN: Payout = {
            p1: ( p1Deposit.mul(payoutScalars[1][0][0]).add(p2Deposit.mul(payoutScalars[1][0][1])) ).div(10000),
            p2: ( p1Deposit.mul(payoutScalars[1][1][0]).add(p2Deposit.mul(payoutScalars[1][1][1])) ).div(10000),
            burn: ( p1Deposit.mul(payoutScalars[1][2][0]).add(p2Deposit.mul(payoutScalars[1][2][1])) ).div(10000)
        }
        const payoutNY: Payout = {
            p1: ( p1Deposit.mul(payoutScalars[2][0][0]).add(p2Deposit.mul(payoutScalars[2][0][1])) ).div(10000),
            p2: ( p1Deposit.mul(payoutScalars[2][1][0]).add(p2Deposit.mul(payoutScalars[2][1][1])) ).div(10000),
            burn: ( p1Deposit.mul(payoutScalars[2][2][0]).add(p2Deposit.mul(payoutScalars[2][2][1])) ).div(10000)
        }
        const payoutNN: Payout = {
            p1: ( p1Deposit.mul(payoutScalars[3][0][0]).add(p2Deposit.mul(payoutScalars[3][0][1])) ).div(10000),
            p2: ( p1Deposit.mul(payoutScalars[3][1][0]).add(p2Deposit.mul(payoutScalars[3][1][1])) ).div(10000),
            burn: ( p1Deposit.mul(payoutScalars[3][2][0]).add(p2Deposit.mul(payoutScalars[3][2][1])) ).div(10000)
        }
        return [payoutYY, payoutYN, payoutNY, payoutNN]
    }

    function eventPayoutMatrix(dpm: [Payout, Payout, Payout, Payout]) {
        return [
          [dpm[0].p1, dpm[0].p2, dpm[0].burn],
          [dpm[1].p1, dpm[1].p2, dpm[1].burn],
          [dpm[2].p1, dpm[2].p2, dpm[2].burn],
          [dpm[3].p1, dpm[3].p2, dpm[3].burn],
        ]
    }

    async function proposeDefPact() {
        const eventDPM = eventPayoutMatrix(defMatrix)

        let pactCount = await pactFactAlice.pactCount()
        assert.equal(Number(pactCount), 0, 'pact count before')

        const contractBalanceBefore = await ethers.provider.getBalance(pactFactAlice.address)

        await expect(pactFactAlice.proposePact(
            await bob.getAddress(),
            DEF_P1_DEP,
            DEF_P2_DEP,
            defMatrix[0],
            defMatrix[1],
            defMatrix[2],
            defMatrix[3],
            DEF_TAGS,
            { value: DEF_P1_DEP }
        ))
            .to.emit(pactFactAlice, "ProposePact")
            .withArgs(
                await alice.getAddress(),
                await bob.getAddress(),
                DEF_P1_DEP,
                DEF_P2_DEP,
                eventDPM[0],
                eventDPM[1],
                eventDPM[2],
                eventDPM[3],
                DEF_TAGS,
                0,
                pactCount
            )

        const contractBalanceAfter = await ethers.provider.getBalance(pactFactAlice.address)
        assert.equal(
            Number(contractBalanceAfter),
            Number(contractBalanceBefore.add(DEF_P1_DEP)),
            'contract balance'
        )
        
        const pact = await pactFactAlice.pacts(0)
        const payoutMatrix = await pactFactAlice.getPayoutMatrix(0)
        
        assert.equal(pact.p1, await alice.getAddress(), 'p1')
        assert.equal(pact.p2, await bob.getAddress(), 'p2')
        assert.equal(Number(pact.p1Deposit), Number(DEF_P1_DEP), "p1Deposit")
        assert.equal(Number(pact.p2Deposit), Number(DEF_P2_DEP), "p2Deposit")
        assert.equal(pact.tags, DEF_TAGS, "tags")
        assert.equal(pact.answer1Hash, BYTES32_0, "answer1Hash")
        assert.equal(pact.answer2, false, "answer2")
        assert.equal(Number(pact.answer2Timestamp), 0, "answer2Timestamp")
        assert.equal(pact.answer1, false, "answer1")
        assert.equal(pact.answer1Salt, BYTES32_0, "answer1Salt")
        assert.equal(pact.state, 0, "state")

        assert.equal(Number(payoutMatrix[0].p1), Number(defMatrix[0].p1), 'payoutTT p1')
        assert.equal(Number(payoutMatrix[0].p2), Number(defMatrix[0].p2), 'payoutTT p2')
        assert.equal(Number(payoutMatrix[0].burn), Number(defMatrix[0].burn), 'payoutTT burn')

        assert.equal(Number(payoutMatrix[1].p1), Number(defMatrix[1].p1), 'payoutTF p1')
        assert.equal(Number(payoutMatrix[1].p2), Number(defMatrix[1].p2), 'payoutTF p2')
        assert.equal(Number(payoutMatrix[1].burn), Number(defMatrix[1].burn), 'payoutTF burn')

        assert.equal(Number(payoutMatrix[2].p1), Number(defMatrix[2].p1), 'payoutFT p1')
        assert.equal(Number(payoutMatrix[2].p2), Number(defMatrix[2].p2), 'payoutFT p2')
        assert.equal(Number(payoutMatrix[2].burn), Number(defMatrix[2].burn), 'payoutFT burn')
        
        assert.equal(Number(payoutMatrix[3].p1), Number(defMatrix[3].p1), 'payoutFF p1')
        assert.equal(Number(payoutMatrix[3].p2), Number(defMatrix[3].p2), 'payoutFF p2')
        assert.equal(Number(payoutMatrix[3].burn), Number(defMatrix[3].burn), 'payoutFF burn')

        pactCount = await pactFactAlice.pactCount()
        assert.equal(Number(pactCount), 1, 'pact count after')
    }

    async function sealDefPact() {
        await proposeDefPact()

        const contractBalanceBefore = await ethers.provider.getBalance(pactFactAlice.address)

        await expect(pactFactBob.sealPact(0, { value: DEF_P2_DEP }))
            .to.emit(pactFactBob, "SealPact")
            .withArgs(
                0,
                2
            )

        const contractBalanceAfter = await ethers.provider.getBalance(pactFactAlice.address)
        assert.equal(
            Number(contractBalanceAfter),
            Number(contractBalanceBefore.add(DEF_P2_DEP)),
            'contract balance'
        )

        const pact = await pactFactAlice.pacts(0)
        assert.equal(pact.state, 2, 'state')
    }

    async function submitDefAnswer1Hash(answer: boolean) {
        await sealDefPact()

        const hash = await pactFactAlice.hashAnswer(answer, P1_SALT)
        await expect(pactFactAlice.submitAnswer1Hash(0, hash))
            .to.emit(pactFactAlice, "SubmitAnswer1Hash")
            .withArgs(
                0,
                hash,
                3
            )
        
        const pact = await pactFactAlice.pacts(0)
        assert.equal(pact.state, 3, 'state')
    }

    async function submitDefAnswer2(answer1: boolean, answer2: boolean) { 
        await submitDefAnswer1Hash(answer1)

        const blockNumber = await ethers.provider.getBlockNumber()
        const blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp
        await expect(pactFactBob.submitAnswer2(0, answer2))
            .to.emit(pactFactBob, "SubmitAnswer2")
            .withArgs(
                0,
                answer2,
                blockTimestamp + 1,
                4
            )

        const pact = await pactFactAlice.pacts(0)
        assert.equal(pact.answer2, answer2, 'answer 2')
        assert.equal(Number(pact.answer2Timestamp), blockTimestamp + 1, 'answer 2 block')
        assert.equal(pact.state, 4, 'state')
    }

    async function submitDefAnswer1(answer1: boolean, answer2: boolean, index: number) {
        await submitDefAnswer2(answer1, answer2)

        const aliceBalanceBefore = await pactFactAlice.accountBalances(await alice.getAddress())
        const bobBalanceBefore = await pactFactAlice.accountBalances(await bob.getAddress())

        await expect(pactFactAlice.submitAnswer1(0, answer1, P1_SALT))
            .to.emit(pactFactAlice, "ResolveValidPact")
            .withArgs(
                0,
                answer1,
                P1_SALT,
                6
            )

        const pact = await pactFactAlice.pacts(0)
        assert.equal(pact.answer1, answer1, 'answer 1')
        assert.equal(pact.answer1Salt, P1_SALT, 'answer 1 salt')
        assert.equal(pact.state, 6, 'state')

        const aliceBalanceAfter = await pactFactAlice.accountBalances(await alice.getAddress())
        const bobBalanceAfter = await pactFactAlice.accountBalances(await bob.getAddress())
        assert.equal(
            Number(aliceBalanceAfter),
            Number(aliceBalanceBefore.add(defMatrix[index].p1)),
            'alice balance'
        )
        assert.equal(
            Number(bobBalanceAfter),
            Number(bobBalanceBefore.add(defMatrix[index].p2)),
            'bob balance'
        )
    }

    async function setupTimeout() {
        let blockNumber = await ethers.provider.getBlockNumber()
        let blockTime = (await ethers.provider.getBlock(blockNumber)).timestamp
        const timeout = Number(await pactFactAlice.timeout())
        await ethers.provider.send("evm_setNextBlockTimestamp", [blockTime + timeout])
    }

    beforeEach(async () => {
        const signers = await ethers.getSigners()
        alice = signers[0]
        bob = signers[1]

        const PactFactFactory = new PactFact__factory(alice)
        pactFactAlice = await PactFactFactory.deploy(TIMEOUT)
        pactFactBob = pactFactAlice.connect(bob)

        defMatrix = defPayoutMatrix(DEF_P1_DEP, DEF_P2_DEP)
    })

    describe('proposePact', () => {
        it("fails if p2 is 0 address", async () => {
            await expect(pactFactAlice.proposePact(
                ethers.constants.AddressZero,
                DEF_P1_DEP,
                DEF_P2_DEP,
                defMatrix[0],
                defMatrix[1],
                defMatrix[2],
                defMatrix[3],
                DEF_TAGS,
                { value: DEF_P1_DEP }
            )).to.be.reverted
        })

        it("fails if value isn't p1Deposit", async () => {
            await expect(pactFactAlice.proposePact(
                await bob.getAddress(),
                DEF_P1_DEP,
                DEF_P2_DEP,
                defMatrix[0],
                defMatrix[1],
                defMatrix[2],
                defMatrix[3],
                DEF_TAGS,
                { value: DEF_P1_DEP.add(-10) }
            )).to.be.reverted
        })

        it("fails if matrix isn't valid", async () => {
            defMatrix[0].p1 = defMatrix[0].p1.add(10)

            await expect(pactFactAlice.proposePact(
                await bob.getAddress(),
                DEF_P1_DEP,
                DEF_P2_DEP,
                defMatrix[0],
                defMatrix[1],
                defMatrix[2],
                defMatrix[3],
                DEF_TAGS,
                { value: DEF_P1_DEP }
            )).to.be.reverted
        })

        it("stores a new pact, increments pactCount, emits ProposePact", async () => {
            await proposeDefPact()
        })
    })

    describe('pactExists', () => {
        it("cancelPact fails if pact doesn't exist", async () => {
            await expect(pactFactAlice.cancelPact(0))
              .to.be.reverted
        })
    })

    describe('cancelPact', () => {
        it("fails if pact state isn't Proposed", async () => {
            await proposeDefPact()
            await pactFactBob.sealPact(0, { value: DEF_P2_DEP })
            await expect(pactFactAlice.cancelPact(0))
                .to.be.reverted
        })

        it("fails if msg.sender isn't p1", async () => {
            await proposeDefPact()
            await expect(pactFactBob.cancelPact(0))
                .to.be.reverted
        })

        it("changes pact state to Canceled, increases p1 account balance by p1Deposit, emits CancelPact", async () => {
            let aliceBalance = await pactFactAlice.accountBalances(await alice.getAddress())
            assert.equal(Number(aliceBalance), 0, 'alice balance before')

            await proposeDefPact()

            await expect(pactFactAlice.cancelPact(0))
                .to.emit(pactFactAlice, "CancelPact")
                .withArgs(
                    0,
                    1
                )

            const pact = await pactFactAlice.pacts(0)
            assert.equal(pact.state, 1, 'state')

            aliceBalance = await pactFactAlice.accountBalances(await alice.getAddress())
            assert.equal(Number(aliceBalance), Number(DEF_P1_DEP), 'alice balance after')
        })
    })

    describe('sealPact', () => {
        it("fails if pact state isn't Proposed", async () => {
            await proposeDefPact()
            await pactFactBob.sealPact(0, { value: DEF_P2_DEP })
            await expect(pactFactBob.sealPact(0, { value: DEF_P2_DEP }))
                .to.be.reverted
        })

        it("fails if msg.sender isn't p2", async () => {
            await proposeDefPact()
            await expect(pactFactAlice.sealPact(0, { value: DEF_P2_DEP }))
                .to.be.reverted
        })

        it("fails if value isn't p2Deposit", async () => {
            await proposeDefPact()
            await expect(pactFactBob.sealPact(0, { value: DEF_P2_DEP.add(-10) }))
                .to.be.reverted
        })

        it("changes pact state to Sealed, emits SealPact", async () => {
            await sealDefPact()
        })
    })

    describe('submitAnswer1Hash', () => {
        it("fails if pact state isn't Sealed", async () => {
            await proposeDefPact()
            const hash = await pactFactAlice.hashAnswer(true, P1_SALT)
            await expect(pactFactAlice.submitAnswer1Hash(0, hash))
                .to.be.reverted
        })

        it("fails if msg.sender isn't p1", async () => {
            await sealDefPact()
            const hash = await pactFactAlice.hashAnswer(true, P1_SALT)
            await expect(pactFactBob.submitAnswer1Hash(0, hash))
                .to.be.reverted
        })

        it("sets answer1Hash, changes pact state to Answer1HashSubmitted, emits SubmitAnswer1Hash", async () => {
            await submitDefAnswer1Hash(true)
        })
    })

    describe('submitAnswer2', () => {
        it("fails if pact state isn't Answer1HashSubmitted", async () => {
            await sealDefPact()
            await expect(pactFactBob.submitAnswer2(0, false))
                .to.be.reverted
        })

        it("fails if msg.sender isn't p2", async () => {
            await submitDefAnswer1Hash(true)
            await expect(pactFactAlice.submitAnswer2(0, false))
                .to.be.reverted
        })

        it("sets answer2 and answer2Timestamp, changes pact state to Answer2Submitted, emits SubmitAnswer2", async () => {
            await submitDefAnswer2(true, false)
        })
    })

    describe('timeoutPact', () => {
        it("fails if pact state isn't Answer2Submitted", async () => {
            await submitDefAnswer1Hash(true)
            await expect(pactFactBob.timeoutPact(0))
                .to.be.reverted
        })

        it("fails if timeout block hasn't been reached", async () => {
            await submitDefAnswer2(true, false)
            await expect(pactFactBob.timeoutPact(0))
                .to.be.reverted
        })

        it("changes pact state to TimedOut, increases p2 account balance by p1Dep + p2Dep, emits TimeoutPact", async () => {
            await submitDefAnswer2(false, true)
            await setupTimeout()

            const bobBalanceBefore = await pactFactBob.accountBalances(await bob.getAddress())

            await expect(pactFactBob.timeoutPact(0))
                .to.emit(pactFactBob, "TimeoutPact")
                .withArgs(
                    0,
                    5
                )
            
            const pact = await pactFactAlice.pacts(0)
            const bobBalanceAfter = await pactFactBob.accountBalances(await bob.getAddress())
            assert.equal(pact.state, 5, 'state')
            assert.equal(Number(bobBalanceAfter), Number(bobBalanceBefore.add(DEF_P1_DEP).add(DEF_P2_DEP)), 'bob balance')
        })
    })

    describe('submitAnswer1', () => {
        it("fails if pact state isn't Answer2Submitted", async () => {
            await submitDefAnswer1Hash(false)
            await expect(pactFactAlice.submitAnswer1(0, false, P1_SALT))
                .to.be.reverted
        })

        it("fails if msg.sender isn't p1", async () => {
            await submitDefAnswer2(false, true)
            await expect(pactFactBob.submitAnswer1(0, false, P1_SALT))
                .to.be.reverted
        })

        it("fails if timed out", async () => {
            await submitDefAnswer2(false, true)
            await setupTimeout()
            await expect(pactFactAlice.submitAnswer1(0, false, P1_SALT))
                .to.be.reverted
        })

        it("if answer is invalid, emits InvalidAnswer, does not change state or account balances", async () => {
            await submitDefAnswer2(false, true)

            const aliceBalanceBefore = await pactFactAlice.accountBalances(await alice.getAddress())
            const bobBalanceBefore = await pactFactAlice.accountBalances(await bob.getAddress())
            
            const pepper: ethersTypes.utils.BytesLike = ethers.utils.formatBytes32String('anniversary')
            await expect(pactFactAlice.submitAnswer1(0, false, pepper))
                .to.emit(pactFactAlice, "InvalidAnswer")

            const pact = await pactFactAlice.pacts(0)
            const aliceBalanceAfter = await pactFactAlice.accountBalances(await alice.getAddress())
            const bobBalanceAfter = await pactFactAlice.accountBalances(await bob.getAddress())
            assert.equal(pact.state, 4, 'state')
            assert.equal(Number(aliceBalanceBefore), Number(aliceBalanceAfter), 'alice balance')
            assert.equal(Number(bobBalanceBefore), Number(bobBalanceAfter), 'bob balance')
        })

        it("if answer is valid, sets answer1 and answer1Salt, changes pact state to Resolved, emits ResolveValidPact, resolves TT properly", async () => {
            await submitDefAnswer1(true, true, 0)
        })

        it("if answer is valid, '', resolves TF properly", async () => {
            await submitDefAnswer1(true, false, 1)
        })

        it("if answer is valid, '', resolves FT properly", async () => {
            await submitDefAnswer1(false, true, 2)
        })

        it("if answer is valid, '', resolves FF properly", async () => {
            await submitDefAnswer1(false, false, 3)
        })
    })

    describe('hashAnswer', () => {
        it("returns same value for same salt & answer", async () => {
            const hash1 = await pactFactAlice.hashAnswer(true, P1_SALT)
            const hash2 = await pactFactAlice.hashAnswer(true, P1_SALT)
            assert.equal(hash1, hash2, 'hashes')
        })

        it("returns different values for different salts, same answer", async () => {
            const hash1 = await pactFactAlice.hashAnswer(true, P1_SALT)
            const pepper: ethersTypes.utils.BytesLike = ethers.utils.formatBytes32String('christmas')
            const hash2 = await pactFactAlice.hashAnswer(true, pepper)
            assert.notEqual(hash1, hash2, 'hashes')
        })

        it("returns different values for same salt, different answers", async () => {
            const hash1 = await pactFactAlice.hashAnswer(true, P1_SALT)
            const hash2 = await pactFactAlice.hashAnswer(false, P1_SALT)
            assert.notEqual(hash1, hash2, 'hashes')
        })
    })

    describe('validateMatrix', () => {
        it("returns for valid matrix", async () => {
            const validity = await pactFactAlice.validateMatrix(
                DEF_P1_DEP,
                DEF_P2_DEP,
                defMatrix[0],
                defMatrix[1],
                defMatrix[2],
                defMatrix[3]
            )
            assert.equal(validity, true, 'valid matrix')
        })

        it("throws for invalid matrix", async () => {
            defMatrix[0].p1 = defMatrix[0].p1.add(100)
            await expect(pactFactAlice.validateMatrix(
                DEF_P1_DEP,
                DEF_P2_DEP,
                defMatrix[0],
                defMatrix[1],
                defMatrix[2],
                defMatrix[3]
            )).to.be.reverted
        })
    })
 
    describe('withdraw', () => {
        it("fails if balance is 0", async () => {
            const aliceBalance = await pactFactAlice.accountBalances(await alice.getAddress())
            assert.equal(Number(aliceBalance), 0, "alice balance")
            await expect(pactFactAlice.withdraw(await alice.getAddress()))
                .to.be.reverted
        })

        it("changes account balance to 0, emits WithdrawEther", async () => {
            await submitDefAnswer1(true, true, 0)
            
            await expect(pactFactAlice.withdraw(await alice.getAddress()))
                .to.emit(pactFactAlice, "WithdrawEther")
                .withArgs(
                    await alice.getAddress(),
                    defMatrix[0].p1
                )

            const aliceBalance = Number(ethers.utils.formatEther(
                await pactFactAlice.accountBalances(await alice.getAddress())
            ))
            assert.equal(aliceBalance, 0, 'alice balance')
        })

        it("transfers balance to account", async () => {
            await submitDefAnswer1(true, true, 0)

            const aliceEtherBefore = Number(ethers.utils.formatEther(
                await ethers.provider.getBalance(await alice.getAddress())
            ))
            const aliceBalanceBefore = Number(ethers.utils.formatEther(
                await pactFactAlice.accountBalances(await alice.getAddress())
            ))

            const tx = await pactFactAlice.withdraw(await alice.getAddress())
            const res = await tx.wait()
            if (!tx.gasPrice) { throw new Error("no gas price") }
            const etherOnGas = Number(ethers.utils.formatEther(tx.gasPrice.mul(res.gasUsed)))
            const aliceEtherAfter = Number(ethers.utils.formatEther(
                await ethers.provider.getBalance(await alice.getAddress())
            ))
            assert.equal(
                aliceEtherAfter,
                Number((aliceEtherBefore - etherOnGas + aliceBalanceBefore).toFixed(9)),
                'ether transfer' 
            )
        })
    })

    describe('receive', () => {
        it("emits ReceiveEther", async () => {
            const value = ethers.utils.parseEther('1')
            await expect(
                alice.sendTransaction({ 
                    to: pactFactAlice.address,
                    value
                })
            )
                .to.emit(pactFactAlice, "ReceiveEther")
                .withArgs(
                    await alice.getAddress(),
                    value
                )
        })
    })
})