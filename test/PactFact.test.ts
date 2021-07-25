import { ethers } from 'hardhat'
import { ethers as ethersTypes } from 'ethers'
import { assert, expect } from 'chai'
import { PactFact, PactFactInterface } from '../typechain/PactFact'
import { PactFact__factory } from '../typechain/factories/PactFact__factory'

describe('PactFact', () => {
    let alice: ethersTypes.Signer
    let bob: ethersTypes.Signer
    let pactFact: PactFact

    const DEF_P1_DEP = ethers.utils.parseEther('1')
    const DEF_P2_DEP = ethers.utils.parseEther('1')
    const P1_SALT: ethersTypes.utils.BytesLike = ethers.utils.formatBytes32String('birthday')

    interface Payout {
        p1: ethersTypes.BigNumber,
        p2: ethersTypes.BigNumber,
        burn: ethersTypes.BigNumber
    }

    function defPayoutMatrix(
        p1Deposit: ethersTypes.BigNumber, 
        p2Deposit: ethersTypes.BigNumber   
    ): [Payout, Payout, Payout, Payout] {
        const payoutYY: Payout = {
            p1: p1Deposit,
            p2: p2Deposit,
            burn: ethers.BigNumber.from(0)
        }
        const payoutYN: Payout = {
            p1: ethers.BigNumber.from(0),
            p2: p1Deposit.div(2).add(p2Deposit),
            burn: p1Deposit.div(2)
        }
        const payoutNY: Payout = {
            p1: p2Deposit.div(2).add(p1Deposit),
            p2: ethers.BigNumber.from(0),
            burn: p2Deposit.div(2)
        }
        const payoutNN: Payout = {
            p1: p1Deposit.div(2),
            p2: p2Deposit.div(2),
            burn: p1Deposit.div(2).add(p2Deposit.div(2))
        }
        return [payoutYY, payoutYN, payoutNY, payoutNN]
    }

    it('runs a successful pact', async () => {
        const signers = await ethers.getSigners()
        alice = signers[0]
        bob = signers[1]

        const PactFactFactory = new PactFact__factory(alice)
        pactFact = await PactFactFactory.deploy(1)

        const pactFactAlice = pactFact.connect(alice)
        const pactFactBob = pactFact.connect(bob)

        let aliceBalance = await pactFact.accountBalances(await alice.getAddress())
        let bobBalance = await pactFact.accountBalances(await bob.getAddress())
        console.log(
            'alice and bob balances before:', 
            ethers.utils.formatEther(aliceBalance), 
            ethers.utils.formatEther(bobBalance)
        )

        const defMatrix = defPayoutMatrix(DEF_P1_DEP, DEF_P2_DEP)
        await pactFact.validateMatrix(
            DEF_P1_DEP, 
            DEF_P2_DEP, 
            defMatrix[0],
            defMatrix[1],
            defMatrix[2],
            defMatrix[3],
        )
        expect(await pactFactAlice.proposePact(
            await bob.getAddress(),
            DEF_P1_DEP,
            DEF_P2_DEP,
            defMatrix[0],
            defMatrix[1],
            defMatrix[2],
            defMatrix[3],
            "prisoner,dilemma,tags",
            { value: DEF_P1_DEP }
        ))

        expect(await pactFactBob.sealPact(0, { value: DEF_P2_DEP }))

        const answer1Hash = await pactFact.hashAnswer(false, P1_SALT)
        expect(await pactFactAlice.submitAnswer1Hash(0, answer1Hash))

        expect(await pactFactBob.submitAnswer2(0, true))

        expect(await pactFactAlice.submitAnswer1(0, false, P1_SALT))

        aliceBalance = await pactFact.accountBalances(await alice.getAddress())
        bobBalance = await pactFact.accountBalances(await bob.getAddress())
        console.log(
            'alice and bob balances after:', 
            ethers.utils.formatEther(aliceBalance), 
            ethers.utils.formatEther(bobBalance)
        )
    })
})