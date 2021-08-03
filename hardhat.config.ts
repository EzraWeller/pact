/**
 * @type import('hardhat/config').HardhatUserConfig
 */

import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

module.exports = {
  solidity: "0.8.5",
  networks: {
    local: {
      url: "http://127.0.0.1:8545"
    }
  }
};
