function parseYDKFile(some_ydk_file) {
  const sections = { main: [], extra: [], side: [] };

  let mode = "main";
  const lines = some_ydk_file.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "#main") { mode = "main"; continue; }
    if (trimmed === "#extra") { mode = "extra"; continue; }
    if (trimmed === "!side") { mode = "side"; continue; }

    if (!/^\d+$/.test(trimmed)) continue;

    sections[mode].push(Number(trimmed));
  }

  return sections;
}

const LocalCards = require("./LocalCards.js");

// Cards outside the project's card pool (the DM / early GX era database) are NOT fetched from anywhere:
// they are reported back so the player can be told exactly which ones are not available.
async function lookupName(id) {
  // Best effort only, purely so the message can say WHICH card it is. Never blocks for long, never required.
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${id}`, { signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    return j && j.data && j.data[0] ? j.data[0].name : null;
  } catch (e) { return null; }
}

async function buildDeckFromParsedYDKFile(some_ydk_file) {
  const parsedFile = parseYDKFile(some_ydk_file);
  const unavailable = new Map();
  const load = (section) => ids => ids.map(id => {
    const c = LocalCards.getAvailable(id);
    if (!c) { const u = unavailable.get(id) || { id, copies: 0, section }; u.copies++; unavailable.set(id, u); }
    return c ? JSON.parse(JSON.stringify(c)) : null;
  }).filter(Boolean);
  const mainDeck = load("main")(parsedFile.main);
  const extraDeck = load("extra")(parsedFile.extra);
  const sideDeck = load("side")(parsedFile.side);
  const list = [...unavailable.values()];
  await Promise.all(list.map(async u => { u.name = await lookupName(u.id); }));
  for (const u of list) {
    u.message = `${u.name ? `"${u.name}" (#${u.id})` : `Card #${u.id}`} is not available in the DM / early GX era card database.`;
  }
  return { mainDeck, extraDeck, sideDeck, unavailable: list };
}

async function buildDeckJSON(some_ydk_file){
  const deck = await buildDeckFromParsedYDKFile(some_ydk_file);
  return JSON.stringify(deck,null, 2);
}

module.exports = {
  buildDeckJSON, parseYDKFile, buildDeckFromParsedYDKFile
}