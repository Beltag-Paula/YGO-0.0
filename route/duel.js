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
const DeckBuilder = require("../DeckBuilder");

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
        const { unavailable, ...deck } = await buildDeckFromParsedYDKFile(text);
        if (deck.mainDeck.length === 0) {
            return res.status(400).json({
                error: unavailable.length ? "None of the Main Deck cards are available in the DM / early GX era card database — every card in that .ydk is not available." : "That .ydk has no Main Deck cards.",
                unavailable
            });
        }
        const fallback = (req.file.originalname || "").replace(/\.ydk$/i, "").trim();
        const id = DeckInventory.save(deck, (req.body && req.body.name) || fallback || undefined);
        const skipped = unavailable.reduce((n, u) => n + u.copies, 0);
        res.json({
            id, unavailable,
            message: skipped
                ? `Deck added, but ${skipped} card${skipped > 1 ? "s were" : " was"} left out: not available in the DM / early GX era card database.`
                : "Deck added to your inventory."
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- deck builder: card pool + create / edit deck from card ids -----------------------------
router.get("/avatars", (req, res) => res.json({ avatars: DeckInventory.avatars(), frames: DeckInventory.frames() }));
router.get("/cards", (req, res) => res.json(DeckBuilder.search(req.query)));
router.get("/cards/meta", (req, res) => res.json({ ...DeckBuilder.meta(), owners: Object.entries(DeckInventory.OWNERS).map(([id, o]) => ({ id, name: o.name, portrait: o.portrait })) }));

router.get("/decks/:id/ids", (req, res) => {
    const deck = DeckInventory.readDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "Deck not found" });
    const s = DeckInventory.summarize(req.params.id, deck);
    res.json({ id: s.id, name: s.name, owner: s.owner, avatar: s.avatar, frame: s.frame, builtin: s.builtin, ...DeckBuilder.toIds(deck) });
});

function builderSave(req, res, id) {
    try {
        const b = req.body || {};
        const { deck, warnings } = DeckBuilder.assemble(b);
        const meta = { name: String(b.name || "").trim() || "New Deck", owner: b.owner, avatar: b.avatar, frame: b.frame, custom: true };
        if (id) {
            if (!DeckInventory.update(id, { ...deck, ...meta })) return res.status(404).json({ error: "Deck not found" });
            return res.json({ id, warnings, message: "Deck saved." });
        }
        res.json({ id: DeckInventory.save({ ...deck, ...meta }, meta.name), warnings, message: "Deck created." });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}
router.post("/decks/custom", (req, res) => builderSave(req, res, null));
router.put("/decks/:id", (req, res) => builderSave(req, res, req.params.id));

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
            playerDeckId: b.playerDeck, botDeckId: botDeck, first: b.first, playerName: b.playerName, playerAvatar: b.playerAvatar, playerFrame: b.playerFrame
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
