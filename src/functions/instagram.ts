import { ChannelType, Message } from "discord.js";

// const channelID= 974776097893924954;


const detectInstagram = (message: Message) => {
    const instaregex = new RegExp("(?<=instagram.com\/)[A-Za-z0-9_.]+");
    let profilename = instaregex.exec(message.content);
    return profilename
}

const handleInstagram = async (message: Message) => {
    let profile = detectInstagram(message);
    if(!profile) return;

    const profilename = profile[0];
    
    console.log("instagram link detected", profilename);
    
}




export default handleInstagram;