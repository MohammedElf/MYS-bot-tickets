const fs = require("fs");
const path = require("path");

const STORE_TICKETS = path.join(__dirname, "..", "storage", "tickets.json");
const STORE_PANELS = path.join(__dirname, "..", "storage", "panels.json");

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function loadTickets() {
  return loadJson(STORE_TICKETS, { nextTicketId: 1000, openTickets: {}, closedTickets: {} });
}
function saveTickets(data) { saveJson(STORE_TICKETS, data); }

function loadPanels() { return loadJson(STORE_PANELS, { panels: {} }); }
function savePanels(data) { saveJson(STORE_PANELS, data); }

function nextTicketId(store) {
  store.nextTicketId = (store.nextTicketId || 1000) + 1;
  return store.nextTicketId;
}

module.exports = { loadTickets, saveTickets, loadPanels, savePanels, nextTicketId };
