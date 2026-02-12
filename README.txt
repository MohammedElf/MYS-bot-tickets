\
# bot-tickets-advanced v4 (PROD)

## Installeren
1) Pak deze ZIP uit naar: `C:\discord-bot\bot-tickets`
2) Run in die map:
   - `npm install`
3) Open `config.json` en zet je token:
   - `"token": "..."`

## Starten met PM2
- `pm2 start index.js --name bot-tickets`
- `pm2 save`

## Wat doet deze bot?
- Stuurt/Update ticket panels (anti panel-spam: edit i.p.v. nieuwe posts)
- Tickets onder categorie (config.ticketCategory)
- Staff rol per panel (config.staffRolesByPanel)
- Join-log (config.joinLogChannel) met Join-knop + staff list update
- Sluiten met bevestiging + transcript naar opener (DM) + transcript kanaal (config.transcriptLogChannel)
- Close-log embed met Ticket ID / Opened By / Closed By / Open Time / Claimed By / Reason


Zoo Koel!   KACHE

 
## Commands (NL)
- /add gebruiker
- /remove gebruiker
- /rename nieuwe_ticket_naam
- /claim
- /unclaim
- /close reden
- /closerequest close_delay reden
- /jumptotop
- /transfer gebruiker
- /switchpanel to_panel
- /reopen ticket_id
- /support-rol-toevoegen rol  (alleen rol: config.managerRoleForAdd)

## Let op
- Message Content Intent moet aan staan in Discord Developer Portal voor deze bot.
