# PACT
## What
A protocol for creating "pacts": two-party staking agreements used to make collaboration safer and to help people discover trustworthy collaborators. 

Pacts are configurable prisoner's dilemmas in which:
1. Two parties each deposit some ETH.
2. Each party attests to whether the pact has been fulfilled (using commit-reveal for fairness).
3. Each party gets a payout depending on the attestations.

A typical pact resembles the classic prisoner's dilemma:
| | P1 "yes" | P1 "no" |
|---|---|---|
| P2 "yes" | 100% P1 deposit, 100% P2 deposit| 100% P1 deposit + 50% P2 deposit, 0 (rest burned)|
| P2 "no" | 0, 50% P1 deposit + 100% P2 deposit (rest burned) | 50% P1 deposit, 50% P2 deposit (rest burned) |

Like in prisoner's dilemma, "no" is the dominant strategy for both parties if they are uncoordinated / don't trust each other. If they do trust each other, as two parties in a functional partnership ought to, then "yes-yes" is optimal.

Since this is Ethereum, all pact records are public, and a given entity's pact record can grant insight into the quality of their work and behavior in the past.

## Why
Two main use cases:
### 1. Safer pseudonymous collaborations
DAOs and other crypto-entities often enter economic agreements with other crypto-entities they know very little about: DAO grant programs are an example. These entities don't want to bring traditional contracts into the picture, so today they either 1) narrow their list of potential partners to people they already trust, or 2) accept the risk of the other party taking the money and running. 

Pacts provide a flexible way to ensure both sides of a two-party commitment have something to lose by acting in bad faith, which enables crypto-entities to partner more safely with pseudomyous collaborators.

### 2. Decentralized reputation
Entities using pacts will leave a record that can inform future partners about their work and behavior. Once a significant graph of completed pacts, each with metadata associating with a particular kind of work or activity, entities can analyze this data to discover or evaluate potential collaborators. Basically, imagine a decentralized, Yelp where the restaurant reviews you, too. 

This use case turns pacts into more of an [iterated prisoner's dilemma](https://en.wikipedia.org/wiki/Prisoner%27s_dilemma#The_iterated_prisoner's_dilemma), in which entities have a reason not to constantly grief their partners: they'll lose out on future opportunities. Note that an entity with a "ruined" reputation can start over from 0 by making a new pseudonym.

## How
This repo includes prototype smart contracts for creating and resolving ETH-staking pacts, which is all that's needed for the first use case (safer collaborations). These contracts are untested, unaudited, and undeployed: rough drafts only!

For this data to become useful for decentralized reputation and discovery, something like a subgraph should be added to make historical data usable. Since entities can easily "wash trade" pacts, algorithms like [TrustRank](https://en.wikipedia.org/wiki/TrustRank) or [EigenTrust](https://en.wikipedia.org/wiki/EigenTrust) would probably be the primary ways for a an entity to evaluate how much they should trust a given partner based on their pact history.

## Dev
1. `yarn`
2. `yarn test`
