"use strict";
process.env.YGO_QUIET = "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const DeckInventory = require("../DeckInventory");
const DuelSession = require("../DuelSession");
const CardScripts = require("../CardScripts");

// ---------------------------------------------------------------- deck inventory
test("Deck inventory lists every deck with name, counts, cover and warnings", () => {
    const decks = DeckInventory.list();
    assert.ok(decks.length >= 6);
    const yugi = decks.find(d => d.id === "yugi");
    assert.equal(yugi.name, "Yugi's Deck");
    assert.equal(yugi.counts.main, 52);
    assert.ok(yugi.counts.monsters + yugi.counts.spells + yugi.counts.traps === yugi.counts.main);
    for (const d of decks) assert.ok(d.name && d.counts && !d.broken, d.id);
});
test("Deck names for unnamed uploads are derived from their contents", () => {
    const names = DeckInventory.list().map(d => d.name);
    assert.ok(names.includes("Harpie Deck"), names.join(" | "));
    assert.ok(names.some(n => /Crystal Beast/.test(n)));
});
test("Deck inventory: save, rename and remove round-trip", () => {
    const src = DeckInventory.readDeck("yugi");
    const id = DeckInventory.save({ mainDeck: src.mainDeck, extraDeck: [], sideDeck: [] }, "Temp Test Deck");
    try {
        assert.equal(DeckInventory.list().find(d => d.id === id).name, "Temp Test Deck");
        assert.ok(DeckInventory.rename(id, "Renamed"));
        assert.equal(DeckInventory.list().find(d => d.id === id).name, "Renamed");
    } finally { assert.ok(DeckInventory.remove(id)); }
    assert.equal(DeckInventory.list().some(d => d.id === id), false);
});
test("Deck ids can't escape the inventory folder", () => {
    assert.equal(DeckInventory.readDeck("../package"), null);
    assert.equal(DeckInventory.remove("../package"), false);
});
test("Offline deck building uses the local card DB", async () => {
    const { buildDeckFromParsedYDKFile } = require("../gimmeDeck");
    const deck = await buildDeckFromParsedYDKFile("#main\n114932\n114932\n#extra\n!side\n");
    assert.equal(deck.mainDeck.length, 2);
    assert.equal(deck.mainDeck[0].name, "Seismic Crasher");
    assert.match(deck.mainDeck[0].card_images[0].image_url_small, /114932/);
});
test("Script coverage is reported per deck", () => {
    const d = DeckInventory.readDeck("kaiba");
    const cov = CardScripts.deckCoverage([...d.mainDeck, ...d.extraDeck]);
    assert.ok(cov.total > 0 && cov.pct >= 90, JSON.stringify(cov));
});

// ---------------------------------------------------------------- duel session
const start = (me = "kaiba", bot = "yugi", first = "you") => new DuelSession({ playerDeckId: me, botDeckId: bot, first });

test("A new duel starts on the human's Main Phase 1 with 5 cards in hand", () => {
    const s = start(); const v = s.state().view;
    assert.equal(v.phase, "m1"); assert.equal(v.turnOf, "you"); assert.equal(v.you.hand.length, 5);
    assert.equal(v.opp.hand.length, 5); assert.equal(v.you.lp, 8000);
    assert.equal(v.you.name, "You"); assert.equal(v.you.deckName, "Kaiba's Deck"); assert.equal(v.opp.deckName, "Yugi's Deck");
});
test("Hidden information stays hidden: the bot's hand and face-down cards carry no card data", () => {
    const s = start(); const v = s.state().view;
    for (const c of v.opp.hand) { assert.equal(c.name, undefined); assert.equal(c.image, undefined); assert.equal(c.id, undefined); assert.match(c.uid, /^c\d+$/); }
    assert.ok(v.you.hand.every(c => c.name && c.image));
    assert.ok(!JSON.stringify(v.opp).includes("_random"), "engine instanceIds must never leak");
});
test("The human can pick any inventory deck for the bot, including the same deck", () => {
    for (const id of DeckInventory.list().map(d => d.id)) {
        const s = new DuelSession({ playerDeckId: id, botDeckId: id, first: "you" });
        assert.equal(s.state().view.you.counts.deck + 5, DeckInventory.readDeck(id).mainDeck.length - 0 + 0, id);
    }
});
test("Unknown decks are rejected with a clear error", () => {
    assert.throws(() => new DuelSession({ playerDeckId: "nope", botDeckId: "yugi" }), /Unknown player deck/);
    assert.throws(() => new DuelSession({ playerDeckId: "yugi", botDeckId: "nope" }), /Unknown bot deck/);
});
test("Legal actions are precomputed on hand cards; illegal ones are refused with a message", () => {
    let s, v, mon;
    for (let i = 0; i < 50 && !mon; i++) {   // the opening hand is random: redraw until it has a low-level monster
        s = start("yugi", "kaiba"); v = s.state().view;
        mon = v.you.hand.find(c => c.act && c.act.summon && c.act.summon.tributes === 0);
    }
    assert.ok(mon, "a 0-tribute monster is summonable");
    const r = s.act("summon", { uid: mon.uid, tributes: [] });
    assert.ok(r.ok); assert.ok(r.events.some(e => e.type === "field" && e.kind === "summon" && e.ownerSide === "you"));
    v = r.view; assert.equal(v.you.monsters.filter(Boolean).length, 1);
    const second = v.you.hand.find(c => c.isMonster && c.act && c.act.summon);
    assert.equal(second, undefined, "second Normal Summon is no longer offered");
    const other = v.you.hand.find(c => c.isMonster);
    if (other) { const bad = s.act("summon", { uid: other.uid, tributes: [] }); assert.equal(bad.ok, false); assert.ok(bad.message); }
    else { const bad = s.act("summon", { uid: "c99999", tributes: [] }); assert.equal(bad.ok, false); }
});
test("Ending the turn plays the bot's turn step by step and returns control", () => {
    const s = start("yugi", "kaiba"); let r = s.act("endTurn"); let guard = 0;
    const seen = new Set(r.events.map(e => e.type));
    while ((r.view.botBusy || (r.view.prompt && /Response|chain/.test(r.view.prompt.type))) && guard++ < 400) {
        // the human may legitimately be offered a response (e.g. Kuriboh in hand); decline and carry on
        r = r.view.botBusy ? s.act("step") : s.act("passResponse");
        r.events.forEach(e => seen.add(e.type));
    }
    assert.ok(guard < 400, "the bot finished its turn");
    if (r.view.gameOver) return;            // the bot got lucky and won outright
    assert.equal(r.view.turnOf, "you"); assert.equal(r.view.phase, "m1"); assert.equal(r.view.turn, 3);
    assert.ok(seen.has("turn") && seen.has("phase"));
    assert.ok(r.view.you.hand.length >= 4, "human drew for the turn");
});
test("Going second: the bot opens the duel and the human is handed control", () => {
    const s = start("yugi", "kaiba", "bot"); let r = s.state(), guard = 0;
    while (r.view.botBusy && guard++ < 400) r = s.act("step");
    assert.equal(r.view.turnOf, "you"); assert.equal(r.view.turn, 2);
});
test("Phase buttons follow the rules (no Battle Phase on turn 1)", () => {
    const v = start().state().view;
    assert.deepEqual(v.phaseButtons.map(b => b.id), ["end"]);
});
test("Surrender ends the duel with a winner", () => {
    const s = start(); const r = s.act("surrender");
    assert.equal(r.view.gameOver, true); assert.equal(r.view.winner, "opp");
    assert.ok(r.events.some(e => e.type === "gameover"));
    assert.equal(s.act("endTurn").ok, false);
});
test("Choice windows reach the human as a prompt and can be answered", () => {
    const s = start("yugi", "kaiba");
    s.game.player1 === s.human || (s.game.player2 === s.human);
    const gc = s.human.zone.hand[0];
    s.game.requestChoice(s.human, { prompt: "Pick one", candidates: s.human.zone.hand.slice(0, 3), min: 1, max: 1, onChoose: () => {} });
    const v = s.state().view;
    assert.equal(v.prompt.type, "choice"); assert.equal(v.prompt.cards.length, 3);
    const r = s.act("choice", { uids: [v.prompt.cards[1].uid] });
    assert.ok(r.ok); assert.equal(r.view.prompt, null);
});

// ---------------------------------------------------------------- HTTP API
test("HTTP API: deck list, duel start, state and an action", async () => {
    const app = require("../server.js");
    const srv = app.listen(0);
    try {
        const base = `http://localhost:${srv.address().port}`;
        const j = (u, o) => fetch(base + u, o);
        const decks = await (await j("/api/decks")).json();
        assert.ok(decks.decks.length >= 6 && decks.decks[0].script);
        const detail = await (await j("/api/decks/yugi")).json();
        assert.ok(detail.main.length > 10 && detail.main[0].script.status);
        assert.equal((await j("/api/decks/nonexistent")).status, 404);
        // no duel yet for a fresh browser
        assert.equal((await j("/api/duel/state")).status, 404);
        const start = await j("/api/duel/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerDeck: "yugi", botDeck: "random", first: "you" }) });
        assert.equal(start.status, 200);
        const cookie = start.headers.get("set-cookie").split(";")[0];
        const st = await (await j("/api/duel/state", { headers: { cookie } })).json();
        assert.equal(st.view.you.hand.length, 5);
        const act = await (await j("/api/duel/act", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ type: "endTurn" }) })).json();
        assert.ok(act.view && Array.isArray(act.events));
        const bad = await j("/api/duel/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerDeck: "zzz", botDeck: "yugi" }) });
        assert.equal(bad.status, 400);
        for (const page of ["/", "/decks", "/duel", "/duel/play"]) assert.equal((await j(page)).status, 200, page);
    } finally { srv.close(); }
});
