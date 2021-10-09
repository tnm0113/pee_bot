import { ethers } from "ethers";
import { toBech32, HarmonyAddress, fromBech32 } from "@harmony-js/crypto";
import config from "config";
import { logger } from "./logger.js";
import { getAllUser } from "./db.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const tokens = require("./tokens.json");
import { MULTI_SEND_CONTRACT_ADDRESS } from "./const.js";
import { multisend_abi } from "./multisend_abi.js";
import { hexValue } from "@ethersproject/bytes";
import { erc20 } from "./erc20_abi.js";

const botConfig = config.get("bot");
// const botWalletSeed = botConfig.wallet_seed;
const botwalletAddress = "";
const defaultGasForNewUser = botConfig.gas_for_new || 0.00025 * 10;

const blockChainUrl = botConfig.mainnet ? "https://api.s0.t.hmny.io/" : "https://api.s0.b.hmny.io/";
const provider = new ethers.providers.JsonRpcProvider(blockChainUrl);

const harmonyWalletPath = "m/44'/1023'/0'/0/0";

const mapWallets = new Map();

const mapAccountNonce = new Map();

const multiSendContract = new ethers.Contract(MULTI_SEND_CONTRACT_ADDRESS, multisend_abi, provider);
let pee_token = null;

const mapContractAddress = new Map();
tokens.tokens.forEach((token) => {
  console.log('add contract for token ' + token.contract_address);
  if (token.contract_address != ''){
    const contract = new ethers.Contract(token.contract_address, erc20.abi, provider);
    mapContractAddress.set(token.contract_address, contract);
  }
  if (token.name.toLowerCase() === 'pee'){
    pee_token = token;
  }
})

async function addAllAccounts(){
  const users = await getAllUser();
  users.forEach(async (user) => {
    const walletMnemonic = ethers.Wallet.fromMnemonic(user.mnemonic, harmonyWalletPath);
    const wallet = walletMnemonic.connect(provider);
    mapWallets.set(user.ethAddress, wallet);
    mapAccountNonce.set(user.ethAddress, 0);
    if (user.username.toLowerCase() === botConfig.name.toLowerCase()){
      botwalletAddress = user.ethAddress;
    }
    // await approveFirstTime(pee_token, user.ethAddress);
  })
  // if (botWalletSeed){
  //   logger.debug("add bot wallet");
  //   const walletMnemonic = ethers.Wallet.fromMnemonic(botWalletSeed, harmonyWalletPath);
  //   const wallet = walletMnemonic.connect(provider);
  //   mapWallets.set(botConfig.wallet_address, wallet);
  // }
}

async function addNewAccount(mnemonic){
  const walletMnemonic = ethers.Wallet.fromMnemonic(mnemonic, harmonyWalletPath);
  const wallet = walletMnemonic.connect(provider);
  const addr = await wallet.getAddress();
  mapWallets.set(addr, wallet);
}


function createAccount() {
  const wallet = ethers.Wallet.createRandom({path: harmonyWalletPath});  
  logger.debug(
      "account create " +
          wallet.address +
          " one address " +
          toBech32(wallet.address)
  );
  return {
      ethAddress: wallet.address,
      oneAddress: toBech32(wallet.address),
      mnemonic: wallet.mnemonic.phrase,
  };
}

async function getAccountBalance(address) {
  try {
    const balance = await provider.getBalance(address); 
    logger.debug("balance get from blockchain " + JSON.stringify(balance));
    const balanceParse = ethers.utils.formatEther(ethers.BigNumber.from(balance));
    logger.info("real balance in ONE " + balanceParse);
    return balanceParse;
  } catch (error) {
    logger.error("get balance error " + error);
  }
}

async function getTokenBalance(contractAddress, userAddress){
  try {
    const contract = mapContractAddress.get(contractAddress);
    const c = contract.connect(provider);
    const balance = await c.balanceOf(userAddress);
    const rs = ethers.utils.formatEther(balance);
    return rs;
  } catch (error) {
    console.log("error ", error);
  }
}

async function sendGasForNewUser(userAddress){
  try {
    const hash = await transferOne(botwalletAddress, userAddress, defaultGasForNewUser);
    return hash;
  } catch (error){
    logger.error('send gas for new user error ' + error);
  }
}

async function transferOne(senderAddress, receiverAddress, amount) {
  try {
    if (HarmonyAddress.isValidBech32(senderAddress)){
      senderAddress = fromBech32(senderAddress);
    }
    if (HarmonyAddress.isValidBech32(receiverAddress)){
      receiverAddress = fromBech32(receiverAddress);
    }
    logger.info("start tranfer to " + receiverAddress + " from address " + senderAddress + " amount " + amount + " ONE");
    const wallet = mapWallets.get(senderAddress);
    const gasPrice = await provider.getGasPrice();
    const gasLimit = ethers.utils.hexlify(hexValue(21000));
    let nonce = 0;
    if (mapAccountNonce.get(senderAddress) === 0){
      nonce = await provider.getTransactionCount(senderAddress, 'latest');
    } else {
      nonce = mapAccountNonce.get(senderAddress) + 1;
    }
    const tx = {
      from: senderAddress,
      to: receiverAddress,
      value: ethers.utils.parseEther(amount.toString()),
      nonce: nonce,
      gasLimit: gasLimit,
      gasPrice: gasPrice,
      nonce: nonce
    };
    mapAccountNonce.set(senderAddress, nonce);
    await wallet.signTransaction(tx);
    const res = await wallet.sendTransaction(tx);
    logger.debug("tranfer success " + JSON.stringify(res));
    return res.hash;
  } catch (error) {
    mapAccountNonce.set(senderAddress, 0);
    logger.error("transfer error " + error);
    return null;
  }
}

async function transferToken(token, _amount, receiverAddress, senderAddress){
  try {
    if (HarmonyAddress.isValidBech32(senderAddress)){
      senderAddress = fromBech32(senderAddress);
    }
    if (HarmonyAddress.isValidBech32(receiverAddress)){
      receiverAddress = fromBech32(receiverAddress);
    }
    const contract = mapContractAddress.get(token.contract_address);
    const decimals = token.decimals;
    const amount = ethers.utils.parseUnits(_amount.toString(), decimals)
    let nonce = 0;
    if (mapAccountNonce.get(senderAddress) === 0){
      nonce = await provider.getTransactionCount(senderAddress, 'latest');
    } else {
      nonce = mapAccountNonce.get(senderAddress) + 1;
    }
    const wallet = mapWallets.get(senderAddress);
    const c = contract.connect(wallet);
    let gasLimit = await c.estimateGas.transfer(receiverAddress, amount);
    let tx = await c.populateTransaction.transfer(receiverAddress, amount);
    const gasPrice = await provider.getGasPrice();
    tx = { ...tx, nonce: nonce, gasLimit: gasLimit, gasPrice: gasPrice};
    mapAccountNonce.set(senderAddress, nonce);
    logger.debug('transfer token tx ' + JSON.stringify(tx));
    await wallet.signTransaction(tx);
    const res = await wallet.sendTransaction(tx);
    logger.debug('send transaction response ' + JSON.stringify(res));
    return res.hash;
  } catch (error){
    mapAccountNonce.set(senderAddress, 0);
    logger.error("tranfer token error " + error);
    return null;
  }
}

async function approveFirstTime(token, senderAddress){
  const decimals = token.decimals;
  const amount = ethers.utils.parseUnits("0", decimals);
  const tokenContract = mapContractAddress.get(token.contract_address);
  const allowance = await tokenContract.allowance(senderAddress, MULTI_SEND_CONTRACT_ADDRESS);
  if (amount.eq(allowance)){
    const resApprove = await approveMultiSend(senderAddress, token);
    if (!resApprove){
      logger.error('approve error');
      return;
    }
  }
}

async function multiSend(token, _amount, senderAddress, receivers){
  try {
    const decimals = token.decimals;
    const amount = ethers.utils.parseUnits(_amount.toString(), decimals);
    const wallet = mapWallets.get(senderAddress);
    const c = multiSendContract.connect(wallet);
    const tokenContract = mapContractAddress.get(token.contract_address);
    const allowance = await tokenContract.allowance(senderAddress, MULTI_SEND_CONTRACT_ADDRESS);
    if (!amount.lt(allowance)){
      const resApprove = await approveMultiSend(senderAddress, token);
      if (!resApprove){
        logger.error('approve error');
        return;
      }
    }
    let gasLimit = await c.estimateGas.sendmultiple(token.contract_address, receivers, amount);
    let tx = await c.populateTransaction.sendmultiple(token.contract_address, receivers, amount);
    const gasPrice = await provider.getGasPrice();
    let nonce = 0;
    if (mapAccountNonce.get(senderAddress) === 0){
      nonce = await provider.getTransactionCount(senderAddress, 'latest');
    } else {
      nonce = mapAccountNonce.get(senderAddress) + 1;
    }
    tx = { ...tx, nonce: nonce, gasLimit: gasLimit, gasPrice: gasPrice};
    logger.debug('send multiple tx ' + JSON.stringify(tx));
    mapAccountNonce.set(senderAddress, nonce);
    await wallet.signTransaction(tx);
    const res = await wallet.sendTransaction(tx);
    logger.debug('send multiple transaction response ' + JSON.stringify(res));
    return res.hash;
  } catch (error){
    mapAccountNonce.set(senderAddress, 0);
    logger.error("send multiple error " + error);
    return null;
  }
}

async function approveMultiSend(ownerAddress, token){
  try {
    const contract = mapContractAddress.get(token.contract_address);
    const wallet = mapWallets.get(ownerAddress);
    const maxAmountApprove = ethers.BigNumber.from("115792089237316195423570985008687907853269984665640564039457584007913129639935");
    const c = contract.connect(wallet);
    let gasLimit = await c.estimateGas.approve(MULTI_SEND_CONTRACT_ADDRESS, maxAmountApprove);
    let tx = await c.populateTransaction.approve(MULTI_SEND_CONTRACT_ADDRESS, maxAmountApprove);
    const gasPrice = await provider.getGasPrice();
    let nonce = 0;
    if (mapAccountNonce.get(ownerAddress) === 0){
      nonce = await provider.getTransactionCount(ownerAddress, 'latest');
    } else {
      nonce = mapAccountNonce.get(ownerAddress) + 1;
    }
    tx = { ...tx, nonce: nonce, gasLimit: gasLimit, gasPrice: gasPrice};
    logger.debug('approve tx ' + JSON.stringify(tx));
    mapAccountNonce.set(ownerAddress, nonce);
    await wallet.signTransaction(tx);
    const res = await wallet.sendTransaction(tx);
    logger.debug('approve token transaction response ' + JSON.stringify(res));
    return res.hash;
  } catch (error){
    mapAccountNonce.set(ownerAddress, 0);
    logger.error("approve token error " + error);
    return null;
  }
}

export { 
  transferOne, 
  getAccountBalance, 
  createAccount, 
  addAllAccounts, 
  transferToken, 
  getTokenBalance, 
  addNewAccount, 
  multiSend, 
  approveFirstTime,
  sendGasForNewUser 
};