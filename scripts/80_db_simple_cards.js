/**
 * scripts/80_db_simple_cards.js
 *
 * Card-database cards whose full text is short and unambiguous, built from
 * a handful of factories. Card TYPE (Spell/Trap, Equip/Quick-Play/...) is
 * read from the database itself so it can't drift from the card.
 *
 * Anything with extra clauses is either scripted fully elsewhere or left a
 * stub — never half-implemented without a Registry.partial() note.
 */
"use strict";
const L = require("./_lib");
const LocalCards = require("../LocalCards");

function install(Effects) {
    const R = Effects.Registry;

    // ---- derive the engine meta from the database row ----------------------------
    function baseMeta(name, extra = {}) {
        const row = LocalCards.rowByName(name);
        if (!row) throw new Error(`scripts/80: "${name}" is not in the card database`);
        const card = LocalCards.toApiShape(row);
        const isTrap = /Trap/.test(card.type);
        const sub = { "Normal": "normal", "Quick-Play": "quickplay", "Continuous": "continuous", "Equip": "equip", "Field": "field", "Counter": "normal", "Ritual": "normal" }[card.race] || "normal";
        const window = extra.window || (isTrap ? "anytime" : sub === "quickplay" ? "anytime" : "main");
        return { kind: isTrap ? "trap" : "spell", subtype: sub, window, ...extra };
    }
    const def = (name, extra, handler) => R.spellTrap(name, baseMeta(name, extra), handler);

    const oppOf = (g, gc) => L.opp(g, gc);
    const faceUpMons = g => L.allMons(g).filter(m => m.faceUp);
    const ownDiscardCost = (game, gc, n, prompt, then) => {
        const o = gc.owner;
        L.choose(game, o, { prompt, candidates: o.zone.hand.slice(), min: n, max: n, alwaysAsk: true }, picked => {
            picked.forEach(c => L.send(c, "graveyard"));
            game.addLog(`${o.name} discards ${picked.map(c => c.card.name).join(", ")}.`);
            then(picked);
        });
    };
    const handOthers = (gc, n) => gc.owner.zone.hand.filter(c => c !== gc).length >= n;

    // ======================= Equip Spells (stat only) ===============================
    const equip = (name, test, atk, def_, partialNote) => {
        def(name, {
            needsTarget: "custom", aiUse: () => true,
            targets: (g, gc) => faceUpMons(g).filter(test),
            aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp && test(m)))
        }, (game, gc, target) => {
            if (!target || target.location !== "monster") return;
            L.equip(game, gc, target, atk, def_);
        });
        if (partialNote) R.partial(name, partialNote);
    };
    const race = r => m => m.card.race === r, attr = a => m => m.card.attribute === a;
    equip("Dragon Treasure", race("Dragon"), 300, 300);
    equip("Silver Bow and Arrow", race("Fairy"), 300, 300);
    equip("Dark Energy", race("Fiend"), 300, 300);
    equip("Violet Crystal", race("Zombie"), 300, 300);
    equip("Steel Shell", attr("WATER"), 400, -200);
    equip("Burning Spear", attr("FIRE"), 400, -200);
    equip("Sword of Dark Destruction", attr("DARK"), 400, -200);
    equip("Legendary Ebon Steed", m => /six samurai/i.test(m.card.name), 200, 200, "The +200 ATK/DEF works; the destruction-substitution clause is not implemented.");
    equip("Fuhma Shuriken", m => /ninja/i.test(m.card.name) || m.card.archetype === "Ninja", 700, 0, "The +700 ATK works; the 700 damage when sent to the Graveyard is not implemented.");
    equip("Sword of Dark Rites", attr("DARK"), 400, 0, "The +400 ATK works; the Tribute/return-to-hand clause is not implemented.");

    // ======================= Continuous / Field stat boosts =========================
    const cont = (name, extra, fn) => {
        def(name, { aiUse: () => true, ...extra }, g => g.addLog(`${name} is now active.`));
        R.continuous(name, fn);
    };
    cont("Wetlands", {}, (g, s, t) => (t.card.race === "Aqua" && t.card.attribute === "WATER" && (t.card.level || 99) <= 2 ? { atk: 1200 } : null));
    cont("Mystic Plasma Zone", {}, (g, s, t) => (t.card.attribute === "DARK" ? { atk: 500, def: -400 } : null));
    cont("Molten Destruction", {}, (g, s, t) => (t.card.attribute === "FIRE" ? { atk: 500, def: -400 } : null));
    cont("Jurassic World", {}, (g, s, t) => (t.card.race === "Dinosaur" ? { atk: 300, def: 300 } : null));
    cont("Yellow Luster Shield", {}, (g, s, t) => (t.owner === s.owner ? { def: 300 } : null));
    cont("Banner of Courage", {}, (g, s, t) => (t.owner === s.owner && g.phase === "battle" && g.currentPlayer === s.owner ? { atk: 200 } : null));
    cont("The A. Forces", {}, (g, s, t) => {
        if (t.owner !== s.owner || t.card.race !== "Warrior") return null;
        const n = L.mons(s.owner).filter(m => m.faceUp && (m.card.race === "Warrior" || m.card.race === "Spellcaster")).length;
        return { atk: 200 * n };
    });

    // ======================= Life Points / draw =====================================
    const simple = (name, extra, fn) => def(name, { aiUse: () => true, ...extra }, fn);
    simple("Ookazi", {}, (g, gc) => { oppOf(g, gc).dealDamage(800); g.addLog("Ookazi inflicts 800 damage!"); });
    simple("Hinotama", {}, (g, gc) => { oppOf(g, gc).dealDamage(500); g.addLog("Hinotama inflicts 500 damage!"); });
    simple("Blue Medicine", {}, (g, gc) => { gc.owner.lifePoints += 400; g.addLog(`${gc.owner.name} gains 400 LP.`); });
    simple("Goblin's Secret Remedy", {}, (g, gc) => { gc.owner.lifePoints += 600; g.addLog(`${gc.owner.name} gains 600 LP.`); });
    simple("Jar of Greed", { aiUse: () => true }, (g, gc) => { gc.owner.drawCard(1); g.addLog(`${gc.owner.name} draws 1 card with Jar of Greed.`); });
    simple("The Gift of Greed", { aiUse: () => false }, (g, gc) => { oppOf(g, gc).drawCard(2); g.addLog(`${oppOf(g, gc).name} draws 2 cards.`); });
    simple("D.D. Dynamite", { condition: (g, gc) => oppOf(g, gc).zone.banished.length > 0 }, (g, gc) => {
        const n = oppOf(g, gc).zone.banished.length * 300; oppOf(g, gc).dealDamage(n); g.addLog(`D.D. Dynamite inflicts ${n} damage!`);
    });
    simple("Rock Bombardment", { condition: (g, gc) => gc.owner.zone.deck.some(c => c.card.race === "Rock" && L.isMonster(c)) }, (g, gc) => {
        L.choose(g, gc.owner, { prompt: "Send 1 Rock monster from your Deck to the Graveyard", candidates: gc.owner.zone.deck.filter(c => c.card.race === "Rock" && L.isMonster(c)), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            L.send(c, "graveyard"); oppOf(g, gc).dealDamage(500); g.addLog("Rock Bombardment inflicts 500 damage!");
        });
    });
    simple("Destruction Ring", {
        needsTarget: "custom", targets: (g, gc) => L.mons(gc.owner).filter(m => m.faceUp),
        condition: (g, gc) => L.mons(gc.owner).some(m => m.faceUp),
        aiTarget: (g, gc) => L.worst(g, L.mons(gc.owner).filter(m => m.faceUp)), aiUse: (g, gc) => oppOf(g, gc).lifePoints <= 2000
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        L.destroy(g, t); [g.player1, g.player2].forEach(p => p.dealDamage(1000)); g.addLog("Destruction Ring inflicts 1000 damage to both players!");
    });

    // ======================= Removal ================================================
    const fieldCards = g => [...L.allMons(g), ...L.allSTs(g)];
    def("Raigeki Break", {
        needsTarget: "custom", targets: (g, gc) => fieldCards(g).filter(c => c !== gc),
        condition: (g, gc) => handOthers(gc, 1), aiTarget: (g, gc) => L.best(g, L.mons(oppOf(g, gc))), aiUse: (g, gc) => gc.owner.zone.hand.length >= 3
    }, (g, gc, t) => ownDiscardCost(g, gc, 1, "Discard 1 card (cost)", () => {
        if (t && ["monster", "spellTrap"].includes(t.location)) { const n = t.card.name; L.destroy(g, t); g.addLog(`Raigeki Break destroys ${n}!`); }
    }));
    def("Breath of Light", { condition: (g) => faceUpMons(g).some(m => m.card.race === "Rock"), aiUse: (g, gc) => faceUpMons(g).filter(m => m.card.race === "Rock" && m.owner !== gc.owner).length > 0 && !L.mons(gc.owner).some(m => m.card.race === "Rock") },
        (g) => { const r = faceUpMons(g).filter(m => m.card.race === "Rock"); L.destroyAll(g, r); g.addLog(`Breath of Light destroys ${r.length} Rock monster(s).`); });
    const isEquipCard = c => /Spell/.test(c.card.type) && c.card.race === "Equip";
    def("Disarmament", { condition: (g) => L.allSTs(g).some(isEquipCard), aiUse: (g, gc) => L.allSTs(g).filter(isEquipCard).some(c => c.owner !== gc.owner) },
        (g) => { const e = L.allSTs(g).filter(isEquipCard); L.destroyAll(g, e); g.addLog(`Disarmament destroys ${e.length} Equip Card(s).`); });
    def("Final Destiny", { condition: (g, gc) => handOthers(gc, 5), aiUse: (g, gc) => L.mons(oppOf(g, gc)).length >= 3 && handOthers(gc, 5) && L.mons(gc.owner).length === 0 },
        (g, gc) => ownDiscardCost(g, gc, 5, "Discard 5 cards (cost)", () => {
            const all = fieldCards(g); L.destroyAll(g, all); g.addLog(`Final Destiny destroys ${all.length} card(s) on the field!`);
        }));
    def("Ritual Sealing", {
        needsTarget: "custom", targets: g => faceUpMons(g).filter(m => /Ritual/.test(m.card.type)), condition: g => faceUpMons(g).some(m => /Ritual/.test(m.card.type)),
        aiTarget: (g, gc) => L.best(g, L.mons(oppOf(g, gc)).filter(m => m.faceUp && /Ritual/.test(m.card.type))), aiUse: () => true
    }, (g, gc, t) => { if (t && t.location === "monster") { const n = t.card.name; L.destroy(g, t); g.addLog(`Ritual Sealing destroys ${n}.`); } });
    const isContSpell = c => c.faceUp && /Spell/.test(c.card.type) && c.card.race === "Continuous";
    const isContTrap = c => c.faceUp && /Trap/.test(c.card.type) && c.card.race === "Continuous";
    def("Spell Purification", { condition: (g, gc) => handOthers(gc, 1) && L.allSTs(g).some(isContSpell) }, (g, gc) =>
        ownDiscardCost(g, gc, 1, "Discard 1 card (cost)", () => { const t = L.allSTs(g).filter(isContSpell); L.destroyAll(g, t); g.addLog(`Spell Purification destroys ${t.length} Continuous Spell(s).`); }));
    def("Malice Dispersion", { condition: (g, gc) => handOthers(gc, 1) && L.allSTs(g).some(isContTrap) }, (g, gc) =>
        ownDiscardCost(g, gc, 1, "Discard 1 card (cost)", () => { const t = L.allSTs(g).filter(isContTrap); L.destroyAll(g, t); g.addLog(`Malice Dispersion destroys ${t.length} Continuous Trap(s).`); }));
    def("Dark Magic Attack", { condition: (g, gc) => L.mons(gc.owner).some(m => m.faceUp && L.is(m, "Dark Magician")) && L.sts(oppOf(g, gc)).length > 0, aiUse: () => true },
        (g, gc) => { const t = L.sts(oppOf(g, gc)); L.destroyAll(g, t); g.addLog(`Dark Magic Attack destroys ${t.length} Spell/Trap Card(s)!`); });
    def("Ojama Delta Hurricane!!", { condition: (g, gc) => ["Ojama Green", "Ojama Yellow", "Ojama Black"].every(n => L.mons(gc.owner).some(m => m.faceUp && L.is(m, n))), aiUse: () => true },
        (g, gc) => { const t = [...L.mons(oppOf(g, gc)), ...L.sts(oppOf(g, gc))]; L.destroyAll(g, t); g.addLog(`Ojama Delta Hurricane!! destroys ${t.length} card(s)!`); });
    def("Soul Release", { condition: g => g.player1.zone.graveyard.length + g.player2.zone.graveyard.length > 0, aiUse: () => false }, (g, gc) => {
        const cands = [...g.player1.zone.graveyard, ...g.player2.zone.graveyard];
        L.choose(g, gc.owner, { prompt: "Banish up to 5 cards from Graveyards", candidates: cands, min: 1, max: Math.min(5, cands.length), alwaysAsk: true }, picked => {
            picked.forEach(c => L.send(c, "banished")); g.addLog(`Soul Release banishes ${picked.length} card(s).`);
        });
    });
    // Traps that react to an attack
    def("Dark Mirror Force", { window: "response", aiUse: (g, gc) => L.mons(oppOf(g, gc)).some(m => m.position === "defense") }, (g, gc) => {
        const t = L.mons(oppOf(g, gc)).filter(m => m.position === "defense"); t.forEach(m => L.send(m, "banished")); g.addLog(`Dark Mirror Force banishes ${t.length} Defense Position monster(s)!`);
    });
    def("Malevolent Catastrophe", { window: "response", aiUse: (g, gc) => L.allSTs(g).filter(c => c.owner !== gc.owner).length >= L.allSTs(g).filter(c => c.owner === gc.owner).length }, (g, gc) => {
        const t = L.allSTs(g).filter(c => c !== gc); L.destroyAll(g, t); g.addLog(`Malevolent Catastrophe destroys ${t.length} Spell/Trap Card(s)!`);
    });

    // ======================= Stat tricks ============================================
    const trick = (name, atk, def_, extra = {}) => def(name, {
        needsTarget: "custom", targets: g => faceUpMons(g), condition: g => faceUpMons(g).length > 0,
        aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp)), aiUse: () => false, ...extra
    }, (g, gc, t) => { if (t && t.location === "monster") { L.tempStat(g, t, atk, def_); g.addLog(`${name}: ${t.card.name} ${atk ? (atk > 0 ? "+" : "") + atk + " ATK " : ""}${def_ ? (def_ > 0 ? "+" : "") + def_ + " DEF" : ""} until the end of the turn.`); } });
    trick("Shield Spear", 400, 400);
    trick("Snake Fang", 0, -500, { aiTarget: (g, gc) => L.best(g, L.mons(oppOf(g, gc)).filter(m => m.faceUp)) });
    trick("The Reliable Guardian", 0, 700);
    def("Micro Ray", { needsTarget: "custom", targets: g => faceUpMons(g), condition: g => faceUpMons(g).length > 0, aiUse: () => false }, (g, gc, t) => {
        if (t && t.location === "monster") { L.tempStat(g, t, 0, -g.getDef(t)); g.addLog(`Micro Ray: ${t.card.name}'s DEF becomes 0 until the end of the turn.`); }
    });
    def("The Big March of Animals", { condition: (g, gc) => L.mons(gc.owner).some(m => m.faceUp && m.card.race === "Beast"), aiUse: () => false }, (g, gc) => {
        const beasts = L.mons(gc.owner).filter(m => m.faceUp && m.card.race === "Beast");
        beasts.forEach(m => L.tempStat(g, m, 200 * beasts.length, 0)); g.addLog(`The Big March of Animals: Beasts gain ${200 * beasts.length} ATK until the end of the turn.`);
    });
    def("Book of Moon", {
        needsTarget: "custom", targets: g => faceUpMons(g), condition: g => faceUpMons(g).length > 0,
        aiTarget: (g, gc) => L.best(g, L.mons(oppOf(g, gc)).filter(m => m.faceUp)), aiUse: () => false
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        t.faceUp = false; t.position = "defense"; g.addLog(`Book of Moon turns ${t.card.name} face-down in Defense Position.`);
    });

    // ======================= Search / graveyard recovery ============================
    const search = (name, filter, from = ["deck"], prompt) => def(name, {
        aiUse: () => true, condition: (g, gc) => from.some(z => gc.owner.zone[z].some(filter))
    }, (g, gc) => {
        const o = gc.owner;
        const cands = from.flatMap(z => o.zone[z].filter(filter));
        L.choose(g, o, { prompt, candidates: cands, min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            const z = c.location; o.moveCard(c, z, "hand"); if (z === "deck") o.shuffleDeck();
            g.addLog(`${o.name} adds ${c.card.name} to their hand.`);
        });
    });
    search("E - Emergency Call", c => L.isMonster(c) && /elemental hero/i.test(c.card.name), ["deck"], "Add 1 \"Elemental HERO\" monster to your hand");
    search("Emblem of Dragon Destroyer", c => L.is(c, "Buster Blader"), ["deck", "graveyard"], "Add 1 \"Buster Blader\" to your hand");
    def("Dark Eruption", {
        needsTarget: "custom", aiUse: () => true,
        targets: (g, gc) => gc.owner.zone.graveyard.filter(c => L.isMonster(c) && c.card.attribute === "DARK" && (c.card.atk || 0) <= 1500),
        aiTarget: (g, gc) => gc.owner.zone.graveyard.filter(c => L.isMonster(c) && c.card.attribute === "DARK" && (c.card.atk || 0) <= 1500)[0] || null
    }, (g, gc, t) => { if (t && t.location === "graveyard") { gc.owner.moveCard(t, "graveyard", "hand"); g.addLog(`Dark Eruption adds ${t.card.name} to the hand.`); } });
    def("Light of Redemption", {
        needsTarget: "custom", cost: { lp: 800 }, aiUse: () => true,
        targets: (g, gc) => gc.owner.zone.banished.filter(c => L.isMonster(c) && c.card.attribute === "LIGHT"),
        aiTarget: (g, gc) => gc.owner.zone.banished.filter(c => L.isMonster(c) && c.card.attribute === "LIGHT")[0] || null
    }, (g, gc, t) => { if (t && t.location === "banished") { gc.owner.moveCard(t, "banished", "hand"); g.addLog(`Light of Redemption adds ${t.card.name} to the hand.`); } });
    def("Sage's Stone", {
        aiUse: () => true,
        condition: (g, gc) => L.mons(gc.owner).some(m => m.faceUp && L.is(m, "Dark Magician Girl")) && gc.owner.getFreeMonsterSlot() !== -1 && [...gc.owner.zone.hand, ...gc.owner.zone.deck].some(c => L.is(c, "Dark Magician"))
    }, (g, gc) => {
        const o = gc.owner, cands = [...o.zone.hand, ...o.zone.deck].filter(c => L.is(c, "Dark Magician"));
        L.choose(g, o, { prompt: "Special Summon \"Dark Magician\"", candidates: cands, min: 1, max: 1 }, ([c]) => { const z = c.location; L.specialSummon(g, c, o); if (z === "deck") o.shuffleDeck(); });
    });
    def("Solar Recharge", { aiUse: () => true, condition: (g, gc) => gc.owner.zone.hand.some(c => c !== gc && L.isMonster(c) && /lightsworn/i.test(c.card.name)) && gc.owner.zone.deck.length >= 4 }, (g, gc) => {
        const o = gc.owner;
        L.choose(g, o, { prompt: "Discard 1 \"Lightsworn\" monster (cost)", candidates: o.zone.hand.filter(c => L.isMonster(c) && /lightsworn/i.test(c.card.name)), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            L.send(c, "graveyard"); o.drawCard(2);
            for (let i = 0; i < 2 && o.zone.deck.length; i++) L.send(o.zone.deck[0], "graveyard");
            g.addLog("Solar Recharge: draws 2 and sends the top 2 cards of the Deck to the Graveyard.");
        });
    });
    def("Next to be Lost", {
        needsTarget: "custom", aiUse: () => true,
        targets: (g, gc) => L.mons(gc.owner).filter(m => m.faceUp && gc.owner.zone.deck.some(c => c.card.name === m.card.name)),
        aiTarget: (g, gc) => L.mons(gc.owner).find(m => m.faceUp && gc.owner.zone.deck.some(c => c.card.name === m.card.name)) || null
    }, (g, gc, t) => { const c = t && gc.owner.zone.deck.find(x => x.card.name === t.card.name); if (c) { L.send(c, "graveyard"); g.addLog(`Next to be Lost sends ${c.card.name} from the Deck to the Graveyard.`); } });
    def("Snake Rain", { aiUse: () => true, condition: (g, gc) => handOthers(gc, 1) && gc.owner.zone.deck.filter(c => L.isMonster(c) && c.card.race === "Reptile").length >= 4 }, (g, gc) =>
        ownDiscardCost(g, gc, 1, "Discard 1 card (cost)", () => {
            L.choose(g, gc.owner, { prompt: "Send 4 Reptile monsters from your Deck to the Graveyard", candidates: gc.owner.zone.deck.filter(c => L.isMonster(c) && c.card.race === "Reptile"), min: 4, max: 4, alwaysAsk: true }, picked => {
                picked.forEach(c => L.send(c, "graveyard")); g.addLog("Snake Rain sends 4 Reptile monsters to the Graveyard.");
            });
        }));

    // ======================= Hand manipulation ======================================
    def("Exchange", { aiUse: (g, gc) => false, condition: (g, gc) => gc.owner.zone.hand.length > 1 && oppOf(g, gc).zone.hand.length > 0 }, (g, gc) => {
        const me = gc.owner, foe = oppOf(g, gc);
        L.choose(g, me, { prompt: "Exchange: take 1 card from your opponent's hand", candidates: foe.zone.hand.slice(), min: 1, max: 1, alwaysAsk: true }, ([theirs]) => {
            L.choose(g, foe, { prompt: "Exchange: take 1 card from your opponent's hand", candidates: me.zone.hand.slice(), min: 1, max: 1, alwaysAsk: true }, ([mine]) => {
                g.transferCard(theirs, foe, "hand", me, "hand");
                g.transferCard(mine, me, "hand", foe, "hand");
                g.addLog("Both players exchange a card from each other's hand.");
            });
        });
    });
    def("Confiscation", { cost: { lp: 1000 }, aiUse: (g, gc) => oppOf(g, gc).zone.hand.length > 0 && gc.owner.lifePoints > 3000, condition: (g, gc) => oppOf(g, gc).zone.hand.length > 0 }, (g, gc) => {
        const foe = oppOf(g, gc);
        L.choose(g, gc.owner, { prompt: "Confiscation: choose 1 card in your opponent's hand to discard", candidates: foe.zone.hand.slice(), min: 1, max: 1, alwaysAsk: true }, ([c]) => { L.send(c, "graveyard"); g.addLog(`Confiscation discards ${c.card.name}.`); });
    });
    def("Spiritual Water Art - Aoi", {
        aiUse: (g, gc) => oppOf(g, gc).zone.hand.length > 0 && L.mons(gc.owner).some(m => m.card.attribute === "WATER"),
        condition: (g, gc) => L.mons(gc.owner).some(m => m.faceUp && m.card.attribute === "WATER") && oppOf(g, gc).zone.hand.length > 0
    }, (g, gc) => {
        const o = gc.owner, foe = oppOf(g, gc);
        L.choose(g, o, { prompt: "Tribute 1 WATER monster", candidates: L.mons(o).filter(m => m.faceUp && m.card.attribute === "WATER"), min: 1, max: 1, alwaysAsk: true }, ([t]) => {
            t._noReplace = true; L.send(t, "graveyard");
            L.choose(g, o, { prompt: "Send 1 card from your opponent's hand to the Graveyard", candidates: foe.zone.hand.slice(), min: 1, max: 1, alwaysAsk: true }, ([c]) => { L.send(c, "graveyard"); g.addLog(`Spiritual Water Art - Aoi sends ${c.card.name} to the Graveyard.`); });
        });
    });
    def("Success Probability 0%", { aiUse: (g, gc) => oppOf(g, gc).zone.extraDeck.length >= 2, condition: (g, gc) => oppOf(g, gc).zone.extraDeck.some(c => /Fusion/.test(c.card.type)) }, (g, gc) => {
        const foe = oppOf(g, gc), fus = foe.zone.extraDeck.filter(c => /Fusion/.test(c.card.type));
        const picks = fus.slice().sort(() => Math.random() - .5).slice(0, 2);
        picks.forEach(c => L.send(c, "graveyard")); g.addLog(`Success Probability 0% sends ${picks.length} Fusion Monster(s) from the Extra Deck to the Graveyard.`);
    });
}
module.exports = { install };
