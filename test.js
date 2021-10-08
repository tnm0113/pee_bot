import { Account, Wallet } from "@harmony-js/account";
import { Messenger, HttpProvider } from "@harmony-js/network";
import { ChainID, ChainType, hexToNumber, Unit } from "@harmony-js/utils";
import { TransactionFactory } from "@harmony-js/transaction";
import { Harmony } from "@harmony-js/core";
// console.log("mnemonic ", Wallet.generateMnemonic());
// const mn1 = Wallet.generateMnemonic();

//=======REGEX amount==========
// amount() {
//   if (!RegExp(`^[0-9]*[.]?[0-9]{0,${Math.min(8, this.selectedToken.decimals)}}$`, "g").test(this.amount))
//     this.amount = this.amount.slice(0, this.amount.length - 1);
// },

const hmy = new Harmony("https://api.s0.t.hmny.io/", {
  chainType: ChainType.Harmony,
  chainId: ChainID.HmyMainnet,
});

// const hmy = new Harmony("https://api.s0.b.hmny.io/", {
//   chainType: ChainType.Harmony,
//   chainId: ChainID.HmyTestnet,
// });
// const mn1 =
//   "north fossil sun grant notable lyrics duck crystal inflict arrive picnic milk";
// console.log("mnemonic ", mn1);
// const wallet = new Wallet(hmy);
// let acc1 = wallet.addByMnemonic(mn1);
// console.log("account addr ", acc1.address);
// console.log("account bech32 addr ", acc1.bech32Address);
// acc1.getBalance().then((v) => {
//   console.log("account balance ", v);
//   console.log(v.balance);
// });

// const mn2 = Wallet.generateMnemonic();
// const mn2 =
//   "loud term gossip basket loop merry brass under glare wolf gun useless";
// console.log("mnemonic ", mn2);
// let acc2 = wallet.addByMnemonic(mn2);
// // console.log("account create " + JSON.stringify(acc2));
// console.log("account addr ", acc2.address);
// console.log("account bech32 addr ", acc2.bech32Address);
// console.log("account balance ", acc2.balance);
// const acc = new Account(
//   "45e497bd45a9049bcb649016594489ac67b9f052a6cdf5cb74ee2427a60bf25e",
//   new Messenger(
//     new HttpProvider("https://api.s0.b.hmny.io"),
//     ChainType.Harmony,
//     ChainID.HmyTestnet
//   )
// );

// console.log(acc.bech32Address);

// const factory = new TransactionFactory(hmy);
// hmy.wallet.addByMnemonic(mn2);

// const txn = hmy.transactions.newTx({
//   // to: "one14nt2lnn0jssxxpvmelmpxrvuktamr3ahhud8j4",
//   to: "one1j4792efsaqm8xf04erfwzcucxz3z5dq7yx90wf",
//   value: new Unit(1).asOne().toWei(),
//   // gas limit, you can use string
//   gasLimit: "21000",
//   // send token from shardID
//   shardID: 0,
//   // send token to toShardID
//   toShardID: 0,
//   // gas Price, you can use Unit class, and use Gwei, then remember to use toWei(), which will be transformed to BN
//   gasPrice: new Unit("1").asGwei().toWei(),
// });

// hmy.wallet.signTransaction(txn).then((signedTxn) => {
//   signedTxn.sendTransaction().then(([tx, hash]) => {
//     console.log("tx hash: " + hash);
//     signedTxn.confirm(hash).then((response) => {
//       console.log(response.receipt);
//     });
//   });
// });


//oswap contract address testnet: 0x759c7F96fD1F98Ab28b6f09b3282f0cC62c9A3Cc

import {abi} from "./artifacts.js";
import BN from "bn.js";
import BigNumber from "bignumber.js";
import { multisend_abi } from "./multisend_abi.js";
// console.log("abi ", abi);
const contractAddress = "0x087e1B11777e8612142334BE986aDb6F64aF71B5";
const contract = hmy.contracts.createContract(abi.abi, contractAddress);

const oSwap_contractAddress = "0x51a742c6a171cd3f945bcbddb2d2292b239aaa69";
const oSwap_contract = hmy.contracts.createContract(abi.abi, oSwap_contractAddress);

// const multiSendContractAddress = "0x659f3DF38537B7826e51479FE8D1C5Bd5f8bEED7";
// const multiSendContract = hmy.contracts.createContract(multisend_abi, multiSendContractAddress);

const multiSendContractAddress = "0xa2f22f67f5E5d02523B564562E4B2D69b698D2bd";
const multiSendContract = hmy.contracts.createContract(multisend_abi, multiSendContractAddress);

const pee_contractAddress = "0x087e1b11777e8612142334be986adb6f64af71b5";
// const pee_contractAddress = "0xea589e93ff18b1a1f1e9bac7ef3e86ab62addc79";
const pee_contract = hmy.contracts.createContract(abi.abi, pee_contractAddress);

async function approve(account, fromHex){
  // const gasLimit = "250000";
  const gasPrice = 1;
  // const hexDecimals = await oSwap_contract.methods.decimals().call();
  // const decimals = new BN(hexDecimals, 16).toNumber();
  const hexDecimals = await pee_contract.methods.decimals().call();
  const decimals = new BN(hexDecimals, 16).toNumber();
  const amount = new BN(new BigNumber(0.001).multipliedBy(Math.pow(10, decimals)).toFixed(), 10);

  const options1 = { gasPrice: '0x3B9ACA00' };
  const gas = await pee_contract.methods.approve("0xa2f22f67f5E5d02523B564562E4B2D69b698D2bd", amount).estimateGas(options1);
  const gasLimit = hexToNumber(gas);
  console.log('gas limit ' + gasLimit);
  const txn = await pee_contract.methods.approve("0xa2f22f67f5E5d02523B564562E4B2D69b698D2bd", amount).createTransaction();
  txn.setParams({
    ...txn.txParams,
    from: fromHex,
    gasLimit,
    gasPrice: new hmy.utils.Unit(1).asGwei().toWei(),
  });
  // console.log('txn ', txn);
  const signedTxn = await account.signTransaction(txn);
  const res = await sendTransaction(signedTxn);
  console.log(res);
  return res;
}

async function multiSend(account, fromHex){
  // const gasLimit = "80000";
  const gasPrice = 1;
  const token = '0x087e1b11777e8612142334be986adb6f64af71b5';
  const _receivers = ['0xec39fcdcd99e17071c6d0be793b300a7c41cc934', '0x13156cf8c1d6426285e50851008a8ada2024860e'];
  // const hexDecimals = await pee_contract.methods.decimals().call();
  // const decimals = new BN(hexDecimals, 16).toNumber();
  const amount = new BN(new BigNumber(1).multipliedBy(Math.pow(10, 18)).toFixed(), 10);
  // const options1 = { gasPrice: '0x3B9ACA00' };
  multiSendContract.wallet.addByPrivateKey("");
  // console.log(multiSendContract.wallet);
  // const gasLimit = await multiSendContract.methods.sendmultiple(token, _receivers, amount).estimateGas(options1);
  const options1 = { gasPrice: '0x3B9ACA00' };
  multiSendContract.methods.sendmultiple(token, _receivers, amount).estimateGas(options1).then((gas) => {
    console.log(gas);
  });
  // const gasLimit = hexToNumber(gas);
  // console.log('gas limit estimate for this ' + gasLimit);
  // const txn = await multiSendContract.methods.sendmultiple(token, _receivers, amount).createTransaction();
  // // console.log('txn ', txn);
  // txn.setParams({
  //   ...txn.txParams,
  //   from: fromHex,
  //   gasLimit,
  //   gasPrice: new hmy.utils.Unit(1).asGwei().toWei(),
  // });
  // const signedTxn = await account.signTransaction(txn);
  // const res = await sendTransaction(signedTxn);
  // console.log(res);
  // return res;
}

async function balance(){
  let balance = await contract.methods.balanceOf("0xeE87fd68e7e878f9a858Dcc1010f2179E198886b").call();
  return balance;
}

// try {
//   const weiBalance = await balance();
//   const hexDecimals = await contract.methods.decimals().call();
//   const decimals = new BN(hexDecimals, 16).toNumber();

//   let bl = BigNumber(weiBalance)
//                 .dividedBy(Math.pow(10, decimals))
//                 .toFixed();
//   console.log(bl);
// } catch (error) {
//   console.log("error ", error);
// }

export async function sendTransaction(signedTxn) {
  try {
    signedTxn
      .observed()
      .on("transactionHash", (txnHash) => {
        console.log('txnHash ', txnHash);
      })
      .on("confirmation", (confirmation) => {
        console.log('confirm ', confirmation);
        if (confirmation !== "CONFIRMED")
          throw new Error(
            "Transaction confirm failed. Network fee is not enough or something went wrong."
          );
      })
      .on("error", (error) => {
        throw new Error(error);
      });

    const [sentTxn, txnHash] = await signedTxn.sendTransaction();
    const confirmedTxn = await sentTxn.confirm(txnHash);

    var explorerLink;
    if (confirmedTxn.isConfirmed()) {
      explorerLink = "/tx/" + txnHash;
    } else {
      return {
        result: false,
        mesg: "Can not confirm transaction " + txnHash,
      };
    }

    return {
      result: true,
      mesg: explorerLink,
    };
  } catch (err) {
    return {
      result: false,
      mesg: err,
    };
  }
}

async function send(amount, toHex, fromHex, pKey){
  try {
    const hexDecimals = await contract.methods.decimals().call();
    const decimals = new BN(hexDecimals, 16).toNumber();
    const weiAmount = new BN(new BigNumber(amount).multipliedBy(Math.pow(10, decimals)).toFixed(), 10);
    const gasLimit = "250000";
    const gasPrice = 1;
    const txn = await contract.methods.transfer(toHex, weiAmount).createTransaction();
    txn.setParams({
      ...txn.txParams,
      from: fromHex,
      gasLimit,
      gasPrice: new hmy.utils.Unit(gasPrice).asGwei().toWei(),
    });
    const account = hmy.wallet.addByPrivateKey(pKey);
    const signedTxn = await account.signTransaction(txn);
    const res = await sendTransaction(signedTxn);
    return res;
  } catch (error){
    return {
      result: false,
      mesg: err,
    };
  }
}

// try {
//   const toHex = "0x0180Bd56393851a46fab05Ae627FB574DaDB5049";
//   const fromHex = "0xeE87fd68e7e878f9a858Dcc1010f2179E198886b";
//   const pKey = "";
//   const res = await send(100, toHex, fromHex, pKey);
//   console.log("res ", res);
// } catch (error) {
//   console.log("send error ", error);
// }

try {
  const fromHex = "0xec39fcdcd99e17071c6d0be793b300a7c41cc934";
  const pKey = "";
  const account = hmy.wallet.addByMnemonic("");
  account.getBalance().then(b => console.log(b));
  console.log('private key ' + account.privateKey);;
  // const approveRes = await approve(account, fromHex);
  // console.log('approveRes ', approveRes);
  const res = await multiSend(account, fromHex);
  // console.log("res ", res);
} catch (error) {
  console.log("send error ", error);
}

// import { ContractFactory } from '@harmony-js/contract';
 
// const wallet = new Wallet(
//   new Messenger(
//     new HttpProvider('https://api.s0.b.hmny.io'),
//     ChainType.Harmony,
//     ChainID.HmyTestnet,
//   ),
// );
// const factory = new ContractFactory(wallet);
 
// // const contractJson = require("./Counter.json");
// const test_contract = factory.createContract(multisend_abi, "0x659f3DF38537B7826e51479FE8D1C5Bd5f8bEED7");
 
// const options1 = { gasPrice: '0x3B9ACA00' }; // gas price in hex corresponds to 1 Gwei or 1000000000
// let options2 = { gasPrice: 1000000000, gasLimit: 21000 }; // setting the default gas limit, but changing later based on estimate gas
 
// // const options3 = { data: contractJson.bytecode }; // contractConstructor needs contract bytecode to deploy
 
// test_contract.wallet.addByPrivateKey('');


// const token = '0x51a742c6a171cd3f945bcbddb2d2292b239aaa69';
// const _receivers = ['0x7a5f02c7bd5477cab3fff0cf959f32ef4349eafa'];
// // const decimals = new BN(hexDecimals, 16).toNumber();
// const amount = new BN(new BigNumber(0.11).multipliedBy(Math.pow(10, 16)).toFixed(), 10);
// // const hexDecimals = await oSwap_contract.methods.decimals().call();
// console.log(test_contract);
// test_contract.methods.sendmultiple(token, _receivers, amount).estimateGas(options1).then(gas => {
//   console.log(gas);
//   // options2 = {...options2, gasLimit: hexToNumber(gas)};
//   // contract.methods.contractConstructor(options3).send(options2).then(response => {
//   //   console.log('contract deployed at ' + response.transaction.receipt.contractAddress);
//   // });
// });