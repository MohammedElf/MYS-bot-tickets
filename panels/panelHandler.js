const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { loadPanels, savePanels } = require("../handlers/helpers");

function styleFromString(s) {
  switch ((s || "").toLowerCase()) {
    case "secondary": return ButtonStyle.Secondary;
    case "success": return ButtonStyle.Success;
    case "danger": return ButtonStyle.Danger;
    default: return ButtonStyle.Primary;
  }
}

module.exports.upsertPanels = async (client, config) => {
  const store = loadPanels();
  const panels = config.panels || {};

  for (const key of Object.keys(panels)) {
    const p = panels[key];
    const channel = await client.channels.fetch(p.channelId).catch(() => null);
    if (!channel) continue;

    const embed = new EmbedBuilder()
      .setTitle(p.title || key)
      .setDescription(p.description || "Klik op de knop hieronder om een ticket aan te maken.")
      .setColor("#0099ff");

    const btns = (p.buttons || []).slice(0, 5).map(b =>
      new ButtonBuilder()
        .setCustomId(b.customId)
        .setLabel(b.label)
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

    const sent = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (sent) {
      store.panels[key] = { channelId: p.channelId, messageId: sent.id };
      savePanels(store);
    }
  }
};
