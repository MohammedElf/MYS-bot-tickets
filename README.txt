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
Zet in de Discord Developer Portal deze intents aan:
- Server Members Intent
- Message Content Intent

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
  - ticket wordt gearchiveerd in `storage/tickets.json`

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
- `storage/tickets.json`
  - open tickets
  - gesloten tickets
  - close request status
- `storage/panels.json`
  - panel message IDs
  - permanent message IDs

## Tip
Na het aanpassen van commandonamen of beschrijvingen: herstart de bot zodat guild slash commands opnieuw worden geregistreerd.
