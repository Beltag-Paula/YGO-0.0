/**
 * route/duel.js — JSON API for decks and duels.
 *
 *   GET    /api/decks                 deck inventory (with script coverage)
 *   GET    /api/decks/:id             one deck, expanded card list
 *   POST   /api/decks                 upload a .ydk (multipart: deck, name)
 *   PATCH  /api/decks/:id             rename { name }
 *   DELETE /api/decks/:id
 *   POST   /api/duel/start            { playerDeck, botDeck, first, playerName }
 *   GET    /api/duel/state
 *   POST   /api/duel/act              { type, ...payload }  (see DuelSession.act)
 */
"use strict";

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const DeckInventory = require("../DeckInventory");
const DuelSession = require("../DuelSession");
const CardScripts = require("../CardScripts");
const { buildDeckFromParsedYDKFile } = require("../gimmeDeck");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

// ---- one duel per browser (cookie keyed) -------------------------------
const sessions = new Map(); // sid -> { duel, touched }
const SESSION_TTL = 1000 * 60 * 60 * 3;

function sidFrom(req, res) {
    const m = /(?:^|;\s*)ygo_sid=([a-f0-9]{16,})/.exec(req.headers.cookie || "");
    if (m) return m[1];
    const sid = crypto.randomBytes(12).toString("hex");
    res.setHeader("Set-Cookie", `ygo_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
    return sid;
}

function sweep() {
    const now = Date.now();
    for (const [k, v] of sessions) if (now - v.touched > SESSION_TTL) sessions.delete(k);
}

function getDuel(req, res) {
    const sid = sidFrom(req, res);
    const s = sessions.get(sid);
    if (s) s.touched = Date.now();
    return { sid, duel: s ? s.duel : null };
}

// ---- decks --------------------------------------------------------------
function decorate(deck) {
    const all = [...deck.mainDeck, ...deck.extraDeck];
    const cov = CardScripts.deckCoverage(all);
    return { script: cov };
}

router.get("/decks", (req, res) => {
    res.json({ decks: DeckInventory.list(decorate) });
});

router.get("/decks/:id", (req, res) => {
    const deck = DeckInventory.readDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "Deck not found" });
    const group = arr => {
        const m = new Map();
        arr.forEach(c => {
            const e = m.get(c.name) || {
                id: c.id, name: c.name, type: c.type, frame: c.frameType, level: c.level || null, atk: c.atk ?? null,
                def: c.def ?? null, attr: c.attribute || null, race: c.race || null, desc: c.desc || "",
                image: c.card_images && c.card_images[0] && (c.card_images[0].image_url_small),
                copies: 0, script: CardScripts.cardStatus(c)
            };
            e.copies++;
            m.set(c.name, e);
        });
        return [...m.values()];
    };
    const summary = DeckInventory.summarize(req.params.id, deck);
    res.json({ ...summary, main: group(deck.mainDeck), extra: group(deck.extraDeck), side: group(deck.sideDeck) });
});

router.post("/decks", upload.single("deck"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const text = req.file.buffer.toString("utf8");
        const deck = await buildDeckFromParsedYDKFile(text);
        if (deck.mainDeck.length === 0) return res.status(400).json({ error: "That .ydk has no Main Deck cards." });
        const fallback = (req.file.originalname || "").replace(/\.ydk$/i, "").trim();
        const id = DeckInventory.save(deck, (req.body && req.body.name) || fallback || undefined);
        res.json({ id, message: "Deck added to your inventory." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch("/decks/:id", (req, res) => {
    if (!DeckInventory.rename(req.params.id, req.body && req.body.name)) return res.status(404).json({ error: "Deck not found" });
    res.json({ ok: true });
});

router.delete("/decks/:id", (req, res) => {
    if (!DeckInventory.remove(req.params.id)) return res.status(404).json({ error: "Deck not found" });
    res.json({ ok: true });
});

// ---- duel ---------------------------------------------------------------
router.post("/duel/start", (req, res) => {
    try {
        sweep();
        const { sid } = getDuel(req, res);
        const b = req.body || {};
        const decks = DeckInventory.list().filter(d => !d.broken);
        if (decks.length === 0) return res.status(400).json({ error: "Your deck inventory is empty — upload a deck first." });
        let botDeck = b.botDeck;
        if (!botDeck || botDeck === "random") botDeck = decks[Math.floor(Math.random() * decks.length)].id;
        if (!b.playerDeck) return res.status(400).json({ error: "Choose your deck first." });
        const duel = new DuelSession({
            playerDeckId: b.playerDeck, botDeckId: botDeck, first: b.first, playerName: b.playerName
        });
        sessions.set(sid, { duel, touched: Date.now() });
        res.json(duel.state());
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message });
    }
});

router.get("/duel/state", (req, res) => {
    const { duel } = getDuel(req, res);
    if (!duel) return res.status(404).json({ error: "No duel in progress" });
    res.json(duel.state());
});

router.post("/duel/act", (req, res) => {
    const { duel } = getDuel(req, res);
    if (!duel) return res.status(404).json({ error: "No duel in progress" });
    const { type, ...payload } = req.body || {};
    try {
        res.json(duel.act(String(type || ""), payload));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

router.sessions = sessions;   // exposed for the end-to-end test harness
module.exports = router;
