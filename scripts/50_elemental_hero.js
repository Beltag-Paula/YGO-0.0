/**
 * scripts/50_elemental_hero.js — Elemental HERO monsters and their support, from the database text.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const def = (name, extra, fn) => R.spellTrap(name, L.dbMeta(name, extra), fn);
    const isEH = gc => L.isMonster(gc) && /^Elemental HERO /.test(gc.card.name);
    const isHero = gc => L.isMonster(gc) && /HERO/.test(gc.card.name);
    const ehOnField = (p, except) => L.mons(p).filter(m => m.faceUp && isEH(m) && m !== except);
    const foe = (g, gc) => L.opp(g, gc);
    const maybe = (g, p, opts, fn) => g.requestChoice(p, { ...opts, min: 0, max: opts.max || 1, optional: true, onChoose: picked => fn(picked) });

    // ---------------------------- monsters ----------------------------
    R.trapImmune("Elemental HERO Wildheart");

    R.dynamic("Elemental HERO Heat", (g, gc) => ({ atk: 200 * ehOnField(gc.owner).length, def: 0 }));

    R.endPhaseTrigger("Elemental HERO Lady Heat", (g, gc) => {
        const n = ehOnField(gc.owner).length;
        if (!n) return;
        foe(g, gc).dealDamage(200 * n); g.addLog(`Elemental HERO Lady Heat inflicts ${200 * n} damage!`);
    });

    // Bubbleman
    R.handIgnition("Elemental HERO Bubbleman", {
        canActivate: (g, gc) => gc.owner.zone.hand.length === 1 && gc.owner.getFreeMonsterSlot() !== -1,
        activate: (g, gc) => { L.specialSummon(g, gc, gc.owner); g.addLog("Elemental HERO Bubbleman is Special Summoned from the hand."); return true; }
    });
    const bubble = (g, gc) => {
        const o = gc.owner, alone = () => o.zone.hand.length === 0 && L.mons(o).concat(L.sts(o)).every(c => c === gc) && o.zone.deck.length >= 2;
        if (!alone()) return;
        g.requestOption(o, { prompt: "Elemental HERO Bubbleman: draw 2 cards?", options: [{ id: "yes", label: "Draw 2 cards" }, { id: "no", label: "No" }], aiPick: () => "yes",
            onChoose: id => { if (id === "yes" && alone()) { o.drawCard(2); g.addLog(`${o.name} draws 2 cards with Bubbleman.`); } } });
    };
    bubble.anySummon = true; R.onSummon("Elemental HERO Bubbleman", bubble);

    // Stratos
    const stratos = (g, gc) => {
        const o = gc.owner, n = L.mons(o).filter(m => m.faceUp && isHero(m) && m !== gc).length;
        const opts = [];
        if (n > 0 && L.allSTs(g).length) opts.push({ id: "destroy", label: `Destroy up to ${n} Spell/Trap Card(s) on the field` });
        if (o.zone.deck.some(isHero)) opts.push({ id: "search", label: "Add 1 \"HERO\" monster from your Deck to your hand" });
        if (!opts.length) return;
        g.requestOption(o, { prompt: "Elemental HERO Stratos: choose 1 effect", options: opts, aiPick: () => opts[0].id, onChoose: id => {
            if (id === "search") return L.addToHand(g, gc, isHero, { prompt: "Add 1 \"HERO\" monster to your hand" });
            const cands = L.allSTs(g);
            g.requestChoice(o, { prompt: `Destroy up to ${n} Spell/Trap Card(s)`, candidates: cands, min: 1, max: Math.min(n, cands.length), onField: true, optional: false,
                aiPick: (gm, c) => c.filter(x => x.owner !== o).concat(c.filter(x => x.owner === o)).slice(0, Math.min(n, c.length)),
                onChoose: picked => { picked.forEach(c => L.destroy(g, c)); g.addLog(`Stratos destroys ${picked.map(c => c.card.name).join(", ")}.`); } });
        } });
    };
    stratos.anySummon = true; R.onSummon("Elemental HERO Stratos", stratos);

    // Captain Gold
    R.handIgnition("Elemental HERO Captain Gold", {
        canActivate: (g, gc) => gc.owner.zone.deck.some(c => Effects.normalize(c.card.name) === "skyscraper"),
        activate: (g, gc) => {
            L.send(gc, "graveyard"); g.addLog(`${gc.owner.name} discards Elemental HERO Captain Gold.`);
            return L.addToHand(g, gc, c => Effects.normalize(c.card.name) === "skyscraper", { prompt: "Add 1 \"Skyscraper\" to your hand" }) || true;
        }
    });
    R.stateCheck("Elemental HERO Captain Gold", (g, gc) => {
        const sky = L.allSTs(g).some(c => c.faceUp && Effects.normalize(c.card.name) === "skyscraper");
        if (!sky && gc.location === "monster") { g.addLog("Elemental HERO Captain Gold is destroyed because \"Skyscraper\" is not face-up on the field."); L.destroy(g, gc); }
    });

    // Knospe
    R.battleDamageTrigger("Elemental HERO Knospe", (g, gc) => { gc.modifiers.atk += 100; gc.modifiers.def -= 100; g.addLog("Elemental HERO Knospe gains 100 ATK and loses 100 DEF."); });
    R.attackShield("Elemental HERO Knospe", (g, src, target) => target === src && ehOnField(src.owner, src).length > 0);
    R.directAttackWhen("Elemental HERO Knospe", (g, gc) => ehOnField(gc.owner, gc).length > 0);

    // Voltic
    R.battleDamageTrigger("Elemental HERO Voltic", (g, gc) => {
        const o = gc.owner, c = o.zone.banished.filter(isEH);
        if (!c.length || o.getFreeMonsterSlot() === -1) return;
        maybe(g, o, { prompt: "Elemental HERO Voltic: Special Summon 1 of your banished \"Elemental HERO\" monsters?", candidates: c, aiPick: (gm, cs) => [cs.slice().sort((a, b) => (b.card.atk || 0) - (a.card.atk || 0))[0]] }, ([t]) => { if (t) L.specialSummon(g, t, o); });
    });

    // Standby Phase: Woodsman / Ocean
    R.standbyTrigger("Elemental HERO Woodsman", (g, gc) => {
        if (gc._standbyTurn === g.turn) return; const o = gc.owner;
        const c = [...o.zone.deck, ...o.zone.graveyard].filter(x => Effects.normalize(x.card.name) === "polymerization");
        if (!c.length) return;
        maybe(g, o, { prompt: "Elemental HERO Woodsman: add \"Polymerization\" from your Deck or Graveyard to your hand?", candidates: c }, ([t]) => { if (t) { gc._standbyTurn = g.turn; const z = t.location; o.moveCard(t, z, "hand"); if (z === "deck") o.shuffleDeck(); g.addLog(`${o.name} adds Polymerization to their hand.`); } });
    });
    R.standbyTrigger("Elemental HERO Ocean", (g, gc) => {
        if (gc._standbyTurn === g.turn) return; const o = gc.owner;
        const c = [...L.mons(o).filter(m => m.faceUp && isHero(m)), ...o.zone.graveyard.filter(isHero)];
        if (!c.length) return;
        maybe(g, o, { prompt: "Elemental HERO Ocean: return 1 \"HERO\" monster you control or in your Graveyard to the hand?", candidates: c }, ([t]) => { if (t) { gc._standbyTurn = g.turn; t.owner.moveCard(t, t.location, "hand"); g.addLog(`${t.card.name} returns to the hand.`); } });
    });

    // ---------------------------- Fusion Monsters ----------------------------
    const burnOnKill = name => R.battleDestroyTrigger(name, (g, gc, d) => {
        if (d.location !== "graveyard") return; const n = d.card.atk || 0; if (n > 0) { d.owner.dealDamage(n); g.addLog(`${name} inflicts ${n} damage (the destroyed monster's ATK)!`); }
    });
    burnOnKill("Elemental HERO Flame Wingman"); R.unpartial("Elemental HERO Flame Wingman");
    burnOnKill("Elemental HERO Shining Flare Wingman");
    R.dynamic("Elemental HERO Shining Flare Wingman", (g, gc) => ({ atk: 300 * gc.owner.zone.graveyard.filter(isEH).length, def: 0 })); R.unpartial("Elemental HERO Shining Flare Wingman");
    R.battleDestroyTrigger("Elemental HERO Steam Healer", (g, gc, d) => { if (d.location !== "graveyard") return; const n = d.card.atk || 0; if (n > 0) { gc.owner.lifePoints += n; g.addLog(`Elemental HERO Steam Healer gains ${n} LP.`); } });
    R.unpartial("Elemental HERO Steam Healer");
    R.attackAll("Elemental HERO Wildedge"); R.unpartial("Elemental HERO Wildedge");
    R.directAttackWhen("Elemental HERO Mariner", (g, gc) => gc.owner.zone.spellTrap.some(c => c && !c.faceUp)); R.unpartial("Elemental HERO Mariner");

    // ---------------------------- Spells & Traps ----------------------------
    def("Hero Signal", {
        condition: (g, gc) => g.battleDestroyed.some(e => e.owner === gc.owner) && gc.owner.getFreeMonsterSlot() !== -1 && [...gc.owner.zone.hand, ...gc.owner.zone.deck].some(c => isEH(c) && (c.card.level || 9) <= 4), aiUse: () => true
    }, (g, gc) => {
        const o = gc.owner, c = [...o.zone.hand, ...o.zone.deck].filter(x => isEH(x) && (x.card.level || 9) <= 4);
        L.choose(g, o, { prompt: "Hero Signal: Special Summon 1 Level 4 or lower \"Elemental HERO\" from your hand or Deck", candidates: c, min: 1, max: 1, alwaysAsk: true }, ([t]) => { const z = t.location; L.specialSummon(g, t, o); if (z === "deck") o.shuffleDeck(); });
    });
    def("Hero Barrier", { condition: (g, gc) => g.currentPlayer !== gc.owner && ehOnField(gc.owner).length > 0, aiUse: () => true }, (g, gc) => {
        g.negateNextAttack = { player: foe(g, gc), turn: g.turn }; g.addLog("Hero Barrier: the next attack from the opponent's monsters this turn will be negated.");
    });
    def("Hero Heart", {
        needsTarget: "custom", targets: (g, gc) => ehOnField(gc.owner), aiTarget: (g, gc) => L.best(g, ehOnField(gc.owner)), aiUse: (g, gc) => g.phase === "battle"
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        L.tempStat(g, t, -Math.floor(g.getAtk(t) / 2), 0);
        t.state.bonusAttack = true; t.state.usedSecondAttack = false; g.turnEffects.push(() => { t.state.bonusAttack = false; });
        g.addLog(`Hero Heart halves ${t.card.name}'s ATK, but it can attack twice this Battle Phase.`);
    });
    def("Hero Ring", {
        staysOnField: true, needsTarget: "custom", targets: g => L.allMons(g).filter(m => m.faceUp && m.card.race === "Warrior" && g.getAtk(m) <= 1500), aiUse: () => true,
        aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp && m.card.race === "Warrior" && g.getAtk(m) <= 1500))
    }, (g, gc, t) => { if (t && t.location === "monster") { gc.equippedTo = t.instanceId; g.addLog(`Hero Ring equips to ${t.card.name}.`); } });
    R.attackShield("Hero Ring", (g, src, target, attacker) => !!attacker && target.instanceId === src.equippedTo && attacker.owner !== src.owner && g.getAtk(attacker) >= 1900);
    def("Hero Blast", {
        needsTarget: "custom", targets: (g, gc) => gc.owner.zone.graveyard.filter(c => isEH(c) && /Normal/.test(c.card.type)), aiUse: () => true,
        aiTarget: (g, gc) => gc.owner.zone.graveyard.filter(c => isEH(c) && /Normal/.test(c.card.type))[0] || null
    }, (g, gc, t) => {
        if (!t || t.location !== "graveyard") return;
        const atk = t.card.atk || 0; gc.owner.moveCard(t, "graveyard", "hand"); g.addLog(`${t.card.name} is added to the hand.`);
        const c = L.mons(foe(g, gc)).filter(m => g.getAtk(m) <= atk);
        if (c.length) L.choose(g, gc.owner, { prompt: "Hero Blast: destroy 1 monster with ATK less than or equal to the added monster's", candidates: c, min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, cs) => [L.best(gm, cs)] }, ([m]) => { L.destroy(g, m); g.addLog(`Hero Blast destroys ${m.card.name}.`); });
    });
    def("Hero Counterattack", {
        condition: (g, gc) => g.battleDestroyed.some(e => e.owner === gc.owner && isEH(e.gc)) && gc.owner.zone.hand.length > 0, aiUse: () => true
    }, (g, gc) => {
        const o = gc.owner, h = o.zone.hand; const pick = h[Math.floor(Math.random() * h.length)];
        g.addLog(`${foe(g, gc).name} chooses a random card from ${o.name}'s hand: ${pick.card.name}.`);
        if (!isEH(pick)) return;
        const c = L.mons(foe(g, gc)); if (!c.length) return;
        L.choose(g, o, { prompt: "Hero Counterattack: destroy 1 monster your opponent controls", candidates: c, min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, cs) => [L.best(gm, cs)] }, ([m]) => { L.destroy(g, m); L.specialSummon(g, pick, o); });
    });
    def("A Hero Emerges", { window: "response", condition: (g, gc) => gc.owner.zone.hand.length > 0 && !!g.pendingAttack && g.pendingAttack.attacker.owner !== gc.owner, aiUse: () => true }, (g, gc) => {
        const o = gc.owner, h = o.zone.hand, pick = h[Math.floor(Math.random() * h.length)];
        g.addLog(`${foe(g, gc).name} chooses a random card from ${o.name}'s hand: ${pick.card.name}.`);
        if (L.isMonster(pick) && L.specialSummon(g, pick, o)) return;   // a monster that can be Special Summoned is; anything else is sent to the GY
        L.send(pick, "graveyard"); g.addLog(`${pick.card.name} is sent to the Graveyard.`);
    });
    def("Hero's Rule 2", { condition: g => { const t = g.chain[g.chain.length - 1]; return !!t && !t.negated && !!t.target && t.target.location === "graveyard" && t.meta && (t.meta.kind === "spell" || t.meta.kind === "trap"); }, aiUse: () => true }, g => {
        const t = g.chain[g.chain.length - 1]; if (!t) return;
        t.negated = true; g.addLog(`Hero's Rule 2 negates ${t.gc.card.name} and destroys it.`); if (t.gc.location === "spellTrap" || t.gc.location === "field") L.destroy(g, t.gc);
    });
    R.partial("Hero's Rule 2", "Negates Spell/Trap activations that target the Graveyard; targeting Effect Monster effects are not chain links in this engine.");

    // Skyscraper / Skyscraper 2 / Neo Space / Hero Flash!!
    def("Skyscraper", { aiUse: () => true }, g => g.addLog("Skyscraper is active."));
    R.continuous("Skyscraper", (g, src, t) => {
        const b = g.currentBattle;
        if (!b || b.attacker !== t || !b.target || !isEH(t)) return null;
        const mine = (t.card.atk || 0) + ((t.modifiers && t.modifiers.atk) || 0);
        return b.target.card && (b.target.card.atk || 0) + ((b.target.modifiers && b.target.modifiers.atk) || 0) > mine ? { atk: 1000 } : null;
    });
    def("Skyscraper 2 - Hero City", { aiUse: () => true }, g => g.addLog("Skyscraper 2 - Hero City is active."));
    R.quickEffect("Skyscraper 2 - Hero City", {
        timing: (g, gc, mode) => mode === "idle" && g.currentPlayer === gc.owner && (g.phase === "m1" || g.phase === "m2"),
        canActivate: (g, gc) => gc._usedTurn !== g.turn && gc.owner.getFreeMonsterSlot() !== -1 && gc.owner.zone.graveyard.some(c => isEH(c) && c._gyByBattle),
        resolve: (g, gc) => {
            const o = gc.owner; gc._usedTurn = g.turn;
            L.choose(g, o, { prompt: "Skyscraper 2: Special Summon 1 \"Elemental HERO\" destroyed by battle", candidates: o.zone.graveyard.filter(c => isEH(c) && c._gyByBattle), min: 1, max: 1, alwaysAsk: true }, ([t]) => L.specialSummon(g, t, o));
        }
    });
    def("Neo Space", { aiUse: () => true }, g => g.addLog("Neo Space is active."));
    const listsNeos = n => { const r = Effects.getFusionRecipe(n); return !!r && r.materials.some(x => (Array.isArray(x) ? x : [x]).includes("Elemental HERO Neos")); };
    R.continuous("Neo Space", (g, src, t) => (t.card.name === "Elemental HERO Neos" || listsNeos(t.card.name) ? { atk: 500 } : null));
    const HFLASH = ["H - Heated Heart", "E - Emergency Call", "R - Righteous Justice", "O - Oversoul"];
    if (HFLASH.every(n => L.dbMeta && require("../LocalCards").rowByName(n))) {
        def("Hero Flash!!", { condition: (g, gc) => HFLASH.every(n => gc.owner.zone.graveyard.some(c => c.card.name === n)) && gc.owner.zone.deck.some(c => isEH(c) && /Normal/.test(c.card.type)) && gc.owner.getFreeMonsterSlot() !== -1, aiUse: () => true }, (g, gc) => {
            const o = gc.owner; HFLASH.forEach(n => { const c = o.zone.graveyard.find(x => x.card.name === n); if (c) L.send(c, "banished"); });
            L.choose(g, o, { prompt: "Hero Flash!!: Special Summon 1 \"Elemental HERO\" Normal Monster from your Deck", candidates: o.zone.deck.filter(c => isEH(c) && /Normal/.test(c.card.type)), min: 1, max: 1, alwaysAsk: true }, ([t]) => {
                L.specialSummon(g, t, o); o.shuffleDeck();
                L.mons(o).filter(m => isEH(m) && /Normal/.test(m.card.type)).forEach(m => { m.state.directAttackTurn = g.turn; });
                g.addLog("All \"Elemental HERO\" Normal Monsters you control can attack directly this turn.");
            });
        });
    }
}
module.exports = { install };
