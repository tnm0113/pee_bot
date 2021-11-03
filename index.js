import { InboxStream, CommentStream } from "snoostorm";
import Snoowrap from "snoowrap";
import { createUser, findUser, saveLog, checkExistedInLog, updateUserLevel, getLastTimeSprinker } from "./db.js";
import { logger } from "./logger.js";
import { COMMANDS, MAP_USER_LEVEL } from "./const.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const tokens = require("./tokens.json");
import config from "config";
import {
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
} from "./ethers.js";
import * as TEXT from "./text_pee.js";

const regexSend = /send\s(.*)/g;
const regexWithdraw = /withdraw\s(.*)/g;
const regexUser = /\/?u\/(.)*/g;
const regexNumber = /^[0-9]*[.]?[0-9]{0,18}/g
const snoowrapConfig = config.get("snoowrap");
const crawBotConfig = config.get("crawbot");
const botConfig = config.get("bot");
const tokenCommands = tokens.tokens.map((token) => {
    return token.tip_command;
})
const mods = [];
const replyQueue = [];

function getTokenWithCommand(tokenCommand){
    return tokens.tokens.filter((token) => token.tip_command.toLowerCase() === tokenCommand.toLowerCase());
}

function getTokenWithName(tokenName){
    return tokens.tokens.filter((token) => token.name.toLowerCase() === tokenName.toLowerCase());
}
const itemExpireTime = botConfig.item_expire_time || 60;
const inbox_poll_time = botConfig.inbox_poll_time || 10000;
const comment_poll_time = botConfig.comment_poll_time || 5000;
const botWalletAddress = botConfig.wallet_address;
const defaultGasForNewUser = botConfig.gas_for_new || 0.00025 * 10;
let lastTimeBotReply = Date.now();

const explorerLink = botConfig.mainnet ? "https://explorer.harmony.one/#/tx/" : "https://explorer.testnet.harmony.one/#/tx/";

const client = new Snoowrap(snoowrapConfig);
client.config({
    requestDelay: botConfig.request_delay || 0,
    // continueAfterRatelimitError: true,
    maxRetryAttempts: 5,
    debug: botConfig.snoowrap_debug,
    logger: logger,
});

const crawbot = new Snoowrap(crawBotConfig);
crawbot.config({
    requestDelay: botConfig.request_delay || 0,
    // continueAfterRatelimitError: true,
    maxRetryAttempts: 5,
    debug: botConfig.snoowrap_debug,
    logger: logger,
});

async function sendMessage(to, subject, text) {
    try {
        logger.debug("send message " + subject +  " to " + to);
        await client.composeMessage({ to: to, subject: subject, text: text });
    } catch (error) {
        logger.error("send message error " + error);
    }
}

async function tip(fromUser, toUserName, amount, token) {
    logger.info(
        "process tip request from " +
            fromUser.username +
            " to " +
            toUserName +
            " amount " +
            amount + " " +
            token.name
    );
    try {
        const toUser = await findOrCreate(toUserName);
        const addressTo = toUser.ethAddress;
        const fromUserAddress = fromUser.ethAddress;
        if (token.name.toLowerCase() === "one"){
            const hash = await transferOne(fromUserAddress, addressTo, amount);
            return hash;
        } else {
            const hash = await transferToken(token, amount, toUser.ethAddress, fromUserAddress);
            return hash;
        }
    } catch (error) {
        logger.error("catch error " + JSON.stringify(error) + error);
        return null;
    }
}

async function getBalance(username) {
    try {
        const user = await findUser(username);
        if (user) {
            let b = "";
            for (const token of tokens.tokens){
                b += await getBalanceOf(token, user);
            }
            return {
                oneAddress: user.oneAddress,
                ethAddress: user.ethAddress,
                balance: b,
                level: user.level
            };
        } else {
            return null;
        }
    } catch (error) {
        logger.error("get balance error " + JSON.stringify(error) + error);
    }
}

async function getBalanceOf(token, user){
    if (token.name === "ONE"){
        const balanceOne = await getAccountBalance(user.ethAddress);    
        return `ONE | ${balanceOne} \n`;
    } else {
        const balanceToken = await getTokenBalance(token.contract_address, user.ethAddress);
        return `${token.name} | ${balanceToken} \n`;
    }
}

async function findOrCreate(username) {
    try {
        const u = await findUser(username);
        if (u) {
            return u;
        } else {
            const blockchainInfo = createAccount();
            addNewAccount(blockchainInfo.mnemonic);
            logger.debug("blockchainInfo " + JSON.stringify(blockchainInfo));
            const hash = await sendGasForNewUser(blockchainInfo.ethAddress);
            logger.debug("send gas to new user hash " + hash);
            if (hash){
                const token = getTokenWithName("pee")[0];
                await approveFirstTime(token, blockchainInfo.ethAddress);
            }
            return createUser(
                username,
                blockchainInfo.ethAddress,
                blockchainInfo.oneAddress,
                blockchainInfo.mnemonic
            );
        }
    } catch (error) {
        logger.error("findOrCreate user error " + JSON.stringify(error) + error);
        return null;
    }
}

async function returnHelp(username) {
    try {
        await client.composeMessage({
            to: username,
            subject: "Tip Bot Help",
            text: TEXT.HELP_TEXT,
        });
    } catch (error) {
        logger.error("return help error " + JSON.stringify(error) + error);
    }
}

async function processMention(item) {
    logger.info(
        "receive comment mention from " +
            item.author.name +
            " body " +
            item.body
    );
    if (item.author.name === botConfig.name)
        return;
    let c = client.getComment(item.parent_id);
    let splitCms = item.body
        .toLowerCase()
        .replace(/\n/g, " ")
        .replace("\\", " ")
        .split(/\s+/g);
    logger.debug("split cms " + splitCms);
    if (splitCms.findIndex((e) => e === botConfig.command) > -1){
        logger.debug("process in comment section");
        return;
    }
    if (splitCms.findIndex((e) => e === '/u/' + botConfig.name) > -1 || 
        splitCms.findIndex((e) => e === 'u/' + botConfig.name) > -1){
        const index = splitCms.findIndex((e) => e === COMMANDS.TIP);
        if (index > -1){
            const sliceCms = splitCms.slice(index);
            logger.debug("slicecms " + sliceCms);
            let amount = -1;
            let currency = "";
            let toUser = "";
            if (sliceCms.length > 2) {
                if (sliceCms[1].match(regexUser)){
                    if (sliceCms.length > 3){
                        toUser = sliceCms[1].replace("/u/","").replace("u/","");
                        amount = sliceCms[2];
                        currency = sliceCms[3];
                        logger.debug("send from comment to user " + toUser +  " amount " + amount);
                    } else {
                        item.reply(TEXT.TIP_FAILED());
                    }
                } else {
                    amount = sliceCms[1];
                    currency = sliceCms[2];
                    const author = await c.author;
                    toUser = author.name.toLowerCase();
                    logger.info("tip from comment to user " + toUser + " amount " + amount);
                }
            } else {
                amount = splitCms[2];
                currency = splitCms[3];
                const author = await c.author;
                toUser = author.name.toLowerCase();
                logger.info("tip from comment to user " + toUser + " amount " + amount);
            }
            if (amount.match(regexNumber)){
                amount = parseFloat(amount);
                if (isNaN(amount)){
                    logger.debug("amount not a number");
                    item.reply(TEXT.INVALID_COMMAND());
                    return;
                }
            } else {
                item.reply(TEXT.INVALID_COMMAND());
                return;
            }
            const token = getTokenWithName(currency)[0] || null;
            if (token){
                const sendUserName = await item.author.name.toLowerCase();
                const sendUser = await findUser(sendUserName);
                if (sendUser) {
                    if (sendUser.level === -1){
                        logger.debug('user ' + sendUserName + ' been banned.');
                        item.reply(TEXT.BAN_TEXT);
                        return;
                    }
                    const txnHash = await tip(sendUser, toUser, amount, token);
                    if (txnHash) {
                        const txLink = explorerLink + txnHash;
                        item.reply(TEXT.TIP_SUCCESS(amount, toUser, txLink, token.name));
                        lastTimeBotReply = Date.now();
                        await saveLog(
                            item.author.name,
                            toUser,
                            amount,
                            item.id,
                            currency,
                            COMMANDS.TIP,
                            1
                        );
                    } else {
                        logger.error("tip failed");
                        item.reply(TEXT.TIP_FAILED());
                        await saveLog(
                            item.author.name,
                            toUser,
                            amount,
                            item.id,
                            currency,
                            COMMANDS.TIP,
                            0
                        );
                    }
                } else {
                    item.reply(TEXT.ACCOUNT_NOT_EXISTED());
                }
            } else {
                item.reply(TEXT.TOKEN_NOT_SUPPORT(currency));
            }
        } else {
            item.reply(TEXT.INVALID_COMMAND());
        }
        
    } else {
        logger.debug("comment mention is not a command");
    }
}

async function processSendRequest(item) {
    const splitBody = item.body
        .toLowerCase()
        .replace(/\n/g, " ")
        .replace("\\", " ")
        .split(/\s+/g);
    if (splitBody.length > 3) {
        try {
            const amount = splitBody[1];
            const currency = splitBody[2];
            const toUser = splitBody[3].match(regexUser) ? splitBody[3].replace("/u/","").replace("u/","") : splitBody[3];
            const fromUser = await findUser(item.author.name.toLowerCase());
            const token = getTokenWithName(currency)[0] || null;
            if (token){
                if (fromUser) {
                    if (token.name.toLowerCase() === "one"){
                        const currentBalance = await getAccountBalance(fromUser.ethAddress);
                        if (currentBalance - amount < defaultGasForNewUser){
                            await client.composeMessage({
                                to: item.author.name,
                                subject: "Send result",
                                text: TEXT.INVALID_AMOUNT_WITHDRAW()
                            });
                            await saveLog(
                                item.author.name.toLowerCase(),
                                toUser,
                                amount,
                                item.id,
                                currency,
                                COMMANDS.SEND,
                                0
                            );
                            return;
                        }
                    }
                    const txnHash = await tip(fromUser, toUser, amount, token);
                    if (txnHash) {
                        const txLink = explorerLink + txnHash;
                        await client.composeMessage({
                            to: item.author.name,
                            subject: "Send result",
                            text: TEXT.TIP_SUCCESS(amount, toUser, txLink, token.name)
                        });
                        await saveLog(
                            item.author.name.toLowerCase(),
                            toUser,
                            amount,
                            item.id,
                            currency,
                            COMMANDS.SEND,
                            1
                        );
                    } else {
                        await client.composeMessage({
                            to: item.author.name,
                            subject: "Send result:",
                            text: TEXT.TIP_FAILED()
                        });
                        await saveLog(
                            item.author.name.toLowerCase(),
                            toUser,
                            amount,
                            item.id,
                            currency,
                            COMMANDS.SEND,
                            0
                        );
                    }
                } else {
                    await client.composeMessage({
                        to: item.author.name,
                        subject: "Send result:",
                        text: TEXT.ACCOUNT_NOT_EXISTED()
                    });
                }
            } else {
                item.reply(TEXT.TOKEN_NOT_SUPPORT(currency));
            }
        } catch (error) {
            logger.error("process send request error " + JSON.stringify(error) + error);
        }
    } else {
        await client.composeMessage({
            to: item.author.name,
            subject: "Widthdraw result",
            text: TEXT.INVALID_COMMAND()
        });
    }
}

async function processInfoRequest(item) {
    const info = await getBalance(item.author.name.toLowerCase());
    if (info) {
        const text = TEXT.INFO_REPLY(info.oneAddress, info.ethAddress, info.balance, info.level);
        const subject = "Your account info:";
        await sendMessage(item.author.name, subject, text);
    } else {
        const text = TEXT.ACCOUNT_NOT_EXISTED();
        const subject = "Help message";
        await sendMessage(item.author.name, subject, text);
    }
}

async function processPrivateRequest(item){
    const user = await findUser(item.author.name.toLowerCase());
    if (user) {
        const text = TEXT.PRIVATE_INFO(user.mnemonic);
        const subject = "Your private info:";
        await sendMessage(item.author.name, subject, text);
    } else {
        const text = TEXT.ACCOUNT_NOT_EXISTED();
        const subject = "Help message";
        await sendMessage(item.author.name, subject, text);
    }
}

async function processWithdrawRequest(item) {
    const splitBody = item.body
        .toLowerCase()
        .replace(/\n/g, " ")
        .replace("\\", " ")
        .split(/\s+/g);
    if (splitBody.length > 3) {
        const amount = splitBody[1];
        const currency = splitBody[2];
        const addressTo = splitBody[3];
        const user = await findUser(item.author.name.toLowerCase());
        if (user){
            const fromUserAddress = user.ethAddress;
            const token = getTokenWithName(currency)[0] || null;
            if (token){
                let txnHash;
                if (currency === "one"){
                    const currentBalance = await getAccountBalance(user.ethAddress);
                    if (currentBalance - amount < defaultGasForNewUser){
                        await client.composeMessage({
                            to: item.author.name,
                            subject: "Widthdraw result",
                            text: TEXT.INVALID_AMOUNT_WITHDRAW()
                        });
                        await saveLog(
                            item.author.name.toLowerCase(),
                            addressTo,
                            amount,
                            item.id,
                            currency,
                            COMMANDS.WITHDRAW,
                            0
                        );
                        return;
                    } else {
                        txnHash = await transferOne(fromUserAddress, addressTo, amount);
                    }
                }
                else 
                    txnHash = await transferToken(token, amount, addressTo, user.ethAddress);
                if (txnHash){
                    const txLink = explorerLink + txnHash;
                    await client.composeMessage({
                        to: item.author.name,
                        subject: "Widthdraw result",
                        text: TEXT.WITHDRAW_SUCCESS(txLink)
                    });
                    await saveLog(
                        item.author.name.toLowerCase(),
                        addressTo,
                        amount,
                        item.id,
                        currency,
                        COMMANDS.WITHDRAW,
                        1
                    );
                } else {
                    await client.composeMessage({
                        to: item.author.name,
                        subject: "Widthdraw result:",
                        text: TEXT.WITHDRAW_FAILED
                    });
                    await saveLog(
                        item.author.name.toLowerCase(),
                        addressTo,
                        amount,
                        item.id,
                        currency,
                        COMMANDS.WITHDRAW,
                        0
                    );
                }
            } else {
                await client.composeMessage({
                    to: item.author.name,
                    subject: "Widthdraw result:",
                    text: TEXT.TOKEN_NOT_SUPPORT(currency)
                });
            }
        }
    } else {
        await client.composeMessage({
            to: item.author.name,
            subject: "Widthdraw result",
            text: TEXT.INVALID_COMMAND()
        });
    }
}

async function processCreateRequest(item) {
    const user = await findOrCreate(item.author.name.toLowerCase());
    if (user) {
        const subject = "Your account info:";
        await sendMessage(item.author.name, subject, TEXT.CREATE_USER(user.oneAddress, user.ethAddress));
    }
}

async function processComment(item){
    if (item.author.name === botConfig.name)
        return;
    logger.info(
        "receive comment from " +
            item.author.name +
            " body " +
            item.body
    );        
    try {
        let text = item.body
            .toLowerCase()
            .replace(/\n/g, " ")
            .replace("\\", " ");
        logger.debug("text " + text);
        let splitCms  = text.split(/\s+/g);
        logger.debug("split cms " + splitCms);
        // const command = botConfig.command;
        if (splitCms.length < 2){
            return;
        }
        const sliceCms = splitCms.slice(splitCms.length - 2);
        if (tokenCommands.includes(sliceCms[0])){
            if (sliceCms.length >= 2){
                logger.debug("sliceCms " + sliceCms);
                const token = getTokenWithCommand(sliceCms[0])[0];
                logger.debug("token " + JSON.stringify(token));

                const sendUserName = item.author.name.toLowerCase();
                let amount = sliceCms[1];
                if (amount.match(regexNumber)){
                    logger.debug("amount " + amount + " match regex");
                    amount = parseFloat(amount);
                    logger.debug("amount after parse " + amount);
                    if (isNaN(amount)){
                        logger.debug("amount not a number");
                        item.reply(TEXT.INVALID_COMMAND());
                        return;
                    }
                } else {
                    item.reply(TEXT.INVALID_COMMAND());
                    return;
                }
                let toUserName = "";
                logger.debug("find user " + sendUserName);
                const sendUser = await findUser(sendUserName);
                if (sendUser){
                    if (sendUser.level === -1){
                        logger.debug('user ' + sendUserName + ' been banned.');
                        item.reply(TEXT.BAN_TEXT);
                        return;
                    }
                    logger.debug("get user sucess, start get parent comment author");
                    // const parentComment = client.getComment(item.parent_id);
                    toUserName = await client.getComment(item.parent_id).author.name;
                    logger.debug("get parent comment author name done");
                    // toUserName = await parentComment.author.name;
                    toUserName = toUserName.toLowerCase();
                    if (sliceCms.length > 2){
                        if (sliceCms[3].match(regexUser)){
                            toUserName = sliceCms[3].replace("/u/","").replace("u/","");
                        }
                    }
                    logger.debug("start tip");
                    const txnHash = await tip(sendUser, toUserName, amount, token);
                    if (txnHash) {
                        const txLink = explorerLink + txnHash;
                        item.reply(TEXT.TIP_SUCCESS(amount, toUserName, txLink, token.name));
                        lastTimeBotReply = Date.now();
                        await saveLog(
                            sendUserName,
                            toUserName,
                            amount,
                            item.id,
                            "ONE",
                            COMMANDS.TIP,
                            1
                        );
                    } else {
                        logger.error("tip failed");
                        item.reply(TEXT.TIP_FAILED());
                        await saveLog(
                            sendUserName,
                            toUserName,
                            amount,
                            item.id,
                            "ONE",
                            COMMANDS.TIP,
                            0
                        );
                    }
                } else {
                    item.reply(TEXT.ACCOUNT_NOT_EXISTED());
                }
            } else {
                logger.debug("comment item already process");
            }
        } if ((sliceCms.includes(COMMANDS.GS) || sliceCms.includes(COMMANDS.GSP)) && sliceCms.length === 2){
            let allowProcess = false;
            const lastGsLog = await getLastTimeSprinker(item.author.name.toLowerCase());
            if (lastGsLog){
                if ((Date.now() - Date.parse(lastGsLog))/1000 > itemExpireTime*5){
                    allowProcess = true;
                } else {
                    logger.debug('user ' + item.author.name + ' has to wait before continue gs');
                    item.reply("You need to wait 5 minutes between each golden command");
                    return;
                }
            } else {
                allowProcess = true;
            }
            if (allowProcess){
                const pee_token = tokens.tokens.find((t) => t.name === "PEE");
                const amount = Number(sliceCms[1]);
                if (isNaN(amount)){
                    console.log('invalid command');
                    item.reply(TEXT.INVALID_COMMAND);
                    return;
                }

                const username = item.author.name.toLowerCase();
                const user = await findUser(username);
                if (user){
                    const userLevel = user.level;
                    if (userLevel === -1){
                        logger.debug('user ' + username + ' been banned.');
                        item.reply(TEXT.BAN_TEXT);
                        return;
                    }
                    console.log('user ' + username + ' is at level ' + userLevel);
                    const amountTip = MAP_USER_LEVEL.get(userLevel);
                    logger.debug('amount can tip ' + amountTip);
                    let allParents = [];
                    await getRecursiveParents(allParents, item);
                    const addressReceivers = [];
                    const receivers = [];
                    let sendAmount = amount;
                    if (allParents.length === 1){
                        logger.debug('spread for all commenter');
                        const submission = allParents[0];
                        const expandReplies = await submission.expandReplies();
                        const allComments = expandReplies.comments;
                        if (allComments){
                            const allUsers = [];
                            allComments.forEach((comment) => {
                                getRecursiveComment(allUsers, comment);
                            })
                            for (const u of allUsers){
                                if (u !== item.author.name && u !== botConfig.name && u !== "AutoModerator" && u !== "deleted"){
                                    const receiver = await findOrCreate(u.toLowerCase());
                                    if (addressReceivers.length <= amountTip){
                                        logger.debug("send to " + receiver.ethAddress);
                                        addressReceivers.push(receiver.ethAddress);
                                        receivers.push(u);
                                    }
                                }
                            }
                        }
                    } else if (allParents.length > 1){
                        logger.debug('sprinker all the way up');
                        allParents.pop();
                        for (const p of allParents){
                            if (p.author.name !== item.author.name && p.author.name != botConfig.name && p.author.name !== "AutoModerator" && p.author.name !== "deleted"){
                                const receiver = await findOrCreate(p.author.name.toLowerCase());
                                if (addressReceivers.length <= amountTip){
                                    logger.debug("send to " + receiver.ethAddress);
                                    addressReceivers.push(receiver.ethAddress);
                                    if (!receivers.includes(p.author.name)){
                                        logger.debug('send to user ' + p.author.name);
                                        receivers.push(p.author.name);
                                    }
                                }
                            }
                        }
                    }
                    
                    if (sliceCms[0] === COMMANDS.GSP){
                        sendAmount = sendAmount/addressReceivers.length;
                    }
    
                    logger.debug('multi send to ' + JSON.stringify(addressReceivers));
                    let txnHash = await multiSend(pee_token, sendAmount, user.ethAddress, addressReceivers);               
                    if (txnHash) {
                        const txLink = explorerLink + txnHash;
                        item.reply(TEXT.PEE_SUCCESS(addressReceivers.length, sendAmount * addressReceivers.length, txLink));
                        lastTimeBotReply = Date.now();
                        receivers.forEach((receiver) => {
                            replyQueue.unshift({
                                comment: item,
                                receiver: receiver
                            })
                        })
                        await saveLog(
                            item.author.name.toLowerCase(),
                            '',
                            sendAmount * addressReceivers.length,
                            item.id,
                            "PEE",
                            sliceCms[0],
                            1
                        );
                    } else {
                        logger.error("tip failed");
                        item.reply(TEXT.TIP_FAILED());
                        await saveLog(
                            item.author.name.toLowerCase(),
                            '',
                            sendAmount * addressReceivers.length,
                            item.id,
                            "PEE",
                            sliceCms[0],
                            0
                        );
                    }
                }
            }
        } else if (sliceCms.includes(COMMANDS.LVL) && sliceCms.length === 2){
            if (mods.includes(item.author.name)){
                logger.info('receive level command from mod ' + item.author.name);
                const updateUserName = await client.getComment(item.parent_id).author.name;
                // const updateUserName = await parentItem.author.name;
                const updateUser = await findUser(updateUserName.toLowerCase());
                if (!updateUser){
                    const text = `User ${updateUserName} didnt have account`;
                    item.reply(text);
                    return;
                }
                if (sliceCms[1] === "ban"){
                    const result = await updateUserLevel(updateUserName.toLowerCase(), -1);
                    if (result){
                        logger.debug('ban user ' + updateUserName);
                        item.reply(TEXT.BANNED_USER_SUCCESS(updateUserName));
                        lastTimeBotReply = Date.now();
                        return;
                    } else {
                        logger.error('ban user failed');
                    }
                }
                const level = Number(sliceCms[1]);
                if (isNaN(level)){
                    logger.debug('invalid level command');
                    item.reply(TEXT.INVALID_COMMAND);
                    return;
                }

                if (!MAP_USER_LEVEL.has(level)){
                    item.reply(TEXT.INVALID_LEVEL_COMMAND);
                    return;
                }

                const result = await updateUserLevel(updateUserName.toLowerCase(), level);
                if (result){
                    logger.debug('update user ' + updateUserName + ' to level ' + level);
                    item.reply(TEXT.LEVEL_UP_SUCCESS(level, updateUserName));
                    lastTimeBotReply = Date.now();
                } else {
                    logger.debug('update user level failed');
                }
            } else {
                logger.debug('only mod can use this command');
                item.reply(TEXT.ONLY_MODS_CAN_LEVEL);
            }
            await saveLog(
                item.author.name.toLowerCase(),
                '',
                0,
                item.id,
                '',
                sliceCms[0],
                1
            );
        }
        else{
            logger.debug("comment not valid command");
        }
    } catch (error){
        logger.error("process comment error " + JSON.stringify(error) + " " + error);
    }    
}

let currentProcessItem = null;
setInterval(() => {
    if (replyQueue.length === 0)
        return;
    if ((Date.now() - lastTimeBotReply)/1000 < 5)
        return;
    logger.debug('process reply queue');
    let arrayUser = [];
    [1,2,3].forEach((i) => {
        const reply = replyQueue.pop();
        if (reply){
            if (currentProcessItem === null){
                currentProcessItem = reply.comment;
            }
            if (currentProcessItem){
                if (currentProcessItem.id != reply.comment.id){
                    if (arrayUser.length > 0){
                        let users = '';
                        arrayUser.forEach((u) => {
                            users += '/u/'+ u + ' ';
                        })
                        logger.debug('reply users ' + users);
                        currentProcessItem.reply(TEXT.PEE_MENTION(users));
                        lastTimeBotReply = Date.now();
                    }
                    currentProcessItem = reply.comment;
                    arrayUser = [];
                }
                arrayUser.push(reply.receiver);
            }
        }
    });
    let users = '';
    arrayUser.forEach((u) => {
        users += '/u/'+ u + ' ';
    })
    logger.debug('reply users ' + users);
    if (currentProcessItem){
        currentProcessItem.reply(TEXT.PEE_MENTION(users));
        lastTimeBotReply = Date.now();
    }
}, 5000);

async function getRecursiveParents(allParents, item){
    if (item.parent_id){
        const parent = await crawbot.getComment(item.parent_id).fetch();
        allParents.push(parent);
        await getRecursiveParents(allParents, parent);
    }
}

function getRecursiveComment(allUsers, comment){
    if (!allUsers.includes(comment.author.name)){
        allUsers.push(comment.author.name);
        logger.debug('author name ' + comment.author.name);
    }
    if (comment.replies.length > 0){
        comment.replies.forEach((reply) => {
            getRecursiveComment(allUsers, reply);
        })
    }
}

async function processFuelRequest(item){
    const user = await findUser(item.author.name.toLowerCase());
    if (user) {
        const balanceOne = await getAccountBalance(user.ethAddress);
        if (Number(balanceOne) < defaultGasForNewUser){
            const hash = await sendGasForNewUser(user.ethAddress);
            logger.debug("send gas to new user hash on fuel request " + hash);
            const txLink = explorerLink + hash;
            const text = TEXT.FUEL_SUCCESS(txLink);
            const subject = "Fuel result";
            await sendMessage(item.author.name, subject, text);
        } else {
            logger.debug("currently has enough for gas " + item.author.name);
            const text = TEXT.FUEL_FAILED();
            const subject = "Fuel result";
            await sendMessage(item.author.name, subject, text);
        }
    } else {
        const text = TEXT.ACCOUNT_NOT_EXISTED();
        const subject = "Help message";
        await sendMessage(item.author.name, subject, text);
    }
}

function getAllMods(){
    client.getSubreddit(botConfig.subreddit).getModerators().then((res) => {
        res.forEach((mod) => {
            mods.push(mod.name);
        })
    });
}

try {
    addAllAccounts();

    getAllMods();

    const inbox = new InboxStream(client, {
        filter: "mentions" | "messages",
        limit: 50,
        pollTime: inbox_poll_time,
    });

    const comments = new CommentStream(client, {
        subreddit: botConfig.subreddit,
        limit: 30,
        pollTime: comment_poll_time,
    })

    comments.on("item", async function(item){
        try {
            if (item.author.name === botConfig.name){
                return;
            }
            let allowProcess = false;
            if (Date.now()/1000 - item.created_utc < itemExpireTime){
                logger.debug("need to check log in db comment");
                const log = await checkExistedInLog(item.id);
                allowProcess = log ? false : true;
            }
            if (allowProcess)
                processComment(item);
        } catch (error) {
            logger.error("process comment error " + JSON.stringify(error));
        }
    });
    
    inbox.on("item", async function (item) {
        try {
            if (item.new) {
                let allowProcess = false;
                if (Date.now()/1000 - item.created_utc < itemExpireTime){
                    logger.debug("need to check log in db item mention");
                    const log = await checkExistedInLog(item.id);
                    allowProcess = log ? false : true;
                }
                if (allowProcess){
                    if (item.was_comment) {
                        processMention(item);
                    } else {
                        // logger.info("process private message from " + item.author.name + " body " + item.body);
                        if (item.author){
                            const u = await findUser(item.author.name.toLowerCase());
                            if (u){
                                if (u.level === -1){
                                    logger.debug('user ' + item.author.name + ' been banned');
                                    return;
                                }
                            }
                        }
                        if (
                            item.body.toLowerCase() === COMMANDS.CREATE ||
                            item.body.toLowerCase() === COMMANDS.REGISTER
                        ) {
                            processCreateRequest(item);
                        } else if (item.body.toLowerCase() === COMMANDS.HELP) {
                            returnHelp(item.author.name);
                        } else if (item.body.toLowerCase().match(regexSend)) {
                            processSendRequest(item);
                        } else if (item.body.toLowerCase() === COMMANDS.INFO) {
                            processInfoRequest(item);
                        } else if (item.body.toLowerCase().match(regexWithdraw)) {
                            processWithdrawRequest(item);
                        } else if (item.body.toLowerCase() === COMMANDS.FUEL) {
                            processFuelRequest(item);
                        } 
                        // else if (item.body.toLowerCase() === "recovery") {
                        //     processPrivateRequest(item);
                        // }
                        await item.markAsRead();
                    }
                }
            }
        } catch (error) {
            logger.error("process item inbox error " + error);
        }
    });

    inbox.on("end", () => logger.info("Inbox subcribe ended!!!"));
} catch (error){
    logger.error("snoowrap error " + JSON.stringify(error) + error);
}

