# BhayanakBot

All purpose bot for Discord servers.

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

#### Among Us automute using Tesseract OCR

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
