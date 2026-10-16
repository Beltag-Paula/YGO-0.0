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

async function loadCard(card_id) {
  // Local database first (works offline, no rate limits); only fall back
  // to the ygoprodeck web API for cards the local database doesn't have.
  const local = LocalCards.get(card_id);
  if (local) return local;
  const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${card_id}`);

  if (!response.ok) throw new Error(`Card ${card_id} is not in the local database and the card API returned ${response.status}`);
  const data = await response.json();
  if (!data.data || !data.data[0]) throw new Error(`Unknown card id ${card_id}`);
  const raw = data.data[0];
  const { card_sets, card_prices, ...card } = raw;
  return card;
}

async function buildDeckFromParsedYDKFile(some_ydk_file) {
  const parsedFile = parseYDKFile(some_ydk_file);

  const mainDeck = await Promise.all(parsedFile.main.map(loadCard));
  const extraDeck = await Promise.all(parsedFile.extra.map(loadCard));
  const sideDeck = await Promise.all(parsedFile.side.map(loadCard));

  return { mainDeck, extraDeck, sideDeck };
}

async function buildDeckJSON(some_ydk_file){
  const deck = await buildDeckFromParsedYDKFile(some_ydk_file);
  return JSON.stringify(deck,null, 2);
}

module.exports = {
  buildDeckJSON, parseYDKFile, buildDeckFromParsedYDKFile
}