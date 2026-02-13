const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { loadPanels, savePanels } = require("../handlers/helpers");

const PANEL_BUTTON_EMOJIS = {
  support: "🛠️",
  scenario: "🎭",
  unban: "🔓",
  politie: "🚓",
  anwb: "🛻",
  ambulance: "🚑",
  taxi: "🚕",
  donaties: "💛",
  staff: "🧑‍💼",
  gang: "🕶️",
  contentcreator: "🎥",
  makelaar: "🏡",
  vergoedingen: "💶"
};

function emojiForButton(button) {
  if (button.emoji) return button.emoji;
  const type = (button.customId || "").split(":")[1];
  return PANEL_BUTTON_EMOJIS[type] || "🎫";
}

function styleFromString(s) {
  switch ((s || "").toLowerCase()) {
    case "secondary": return ButtonStyle.Secondary;
    case "success": return ButtonStyle.Success;
    case "danger": return ButtonStyle.Danger;
    default: return ButtonStyle.Primary;
  }
}

function sameButtons(message, panelButtons = []) {
  const configured = panelButtons.map((b) => b.customId);
  const current = (message.components || [])
    .flatMap((row) => row.components || [])
    .map((component) => component.customId)
    .filter(Boolean);

  return configured.length > 0
    && configured.length === current.length
    && configured.every((id, idx) => id === current[idx]);
}

async function findExistingPanelMessage(channel, panelConfig) {
  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!recent) return null;

  return recent.find((msg) => {
    if (!msg.author?.bot) return false;
    const title = msg.embeds?.[0]?.title;
    return title === (panelConfig.title || null) && sameButtons(msg, panelConfig.buttons || []);
  }) || null;
}

module.exports.upsertPanels = async (client, config) => {
  const store = await loadPanels();
  const panels = config.panels || {};

  for (const key of Object.keys(panels)) {
    const p = panels[key];
    const channel = await client.channels.fetch(p.channelId).catch(() => null);
    if (!channel) continue;

    const embed = new EmbedBuilder()
      .setTitle(p.title || key)
      .setDescription(p.description || "Klik op de knop hieronder om een ticket aan te maken.")
      .setColor("#FEE75C");

    const btns = (p.buttons || []).slice(0, 5).map(b =>
      new ButtonBuilder()
        .setCustomId(b.customId)
        .setLabel(b.label)
        .setEmoji(emojiForButton(b))
        .setStyle(styleFromString(b.style))
    );

    const row = new ActionRowBuilder().addComponents(...btns);

    const saved = store.panels[key];
    if (saved?.channelId === p.channelId && saved?.messageId) {
      const msg = await channel.messages.fetch(saved.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: [row] }).catch(() => null);
        continue;
      }
    }

    const existing = await findExistingPanelMessage(channel, p);
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] }).catch(() => null);
      store.panels[key] = { channelId: p.channelId, messageId: existing.id };
      await savePanels(store);
      continue;
    }

    const sent = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (sent) {
      store.panels[key] = { channelId: p.channelId, messageId: sent.id };
      await savePanels(store);
    }
  }
};

module.exports.upsertPermanentMessage = async (client, config) => {
  const permanent = config.permanentSupportMessage;
  if (!permanent?.channelId) return;

  const store = await loadPanels();
  store.permanentMessages = store.permanentMessages || {};

  const channel = await client.channels.fetch(permanent.channelId).catch(() => null);
  if (!channel) return;

  const configuredEmbed = permanent.embeds?.[0] || null;
  const embed = configuredEmbed
    ? new EmbedBuilder()
      .setTitle(configuredEmbed.title || "Support Wachtkamer")
      .setDescription(configuredEmbed.description || null)
      .setFields(configuredEmbed.fields || [])
      .setColor("#FEE75C")
    : new EmbedBuilder()
      .setTitle("Support Wachtkamer")
      .setDescription((permanent.content || "").replace(/^Support Wachtkamer\n?/i, ""))
      .setColor("#FEE75C");

  const messagePayload = {
    content: permanent.content || "",
    embeds: [embed]
  };

  const key = "supportWachtkamer";
  const saved = store.permanentMessages[key];

  if (saved?.channelId === permanent.channelId && saved?.messageId) {
    const existing = await channel.messages.fetch(saved.messageId).catch(() => null);
    if (existing) {
      await existing.edit(messagePayload).catch(() => null);
      return;
    }
  }

  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const fallbackExisting = recent
    ? recent.find((msg) => msg.author?.bot && msg.embeds?.[0]?.title === embed.data.title)
    : null;

  if (fallbackExisting) {
    await fallbackExisting.edit(messagePayload).catch(() => null);
    store.permanentMessages[key] = { channelId: permanent.channelId, messageId: fallbackExisting.id };
    await savePanels(store);
    return;
  }

  const sent = await channel.send(messagePayload).catch(() => null);
  if (!sent) return;

  store.permanentMessages[key] = { channelId: permanent.channelId, messageId: sent.id };
  await savePanels(store);
};
