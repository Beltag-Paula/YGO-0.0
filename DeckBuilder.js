/**
 * DeckBuilder.js — card search + deck validation for the in-browser deck editor.
 * The pool is exactly the card database (DM / early GX era, 2002-2008). Decks are stored as the same
 * full-card-object json the rest of the engine reads, so a built deck plays like any uploaded one.
 */
"use strict";
const LocalCards = require("./LocalCards");
const CardScripts = require("./CardScripts");

const EXTRA_FRAMES = new Set(["fusion", "synchro", "xyz", "link"]);
const LIMITS = { mainMin: 40, mainMax: 60, extraMax: 15, sideMax: 15, copies: 3 };

let index = null;
function build() {
    if (index) return index;
    CardScripts.loadAll();
    const rows = LocalCards.all();
    index = rows.map(r => {
        const c = LocalCards.toApiShape(r);
        const kind = /Monster/.test(c.type) ? "monster" : /Spell/.test(c.type) ? "spell" : "trap";
        return {
            card: c, kind, lower: (c.name + " " + (c.desc || "")).toLowerCase(), nameLower: c.name.toLowerCase(),
            extra: EXTRA_FRAMES.has(c.frameType), date: (r.release && r.release.tcg && r.release.tcg.date) || "",
            status: CardScripts.cardStatus(c).status
        };
    });
    return index;
}

const brief = e => {
    const c = e.card;
    return {
        id: c.id, name: c.name, type: c.type, frame: c.frameType, kind: e.kind, race: c.race, attr: c.attribute || null,
        level: c.level ?? null, atk: c.atk ?? null, def: c.def ?? null, desc: c.desc, extra: e.extra, script: e.status,
        image: c.card_images[0].image_url_small, big: c.card_images[0].image_url
    };
};

function meta() {
    const e = build(), races = new Set(), attrs = new Set(), frames = new Set();
    e.forEach(x => { races.add(x.card.race); if (x.card.attribute) attrs.add(x.card.attribute); frames.add(x.card.frameType); });
    return { races: [...races].sort(), attrs: [...attrs].sort(), frames: [...frames].sort(), total: e.length, limits: LIMITS };
}

/** q: text in name/effect · kind · attr · race · frame · lv · script (vanilla|scripted|partial|stub|playable) · sort */
function search(o = {}) {
    let list = build();
    if (o.ids) { const want = new Set(String(o.ids).split(",").map(Number)); return { total: want.size, offset: 0, cards: list.filter(e => want.has(e.card.id)).map(brief) }; }
    const q = String(o.q || "").trim().toLowerCase();
    if (q) {
        const num = /^\d+$/.test(q) ? Number(q) : null;
        list = list.filter(e => (num !== null && e.card.id === num) || (o.nameOnly ? e.nameLower.includes(q) : e.lower.includes(q)));
    }
    if (o.kind) list = list.filter(e => e.kind === o.kind);
    if (o.attr) list = list.filter(e => e.card.attribute === o.attr);
    if (o.race) list = list.filter(e => e.card.race === o.race);
    if (o.frame) list = list.filter(e => e.card.frameType === o.frame);
    if (o.lv !== undefined && o.lv !== "") list = list.filter(e => e.card.level === Number(o.lv));
    if (o.script === "playable") list = list.filter(e => e.status !== "stub");
    else if (o.script) list = list.filter(e => e.status === o.script);
    const rank = e => (q && e.nameLower === q ? 0 : q && e.nameLower.startsWith(q) ? 1 : q && e.nameLower.includes(q) ? 2 : 3);
    const sorts = {
        name: (a, b) => a.card.name.localeCompare(b.card.name),
        atk: (a, b) => (b.card.atk ?? -1) - (a.card.atk ?? -1),
        def: (a, b) => (b.card.def ?? -1) - (a.card.def ?? -1),
        level: (a, b) => (b.card.level ?? -1) - (a.card.level ?? -1),
        newest: (a, b) => b.date.localeCompare(a.date)
    };
    const cmp = sorts[o.sort] || sorts.name;
    list = list.slice().sort((a, b) => rank(a) - rank(b) || cmp(a, b));
    const limit = Math.min(Math.max(Number(o.limit) || 60, 1), 200), offset = Math.max(Number(o.offset) || 0, 0);
    return { total: list.length, offset, cards: list.slice(offset, offset + limit).map(brief) };
}

/**
 * Turn { main:[ids], extra:[ids], side:[ids] } into stored deck arrays.
 * Throws {message} for hard errors; returns { deck, warnings }.
 */
function assemble(body) {
    const ids = k => (Array.isArray(body[k]) ? body[k].map(Number) : []);
    const main = ids("main"), extra = ids("extra"), side = ids("side");
    const err = m => { const e = new Error(m); e.status = 400; throw e; };
    if (main.length > LIMITS.mainMax) err(`Main Deck has ${main.length} cards (max ${LIMITS.mainMax}).`);
    if (extra.length > LIMITS.extraMax) err(`Extra Deck has ${extra.length} cards (max ${LIMITS.extraMax}).`);
    if (side.length > LIMITS.sideMax) err(`Side Deck has ${side.length} cards (max ${LIMITS.sideMax}).`);
    const copies = new Map(), load = (arr, where) => arr.map(id => {
        const c = LocalCards.getAvailable(id);
        if (!c) err(`Card #${id} is not in the DM / GX era card pool.`);
        const n = (copies.get(c.name) || 0) + 1; copies.set(c.name, n);
        if (n > LIMITS.copies) err(`More than ${LIMITS.copies} copies of "${c.name}".`);
        const isExtra = EXTRA_FRAMES.has(c.frameType);
        if (where === "extra" && !isExtra) err(`"${c.name}" does not belong in the Extra Deck.`);
        if (where === "main" && isExtra) err(`"${c.name}" must go in the Extra Deck.`);
        return JSON.parse(JSON.stringify(c));
    });
    const deck = { mainDeck: load(main, "main"), extraDeck: load(extra, "extra"), sideDeck: load(side, "side") };
    const warnings = [];
    if (deck.mainDeck.length < LIMITS.mainMin) warnings.push(`Main Deck has ${deck.mainDeck.length} cards — you need at least ${LIMITS.mainMin} to duel.`);
    return { deck, warnings };
}

/** The inverse: a stored deck as flat id lists, for loading it into the editor. */
function toIds(deck) {
    const f = a => (a || []).map(c => c.id);
    return { main: f(deck.mainDeck), extra: f(deck.extraDeck), side: f(deck.sideDeck) };
}

module.exports = { search, meta, assemble, toIds, LIMITS };
