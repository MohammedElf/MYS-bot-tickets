# MYS Ticket Bot

Een uitgebreide Discord ticketbot met panelen, geautomatiseerde ticketkanalen, transcripts, logs en staff-workflows.

## Installatie
1. Plaats de botbestanden in een map, bijvoorbeeld: `C:\discord-bot\bot-tickets`.
2. Installeer dependencies:
   - `npm install`
3. Vul je bot-token in `config.json` in (of via `.env` met `DISCORD_TOKEN`).
4. Start de bot:
   - `node index.js`

## Starten met PM2 (aanbevolen)
- `pm2 start index.js --name mys-ticket-bot`
- `pm2 save`

## Benodigde intents
Standaard gebruikt de bot alleen niet-privileged intents, zodat hij ook start als privileged intents niet geactiveerd zijn.

Optionele privileged intents via `.env`:
- `ENABLE_GUILD_MEMBERS_INTENT=true` (nodig voor welkomstberichten via `guildMemberAdd`)
- `ENABLE_MESSAGE_CONTENT_INTENT=true` (alleen nodig als je later message-content events toevoegt)

Als je deze flags aanzet, zorg dan dat dezelfde intents ook in de Discord Developer Portal aanstaan.

## Wat deze bot doet

### 1) Ticketpanelen beheren
- Plaatst of updatet panel-embeds automatisch op startup.
- Voorkomt panel-spam door bestaande panelberichten te bewerken i.p.v. steeds nieuwe te sturen.
- Leest panelinstellingen uit `config.json` (`panels`).

### 2) Tickets aanmaken via knoppen
- Gebruikers openen tickets via panelknoppen.
- Bot maakt een ticketkanaal met correcte rechten voor:
  - ticket-opener
  - staffrol van dat panel (`staffRolesByPanel`)
  - extra rollen (indien toegevoegd via commando)
- Ondersteunt vaste categorie (`ticketCategory`) of automatische categorieën per type/prefix.

### 3) Claim- en staffworkflow
- Staff kan tickets claimen/unclaimen en overdragen.
- Join-log bericht wordt bijgewerkt met:
  - wie het ticket opende
  - panelnaam
  - staffleden die in ticket zitten
- Staff kan via een Join-knop direct toegang krijgen tot een ticket.

### 4) Ticket sluiten + transcript + logging
- Ticket kan direct worden gesloten of via sluitverzoek met delay/goedkeuring.
- Bij sluiten:
  - transcript wordt gegenereerd
  - transcript wordt naar ticket-opener (DM) gestuurd
  - transcript wordt in transcript-log kanaal geplaatst
  - close-log embed met metadata wordt verstuurd
  - ticket wordt gearchiveerd in MySQL (fallback: `storage/tickets.json`)

### 5) Ticketbeheer en hulpmiddelen
- Ticket hernoemen.
- Gebruikers toevoegen/verwijderen op rechtenniveau.
- Wisselen van panel/type in bestaand ticket (inclusief rolrechten-update).
- Ticket opnieuw openen op basis van eerder gesloten ticket-ID.
- Snelle knop om naar eerste ticketbericht te springen.
- Admin-overzicht van alle open tickets in een overzichtskanaal.

### 6) Overige functies
- Plaatsen van mededelingen in een vast mededelingenkanaal (met rolcontrole).
- Welkomstbericht bij server join (`guildMemberAdd`).
- Permanent wachtkamerbericht upserten.

## Slash commands (Nederlands)
- `/toevoegen gebruiker`
- `/verwijderen gebruiker`
- `/hernoemen naam`
- `/claimen`
- `/unclaimen`
- `/sluiten reden`
- `/sluitverzoek close_delay reden`
- `/naarboven`
- `/overdragen gebruiker`
- `/wisselpaneel naar_paneel`
- `/heropenen ticket_id`
- `/support-rol-toevoegen rol` (alleen voor rol: `config.managerRoleForAdd`)
- `/plaats-mededeling bericht`
- `/tickets-overzicht`

## Belangrijke configuratie (`config.json`)
- `token`
- `ticketCategory`
- `ticketCategoryPrefix`
- `ticketCategoriesByType`
- `staffRolesByPanel`
- `joinLogChannel`
- `transcriptLogChannel`
- `managerRoleForAdd`
- `addRoleChoices`
- `announcementAllowedRoleIds`
- `announcementChannelId`
- `overviewChannelId`
- `panels`
- `permanentSupportMessage`

## Data-opslag
Standaard gebruikt de bot nu MySQL (geschikt voor XAMPP/phpMyAdmin).

- Database: `bot_tickets_live` (of wat je zet in `DB_NAME`)
- Tabel: `app_state`
  - sleutel `tickets`: open tickets, gesloten tickets, close requests, next ticket ID
  - sleutel `panels`: panel message IDs + permanente message IDs

Je hoeft normaal **geen tabel handmatig** te maken: de bot maakt `app_state` automatisch aan bij startup.
Als je DB `bot_tickets_live` nog niet bestaat, probeert de bot die ook automatisch aan te maken.

Als MySQL niet bereikbaar is, valt de bot automatisch terug op:
- `storage/tickets.json`
- `storage/panels.json`

### Database omgeving variabelen
Zet deze in je `.env` (of als system env vars):
- `DB_HOST=127.0.0.1`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD=`
- `DB_NAME=bot_tickets_live`

Optioneel:
- `STORAGE_MODE=json` om MySQL uit te zetten en altijd JSON te gebruiken.

### Handmatig aanmaken in phpMyAdmin (optioneel)
Als je het liever zelf doet, kun je deze SQL uitvoeren:

```sql
CREATE DATABASE IF NOT EXISTS `bot_tickets_live`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `bot_tickets_live`;

CREATE TABLE IF NOT EXISTS `app_state` (
  `state_key` VARCHAR(64) NOT NULL,
  `state_value` LONGTEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`state_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Tip
Na het aanpassen van commandonamen of beschrijvingen: herstart de bot zodat guild slash commands opnieuw worden geregistreerd.
