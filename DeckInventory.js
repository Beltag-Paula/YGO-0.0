/**
 * DeckInventory.js
 *
 * The single place that reads and writes deck_inventory/*.json.
 *
 * A deck file is { mainDeck, extraDeck, sideDeck } (what gimmeDeck.js
 * produces from a .ydk upload). This module also understands two
 * optional extra fields so decks get a proper display name:
 *
 *   name:      shown in the deck picker (falls back to a derived name)
 *   createdAt: ISO timestamp
 *
 * Old files without those fields keep working unchanged.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "deck_inventory");

const KNOWN_NAMES = { yugi: "Yugi's Deck", kaiba: "Kaiba's Deck" };
const GENERIC_WORDS = new Set([
    "the", "of", "and", "dragon", "dragons", "warrior", "knight", "monster", "card", "dark", "light",
    "magician", "beast", "with", "from", "swordsman", "lady", "girl", "king", "queen"
]);

function ensureDir() {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function safeId(id) {
    return /^[A-Za-z0-9_\-]+$/.test(String(id || "")) ? String(id) : null;
}

function fileFor(id) {
    const s = safeId(id);
    return s ? path.join(DIR, s + ".json") : null;
}

function isMonster(c) { return /Monster/.test(c.type || ""); }
function isSpell(c) { return /Spell/.test(c.type || ""); }
function isTrap(c) { return /Trap/.test(c.type || ""); }

/** Best-effort readable name for a deck that was never given one. */
function deriveName(id, deck) {
    if (KNOWN_NAMES[id]) return KNOWN_NAMES[id];
    const monsters = (deck.mainDeck || []).filter(isMonster);

    // 1. Most common archetype among the whole main deck.
    const arch = {};
    (deck.mainDeck || []).forEach(c => { if (c.archetype) arch[c.archetype] = (arch[c.archetype] || 0) + 1; });
    const topArch = Object.entries(arch).sort((a, b) => b[1] - a[1])[0];
    if (topArch && topArch[1] >= Math.max(5, (deck.mainDeck || []).length * 0.25)) return `${topArch[0]} Deck`;

    // 2. A distinctive shared word in monster names.
    const words = {};
    monsters.forEach(c => {
        new Set(c.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !GENERIC_WORDS.has(w)))
            .forEach(w => { words[w] = (words[w] || 0) + 1; });
    });
    const topWord = Object.entries(words).sort((a, b) => b[1] - a[1])[0];
    if (topWord && topWord[1] >= Math.max(4, monsters.length * 0.3)) {
        return `${topWord[0][0].toUpperCase()}${topWord[0].slice(1)} Deck`;
    }

    // 3. Signature card: most copies, then highest level.
    const copies = {};
    monsters.forEach(c => { copies[c.name] = copies[c.name] || { n: 0, lv: c.level || 0 }; copies[c.name].n++; });
    const sig = Object.entries(copies).sort((a, b) => b[1].n - a[1].n || b[1].lv - a[1].lv)[0];
    return sig ? `${sig[0]} Deck` : `Deck ${id}`;
}

/** The card whose art best represents the deck (shown as the "deck case"). */
function pickCover(deck) {
    const all = [...(deck.mainDeck || []), ...(deck.extraDeck || [])];
    const rank = c => {
        if (!isMonster(c)) return -1;
        return (c.atk || 0) + (c.level || 0) * 100 + (/Fusion|Ritual/.test(c.type) ? 500 : 0);
    };
    const best = all.slice().sort((a, b) => rank(b) - rank(a))[0];
    const img = best && best.card_images && best.card_images[0];
    return img ? { name: best.name, image: img.image_url_cropped || img.image_url_small || img.image_url } : null;
}

function summarize(id, deck, extra = {}) {
    const main = deck.mainDeck || [];
    const extraDeck = deck.extraDeck || [];
    const side = deck.sideDeck || [];
    const warnings = [];
    if (main.length < 40) warnings.push(`Main Deck has ${main.length} cards (40–60 recommended)`);
    if (main.length > 60) warnings.push(`Main Deck has ${main.length} cards (max 60)`);
    if (extraDeck.length > 15) warnings.push(`Extra Deck has ${extraDeck.length} cards (max 15)`);
    const counts = {};
    main.forEach(c => { counts[c.name] = (counts[c.name] || 0) + 1; });
    const over = Object.entries(counts).filter(([, n]) => n > 3).map(([k]) => k);
    if (over.length) warnings.push(`More than 3 copies of: ${over.join(", ")}`);
    return {
        id,
        name: deck.name || deriveName(id, deck),
        customName: !!deck.name,
        createdAt: deck.createdAt || null,
        counts: {
            main: main.length, extra: extraDeck.length, side: side.length,
            monsters: main.filter(isMonster).length,
            spells: main.filter(isSpell).length,
            traps: main.filter(isTrap).length
        },
        cover: pickCover(deck),
        topCards: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => ({ name: n, copies: c })),
        warnings,
        ...extra
    };
}

function readDeck(id) {
    const file = fileFor(id);
    if (!file || !fs.existsSync(file)) return null;
    const deck = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(deck.mainDeck)) throw new Error(`Deck "${id}" has no mainDeck array`);
    deck.extraDeck = deck.extraDeck || [];
    deck.sideDeck = deck.sideDeck || [];
    return deck;
}

function list(decorate) {
    ensureDir();
    const out = [];
    for (const f of fs.readdirSync(DIR)) {
        if (!f.endsWith(".json") || f.startsWith("_")) continue;
        const id = f.slice(0, -5);
        try {
            const deck = readDeck(id);
            const mtime = fs.statSync(path.join(DIR, f)).mtimeMs;
            const s = summarize(id, deck, { mtime });
            if (decorate) Object.assign(s, decorate(deck, s));
            out.push(s);
        } catch (e) {
            out.push({ id, name: id, broken: true, error: e.message, counts: { main: 0, extra: 0, side: 0 }, warnings: [e.message] });
        }
    }
    // Built-in duelists first, then newest uploads first.
    return out.sort((a, b) => {
        const ab = KNOWN_NAMES[a.id] ? 0 : 1, bb = KNOWN_NAMES[b.id] ? 0 : 1;
        return ab - bb || (b.mtime || 0) - (a.mtime || 0);
    });
}

function save(deckJson, name) {
    ensureDir();
    const deck = { ...deckJson };
    if (name) deck.name = String(name).trim().slice(0, 60);
    deck.createdAt = deck.createdAt || new Date().toISOString();
    let id = `deck_${Date.now()}`;
    while (fs.existsSync(fileFor(id))) id += "x";
    fs.writeFileSync(fileFor(id), JSON.stringify(deck, null, 2), "utf8");
    return id;
}

function rename(id, name) {
    const deck = readDeck(id);
    if (!deck) return false;
    deck.name = String(name || "").trim().slice(0, 60) || undefined;
    fs.writeFileSync(fileFor(id), JSON.stringify(deck, null, 2), "utf8");
    return true;
}

function remove(id) {
    const file = fileFor(id);
    if (!file || !fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
}

module.exports = { DIR, list, readDeck, save, rename, remove, summarize, deriveName, safeId };
