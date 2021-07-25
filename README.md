# PACT
## What
Smart contracts for creating "pacts": two-party ETH-staking agreements. Pacts are configurable prisoner's dilemmas in which:
1. Two parties each deposit some ETH.
2. Each party attests to whether the pact has been fulfilled (using commit-reveal for fairness).
3. Each party gets a payout depending on the attestations.

A typical pact looks like the classic prisoner's dilemma:
| | P1 "yes" | P1 "no" |
| P2 "yes" | | |
| P2 "no" | | |

## Why
Two main use cases:
### 1. Greater assurance of pseudonymous commitments
DAOs and other crypto-entities often economic relationships with other crypto-entities they know very little about: DAO grant programs are an example. These entities don't want to bring traditional contracts into the picture, so today they just except the risk of the other party taking the money and running. Pacts provide a flexible way to ensure both sides of a two-party commitment have something to lose by acting in bad faith


## How

## Dev
1. `yarn`
2. `yarn test`