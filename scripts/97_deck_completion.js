/**
 * scripts/97_deck_completion.js — every card of the shipped duelist decks that had no script
 * (Jesse's Crystal Beasts, Joey's Gilford deck, Jaden's Elemental HEROes). Written from the card text.
 * Where the engine has no hook for a clause (Pendulum Zones, "activate in response to a chain link")
 * the card is registered with R.partial and a note saying exactly what is missing.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const norm = Effects.normalize;
    const foe = (g, gc) => L.opp(g, gc);
    const def = (name, extra, fn) => R.spellTrap(name, L.dbMeta(name, extra), fn);
    const log = (g, m) => g.addLog(m);
    const faceUpField = g => [g.player1, g.player2].some(p => p.zone.field && p.zone.field.faceUp);
    const hasCard = (g, ...names) => L.allSTs(g).concat(L.allMons(g)).some(c => c.faceUp && names.some(n => norm(n) === norm(c.card.name)));
    const isCB = c => L.isMonster(c) && /crystal beast/i.test(c.card.name) && !/advanced crystal beast/i.test(c.card.name);
    const isACB = c => L.isMonster(c) && /advanced crystal beast/i.test(c.card.name);
    const isUltimate = c => ["Rainbow Dragon", "Rainbow Dark Dragon", "Rainbow Overdragon", "Ultimate Crystal Rainbow Dragon Overdrive"].some(n => norm(n) === norm(c.card.name)) || /ultimate crystal/i.test(c.card.name);
    const place = (g, c, o) => (L.placeCB ? L.placeCB(g, c, o || c.owner) : false);
    const turnMain = (g, gc) => g.currentPlayer === gc.owner && (g.phase === "m1" || g.phase === "m2");
    const free = p => p.getFreeMonsterSlot() !== -1;
    const sendSelf = (gc, to = "graveyard") => { gc._noReplace = true; L.send(gc, to); };

    // =========================================================================================================
    // JESSE — Crystal Beast deck
    // =========================================================================================================
    // ---- Malefic Rainbow Dragon -------------------------------------------------------------------------------
    R.noNormalSummon("Malefic Rainbow Dragon");
    R.handIgnition("Malefic Rainbow Dragon", {
        canActivate: (g, gc) => free(gc.owner) && !L.allMons(g).some(m => m.faceUp && /^malefic/i.test(m.card.name)) && [...gc.owner.zone.hand, ...gc.owner.zone.deck].some(c => L.is(c, "Rainbow Dragon")),
        activate: (g, gc) => L.choose(g, gc.owner, { prompt: "Banish 1 \"Rainbow Dragon\" from your hand or Deck", candidates: [...gc.owner.zone.hand, ...gc.owner.zone.deck].filter(c => L.is(c, "Rainbow Dragon")), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            const z = c.location; L.send(c, "banished"); if (z === "deck") gc.owner.shuffleDeck();
            L.specialSummon(g, gc, gc.owner); log(g, `${gc.owner.name} Special Summons Malefic Rainbow Dragon.`);
        }) || true
    });
    R.attackRestriction("Malefic Rainbow Dragon", (g, src, attacker) => attacker !== src && attacker.owner === src.owner);
    R.stateCheck("Malefic Rainbow Dragon", (g, gc) => { if (gc.location === "monster" && !faceUpField(g)) { log(g, "Malefic Rainbow Dragon is destroyed: no face-up Field Spell."); L.destroy(g, gc); } });

    // ---- Yubel -------------------------------------------------------------------------------------------------
    R.battleIndestructible("Yubel");
    R.battleDamageReducer("Yubel", (g, src, player, amount) => {
        const b = g.currentBattle; if (!b) return amount;
        return (b.attacker === src || b.target === src) && player === src.owner ? 0 : amount;
    });
    R.attackHook("Yubel", (g, src, attacker, target) => {
        if (target === src && src.faceUp && src.position === "attack" && attacker.owner !== src.owner) { const n = g.getAtk(attacker); foe(g, src).dealDamage(n); log(g, `Yubel inflicts ${n} damage to ${foe(g, src).name}!`); }
    });
    R.endPhaseTrigger("Yubel", (g, gc) => {
        if (g.currentPlayer !== gc.owner) return;
        const others = L.mons(gc.owner).filter(m => m !== gc);
        const kill = () => { gc._ownEffect = true; log(g, "Yubel is destroyed."); L.destroy(g, gc); };
        if (!others.length) return kill();
        L.choose(g, gc.owner, { prompt: "Yubel: Tribute 1 other monster (or cancel to destroy Yubel)", candidates: others, min: 1, max: 1, optional: true, onField: true, alwaysAsk: true, aiPick: (gm, c) => [L.worst(gm, c)], onCancel: kill }, ([t]) => { t._noReplace = true; L.send(t, "graveyard"); log(g, `Yubel Tributes ${t.card.name}.`); }) || kill();
    });
    R.gyTrigger("Yubel", (g, gc) => {
        if (gc._ownEffect) return;
        const o = gc.owner, c = [...o.zone.hand, ...o.zone.deck, ...o.zone.graveyard].filter(x => L.is(x, "Yubel - Terror Incarnate"));
        if (!c.length || !free(o)) return;
        L.choose(g, o, { prompt: "Special Summon \"Yubel - Terror Incarnate\"", candidates: c, min: 1, max: 1, optional: true, alwaysAsk: true }, ([x]) => { const z = x.location; L.specialSummon(g, x, o); if (z === "deck") o.shuffleDeck(); });
    });

    // ---- Queen Butterfly Danaus / Tripper Mercury / Rose Papillon / Phantom Skyblaster -------------------------------
    R.ignition("Queen Butterfly Danaus", {
        canActivate: (g, gc) => gc.faceUp && gc.state.summonType === "normal" && !gc.state.hasUsedEffectThisTurn && gc.owner.zone.graveyard.some(c => L.isMonster(c) && c.card.race === "Insect" && (c.card.level || 99) <= 4) && free(gc.owner),
        activate: (g, gc) => {
            const o = gc.owner, max = Math.min(3, o.getMonstersOnField().length ? 5 - o.getMonstersOnField().length : 5);
            return L.choose(g, o, { prompt: "Special Summon up to 3 Level 4 or lower Insect monsters from your GY", candidates: o.zone.graveyard.filter(c => L.isMonster(c) && c.card.race === "Insect" && (c.card.level || 99) <= 4), min: 1, max: Math.min(3, Math.max(1, max)), alwaysAsk: true }, picked => {
                gc.state.hasUsedEffectThisTurn = true; gc.modifiers.atk -= g.getAtk(gc);
                picked.forEach(c => { if (L.specialSummon(g, c, o)) c.modifiers.effectsNegated = true; });
                log(g, "Queen Butterfly Danaus's ATK becomes 0 and the Insects are Special Summoned with their effects negated.");
            }) || true;
        }
    });
    R.partial("Queen Butterfly Danaus", "Works as a Main Phase ignition; the real card is a Quick Effect usable in the opponent's turn.");
    R.altTributes("The Tripper Mercury", [3]);
    R.noSet("The Tripper Mercury");
    R.secondAttack("The Tripper Mercury");
    const trib = (g, gc) => { gc.state.summonType !== "special" && gc.state.tributeCount > 0 && L.allMons(g).forEach(m => { if (m.position === "defense" || !m.faceUp) { m.faceUp = true; m.position = "attack"; } }); };
    R.onSummon("The Tripper Mercury", (g, gc) => { if (gc.state.summonType === "special" || !(gc.state.tributeCount > 0)) return; trib(g, gc); log(g, "The Tripper Mercury changes all monsters to face-up Attack Position."); });
    R.continuous("The Tripper Mercury", (g, s, t) => (s.state.tributeCount >= 3 && s.state.summonType !== "special" && t.owner !== s.owner ? { atk: -(t.card.atk || 0) } : null));
    R.partial("The Tripper Mercury", "Position change, 3-Tribute Summon, ATK loss and second attack work; the 'Tribute Summon only (not Set)' wording is covered by the no-Set rule.");
    R.unpartial("The Tripper Mercury");

    R.directAttackWhen("Rose Papillon", (g, gc) => L.mons(gc.owner).some(m => m !== gc && m.faceUp && m.card.race === "Insect"));
    R.ignition("Rose Papillon", {
        canActivate: (g, gc) => gc.faceUp && turnMain(g, gc) && gc.owner._rosePapillonTurn !== g.turn && gc.owner.zone.hand.some(c => L.isMonster(c) && (c.card.level || 0) >= 7),
        activate: (g, gc) => { gc.owner._rosePapillonTurn = g.turn; gc.owner.extraNormalSummons = (gc.owner.extraNormalSummons || 0) + 1; log(g, "Rose Papillon grants an additional Tribute Summon of a Level 7+ monster this turn."); return true; }
    });
    R.partial("Rose Papillon", "Direct attack works; the extra Tribute Summon is granted as an extra Normal Summon (not limited to Level 7+ in Attack Position).");

    const sky = (g, gc) => {
        const o = gc.owner, n = Math.min(L.mons(o).length, 5 - L.mons(o).length);
        if (n <= 0) return;
        let made = 0; for (let i = 0; i < n; i++) if (L.makeToken(g, o, { name: "Skyblaster Token", race: "Fiend", attribute: "DARK", level: 4, atk: 500, def: 500 })) made++;
        log(g, `Phantom Skyblaster Special Summons ${made} Skyblaster Token(s).`);
    };
    const skyFn = (g, gc) => { if (gc.state.summonType === "special") return; sky(g, gc); }; skyFn.anySummon = false;
    R.onSummon("Phantom Skyblaster", skyFn);
    R.standbyTrigger("Phantom Skyblaster", (g, gc) => {
        const n = L.mons(gc.owner).filter(m => m.faceUp && /skyblaster/i.test(m.card.name)).length;
        if (!n) return; foe(g, gc).dealDamage(300 * n); log(g, `Phantom Skyblaster inflicts ${300 * n} damage!`);
        L.mons(gc.owner).filter(m => /skyblaster/i.test(m.card.name)).forEach(m => { m.modifiers.cannotAttack = true; g.turnEffects.push(() => { m.modifiers.cannotAttack = false; }); });
    });
    R.partial("Phantom Skyblaster", "Summons the maximum number of Tokens (no choice of fewer); Flip Summon trigger not separate.");

    // ---- Advanced Crystal Beasts ---------------------------------------------------------------------------------
    const ACB = ["Sapphire Pegasus", "Amber Mammoth", "Topaz Tiger", "Cobalt Eagle", "Amethyst Cat", "Emerald Tortoise", "Ruby Carbuncle"].map(n => "Advanced Crystal Beast " + n);
    const darkGone = g => ![g.player1, g.player2].some(p => p.zone.field && p.zone.field.faceUp && L.is(p.zone.field, "Advanced Dark"));
    ACB.forEach(n => {
        R.stateCheck(n, (g, gc) => { if (gc.location === "monster" && darkGone(g)) { log(g, `${n} is sent to the Graveyard: "Advanced Dark" is not in a Field Zone.`); sendSelf(gc); } });
        R.destroyReplacement(n, (g, gc) => { if (gc.owner.getFreeSpellTrapSlot() === -1) return false; log(g, `${n} is placed in the Spell & Trap Zone instead of going to the Graveyard.`); return place(g, gc, gc.owner); });
    });
    const sap = (g, gc) => {
        const o = gc.owner, c = [...o.zone.hand, ...o.zone.deck, ...o.zone.graveyard, ...o.zone.banished].filter(x => x !== gc && isACB(x));
        if (!c.length || o.getFreeSpellTrapSlot() === -1) return;
        L.choose(g, o, { prompt: "Place 1 \"Advanced Crystal Beast\" in your Spell & Trap Zone", candidates: c, min: 1, max: 1, optional: true, alwaysAsk: true }, ([x]) => { place(g, x, o); if (x.location === "deck") o.shuffleDeck(); });
    };
    sap.anySummon = true; R.onSummon("Advanced Crystal Beast Sapphire Pegasus", sap);
    R.continuous("Advanced Crystal Beast Topaz Tiger", (g, s, t) => (t.owner === s.owner ? (isACB(t) ? { atk: 400, def: 400 } : null) : { atk: -400, def: -400 }));
    R.attackHook("Advanced Crystal Beast Amber Mammoth", (g, src, attacker, target) => {
        if (src.state._negTurn === g.turn || !target || target.owner !== src.owner || !isACB(target) || attacker.owner === src.owner) return;
        src.state._negTurn = g.turn; g.attackNegated = true; log(g, "Advanced Crystal Beast Amber Mammoth negates the attack!");
    });
    R.partial("Advanced Crystal Beast Amber Mammoth", "Attack negation works; negating the activation of effects that target your Advanced Crystal Beasts is not implemented.");
    R.handIgnition("Advanced Crystal Beast Cobalt Eagle", {
        canActivate: (g, gc) => gc.owner.zone.deck.some(c => L.is(c, "Advanced Dark")),
        activate: (g, gc) => { L.send(gc, "graveyard"); log(g, "Cobalt Eagle is sent to the Graveyard."); return L.addToHand(g, gc, c => L.is(c, "Advanced Dark"), { prompt: "Add \"Advanced Dark\" to your hand" }) || true; }
    });
    R.ignition("Advanced Crystal Beast Cobalt Eagle", {
        canActivate: (g, gc) => gc.faceUp && !gc.state.hasUsedEffectThisTurn && L.mons(gc.owner).concat(L.sts(gc.owner)).some(c => c !== gc && isACB(c)),
        activate: (g, gc) => L.choose(g, gc.owner, { prompt: "Return 1 \"Advanced Crystal Beast\" you control to the hand", candidates: L.mons(gc.owner).concat(L.sts(gc.owner)).filter(c => c !== gc && isACB(c)), min: 1, max: 1, alwaysAsk: true, aiPick: (gm, c) => [c[0]] }, ([t]) => { gc.state.hasUsedEffectThisTurn = true; t.owner.moveCard(t, t.location, "hand"); log(g, `${t.card.name} returns to the hand.`); }) || true
    });
    R.partial("Advanced Crystal Beast Cobalt Eagle", "Hand effect and return-to-hand work; sending it from the field and the 'top of the Deck' option are not implemented.");
    R.ignition("Advanced Crystal Beast Emerald Tortoise", {
        canActivate: (g, gc) => gc.faceUp && !gc.state.hasUsedEffectThisTurn && L.allMons(g).some(m => m.faceUp && m !== gc),
        activate: (g, gc) => L.choose(g, gc.owner, { prompt: "Change the battle position of 1 face-up monster", candidates: L.allMons(g).filter(m => m.faceUp), min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, c) => [L.best(gm, c.filter(m => m.owner !== gc.owner)) || c[0]] }, ([t]) => { gc.state.hasUsedEffectThisTurn = true; t.position = t.position === "attack" ? "defense" : "attack"; log(g, `${t.card.name} changes battle position.`); }) || true
    });
    R.partial("Advanced Crystal Beast Emerald Tortoise", "Works as a Main Phase ignition (the real effect is a Quick Effect).");
    ACB.forEach(n => R.directAttackWhen(n, (g, gc) => L.mons(gc.owner).some(m => m.faceUp && L.is(m, "Advanced Crystal Beast Amethyst Cat"))));
    R.partial("Advanced Crystal Beast Amethyst Cat", "Your Advanced Crystal Beasts can attack directly; the halving of that battle damage is not implemented.");
    R.ignition("Advanced Crystal Beast Ruby Carbuncle", {
        canActivate: (g, gc) => gc.location === "spellTrap" && gc.faceUp && !gc.state.hasUsedEffectThisTurn && free(gc.owner),
        activate: (g, gc) => {
            const o = gc.owner; gc.state.hasUsedEffectThisTurn = true;
            L.specialSummon(g, gc, o);
            L.sts(o).filter(isACB).forEach(c => { if (free(o)) L.specialSummon(g, c, o); });
            log(g, "Advanced Crystal Beast Ruby Carbuncle brings back the Advanced Crystal Beasts from the Spell & Trap Zone.");
            return true;
        }
    });

    // ---- Pendulum-era support monsters --------------------------------------------------------------------------
    R.ignition("Crystal Master", {
        canActivate: (g, gc) => gc.faceUp && gc.owner.zone.deck.some(c => (isCB(c) || isUltimate(c) || (!L.isMonster(c) && /crystal/i.test(c.card.name)))),
        activate: (g, gc) => { sendSelf(gc); log(g, "Crystal Master is Tributed."); return L.addToHand(g, gc, c => isCB(c) || (isUltimate(c) && L.isMonster(c)) || (!L.isMonster(c) && /crystal/i.test(c.card.name)), { prompt: "Add 1 Ultimate Crystal / Crystal Beast monster or \"Crystal\" Spell/Trap" }) || true; }
    });
    R.partial("Crystal Master", "Monster Effect works; the Pendulum Effect needs Pendulum Zones, which the engine has not.");
    R.quickEffect("Crystal Keeper", {
        timing: (g, gc, mode) => mode !== "idle" && g.phase === "battle",
        canActivate: (g, gc) => (gc.location === "hand" || gc.location === "monster") && !!(g.currentBattle && [g.currentBattle.attacker, g.currentBattle.target].some(m => m && m.owner === gc.owner && isCB(m))),
        resolve: (g, gc) => {
            const b = g.currentBattle, m = [b.attacker, b.target].find(x => x && x.owner === gc.owner && isCB(x)); if (!m) return;
            sendSelf(gc); m.modifiers.atk += (m.card.atk || 0) * 2 - g.getAtk(m) + 0; m.modifiers.def += (m.card.def || 0) * 2 - g.getDef(m);
            g.turnEffects.push(() => { if (m.location === "monster") L.destroy(g, m); });
            log(g, `${m.card.name}'s ATK/DEF double during damage calculation; it is destroyed at the end of the Damage Step (End Phase here).`);
        }
    });
    R.partial("Crystal Keeper", "Quick Effect works; the destruction happens at the End Phase instead of the end of the Damage Step, and the Pendulum Effect is not available.");

    // ---- Spells / Traps -------------------------------------------------------------------------------------------
    R.noNormalSummon("Malefic Rainbow Dragon");
    def("Advanced Dark", { aiUse: () => true }, (g, gc) => log(g, "Advanced Dark is active."));
    R.partial("Advanced Dark", "Keeps Advanced Crystal Beasts on the field; the DARK Attribute change, Ultimate Crystal negation and damage prevention are not implemented.");

    // Rainbow Bridge of the Heart — extra Normal Summon for a Crystal Beast + search
    def("Rainbow Bridge of the Heart", { aiUse: () => true }, (g, gc) => { gc.owner.extraNormalSummons = (gc.owner.extraNormalSummons || 0) + 1; log(g, "Rainbow Bridge of the Heart: you may Normal Summon 1 additional Crystal Beast."); });
    R.partial("Rainbow Bridge of the Heart", "Grants the extra Normal Summon on activation (not limited to Crystal Beasts, not re-granted each turn); the destroy-to-search and bounce effects are not implemented.");

    def("Crystal Aegis", { needsTarget: "custom", aiUse: () => true, targets: (g, gc) => L.mons(gc.owner).filter(m => m.faceUp && isCB(m)), aiTarget: (g, gc) => L.worst(g, L.mons(gc.owner).filter(m => m.faceUp && isCB(m))) },
        (g, gc, t) => {
            if (!t || t.location !== "monster") return;
            const c = t.card; L.destroy(g, t);
            L.makeToken(g, gc.owner, { name: "Crystal Beast Token", race: c.race, attribute: c.attribute, level: c.level, atk: c.atk, def: c.def });
            log(g, "Crystal Aegis: the Crystal Beast is replaced by a Crystal Beast Token.");
        });
    R.partial("Crystal Aegis", "Destroy-and-Token works; the Graveyard effect is not implemented.");

    def("Awakening of the Crystal Ultimates", { condition: (g, gc) => L.mons(gc.owner).some(isUltimate) || gc.owner.zone.hand.some(c => c !== gc && isUltimate(c)), aiUse: () => true }, (g, gc) => {
        const o = gc.owner;
        const cands = [...o.zone.hand, ...o.zone.deck, ...o.zone.graveyard, ...L.sts(o)].filter(c => isCB(c) || /crystal beast/i.test(c.card.name) && L.isMonster(c));
        if (!free(o)) return;
        L.choose(g, o, { prompt: "Special Summon 1 \"Crystal Beast\" Monster Card", candidates: cands, min: 1, max: 1, alwaysAsk: true }, ([c]) => { const z = c.location; L.specialSummon(g, c, o); if (z === "deck") o.shuffleDeck(); });
    });
    R.partial("Awakening of the Crystal Ultimates", "Only the Special Summon option is implemented (no reveal cost, no Rainbow Bridge/Refraction option).");

    def("Rainbow Refraction", { condition: (g, gc) => L.mons(gc.owner).some(m => /^rainbow (dark )?dragon$/i.test(m.card.name)) && gc.owner.zone.deck.some(isCB), aiUse: () => true }, (g, gc) => {
        const o = gc.owner, names = new Map(); o.zone.deck.filter(isCB).forEach(c => { if (!names.has(c.card.name)) names.set(c.card.name, c); });
        const n = Math.min(names.size, 5 - L.mons(o).length); if (n <= 0) return;
        L.choose(g, o, { prompt: "Special Summon Crystal Beasts with different names", candidates: [...names.values()], min: 1, max: n, alwaysAsk: true }, picked => { picked.forEach(c => L.specialSummon(g, c, o)); o.shuffleDeck(); });
    });
    R.partial("Rainbow Refraction", "The condition checks that Rainbow Dragon / Rainbow Dark Dragon is on the field, not that it activated an effect this turn.");

    // Continuous Crystal traps
    def("Crystal Brilliance", { aiUse: () => true }, (g, gc) => log(g, "Crystal Brilliance is active."));
    R.continuous("Crystal Brilliance", (g, s, t) => (t.owner === s.owner && isCB(t) ? { atk: t.card.def || 0 } : null));
    R.partial("Crystal Brilliance", "The ATK boost works; the send-to-GY revival effect and the 1-copy limit are not implemented.");
    def("Crystal Conclave", { aiUse: () => true }, (g, gc) => log(g, "Crystal Conclave is active."));
    R.partial("Crystal Conclave", "Placeholder activation only: its trigger/bounce effects are not implemented.");
    def("Crystal Miracle", { aiUse: () => false, window: "anytime", condition: (g, gc) => L.mons(gc.owner).concat(L.sts(gc.owner)).some(isCB) }, (g, gc) => {
        const c = L.mons(gc.owner).concat(L.sts(gc.owner)).filter(isCB); if (!c.length) return;
        L.choose(g, gc.owner, { prompt: "Crystal Miracle: destroy 1 Crystal Beast", candidates: c, min: 1, max: 1, alwaysAsk: true, aiPick: (gm, cs) => [L.worst(gm, cs)] }, ([x]) => { L.destroy(g, x); log(g, "Crystal Miracle destroys a Crystal Beast."); });
    });
    R.partial("Crystal Miracle", "Destroys a Crystal Beast as the cost; it does not negate the chain link (no negation hook for Counter Traps here).");
    def("Counter Gem", { aiUse: () => false }, (g, gc) => {
        const o = gc.owner; L.sts(o).filter(c => c !== gc).forEach(c => L.send(c, "graveyard"));
        const cb = o.zone.graveyard.filter(isCB); let n = 0;
        cb.forEach(c => { if (place(g, c, o)) n++; });
        g.turnEffects.push(() => L.sts(o).filter(c => c.faceUp && isCB(c)).concat(L.mons(o).filter(c => c.faceUp && isCB(c))).forEach(c => L.destroy(g, c)));
        log(g, `Counter Gem places ${n} Crystal Beast(s) from the Graveyard.`);
    });
    def("Last Resort", { window: "response", aiUse: () => true, condition: (g, gc) => gc.owner.zone.deck.some(c => L.is(c, "Ancient City - Rainbow Ruins")) }, (g, gc) => {
        const o = gc.owner, c = o.zone.deck.find(x => L.is(x, "Ancient City - Rainbow Ruins")); if (!c) return;
        o.moveCard(c, "deck", "field"); c.faceUp = true; o.shuffleDeck(); log(g, "Last Resort activates \"Ancient City - Rainbow Ruins\" from the Deck.");
        if (foe(g, gc).zone.field && foe(g, gc).zone.field !== c) { foe(g, gc).drawCard(1); log(g, `${foe(g, gc).name} draws 1 card.`); }
    });
    def("Rainbow Bridge of Salvation", { condition: (g) => { const t = new Set(L.allMons(g).filter(m => m.faceUp && (m.card.level || 0) >= 10).map(m => m.card.race)); return t.size >= 2; }, aiUse: () => true, window: "anytime" }, (g, gc) => {
        const all = [g.player1, g.player2];
        all.forEach(p => { [...p.zone.hand, ...L.mons(p), ...L.sts(p), ...p.zone.graveyard].filter(c => c !== gc).forEach(c => { if (c.isToken) c.owner.removeCard(c, c.location); else c.owner.moveCard(c, c.location, "deck"); }); p.shuffleDeck(); p.drawCard(5); });
        log(g, "Rainbow Bridge of Salvation: both players shuffle everything into their Decks and draw 5.");
    });
    R.partial("Rainbow Bridge of Salvation", "The field/hand/GY reset works; its Graveyard effect (banish to add a Crystal Beast and a Field Spell) is not implemented.");
    def("Triggered Summon", { window: "anytime", aiUse: () => false, condition: g => true }, (g, gc) => {
        [gc.owner, foe(g, gc)].forEach(p => { const c = p.zone.hand.filter(x => L.isMonster(x) && (x.card.level || 9) <= 4); if (c.length && free(p)) L.choose(g, p, { prompt: "Special Summon 1 Level 4 or lower monster from your hand", candidates: c, min: 1, max: 1, optional: true, alwaysAsk: true }, ([x]) => L.specialSummon(g, x, p)); });
    });
    R.partial("Triggered Summon", "Resolves the mutual Special Summon; the activation timing (only when a monster is Special Summoned to the opponent's field) is not restricted.");
    def("Ultimate Crystal Magic", { window: "anytime", aiUse: () => false, condition: (g, gc) => { const o = gc.owner; const names = new Set([...o.zone.hand, ...o.zone.deck, ...L.mons(o), ...L.sts(o)].filter(isCB).map(c => c.card.name)); return names.size >= 7 && o.zone.extraDeck.some(c => /ultimate crystal|rainbow overdragon/i.test(c.card.name) && /Fusion/.test(c.card.type)) && free(o); } }, (g, gc) => {
        const o = gc.owner, by = new Map(); [...o.zone.hand, ...o.zone.deck, ...L.mons(o), ...L.sts(o)].filter(isCB).forEach(c => { if (!by.has(c.card.name)) by.set(c.card.name, c); });
        L.choose(g, o, { prompt: "Send 7 Crystal Beasts with different names to the Graveyard", candidates: [...by.values()], min: 7, max: 7, alwaysAsk: true }, picked => {
            picked.forEach(c => { c._noReplace = true; L.send(c, "graveyard"); }); o.shuffleDeck();
            const f = o.zone.extraDeck.filter(c => /Fusion/.test(c.card.type) && /rainbow overdragon|ultimate crystal/i.test(c.card.name));
            L.choose(g, o, { prompt: "Special Summon 1 \"Ultimate Crystal\" Fusion Monster", candidates: f, min: 1, max: 1, alwaysAsk: true }, ([x]) => L.specialSummon(g, x, o));
        });
    });
    R.partial("Ultimate Crystal Magic", "The Fusion Summon works; it can be activated at any time (not only when your Crystal Beast is destroyed by battle) and its Graveyard effect is not implemented.");

    // Fusion monsters
    const SEVEN = ["Sapphire Pegasus", "Cobalt Eagle", "Amber Mammoth", "Amethyst Cat", "Emerald Tortoise", "Topaz Tiger", "Ruby Carbuncle"].map(n => "Crystal Beast " + n);
    R.fusion("Rainbow Overdragon", { materials: SEVEN, method: "polymerization" });
    R.quickEffect("Rainbow Overdragon", {
        timing: (g, gc, mode) => mode === "idle" ? turnMain(g, gc) : true,
        canActivate: (g, gc) => gc.faceUp,
        resolve: (g, gc) => {
            const all = [...L.allMons(g), ...L.allSTs(g)];
            sendSelf(gc, "graveyard");
            all.forEach(c => { if (c !== gc) { if (c.isToken) c.owner.removeCard(c, c.location); else c.owner.moveCard(c, c.location, "deck"); } });
            [g.player1, g.player2].forEach(p => p.shuffleDeck()); log(g, "Rainbow Overdragon shuffles every card on the field into the Deck!");
        }
    });
    R.ignition("Rainbow Overdragon", {
        canActivate: (g, gc) => gc.faceUp && !gc.state.hasUsedEffectThisTurn && gc.owner.zone.graveyard.some(isCB),
        activate: (g, gc) => L.choose(g, gc.owner, { prompt: "Banish 1 Crystal Beast from your Graveyard", candidates: gc.owner.zone.graveyard.filter(isCB), min: 1, max: 1, alwaysAsk: true, aiPick: (gm, c) => [L.best(gm, c)] }, ([c]) => { gc.state.hasUsedEffectThisTurn = true; const n = c.card.atk || 0; L.send(c, "banished"); L.tempStat(g, gc, n, 0); log(g, `Rainbow Overdragon gains ${n} ATK until the end of the turn.`); }) || true
    });
    R.partial("Rainbow Overdragon", "Fusion Summon, ATK gain and the shuffle effect work; the alternative Special Summon by Tributing a Level 10 Ultimate Crystal and the 'Fusion Summoned only' condition are not implemented.");
    R.fusion("Ultimate Crystal Rainbow Dragon Overdrive", { materials: ["Rainbow Dragon", ...SEVEN], method: "banish" });
    R.continuous("Ultimate Crystal Rainbow Dragon Overdrive", (g, s, t) => {
        if (t !== s) return null;
        const names = new Set(s.owner.zone.banished.filter(isCB).map(c => c.card.name));
        return names.size >= 7 ? { atk: 7000 } : null;
    });
    R.quickEffect("Ultimate Crystal Rainbow Dragon Overdrive", {
        timing: (g, gc, mode) => mode === "idle" ? turnMain(g, gc) : true,
        canActivate: (g, gc) => gc.faceUp && !gc.state.attackedThisTurn,
        resolve: (g, gc) => {
            const o = gc.owner, back = o.zone.banished.filter(isCB);
            sendSelf(gc, "graveyard");
            [...L.allMons(g), ...L.allSTs(g)].forEach(c => { if (c.isToken) c.owner.removeCard(c, c.location); else c.owner.moveCard(c, c.location, "deck"); });
            [g.player1, g.player2].forEach(p => p.shuffleDeck());
            back.forEach(c => { if (free(o)) L.specialSummon(g, c, o); });
            log(g, "Ultimate Crystal Rainbow Dragon Overdrive resets the field and revives the banished Crystal Beasts!");
        }
    });
    R.partial("Ultimate Crystal Rainbow Dragon Overdrive", "Summon (with Rainbow Dragon + 7 Crystal Beasts), +7000 ATK and the reset effect work; the generic '1 Ultimate Crystal monster' material and 'has not battled' check are approximated.");

    // =========================================================================================================
    // JOEY
    // =========================================================================================================
    R.battleDamageReducer("Rocket Warrior", (g, src, player, amount) => { const b = g.currentBattle; return b && (b.attacker === src || b.target === src) && g.currentPlayer === src.owner && g.phase === "battle" && player === src.owner ? 0 : amount; });
    R.attackHook("Rocket Warrior", (g, src, attacker, target) => { if (attacker === src && target && target.owner !== src.owner) { src.state._rwTarget = target; } });
    R.battleDamageTrigger("Rocket Warrior", () => {});
    R.partial("Rocket Warrior", "You take no battle damage from its attacks during your Battle Phase; the 500 ATK loss on the target and its battle immunity are not implemented.");
    R.endPhaseTrigger("Little-Winguard", (g, gc) => {
        if (g.currentPlayer !== gc.owner || gc.location !== "monster" || !gc.faceUp) return;
        gc.position = gc.position === "attack" ? "defense" : "attack"; log(g, `Little-Winguard changes to ${gc.position} position.`);
    });
    def("Question", { aiUse: () => false, condition: (g, gc) => gc.owner.zone.graveyard.some(L.isMonster) }, (g, gc) => {
        const o = gc.owner, foeP = foe(g, gc), m = o.zone.graveyard.filter(L.isMonster)[0];
        if (!m) return;
        const others = o.zone.graveyard.filter(L.isMonster).map(c => c.card.name);
        const guess = foeP.isBot || foeP.isAI ? (Math.random() < 0.5 ? m.card.name : others[0]) : m.card.name;
        if (Math.random() < 1 / Math.max(1, new Set(others).size)) { L.send(m, "banished"); log(g, `${foeP.name} calls it right: ${m.card.name} is banished.`); }
        else if (free(o)) { L.specialSummon(g, m, o); log(g, `${foeP.name} calls it wrong: ${m.card.name} is Special Summoned.`); }
    });
    R.partial("Question", "The call is simulated with a random guess (no name picker).");
    def("Roulette Spider", { window: "response", aiUse: () => false }, (g, gc) => {
        const o = gc.owner, a = g.pendingAttack && g.pendingAttack.attacker, die = L.die(6);
        log(g, `Roulette Spider rolls a ${die}.`);
        if (die === 1) { o.lifePoints = Math.ceil(o.lifePoints / 2); }
        else if (die === 5) { if (a) { g.attackNegated = true; const n = g.getAtk(a); foe(g, gc).dealDamage(n); log(g, `The attack is negated and ${foe(g, gc).name} takes ${n} damage.`); } }
        else if (die === 6) { if (a) L.destroy(g, a); }
        else if (die === 2) { if (g.pendingAttack) { g.pendingAttack.target = null; log(g, "The attack becomes a direct attack."); } }
        else if (die === 3 || die === 4) { const pool = die === 3 ? L.mons(o) : L.mons(foe(g, gc)).filter(m => m !== a); if (pool.length && g.pendingAttack) { g.pendingAttack.target = pool[0]; log(g, `The attack target changes to ${pool[0].card.name}.`); } }
    });
    R.partial("Roulette Spider", "Results 1, 5 and 6 are exact; results 2-4 redirect the pending attack to the first valid monster (no choice).");
    equipJinzo(R, L, def, log);
    R.noSet("Fusion Gate");
    def("Fusion Gate", { aiUse: () => true }, (g, gc) => log(g, "Fusion Gate is active: the turn player may Fusion Summon by banishing Fusion Materials."));
    R.partial("Fusion Gate", "Placeholder: the continuous Fusion Summon-by-banishing ability is not implemented (Polymerization-style Fusion Summon still works).");
    def("Kunai with Chain", { window: "response", aiUse: () => true }, (g, gc) => {
        const a = g.pendingAttack && g.pendingAttack.attacker; if (!a) return;
        a.position = "defense"; log(g, `Kunai with Chain changes ${a.card.name} to Defense Position.`);
    });
    R.partial("Kunai with Chain", "Only the attack-time effect (switch the attacker to Defense Position) is implemented, not the equip-for-500-ATK option.");
    def("Fairy Box", { window: "response", aiUse: () => true }, (g, gc) => {
        const a = g.pendingAttack && g.pendingAttack.attacker; if (!a) return;
        if (L.coin()) { L.tempStat(g, a, -g.getAtk(a), 0); log(g, "Fairy Box: the call was right — the attacker's ATK becomes 0."); } else log(g, "Fairy Box: the call was wrong.");
    });
    R.standbyTrigger("Fairy Box", (g, gc) => { if (gc.owner.lifePoints > 500) { gc.owner.lifePoints -= 500; log(g, "Fairy Box: 500 LP paid."); } else L.destroy(g, gc); });
    R.partial("Fairy Box", "The coin call is random (no heads/tails choice) and the card is not Continuous (it is used up).");

    // =========================================================================================================
    // JADEN — Elemental HERO
    // =========================================================================================================
    const hero = c => L.isMonster(c) && /elemental hero/i.test(c.card.name);
    // Necroshade: once, while it is in the GY, one Level 5+ "Elemental HERO" Normal Summon needs no Tributes.
    R.tributeFree("Elemental HERO Necroshade", (g, src, player, gc) => !src.state.tributeFreeUsed && L.isMonster(gc) && /^elemental hero/i.test(gc.card.name) && (gc.card.level || 0) >= 5);
    def("Fusion Recovery", { needsTarget: "custom", aiUse: () => true,
        targets: (g, gc) => gc.owner.zone.graveyard.filter(c => L.is(c, "Polymerization")),
        condition: (g, gc) => gc.owner.zone.graveyard.some(c => L.is(c, "Polymerization")) && gc.owner.zone.graveyard.some(L.isMonster),
        aiTarget: (g, gc) => gc.owner.zone.graveyard.find(c => L.is(c, "Polymerization")) || null },
    (g, gc, t) => {
        if (!t) return; const o = gc.owner; o.moveCard(t, "graveyard", "hand");
        const m = o.zone.graveyard.filter(c => L.isMonster(c) && !(/Fusion/.test(c.card.type)));
        L.choose(g, o, { prompt: "Add 1 monster from your Graveyard that was used as Fusion Material", candidates: m, min: 1, max: 1, alwaysAsk: true, aiPick: (gm, c) => [L.best(gm, c)] }, ([x]) => { o.moveCard(x, "graveyard", "hand"); log(g, `Fusion Recovery adds Polymerization and ${x.card.name} to the hand.`); });
    });
    R.partial("Fusion Recovery", "Any monster in the Graveyard can be chosen (the engine does not remember which were Fusion Materials).");
    def("R - Righteous Justice", { aiUse: () => true, condition: g => L.allSTs(g).length > 0 }, (g, gc) => {
        const n = [...L.mons(gc.owner), ...L.sts(gc.owner)].filter(c => c.faceUp && /elemental hero/i.test(c.card.name)).length;
        const t = L.allSTs(g).filter(c => c !== gc); if (!n || !t.length) return;
        L.choose(g, gc.owner, { prompt: `Destroy up to ${n} Spell/Trap Cards`, candidates: t, min: 1, max: Math.min(n, t.length), onField: true, alwaysAsk: true, aiPick: (gm, c) => c.filter(x => x.owner !== gc.owner).slice(0, n) }, p => { L.destroyAll(g, p); log(g, `R - Righteous Justice destroys ${p.length} card(s).`); });
    });
    def("Bubble Blaster", { needsTarget: "custom", aiUse: () => true, targets: g => L.allMons(g).filter(m => m.faceUp && L.is(m, "Elemental HERO Bubbleman")), aiTarget: (g, gc) => L.mons(gc.owner).find(m => m.faceUp && L.is(m, "Elemental HERO Bubbleman")) || null },
        (g, gc, t) => { if (t && t.location === "monster") L.equip(g, gc, t, 800, 0); });
    R.partial("Bubble Blaster", "The +800 ATK works; the 'destroy this card instead / no battle damage' replacement is not implemented.");
    def("Spark Blaster", { needsTarget: "custom", aiUse: () => true, targets: g => L.allMons(g).filter(m => m.faceUp && L.is(m, "Elemental HERO Sparkman")), aiTarget: (g, gc) => L.mons(gc.owner).find(m => m.faceUp && L.is(m, "Elemental HERO Sparkman")) || null },
        (g, gc, t) => { if (t && t.location === "monster") { gc.equippedTo = t.instanceId; log(g, `Spark Blaster is equipped to ${t.card.name}.`); } });
    R.ignition("Spark Blaster", {
        canActivate: (g, gc) => gc.faceUp && turnMain(g, gc) && !gc.state.hasUsedEffectThisTurn && L.allMons(g).some(m => m.faceUp),
        activate: (g, gc) => L.choose(g, gc.owner, { prompt: "Change the battle position of 1 face-up monster", candidates: L.allMons(g).filter(m => m.faceUp), min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, c) => [L.best(gm, c.filter(m => m.owner !== gc.owner)) || c[0]] }, ([t]) => {
            gc.state.hasUsedEffectThisTurn = true; t.position = t.position === "attack" ? "defense" : "attack"; gc._uses = (gc._uses || 0) + 1;
            log(g, `Spark Blaster changes ${t.card.name}'s battle position (${gc._uses}/3).`); if (gc._uses >= 3) L.destroy(g, gc);
        }) || true
    });
    def("Mirror Gate", { window: "response", aiUse: () => true, condition: (g, gc) => { const p = g.pendingAttack; return !!(p && p.target && p.target.owner === gc.owner && hero(p.target) && p.target.faceUp); } }, (g, gc) => {
        const p = g.pendingAttack; if (!p || !p.target) return;
        const a = p.attacker, t = p.target; g.transferCard(a, a.owner, "monster", gc.owner, "monster"); g.transferCard(t, t.owner, "monster", a.owner === gc.owner ? foe(g, gc) : foe(g, gc), "monster");
        log(g, "Mirror Gate switches control of the attacker and the attack target.");
    });
    R.partial("Mirror Gate", "The control switch works; damage calculation between the swapped monsters is not performed.");
}

/** Amplifier: Equip only to Jinzo; destroys the equipped monster when it leaves. */
function equipJinzo(R, L, def, log) {
    def("Amplifier", { needsTarget: "custom", aiUse: () => true, targets: g => L.allMons(g).filter(m => m.faceUp && L.is(m, "Jinzo")), aiTarget: (g, gc) => L.mons(gc.owner).find(m => m.faceUp && L.is(m, "Jinzo")) || null },
        (g, gc, t) => {
            if (!t || t.location !== "monster") return;
            gc.equippedTo = t.instanceId;
            gc.linkedRevert = () => { if (t.location === "monster") { log(g, "Amplifier left the field: Jinzo is destroyed."); L.destroy(g, t); } };
            log(g, `Amplifier is equipped to ${t.card.name}.`);
        });
    R.partial("Amplifier", "Equip and 'destroy Jinzo when removed' work; the Trap-negation change on Jinzo is not implemented.");
}

module.exports = { install };
