/**
 * CardScripts.js
 *
 * Loads every file in scripts/ (each one registers card behaviour into
 * Effects.js through Effects.Registry) and answers "does this card have a
 * working script?" for the deck picker, the coverage tool and the tests.
 *
 * Status of a card:
 *   vanilla  Normal Monster with no card text to script — nothing to do.
 *   scripted at least one behaviour is registered for it.
 *   partial  scripted, but only part of the card text is implemented
 *            (the note says which part).
 *   stub     it can be drawn/played as a plain card but its effect text
 *            is NOT implemented yet.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Effects = require("./Effects");

const SCRIPT_DIR = path.join(__dirname, "scripts");
let loaded = false;
const loadedFiles = [];

function loadAll() {
    if (loaded) return;
    loaded = true;
    if (!fs.existsSync(SCRIPT_DIR)) return;
    for (const f of fs.readdirSync(SCRIPT_DIR).sort()) {
        if (!f.endsWith(".js") || f.startsWith("_")) continue;
        const mod = require(path.join(SCRIPT_DIR, f));
        if (typeof mod.install === "function") mod.install(Effects);
        loadedFiles.push(f);
    }
}

function isVanilla(card) {
    const t = card.type || "";
    return /Monster/.test(t) && card.frameType === "normal" && !/Effect/.test(t);
}

function cardStatus(card) {
    loadAll();
    if (isVanilla(card)) return { status: "vanilla", kinds: [] };
    const kinds = Effects.scriptKinds(card.name);
    if (kinds.includes("partial")) return { status: "partial", kinds, note: Effects.partialNote(card.name) };
    return kinds.length ? { status: "scripted", kinds } : { status: "stub", kinds: [] };
}

function deckCoverage(cards) {
    loadAll();
    const seen = new Map();
    for (const c of cards) if (!seen.has(c.name)) seen.set(c.name, cardStatus(c).status);
    const out = { total: seen.size, vanilla: 0, scripted: 0, partial: 0, stub: 0, stubs: [] };
    for (const [name, st] of seen) {
        out[st]++;
        if (st === "stub") out.stubs.push(name);
    }
    out.pct = out.total ? Math.round(((out.vanilla + out.scripted + out.partial) / out.total) * 100) : 100;
    return out;
}

module.exports = { loadAll, cardStatus, deckCoverage, isVanilla, loadedFiles };
