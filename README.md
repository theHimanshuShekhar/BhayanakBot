# BhayanakBot

All purpose bot for Discord servers.

[**Add me to your server!**](https://discord.com/api/oauth2/authorize?client_id=470814535146536972&permissions=8&redirect_uri=https%3A%2F%2Fbhayanak-bot.herokuapp.com%2F&response_type=code&scope=bot%20guilds%20connections%20email%20identify%20messages.read)

![alt](https://i.imgur.com/CIAJAgg.jpg)

# Relevant Links

- [Trello](https://trello.com/b/BkBvlAL5/bhayanakbot) - Development activity status.
- [Bhayanak](https://discord.gg/879CFrn) - Discord server.

### This bot was created using the following open source projects:

- [VSCode](https://code.visualstudio.com/) - awesome text editor.
- [node.js](https://nodejs.org/) - JavaScript runtime built on Chrome's V8 JavaScript engine.
- [discord.js](https://discord.js.org/) - discord.js is a powerful node.js module that allows you to interact with the Discord API.

### Installation

This project requires [Node.js](https://nodejs.org/) v6+ to run.

Install the dependencies and devDependencies and start the server.

#### Among Us Automute using Tesseract OCR

Steps to install the program

- Add the BhayanakBot to your server. (Make sure bot has administrator priveleges)
- Install [Tesseract OCR](https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-v5.0.0-alpha.20200328.exe) in the default installation directory
- Run amongus.exe
- Create a discord webhook in your server and add the WebhookURL
- Right click a channel with discord developer mode on and add the channelID
- Enter the resolution of your main monitor
- Click Start Detection

```sh
$ cd BhayanakBot
$ npm install -d
$ node index.js
```

For production environments.

```sh
$ npm install --production
$ NODE_ENV=production node index.js
```
