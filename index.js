require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const config = require("./config.json");
const panelHandler = require("./panels/panelHandler");
const ticketHandler = require("./handlers/ticketHandler");
const commandHandler = require("./handlers/commandHandler");

function envFlag(name) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

const enableGuildMembersIntent = envFlag("ENABLE_GUILD_MEMBERS_INTENT");
const enableMessageContentIntent = envFlag("ENABLE_MESSAGE_CONTENT_INTENT");

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages
];

if (enableGuildMembersIntent) intents.push(GatewayIntentBits.GuildMembers);
if (enableMessageContentIntent) intents.push(GatewayIntentBits.MessageContent);

const client = new Client({
  intents
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

if (enableGuildMembersIntent) {
  client.on("guildMemberAdd", async (member) => {
    const welcomeChannelId = "1006907804164046880";
    const rulesChannelId = "1178387378226876426";

    const welcomeChannel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (!welcomeChannel || !welcomeChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("Moyas Roleplay")
      .setDescription([
        `**Welkom ${member} 😀**`,
        `Hallo ${member.user}, welkom op **SWR | Support**!`,
        `Bekijk eerst de regels in <#${rulesChannelId}>.`
      ].join("\n"));

    const iconUrl = member.guild.iconURL({ size: 1024 });
    if (iconUrl) {
      embed.setImage(iconUrl);
    }

    await welcomeChannel.send({
      content: "Schilderswijk RP",
      embeds: [embed]
    }).catch(() => null);
  });
} else {
  console.log("Guild member welcome messages disabled (ENABLE_GUILD_MEMBERS_INTENT is not enabled).");
}

ticketHandler.attach(client, config);
commandHandler.attach(client, config);

const token = process.env.DISCORD_TOKEN || config.token;
client.login(token);
