const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const STORE_TICKETS = path.join(__dirname, "..", "storage", "tickets.json");
const STORE_PANELS = path.join(__dirname, "..", "storage", "panels.json");

const DEFAULT_TICKETS = { nextTicketId: 1000, openTickets: {}, closedTickets: {} };
const DEFAULT_PANELS = { panels: {} };

let pool;
let databaseReady = false;
let migrationDone = false;

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function mysqlEnabled() {
  return String(process.env.STORAGE_MODE || "mysql").toLowerCase() !== "json";
}

function dbConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "bot_tickets_live"
  };
}

async function ensureDatabase() {
  if (!mysqlEnabled()) return false;
  if (databaseReady && pool) return true;

  const cfg = dbConfig();

  try {
    const makePool = () => mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true
    });

    pool = makePool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        state_key VARCHAR(64) PRIMARY KEY,
        state_value LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    databaseReady = true;
    return true;
  } catch (error) {
    const missingDb = error?.code === "ER_BAD_DB_ERROR";

    if (!missingDb) {
      console.error("[storage] MySQL niet beschikbaar, fallback naar JSON:", error.message);
      pool = null;
      databaseReady = false;
      return false;
    }

    try {
      const bootstrap = await mysql.createConnection({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        multipleStatements: true
      });

      await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await bootstrap.end();

      pool = mysql.createPool({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: true
      });

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          state_key VARCHAR(64) PRIMARY KEY,
          state_value LONGTEXT NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      databaseReady = true;
      return true;
    } catch (bootstrapError) {
      console.error("[storage] MySQL niet beschikbaar, fallback naar JSON:", bootstrapError.message);
      pool = null;
      databaseReady = false;
      return false;
    }
  }
}

async function migrateJsonToDatabaseIfNeeded() {
  if (!mysqlEnabled()) return;
  if (migrationDone) return;

  const ready = await ensureDatabase();
  if (!ready) return;

  const [[ticketsRow]] = await pool.query("SELECT state_key FROM app_state WHERE state_key = 'tickets' LIMIT 1");
  if (!ticketsRow && fs.existsSync(STORE_TICKETS)) {
    const fileTickets = loadJson(STORE_TICKETS, DEFAULT_TICKETS);
    await pool.query(
      "INSERT INTO app_state (state_key, state_value) VALUES ('tickets', ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)",
      [JSON.stringify(fileTickets)]
    );
  }

  const [[panelsRow]] = await pool.query("SELECT state_key FROM app_state WHERE state_key = 'panels' LIMIT 1");
  if (!panelsRow && fs.existsSync(STORE_PANELS)) {
    const filePanels = loadJson(STORE_PANELS, DEFAULT_PANELS);
    await pool.query(
      "INSERT INTO app_state (state_key, state_value) VALUES ('panels', ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)",
      [JSON.stringify(filePanels)]
    );
  }

  migrationDone = true;
}

async function loadStateFromDb(key, fallback) {
  await migrateJsonToDatabaseIfNeeded();
  const ready = await ensureDatabase();
  if (!ready) return fallback;

  const [rows] = await pool.query("SELECT state_value FROM app_state WHERE state_key = ? LIMIT 1", [key]);
  if (!rows.length) return fallback;

  try {
    return JSON.parse(rows[0].state_value);
  } catch {
    return fallback;
  }
}

async function saveStateToDb(key, data) {
  await migrateJsonToDatabaseIfNeeded();
  const ready = await ensureDatabase();
  if (!ready) return false;

  await pool.query(
    "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)",
    [key, JSON.stringify(data)]
  );
  return true;
}

async function loadTickets() {
  const ready = await ensureDatabase();
  if (!ready) return loadJson(STORE_TICKETS, DEFAULT_TICKETS);
  return loadStateFromDb("tickets", DEFAULT_TICKETS);
}

async function saveTickets(data) {
  const ok = await saveStateToDb("tickets", data);
  if (!ok) saveJson(STORE_TICKETS, data);
}

async function loadPanels() {
  const ready = await ensureDatabase();
  if (!ready) return loadJson(STORE_PANELS, DEFAULT_PANELS);
  return loadStateFromDb("panels", DEFAULT_PANELS);
}

async function savePanels(data) {
  const ok = await saveStateToDb("panels", data);
  if (!ok) saveJson(STORE_PANELS, data);
}

async function nextTicketId(store = null) {
  if (store) {
    store.nextTicketId = (store.nextTicketId || 1000) + 1;
    return store.nextTicketId;
  }

  const loadedStore = await loadTickets();
  loadedStore.nextTicketId = (loadedStore.nextTicketId || 1000) + 1;
  await saveTickets(loadedStore);
  return loadedStore.nextTicketId;
}

module.exports = { loadTickets, saveTickets, loadPanels, savePanels, nextTicketId };
