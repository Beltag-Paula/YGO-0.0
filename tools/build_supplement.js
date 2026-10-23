#!/usr/bin/env node
/**
 * Writes card_database/supplement.json: cards that already appear in a deck in deck_inventory/ but are
 * missing from yugioh_cards.jsonl (the dataset has gaps, e.g. Blue-Eyes White Dragon). Without this, a
 * deck you already play would be reported as "not available". Re-run after adding decks you consider valid.
 */
const fs = require("fs"), path = require("path");
const LocalCards = require("../LocalCards");
const dir = path.join(__dirname, "..", "deck_inventory");
const out = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const c of [...d.mainDeck, ...(d.extraDeck || []), ...(d.sideDeck || [])]) {
        if (!LocalCards.rowById(c.id) && !out[c.id]) { const { card_sets, card_prices, ...card } = c; out[c.id] = card; }
    }
}
fs.writeFileSync(path.join(__dirname, "..", "card_database", "supplement.json"), JSON.stringify(out, null, 1));
console.log(`supplement.json: ${Object.keys(out).length} cards`);
