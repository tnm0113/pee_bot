import config from "config";
const botConfig = config.get("bot");
const wiki_link = botConfig.wiki_link || "https://www.reddit.com/r/AltStreetBets/wiki/peeing_bot-hrc20_tipping";

const linkPmReddit = (subject, action) => {
    return `https://www.reddit.com/message/compose/?to=${botConfig.name}&subject=${subject}&message=${action}`;
}
      
//Account Created:    
const account_created = `Your account has been created. Address and balance are below.  
<addr & balance information>`  

export const ACCOUNT_CREATED = (info) => {
    return `Your account has been created. Address and balance are below.\n ${info}.${SIGNATURE(botConfig.name)}`
}
      
//Succssful Tip Reply:    
const tip_success = `Your tip was successful! Transaction ID below. <transactionID>`  
export const TIP_SUCCESS = (amount, receiveUser, txLink, currency) => {
    return `Your tip of ${amount} ${currency.toUpperCase()} was successful to /u/${receiveUser}! Transaction ID [HERE](${txLink}).${SIGNATURE(botConfig.name)}`
}
      
//Failed Tip Reply:    
export const TIP_FAILED = () => {
    const link = linkPmReddit("My Info", "info");
    return `Your tip was not successful. Please review your command and retry. ` + 
        `Ensure your balance covers the transaction and gas. For more information, send the word INFO in private message ` + 
        `by clicking [HERE](${link}).${SIGNATURE(botConfig.name)}`
}
      
//Info Reply:    
//(Current is good. Leave as-is)
export const INFO_REPLY = (one, eth, balance, level) => {
    return `This is your One Address: ${one}` +
            `\n \n ` +
            `And this is your Eth Address: ${eth}` +
            `\n \n` +
            `You are currently at level ${level}` + 
            `\n \n`+
            `[Your Balance](https://explorer.harmony.one/address/${one}): \n\n` + 
            `Token | Balance \n` +
            `| :-: | :-: \n` +
            `${balance}` +
            `${SIGNATURE(botConfig.name)}`;
}

export const PEE_SUCCESS = (numberReceivers, amountPee, txlink) => {
    return `You have tipped ${amountPee} PEE to ${numberReceivers} people ! Transaction ID [HERE](${txlink}).${SIGNATURE(botConfig.name)}`
}
      
//Withdraw Reply:    
export const WITHDRAW_SUCCESS = (txlink) => {
    return `Your withdraw was successful! Transaction ID [HERE](${txlink}).${SIGNATURE(botConfig.name)}`
}

//Withdraw Failure:
export const WITHDRAW_FAILED = `Your withdraw was not successful. Please check your command and ensure the address is correct. Be sure you have enough funds and small amount for the transaction fee.`

export const ACCOUNT_NOT_EXISTED = () => {
    const linkPm = linkPmReddit("Create Account", "create");
    return `Your account does not exist. Please send "CREATE" or "REGISTER" in private message to the tip bot by clicking [HERE](${linkPm}).${SIGNATURE(botConfig.name)}`;
}

export const INVALID_COMMAND = () => {
    const linkPm = linkPmReddit("Get Help", "help");
    return `Invalid command, please send "HELP" in private message to the tip bot by clicking [HERE](${linkPm}).${SIGNATURE(botConfig.name)}`
}

export const INVALID_AMOUNT_WITHDRAW = () => {
    return `Your withdraw/send request is failed, please keep some ONE for fee when peeing`;
}

export const INVALID_LEVEL_COMMAND = () => {
    return `Invalid level.${SIGNATURE(botConfig.name)}`;
}

export const ONLY_MODS_CAN_LEVEL = () => {
    return `Only mods can use level command.${SIGNATURE(botConfig.name)}`;
}

export const PRIVATE_INFO = (mnemonic) => {
    return `Below is your wallet recovery phrase. Please keep it safe: \n\n ${mnemonic}.${SIGNATURE(botConfig.name)}`
}

export const LEVEL_UP_SUCCESS = (level, user) => {
    return `/u/${user} You are advanced to level ${level}.${SIGNATURE(botConfig.name)}`
}

export const BAN_TEXT = () => {
    return `You have been banned ! Contact mod for appealing.${SIGNATURE(botConfig.name)}`
}

export const BANNED_USER_SUCCESS = (user) => {
    return `/u/${user} You are banned !.${SIGNATURE(botConfig.name)}`
}

export const PEE_MENTION = (users) => {
    return `${users} You have been tipped.${SIGNATURE(botConfig.name)}`;
}

export const SIGNATURE = (tip_bot_name) => {
    const base = "\n\n*****\n\n";
    const emojii = "♡ (っ◔◡◔)っ ♡";
    const get_started = ` | [Get Started](${wiki_link})`;
    const show_balance = ` | [Show my balance](https://www.reddit.com/message/compose/?to=${tip_bot_name}&subject=My%20info&message=info)`
    const end = " | ♡";
    return base + emojii + get_started +  show_balance + end;
}

export const HELP_TEXT = () => {
    return `Commands supported via Private Message: \n\n` +
    `- 'info' - Retrieve your account info.\n\n` +
    `- 'create' or 'register' - Create a new account if one does not exist.\n\n` +
    `- 'send <amount> <currency> <user>' - Send some ONE or PEE to a reddit user.\n\n` +
    `- 'withdraw <amount> <currency> <address>' - Withdraw ONE or PEE to an address.\n\n` +
    `- 'help' - Get this help message.`+
    `${SIGNATURE(botConfig.name)}`;
}

export const CREATE_USER = (oneAddress, ethAddress) => {
    return  `A bladder/wallet has been created for you and you have received some ONE for peeing, enjoy it!.\n\n` +
            `One Address:  ${oneAddress}` +
            `\n \n` +
            `Eth Address:  ${ethAddress}.${SIGNATURE(botConfig.name)}`;
}

export const TOKEN_NOT_SUPPORT = (currency) => {
    return `Tip bot havent support ${currency} yet`;
}

export const FUEL_SUCCESS = (txlink) => {
    return `You have received some ONE for peeing! Transaction ID [HERE](${txlink}).${SIGNATURE(botConfig.name)}`
}

export const FUEL_FAILED = () => {
    return `You still have enough ONE for peeing!.${SIGNATURE(botConfig.name)}`
}