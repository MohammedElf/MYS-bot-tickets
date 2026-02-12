const {
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");

const { loadTickets, saveTickets, nextTicketId } = require("./helpers");

function nowMs() { return Date.now(); }

function safeName(s) {
  return (s || "user")
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "")
    .slice(0, 16) || "user";
}

function staffRoleFor(config, ticketType) {
  if (ticketType === "scenario") return config.staffRolesByPanel?.support || null;
  // some panel keys differ from ticketType; for now they match
  return config.staffRolesByPanel?.[ticketType] || null;
}

async function buildTranscript(channel, limit = 200) {
  const maxMessages = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const all = [];
  let before;

  while (all.length < maxMessages) {
    const batchSize = Math.min(100, maxMessages - all.length);
    const fetched = await channel.messages.fetch({ limit: batchSize, before }).catch(() => null);
    if (!fetched) {
      return all.length
        ? all
            .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
            .map(m => {
              const ts = new Date(m.createdTimestamp).toLocaleString("nl-NL");
              const author = m.author?.tag || "unknown";
              const content = m.content || "";
              const att = m.attachments?.size ? ` [bijlagen: ${m.attachments.map(a => a.url).join(", ")}]` : "";
              return `[${ts}] ${author}: ${content}${att}`;
            })
            .join("\n")
        : "Geen transcript beschikbaar (fetch error).";
    }

    const page = Array.from(fetched.values());
    if (!page.length) break;

    all.push(...page);
    before = page[page.length - 1].id;

    if (page.length < batchSize) break;
  }

  const msgs = all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  if (!msgs.length) return "Geen transcript beschikbaar.";

  const lines = msgs.map(m => {
    const ts = new Date(m.createdTimestamp).toLocaleString("nl-NL");
    const author = m.author?.tag || "unknown";
    const content = m.content || "";
    const att = m.attachments?.size ? ` [bijlagen: ${m.attachments.map(a => a.url).join(", ")}]` : "";
    return `[${ts}] ${author}: ${content}${att}`;
  });
  return lines.join("\n");
}

function joinEmbed(ticket) {
  return new EmbedBuilder()
    .setTitle("Join Ticket")
    .setDescription("Er is een ticket geopend. Klik op de knop hieronder om mee te kijken.")
    .addFields(
      { name: "Opened By", value: `<@${ticket.openedBy}>`, inline: true },
      { name: "Panel", value: ticket.panelName, inline: true },
      { name: "Staff In Ticket", value: `${(ticket.staffInTicket || []).length}`, inline: true },
      { name: "Staff Members", value: (ticket.staffInTicket?.length ? ticket.staffInTicket.map(id => `<@${id}>`).join(" ") : "Geen"), inline: false }
    )
    .setFooter({ text: `Ticket ID: ${ticket.ticketId}` });
}

async function upsertJoinLogMessage(client, config, ticketChannel, ticket) {
  const logCh = await client.channels.fetch(config.joinLogChannel).catch(() => null);
  if (!logCh) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_ticket:${ticketChannel.id}`)
      .setLabel("Join Ticket")
      .setEmoji("👀")
      .setStyle(ButtonStyle.Success)
  );

  if (ticket.joinLogMessageId) {
    const msg = await logCh.messages.fetch(ticket.joinLogMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [joinEmbed(ticket)], components: [row] }).catch(() => null);
      return;
    }
  }

  const sent = await logCh.send({ embeds: [joinEmbed(ticket)], components: [row] }).catch(() => null);
  if (sent) ticket.joinLogMessageId = sent.id;
}

module.exports.syncOpenTickets = async (client, config) => {
  const store = loadTickets();
  let changed = false;

  for (const channelId of Object.keys(store.openTickets || {})) {
    const ticket = store.openTickets[channelId];
    const ticketChannel = await client.channels.fetch(channelId).catch(() => null);
    if (!ticketChannel) continue;

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket").setLabel("Sluit Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
    );

    if (ticket.firstMessageId) {
      const firstMsg = await ticketChannel.messages.fetch(ticket.firstMessageId).catch(() => null);
      if (firstMsg) {
        await firstMsg.edit({ components: [closeRow] }).catch(() => null);
      }
    }

    await upsertJoinLogMessage(client, config, ticketChannel, ticket);

    if (ticket.joinLogMessageId) {
      store.openTickets[channelId] = ticket;
      changed = true;
    }
  }

  if (changed) saveTickets(store);
};

async function sendCloseLog(client, config, ticket, closedBy, reason) {
  const logCh = await client.channels.fetch(config.transcriptLogChannel).catch(() => null);
  if (!logCh) return;

  const openedAt = new Date(ticket.openedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const closedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

  const embed = new EmbedBuilder()
    .setTitle("Ticket Closed")
    .addFields(
      { name: "Ticket ID", value: `${ticket.ticketId}`, inline: true },
      { name: "Opened By", value: `<@${ticket.openedBy}>`, inline: true },
      { name: "Closed By", value: `<@${closedBy}>`, inline: true },
      { name: "Open Time", value: openedAt, inline: true },
      { name: "Claimed By", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Not claimed", inline: true },
      { name: "Reason", value: reason || "No reason specified", inline: false },
      { name: "Closed At", value: closedAt, inline: true }
    );

  await logCh.send({ embeds: [embed] }).catch(() => null);
}

async function closeTicket(client, config, channel, closerId, reason) {
  const store = loadTickets();
  const ticket = store.openTickets[channel.id];
  if (!ticket) return { ok: false, msg: "Dit kanaal is geen ticket." };

  const transcriptText = await buildTranscript(channel, 200);
  const filename = `transcript-${ticket.ticketId}.txt`;
  const attachment = new AttachmentBuilder(Buffer.from(transcriptText, "utf8"), { name: filename });

  // DM opener
  const opener = await client.users.fetch(ticket.openedBy).catch(() => null);
  if (opener) {
    await opener.send({ content: `📄 Transcript van jouw ticket (ID: ${ticket.ticketId})`, files: [attachment] }).catch(() => null);
  }

  // Send transcript to log channel
  const logCh = await client.channels.fetch(config.transcriptLogChannel).catch(() => null);
  if (logCh) {
    await logCh.send({ content: `📄 Transcript ticket ID: ${ticket.ticketId}`, files: [attachment] }).catch(() => null);
  }

  await sendCloseLog(client, config, ticket, closerId, reason || "No reason specified");

  // archive
  ticket.closedAt = nowMs();
  ticket.closedBy = closerId;
  ticket.closeReason = reason || "No reason specified";
  ticket.transcript = transcriptText.slice(0, 150000); // prevent huge file in json
  store.closedTickets[String(ticket.ticketId)] = ticket;

  delete store.openTickets[channel.id];
  saveTickets(store);

  // try delete channel
  await channel.delete().catch(() => null);

  return { ok: true };
}

module.exports._closeTicket = closeTicket;

module.exports.attach = (client, config) => {

  client.on("interactionCreate", async (interaction) => {
    // BUTTONS
    if (interaction.isButton()) {

      // Join Ticket button (log channel)
      if (interaction.customId.startsWith("join_ticket:")) {
        const channelId = interaction.customId.split(":")[1];
        const ticketChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!ticketChannel) return interaction.reply({ content: "Ticket kanaal niet gevonden.", ephemeral: true });

        await ticketChannel.permissionOverwrites.edit(interaction.user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch(() => null);

        const store = loadTickets();
        const t = store.openTickets[channelId];
        if (t) {
          t.staffInTicket = Array.from(new Set([...(t.staffInTicket || []), interaction.user.id]));
          store.openTickets[channelId] = t;
          saveTickets(store);
          await upsertJoinLogMessage(client, config, ticketChannel, t);
        }

        return interaction.reply({ content: `Je bent toegevoegd aan ${ticketChannel}.`, ephemeral: true });
      }

      // Close confirm flow (button in ticket)
      if (interaction.customId === "close_ticket") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`confirm_close:${interaction.channel.id}`).setLabel("Ja, sluit ticket").setEmoji("✅").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`cancel_close:${interaction.channel.id}`).setLabel("Annuleren").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ content: "Weet je zeker dat je dit ticket wilt sluiten?", components: [row], ephemeral: true });
      }

      if (interaction.customId.startsWith("cancel_close:")) {
        return interaction.update({ content: "Sluiten geannuleerd.", components: [] });
      }

      if (interaction.customId.startsWith("confirm_close:")) {
        const channelId = interaction.customId.split(":")[1];
        if (interaction.channel.id !== channelId) return interaction.reply({ content: "Onjuiste actie.", ephemeral: true });

        await interaction.update({ content: "Ticket wordt gesloten...", components: [] }).catch(() => null);
        await closeTicket(client, config, interaction.channel, interaction.user.id, "No reason specified");
        return;
      }

      // Create ticket from panel buttons
      if (interaction.customId.startsWith("create:")) {
        const ticketType = interaction.customId.split(":")[1]; // e.g. support, scenario, vergoedingen...

        // Find panel metadata
        const panels = config.panels || {};
        let panelKey = Object.keys(panels).find(k => (panels[k].buttons || []).some(b => b.customId === interaction.customId));
        if (!panelKey) panelKey = ticketType; // fallback

        const panelName = panels[panelKey]?.title || panelKey;

        const store = loadTickets();

        // duplicate prevention: one open per user per ticketType
        const dup = Object.values(store.openTickets).find(t => t.openedBy === interaction.user.id && t.ticketType === ticketType);
        if (dup) {
          const ch = interaction.guild.channels.cache.get(dup.channelId);
          return interaction.reply({ content: `Je hebt al een open ticket: ${ch || "ticket"}`, ephemeral: true });
        }

        const ticketId = nextTicketId(store);
        const staffRoleId = staffRoleFor(config, ticketType);

        const overwrites = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
        ];

        if (staffRoleId) {
          overwrites.push({
            id: staffRoleId,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
          });
        }

        const channelName = `${ticketType}-${safeName(interaction.user.username)}-${ticketId}`;

        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: config.ticketCategory,
          permissionOverwrites: overwrites
        });

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("close_ticket").setLabel("Sluit Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
        );

        const firstMsg = await ticketChannel.send({
          content: `Welkom <@${interaction.user.id}>, beschrijf hier je aanvraag.\n\n**Ticket ID:** ${ticketId}\n**Type:** ${ticketType}`,
          components: [closeRow]
        }).catch(() => null);

        const ticketData = {
          ticketId,
          channelId: ticketChannel.id,
          openedBy: interaction.user.id,
          openedAt: nowMs(),
          ticketType,
          panelKey,
          panelName,
          staffRoleId: staffRoleId || null,
          staffInTicket: [],
          claimedBy: null,
          firstMessageId: firstMsg?.id || null,
          joinLogMessageId: null,
          extraRoles: []
        };

        store.openTickets[ticketChannel.id] = ticketData;
        saveTickets(store);

        await upsertJoinLogMessage(client, config, ticketChannel, ticketData);

        return interaction.reply({ content: `Je ticket is aangemaakt: ${ticketChannel}`, ephemeral: true });
      }
    }
  });
};
