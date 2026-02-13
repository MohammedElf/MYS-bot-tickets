const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { loadTickets, saveTickets } = require("./helpers");
const ticketHandler = require("./ticketHandler");

function memberHasRole(member, roleId) {
  return !!member?.roles?.cache?.has(roleId);
}

function memberHasAnyRole(member, roleIds = []) {
  return roleIds.some((roleId) => memberHasRole(member, roleId));
}

function ticketFromChannel(store, channelId) {
  return store.openTickets[channelId] || null;
}

function formatOpenTicketsOverview(store, guildId) {
  const openTickets = Object.entries(store.openTickets || {})
    .map(([channelId, ticket]) => ({ channelId, ...ticket }))
    .sort((a, b) => (a.openedAt || 0) - (b.openedAt || 0));

  if (!openTickets.length) {
    return "📋 **Openstaande tickets**\nEr staan momenteel geen open tickets.";
  }

  const lines = openTickets.map((ticket, index) => {
    const openedBy = ticket.openedBy ? `<@${ticket.openedBy}>` : "Onbekend";
    const claimedBy = ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Niet geclaimd";
    const panelName = ticket.panelName || ticket.ticketType || "Onbekend";
    const createdAt = ticket.openedAt ? `<t:${Math.floor(ticket.openedAt / 1000)}:R>` : "Onbekend";
    const jumpUrl = `https://discord.com/channels/${guildId}/${ticket.channelId}`;

    return `${index + 1}. [#${ticket.channelName || ticket.channelId}](${jumpUrl}) • ID: **${ticket.ticketId || "?"}** • Panel: **${panelName}** • Opened by: ${openedBy} • Claimed: ${claimedBy} • Geopend: ${createdAt}`;
  });

  return [
    `📋 **Openstaande tickets (${openTickets.length})**`,
    "",
    ...lines
  ].join("\n");
}

async function updateJoinLog(client, config, guild, ticketChannelId) {
  const store = loadTickets();
  const t = store.openTickets[ticketChannelId];
  if (!t) return;
  const ch = await guild.channels.fetch(ticketChannelId).catch(() => null);
  if (!ch) return;
  // reuse internal helper via fake button press? simplest: re-send embed update
  const logCh = await client.channels.fetch(config.joinLogChannel).catch(() => null);
  if (!logCh || !t.joinLogMessageId) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join_ticket:${ticketChannelId}`).setLabel("Join Ticket").setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setTitle("Join Ticket")
    .setDescription("Er is een ticket geopend. Klik op de knop hieronder om mee te kijken.")
    .addFields(
      { name: "Opened By", value: `<@${t.openedBy}>`, inline: true },
      { name: "Panel", value: t.panelName, inline: true },
      { name: "Staff In Ticket", value: `${(t.staffInTicket || []).length}`, inline: true },
      { name: "Staff Members", value: (t.staffInTicket?.length ? t.staffInTicket.map(id => `<@${id}>`).join(" ") : "Geen"), inline: false }
    )
    .setFooter({ text: `Ticket ID: ${t.ticketId}` });

  const msg = await logCh.messages.fetch(t.joinLogMessageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [embed], components: [row] }).catch(() => null);
}

module.exports.registerGuildCommands = async (client, config) => {
  const choices = (config.addRoleChoices || []).slice(0, 25);

  const commands = [
    {
      name: "support-rol-toevoegen",
      description: "Voeg een staff/support rol toe aan het huidige ticket kanaal",
      options: [{ name: "rol", description: "Welke rol wil je toevoegen?", type: 3, required: true, choices }]
    },
    { name: "toevoegen", description: "Voeg een gebruiker toe aan dit ticket", options: [{ name: "gebruiker", description: "Gebruiker", type: 6, required: true }] },
    { name: "verwijderen", description: "Verwijder een gebruiker uit dit ticket", options: [{ name: "gebruiker", description: "Gebruiker", type: 6, required: true }] },
    { name: "hernoemen", description: "Hernoem dit ticket", options: [{ name: "naam", description: "Nieuwe ticket naam", type: 3, required: true }] },
    { name: "claimen", description: "Claim dit ticket (wijs jezelf toe)" },
    { name: "unclaimen", description: "Verwijder de claim op dit ticket" },
    { name: "overdragen", description: "Draag een geclaimd ticket over", options: [{ name: "gebruiker", description: "Nieuwe claimer", type: 6, required: true }] },
    { name: "sluiten", description: "Sluit dit ticket", options: [{ name: "reden", description: "Reden", type: 3, required: false }] },
    { name: "sluitverzoek", description: "Vraag opener om sluiting goed te keuren", options: [
      { name: "close_delay", description: "Delay in seconden (0-3600)", type: 4, required: true },
      { name: "reden", description: "Reden", type: 3, required: false }
    ]},
    { name: "naarboven", description: "Toon een knop om naar de eerste bot-post te springen" },
    { name: "wisselpaneel", description: "Verander panel/type van dit ticket", options: [{ name: "naar_paneel", description: "Nieuwe panel key (bv: support, vergoedingen, unban, gang, staff)", type: 3, required: true }] },
    { name: "heropenen", description: "Heropen een eerder gesloten ticket-ID", options: [{ name: "ticket_id", description: "Ticket ID", type: 4, required: true }] },
    { name: "plaats-mededeling", description: "Plaats een mededeling in het mededelingen kanaal", options: [{ name: "bericht", description: "Het bericht dat je wilt plaatsen", type: 3, required: true }] },
    { name: "tickets-overzicht", description: "Plaats een overzicht van alle open tickets in het admin kanaal" }
  ];

  const guilds = await client.guilds.fetch();
  for (const [guildId] of guilds) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    for (const cmd of commands) {
      await guild.commands.create(cmd).catch(() => null);
    }
  }
};

module.exports.attach = (client, config) => {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const store = loadTickets();
    const t = ticketFromChannel(store, interaction.channel.id);

    // Commands below mostly require being in ticket
    const needsTicket = ["support-rol-toevoegen","toevoegen","verwijderen","hernoemen","claimen","unclaimen","overdragen","sluiten","sluitverzoek","naarboven","wisselpaneel"];
    if (needsTicket.includes(interaction.commandName) && !t) {
      return interaction.reply({ content: "Dit kanaal is geen ticket kanaal.", ephemeral: true });
    }

    // /support-rol-toevoegen
    if (interaction.commandName === "support-rol-toevoegen") {
      if (!memberHasRole(interaction.member, config.managerRoleForAdd)) {
        return interaction.reply({ content: "Je hebt geen rechten om dit te doen.", ephemeral: true });
      }

      const roleId = interaction.options.getString("rol", true);
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: "Rol niet gevonden.", ephemeral: true });

      await interaction.channel.permissionOverwrites.edit(roleId, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
      }).catch(() => null);

      t.extraRoles = Array.from(new Set([...(t.extraRoles || []), roleId]));
      store.openTickets[interaction.channel.id] = t;
      saveTickets(store);

      return interaction.reply({ content: `Rol toegevoegd: <@&${roleId}>`, ephemeral: true });
    }

    // /toevoegen
    if (interaction.commandName === "toevoegen") {
      const user = interaction.options.getUser("gebruiker", true);
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
      }).catch(() => null);
      return interaction.reply({ content: `Gebruiker toegevoegd: <@${user.id}>`, ephemeral: true });
    }

    // /verwijderen
    if (interaction.commandName === "verwijderen") {
      const user = interaction.options.getUser("gebruiker", true);
      await interaction.channel.permissionOverwrites.delete(user.id).catch(() => null);
      return interaction.reply({ content: `Gebruiker verwijderd: <@${user.id}>`, ephemeral: true });
    }

    // /hernoemen
    if (interaction.commandName === "hernoemen") {
      const name = interaction.options.getString("naam", true);
      await interaction.channel.setName(name).catch(() => null);
      return interaction.reply({ content: "Ticket hernoemd.", ephemeral: true });
    }

    // /claimen
    if (interaction.commandName === "claimen") {
      t.claimedBy = interaction.user.id;
      // ensure claimer has access
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
      }).catch(() => null);

      // add to staff in ticket list
      t.staffInTicket = Array.from(new Set([...(t.staffInTicket || []), interaction.user.id]));
      store.openTickets[interaction.channel.id] = t;
      saveTickets(store);

      await updateJoinLog(client, config, interaction.guild, interaction.channel.id);
      return interaction.reply({ content: `Ticket geclaimd door <@${interaction.user.id}>.`, ephemeral: false });
    }

    // /unclaimen
    if (interaction.commandName === "unclaimen") {
      t.claimedBy = null;
      store.openTickets[interaction.channel.id] = t;
      saveTickets(store);
      return interaction.reply({ content: "Claim verwijderd.", ephemeral: true });
    }

    // /overdragen
    if (interaction.commandName === "overdragen") {
      const user = interaction.options.getUser("gebruiker", true);
      t.claimedBy = user.id;
      t.staffInTicket = Array.from(new Set([...(t.staffInTicket || []), user.id]));
      store.openTickets[interaction.channel.id] = t;
      saveTickets(store);

      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
      }).catch(() => null);

      await updateJoinLog(client, config, interaction.guild, interaction.channel.id);
      return interaction.reply({ content: `Ticket overgedragen aan <@${user.id}>.`, ephemeral: false });
    }

    // /sluiten
    if (interaction.commandName === "sluiten") {
      const reason = interaction.options.getString("reden") || "No reason specified";
      await interaction.reply({ content: "Ticket wordt gesloten...", ephemeral: true }).catch(() => null);
      await ticketHandler._closeTicket(client, config, interaction.channel, interaction.user.id, reason);
      return;
    }

    // /sluitverzoek
    if (interaction.commandName === "sluitverzoek") {
      const delay = Math.max(0, Math.min(3600, interaction.options.getInteger("close_delay", true)));
      const reason = interaction.options.getString("reden") || "No reason specified";

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cr_yes:${interaction.channel.id}:${interaction.user.id}:${delay}`).setLabel("Goedkeuren").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cr_no:${interaction.channel.id}:${interaction.user.id}`).setLabel("Weigeren").setStyle(ButtonStyle.Danger)
      );

      await interaction.channel.send({
        content: `<@${t.openedBy}> wil staff dit ticket sluiten?\n**Reden:** ${reason}\nKlik op een knop hieronder.`,
        components: [row]
      }).catch(() => null);

      // store pending request
      t.closeRequest = { requestedBy: interaction.user.id, reason, delay, createdAt: Date.now(), status: "pending" };
      store.openTickets[interaction.channel.id] = t;
      saveTickets(store);

      return interaction.reply({ content: "Sluitverzoek verstuurd.", ephemeral: true });
    }

    // /naarboven
    if (interaction.commandName === "naarboven") {
      if (!t.firstMessageId) return interaction.reply({ content: "Geen startbericht gevonden.", ephemeral: true });

      const url = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${t.firstMessageId}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Ga naar boven").setStyle(ButtonStyle.Link).setURL(url)
      );
      return interaction.reply({ content: "Klik om naar het begin van het ticket te gaan:", components: [row], ephemeral: true });
    }

    // /wisselpaneel
    if (interaction.commandName === "wisselpaneel") {
      const toPanel = interaction.options.getString("naar_paneel", true);
      const panels = config.panels || {};
      if (!panels[toPanel] && toPanel !== "scenario") {
        return interaction.reply({ content: "Onbekend panel. Gebruik bv: support, vergoedingen, unban, gang, staff, donaties, overheid, contentcreator, makelaar", ephemeral: true });
      }

      t.ticketType = toPanel;
      t.panelKey = (toPanel === "scenario") ? "support" : toPanel;
      t.panelName = panels[t.panelKey]?.title || t.panelKey;

      // update staff role access
      const newStaffRole = (toPanel === "scenario") ? config.staffRolesByPanel?.support : config.staffRolesByPanel?.[toPanel];
      if (newStaffRole && newStaffRole !== t.staffRoleId) {
        // remove old staff role overwrite if any
        if (t.staffRoleId) {
          await interaction.channel.permissionOverwrites.delete(t.staffRoleId).catch(() => null);
        }
        await interaction.channel.permissionOverwrites.edit(newStaffRole, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true
        }).catch(() => null);
        t.staffRoleId = newStaffRole;
      }

      // rename to reflect type (keep id at end if possible)
      const current = interaction.channel.name;
      const m = current.match(/-(\d+)$/);
      const idSuffix = m ? m[1] : "";
      const newName = idSuffix ? `${toPanel}-${idSuffix}` : `${toPanel}-${Date.now()}`;
      await interaction.channel.setName(newName).catch(() => null);

      store.openTickets[interaction.channel.id] = t;
      saveTickets(store);

      await updateJoinLog(client, config, interaction.guild, interaction.channel.id);
      return interaction.reply({ content: `Ticket is omgezet naar panel: ${toPanel}`, ephemeral: true });
    }


    // /plaats-mededeling
    if (interaction.commandName === "plaats-mededeling") {
      const allowedRoleIds = config.announcementAllowedRoleIds || [];
      if (!memberHasAnyRole(interaction.member, allowedRoleIds)) {
        return interaction.reply({ content: "Je hebt geen rechten om dit te doen.", ephemeral: true });
      }

      const announcementChannelId = config.announcementChannelId;
      const announcementChannel = announcementChannelId
        ? await interaction.guild.channels.fetch(announcementChannelId).catch(() => null)
        : null;

      if (!announcementChannel) {
        return interaction.reply({ content: "Mededelingen kanaal niet gevonden.", ephemeral: true });
      }

      const bericht = interaction.options.getString("bericht", true);
      const embed = new EmbedBuilder()
        .setTitle("📢 Mededeling")
        .setDescription(bericht)
        .setColor("#FEE75C")
        .setTimestamp();

      await announcementChannel.send({ content: "@everyone", embeds: [embed] }).catch(() => null);

      return interaction.reply({ content: `Mededeling geplaatst in <#${announcementChannel.id}>.`, ephemeral: true });
    }

    // /tickets-overzicht
    if (interaction.commandName === "tickets-overzicht") {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "Alleen admins kunnen dit overzicht plaatsen.", ephemeral: true });
      }

      const overviewChannelId = "1471786667877597300";
      const overviewChannel = await interaction.guild.channels.fetch(overviewChannelId).catch(() => null);
      if (!overviewChannel || !overviewChannel.isTextBased()) {
        return interaction.reply({ content: "Overzicht kanaal niet gevonden of niet tekst-gebaseerd.", ephemeral: true });
      }

      const message = formatOpenTicketsOverview(store, interaction.guild.id);
      await overviewChannel.send({ content: message }).catch(() => null);

      return interaction.reply({ content: `Overzicht geplaatst in <#${overviewChannel.id}>.`, ephemeral: true });
    }

    // /heropenen
    if (interaction.commandName === "heropenen") {
      const ticketId = interaction.options.getInteger("ticket_id", true);
      const closed = store.closedTickets[String(ticketId)];
      if (!closed) return interaction.reply({ content: "Ticket ID niet gevonden in gesloten tickets.", ephemeral: true });

      // create a new channel with similar permissions
      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: closed.openedBy, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
      ];
      if (closed.staffRoleId) {
        overwrites.push({ id: closed.staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
      }
      for (const r of (closed.extraRoles || [])) {
        overwrites.push({ id: r, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
      }

      const ch = await interaction.guild.channels.create({
        name: `reopen-${ticketId}`,
        type: 0, // GuildText
        parent: config.ticketCategory,
        permissionOverwrites: overwrites
      });

      await ch.send(`🔓 Ticket heropend (ID: ${ticketId}).\nOorspronkelijke reden sluiting: **${closed.closeReason || "Onbekend"}**`).catch(() => null);

      // move to open tickets again (new ticketId or keep?) keep same for trace
      const newT = { ...closed, channelId: ch.id, reopenedAt: Date.now(), staffInTicket: closed.staffInTicket || [] };
      store.openTickets[ch.id] = newT;
      delete store.closedTickets[String(ticketId)];
      saveTickets(store);

      await updateJoinLog(client, config, interaction.guild, ch.id).catch(() => null);
      return interaction.reply({ content: `Ticket heropend: ${ch}`, ephemeral: true });
    }
  });

  // close request buttons
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    // close request approve/deny
    if (interaction.customId.startsWith("cr_yes:") || interaction.customId.startsWith("cr_no:")) {
      const parts = interaction.customId.split(":");
      const action = parts[0]; // cr_yes or cr_no
      const channelId = parts[1];
      const requesterId = parts[2];
      const delay = action === "cr_yes" ? parseInt(parts[3] || "0", 10) : 0;

      const store = loadTickets();
      const t = store.openTickets[channelId];
      if (!t) return interaction.reply({ content: "Ticket niet gevonden.", ephemeral: true });

      // Only opener can decide
      if (interaction.user.id !== t.openedBy) {
        return interaction.reply({ content: "Alleen de ticket opener kan dit goedkeuren/weigeren.", ephemeral: true });
      }

      if (action === "cr_no") {
        t.closeRequest = { ...(t.closeRequest || {}), status: "denied", decidedAt: Date.now(), decidedBy: interaction.user.id };
        store.openTickets[channelId] = t;
        saveTickets(store);
        await interaction.update({ content: "Sluitverzoek geweigerd.", components: [] }).catch(() => null);
        return;
      }

      // approve
      t.closeRequest = { ...(t.closeRequest || {}), status: "approved", decidedAt: Date.now(), decidedBy: interaction.user.id };
      store.openTickets[channelId] = t;
      saveTickets(store);

      await interaction.update({ content: `Sluitverzoek goedgekeurd. Ticket sluit over ${delay} seconden...`, components: [] }).catch(() => null);

      setTimeout(async () => {
        const ch = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!ch) return;
        await ticketHandler._closeTicket(client, config, ch, requesterId, t.closeRequest?.reason || "No reason specified").catch(() => null);
      }, delay * 1000);

      return;
    }
  });
};
