/**
 * LocalCards.js
 *
 * Reads card_database/yugioh_cards.jsonl once and can hand back card
 * objects in the SAME shape the ygoprodeck API returns (and therefore the
 * same shape deck_inventory/*.json stores). That makes deck uploads work
 * offline and turns "which cards exist in the database" into a plain
 * local lookup (used by the coverage tool and the tests as well).
 *
 * Image URLs are derived from the passcode using ygoprodeck's stable
 * image-hosting pattern.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const JSONL = path.join(__dirname, "card_database", "yugioh_cards.jsonl");

const T = {
    MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80,
    SPIRIT: 0x200, UNION: 0x400, DUAL: 0x800, TUNER: 0x1000, SYNCHRO: 0x2000, TOKEN: 0x4000,
    QUICKPLAY: 0x10000, CONTINUOUS: 0x20000, EQUIP: 0x40000, FIELD: 0x80000, COUNTER: 0x100000,
    FLIP: 0x200000, TOON: 0x400000, XYZ: 0x800000, PENDULUM: 0x1000000, LINK: 0x4000000
};

const ATTRIBUTES = { 1: "EARTH", 2: "WATER", 4: "FIRE", 8: "WIND", 16: "LIGHT", 32: "DARK", 64: "DIVINE" };
const RACES = {
    0x1: "Warrior", 0x2: "Spellcaster", 0x4: "Fairy", 0x8: "Fiend", 0x10: "Zombie", 0x20: "Machine",
    0x40: "Aqua", 0x80: "Pyro", 0x100: "Rock", 0x200: "Winged Beast", 0x400: "Plant", 0x800: "Insect",
    0x1000: "Thunder", 0x2000: "Dragon", 0x4000: "Beast", 0x8000: "Beast-Warrior", 0x10000: "Dinosaur",
    0x20000: "Fish", 0x40000: "Sea Serpent", 0x80000: "Reptile", 0x100000: "Psychic",
    0x200000: "Divine-Beast", 0x400000: "Creator God", 0x800000: "Wyrm", 0x1000000: "Cyberse"
};

/** ygoprodeck-style type line, e.g. "Flip Effect Monster", "Spell Card". */
function typeString(t) {
    if (t & T.SPELL) return "Spell Card";
    if (t & T.TRAP) return "Trap Card";
    const parts = [];
    if (t & T.PENDULUM) parts.push("Pendulum");
    if (t & T.FLIP) parts.push("Flip");
    if (t & T.SPIRIT) parts.push("Spirit");
    if (t & T.UNION) parts.push("Union");
    if (t & T.DUAL) parts.push("Gemini");
    if (t & T.TOON) parts.push("Toon");
    if (t & T.TUNER) parts.push("Tuner");
    if (t & T.FUSION) return [...parts, "Fusion Monster"].join(" ");
    if (t & T.SYNCHRO) return [...parts, "Synchro Monster"].join(" ");
    if (t & T.XYZ) return [...parts, "XYZ Monster"].join(" ");
    if (t & T.LINK) return [...parts, "Link Monster"].join(" ");
    if (t & T.RITUAL) return [...parts, (t & T.EFFECT) ? "Ritual Effect Monster" : "Ritual Monster"].join(" ");
    if (t & T.TOKEN) return "Token";
    if ((t & T.NORMAL) && !(t & T.EFFECT)) return [...parts, "Normal Monster"].join(" ");
    return [...parts, "Effect Monster"].join(" ");
}

function frameType(t) {
    if (t & T.SPELL) return "spell";
    if (t & T.TRAP) return "trap";
    if (t & T.FUSION) return "fusion";
    if (t & T.RITUAL) return "ritual";
    if (t & T.SYNCHRO) return "synchro";
    if (t & T.XYZ) return "xyz";
    if (t & T.LINK) return "link";
    if ((t & T.NORMAL) && !(t & T.EFFECT)) return "normal";
    return "effect";
}

function spellTrapRace(t) {
    if (t & T.EQUIP) return "Equip";
    if (t & T.FIELD) return "Field";
    if (t & T.QUICKPLAY) return "Quick-Play";
    if (t & T.RITUAL) return "Ritual";
    if (t & T.COUNTER) return "Counter";
    if (t & T.CONTINUOUS) return "Continuous";
    return "Normal";
}

let _byId = null, _byName = null, _rows = null;

function load() {
    if (_rows) return;
    _rows = [];
    _byId = new Map();
    _byName = new Map();
    if (!fs.existsSync(JSONL)) return;
    for (const line of fs.readFileSync(JSONL, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        r.id = Number(r.id);
        _rows.push(r);
        _byId.set(r.id, r);
        const k = r.name.trim().toLowerCase();
        if (!_byName.has(k)) _byName.set(k, r);
    }
}

function toApiShape(r) {
    const m = r.metadata, t = m.type;
    const isMonster = !!(t & T.MONSTER);
    const card = {
        id: r.id,
        name: r.name,
        type: typeString(t),
        humanReadableCardType: typeString(t),
        frameType: frameType(t),
        desc: r.effect_text || "",
        race: isMonster ? (RACES[m.race] || "Unknown") : spellTrapRace(t),
        ygoprodeck_url: `https://ygoprodeck.com/card/${r.id}`,
        card_images: [{
            id: r.id,
            image_url: `https://images.ygoprodeck.com/images/cards/${r.id}.jpg`,
            image_url_small: `https://images.ygoprodeck.com/images/cards_small/${r.id}.jpg`,
            image_url_cropped: `https://images.ygoprodeck.com/images/cards_cropped/${r.id}.jpg`
        }]
    };
    if (isMonster) {
        card.atk = m.atk;
        card.def = m.def;
        card.level = m.level;
        card.attribute = ATTRIBUTES[m.attribute] || "DARK";
    }
    return card;
}

// Cards that decks already in the inventory use but the dataset lacks (see tools/build_supplement.js).
let _supp = null;
function supplement() {
    if (_supp) return _supp;
    const f = path.join(__dirname, "card_database", "supplement.json");
    _supp = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
    return _supp;
}
/** A card in the DM / early GX era card pool this project supports (the database plus the supplement). */
/** A supplement card (post-DB card an inventory deck uses) by exact name, or null. */
function supplementByName(name) { const n = String(name).toLowerCase(); return Object.values(supplement()).find(c => c.name.toLowerCase() === n) || null; }
function getAvailable(id) { return get(id) || supplement()[String(id)] || null; }
function isAvailable(id) { return !!getAvailable(id); }

function all() { load(); return _rows; }
function rowById(id) { load(); return _byId.get(Number(id)) || null; }
function rowByName(name) { load(); return _byName.get(String(name).trim().toLowerCase()) || null; }
function get(id) { const r = rowById(id); return r ? toApiShape(r) : null; }
function typeBits(row) { return row.metadata.type; }

module.exports = {
    supplementByName, T, all, rowById, rowByName, get, getAvailable, isAvailable, toApiShape, typeBits, typeString };
