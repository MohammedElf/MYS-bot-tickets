require('dotenv').config();
const config = require('./config.json');

const token = process.env.DISCORD_TOKEN || config.token;

client.login(token);


const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config.json");
const panelHandler = require("./panels/panelHandler");
const ticketHandler = require("./handlers/ticketHandler");
const commandHandler = require("./handlers/commandHandler");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("clientReady", async () => {
  console.log(`Ticket Bot online als ${client.user.tag}`);

  // Panels upsert (anti spam)
  await panelHandler.upsertPanels(client, config);

  // Register slash commands (guild-level for fast availability)
  await commandHandler.registerGuildCommands(client, config);

  // Herstel open ticket knoppen/log berichten na restart
  await ticketHandler.syncOpenTickets(client, config);

  // Upsert permanent wachtkamer bericht
  await panelHandler.upsertPermanentMessage(client, config);
});

ticketHandler.attach(client, config);
commandHandler.attach(client, config);

client.login(config.token);
