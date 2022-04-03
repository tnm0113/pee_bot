import { createUser, findUser } from "./db.js";
import {
    createAccount,
} from "./ethers.js";
import fs from 'fs';

fs.readFile('./Cleaneduserlistfinal.txt', 'utf-8', async (err, data) => {
    if (err){
        return;
    }

    // console.log(data);
    let usernames = data.split('\r\n');
    let addresses = [];
    let ethAddresses = [];
    for (const name of usernames){
        let username = name.toLowerCase();
        const u = await findUser(username);
        if (u) {
            addresses.push(u.oneAddress);
            ethAddresses.push(u.ethAddress);
        } else {
            const blockchainInfo = createAccount();
            addresses.push(blockchainInfo.oneAddress);
            ethAddresses.push(blockchainInfo.ethAddress);
            await createUser(username, blockchainInfo.ethAddress, blockchainInfo.oneAddress, blockchainInfo.mnemonic);
        }
    }

    let writeAddress = fs.createWriteStream('./one_addresses.txt', {flags: 'a'});
    addresses.forEach((addr) => {
        writeAddress.write(addr);
        writeAddress.write('\n');
    })

    let writeEthAddress = fs.createWriteStream('./eth_addresses.txt', {flags: 'a'});
    ethAddresses.forEach((addr) => {
        writeEthAddress.write(addr);
        writeEthAddress.write('\n');
    })
})