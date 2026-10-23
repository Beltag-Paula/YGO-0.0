/**
 * scripts/90_classic_batch1.js — short, unambiguous classic effects from the database, written from the
 * card text. Spell/Trap type (Normal, Quick-Play, Equip, Field ...) comes from the database row (L.dbMeta).
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const def = (name, extra, fn) => R.spellTrap(name, L.dbMeta(name, extra), fn);
    const foe = (g, gc) => L.opp(g, gc);
    const owner = gc => gc.owner;
    const raceOf = m => m.card.race;
    const destroyAllWhere = (g, pred, label) => { const t = L.allMons(g).filter(pred); L.destroyAll(g, t); g.addLog(`${label} destroys ${t.length} monster(s).`); };
    const gain = (gc, n) => { gc.owner.lifePoints += n; };
    const hasTarget = list => (g, gc) => list(g, gc).length > 0;

    // =========================== FLIP monsters ===========================
    R.flip("Skelengel", (g, gc) => { gc.owner.drawCard(1); g.addLog(`${gc.owner.name} draws 1 card.`); });
    R.flip("Poison Mummy", (g, gc) => { foe(g, gc).dealDamage(500); g.addLog("Poison Mummy inflicts 500 damage!"); });
    R.flip("Magnetic Mosquito", (g) => destroyAllWhere(g, m => raceOf(m) === "Machine", "Magnetic Mosquito"));
    R.flip("4-Starred Ladybug of Doom", (g, gc) => {
        const t = L.mons(foe(g, gc)).filter(m => (m.card.level || 0) === 4); L.destroyAll(g, t);
        g.addLog(`4-Starred Ladybug of Doom destroys ${t.length} Level 4 monster(s).`);
    });
    R.flip("Nobleman-Eater Bug", (g, gc) => {
        const all = L.allMons(g), n = Math.min(2, all.length);
        if (!n) return;
        L.choose(g, gc.owner, { prompt: "Nobleman-Eater Bug: destroy 2 monsters on the field", candidates: all, min: n, max: n, onField: true, alwaysAsk: true,
            aiPick: (gm, c) => c.filter(x => x.owner !== gc.owner).sort((a, b) => gm.getAtk(b) - gm.getAtk(a)).concat(c.filter(x => x.owner === gc.owner).sort((a, b) => gm.getAtk(a) - gm.getAtk(b))).slice(0, n) },
            picked => { picked.forEach(m => L.destroy(g, m)); g.addLog(`Nobleman-Eater Bug destroys ${picked.map(m => m.card.name).join(" and ")}.`); });
    });
    R.flip("Old Vindictive Magician", (g, gc) => {
        const c = L.mons(foe(g, gc)).filter(m => !Effects.isProtectedByLordOfD(g, m, gc.owner));
        L.choose(g, gc.owner, { prompt: "Old Vindictive Magician: destroy 1 monster your opponent controls", candidates: c, min: 1, max: 1, onField: true, alwaysAsk: true,
            aiPick: (gm, cs) => [L.best(gm, cs)] }, ([t]) => { const n = t.card.name; L.destroy(g, t); g.addLog(`Old Vindictive Magician destroys ${n}.`); });
    });
    R.flip("Iron Blacksmith Kotetsu", (g, gc) => L.addToHand(g, gc, c => /Spell/.test(c.card.type) && c.card.race === "Equip", { prompt: "Add 1 Equip Spell from your Deck to your hand" }));
    R.flip("Mask of Darkness", (g, gc) => L.addToHand(g, gc, c => /Trap/.test(c.card.type), { from: "graveyard", prompt: "Add 1 Trap from your Graveyard to your hand" }));
    R.flip("Magician of Faith", (g, gc) => L.addToHand(g, gc, c => /Spell/.test(c.card.type), { from: "graveyard", prompt: "Add 1 Spell from your Graveyard to your hand" }));
    R.flip("Guard Dog", (g, gc) => { foe(g, gc).noSpecialSummonTurn = g.turn; g.addLog(`${foe(g, gc).name} cannot Special Summon for the rest of this turn.`); });

    // =========================== triggers / Tribute effects ===========================
    const sacred = (g, gc) => { if (gc.state.summonType === "special") { gc.owner.drawCard(1); g.addLog("Sacred Crane: draw 1 card."); } };
    sacred.anySummon = true; R.onSummon("Sacred Crane", sacred);
    const molten = (g, gc) => { if (gc.state.summonType === "special" && gc.state.summonFrom === "graveyard") { gc.owner.drawCard(1); g.addLog("Molten Zombie: draw 1 card."); } };
    molten.anySummon = true; R.onSummon("Molten Zombie", molten);
    const curse = (g, gc) => { foe(g, gc).dealDamage(500); g.addLog("Gravekeeper's Curse inflicts 500 damage!"); };
    curse.anySummon = true; R.onSummon("Gravekeeper's Curse", curse);

    const tributeBurn = (name, count, dmg) => R.ignition(name, {
        canActivate: (g, gc) => L.mons(gc.owner).length >= count,
        activate: (g, gc) => {
            L.choose(g, gc.owner, { prompt: `${name}: Tribute ${count} monster${count > 1 ? "s" : ""}`, candidates: L.mons(gc.owner), min: count, max: count, onField: true, alwaysAsk: true,
                aiPick: (gm, c) => c.slice().sort((a, b) => gm.getAtk(a) - gm.getAtk(b)).slice(0, count) }, picked => {
                picked.forEach(m => { m._noReplace = true; L.send(m, "graveyard"); });
                foe(g, gc).dealDamage(dmg); g.addLog(`${name} inflicts ${dmg} damage!`);
            });
            return true;
        }
    });
    tributeBurn("Cannon Soldier", 1, 500); tributeBurn("Amazoness Archer", 2, 1200); tributeBurn("Cannon Soldier MK-2", 2, 1500);
    R.attackCost("Dark Elf", { canPay: (g, gc) => gc.owner.lifePoints > 1000, pay: (g, gc) => { gc.owner.dealDamage(1000); g.addLog("Dark Elf: 1000 LP paid to attack."); } });
    R.secondAttack("Twinheaded Beast");

    // =========================== ATK that depends on the board ===========================
    const dyn = (name, f, defToo = false) => R.dynamic(name, (g, gc) => { const n = f(g, gc); return { atk: n, def: defToo ? n : 0 }; });
    const named = (p, n) => L.mons(p).filter(m => m.faceUp && Effects.normalize(m.card.name) === Effects.normalize(n)).length;
    dyn("Shadow Ghoul", (g, gc) => 100 * gc.owner.zone.graveyard.filter(L.isMonster).length);
    dyn("Mudora", (g, gc) => 200 * gc.owner.zone.graveyard.filter(c => L.isMonster(c) && c.card.race === "Fairy").length);
    dyn("Enraged Muka Muka", (g, gc) => 400 * gc.owner.zone.hand.length, true);
    dyn("Muka Muka", (g, gc) => 300 * gc.owner.zone.hand.length, true);
    dyn("Golden Homunculus", (g, gc) => 300 * gc.owner.zone.banished.length, true);
    dyn("Swamp Battleguard", (g, gc) => 500 * named(gc.owner, "Lava Battleguard"));
    dyn("Lava Battleguard", (g, gc) => 500 * named(gc.owner, "Swamp Battleguard"));
    dyn("Amazoness Paladin", (g, gc) => 100 * L.mons(gc.owner).filter(m => m.faceUp && /amazoness/i.test(m.card.name)).length);
    dyn("Maha Vailo", (g, gc) => 500 * L.sts(gc.owner).filter(c => c.equippedTo === gc.instanceId).length);
    dyn("Neo-Spacian Flare Scarab", (g, gc) => 400 * L.sts(foe(g, gc)).length);
    dyn("Machine King", (g) => 100 * L.allMons(g).filter(m => m.faceUp && raceOf(m) === "Machine").length);
    dyn("Boot-Up Soldier - Dread Dynamo", (g, gc) => (L.mons(gc.owner).some(m => m.faceUp && /gadget/i.test(m.card.name)) ? 2000 : 0));
    dyn("Cybernetic Cyclopean", (g, gc) => (gc.owner.zone.hand.length === 0 ? 1000 : 0));
    dyn("Dweller in the Depths", (g, gc) => 300 * L.sts(gc.owner).filter(c => c.faceUp && /Spell/.test(c.card.type) && c.card.race === "Continuous").length);
    dyn("Grass Phantom", (g, gc) => 500 * gc.owner.zone.graveyard.filter(c => Effects.normalize(c.card.name) === "grass phantom").length);
    dyn("Beelze Frog", (g, gc) => 300 * gc.owner.zone.graveyard.filter(c => /t\.a\.d\.p\.o\.l\.e\./i.test(c.card.name)).length);
    R.dynamic("Helios - The Primordial Sun", (g, gc) => { const n = 100 * gc.owner.zone.banished.filter(L.isMonster).length; return { atk: n, def: n }; });
    R.dynamic("Gren Maju Da Eiza", (g, gc) => { const n = 400 * gc.owner.zone.banished.length; return { atk: n, def: n }; });

    // =========================== mass destruction by type ===========================
    const wipe = (name, race) => def(name, { condition: g => L.allMons(g).some(m => raceOf(m) === race), aiUse: (g, gc) => L.mons(foe(g, gc)).filter(m => raceOf(m) === race).length > L.mons(gc.owner).filter(m => raceOf(m) === race).length },
        g => destroyAllWhere(g, m => raceOf(m) === race, name));
    wipe("Exile of the Wicked", "Fiend"); wipe("Acid Rain", "Machine"); wipe("Warrior Elimination", "Warrior"); wipe("Last Day of Witch", "Spellcaster");
    def("Eternal Rest", { condition: g => L.allMons(g).some(m => L.allSTs(g).some(c => c.equippedTo === m.instanceId)), aiUse: () => false }, g => {
        const t = L.allMons(g).filter(m => L.allSTs(g).some(c => c.equippedTo === m.instanceId)); L.destroyAll(g, t); g.addLog(`Eternal Rest destroys ${t.length} equipped monster(s).`);
    });
    def("Really Eternal Rest", { condition: g => L.allMons(g).some(m => L.allSTs(g).some(c => c.equippedTo === m.instanceId)), aiUse: () => false }, g => {
        const t = L.allMons(g).filter(m => L.allSTs(g).some(c => c.equippedTo === m.instanceId)); L.destroyAll(g, t); g.addLog(`Really Eternal Rest destroys ${t.length} equipped monster(s).`);
    });
    def("Shield Crush", { needsTarget: "custom", targets: g => L.allMons(g).filter(m => m.position === "defense"), aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc)).filter(m => m.position === "defense")), aiUse: () => true },
        (g, gc, t) => { if (t && t.location === "monster") { const n = t.card.name; L.destroy(g, t); g.addLog(`Shield Crush destroys ${n}.`); } });
    def("Anti-Fusion Device", { needsTarget: "custom", targets: g => L.allMons(g).filter(m => m.faceUp && /Fusion/.test(m.card.type)), aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc)).filter(m => m.faceUp && /Fusion/.test(m.card.type))), aiUse: () => true },
        (g, gc, t) => { if (t && t.location === "monster") { const n = t.card.name; L.destroy(g, t); g.addLog(`Anti-Fusion Device destroys ${n}.`); } });
    def("Compulsory Evacuation Device", { needsTarget: "custom", targets: g => L.allMons(g), aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc))), aiUse: () => true },
        (g, gc, t) => { if (t && t.location === "monster") { const n = t.card.name; t.owner.moveCard(t, "monster", "hand"); g.addLog(`Compulsory Evacuation Device returns ${n} to the hand.`); } });
    def("Giant Trunade", { condition: g => L.allSTs(g).some(c => !c.isToken), aiUse: (g, gc) => L.sts(foe(g, gc)).length > L.sts(gc.owner).length + 1 }, (g, gc) => {
        const all = L.allSTs(g).filter(c => c !== gc); all.forEach(c => c.owner.moveCard(c, c.location, "hand")); g.addLog(`Giant Trunade returns ${all.length} Spell/Trap Card(s) to the hand.`);
    });
    def("Just Desserts", { condition: (g, gc) => L.mons(foe(g, gc)).length > 0, aiUse: () => true }, (g, gc) => { const n = L.mons(foe(g, gc)).length * 500; foe(g, gc).dealDamage(n); g.addLog(`Just Desserts inflicts ${n} damage!`); });

    // =========================== Life Points / draw / hand ===========================
    const burn = (name, n) => def(name, { aiUse: () => true }, (g, gc) => { foe(g, gc).dealDamage(n); g.addLog(`${name} inflicts ${n} damage!`); });
    burn("Raimei", 300); burn("Final Flame", 600); burn("Sparks", 200);
    const heal = (name, n) => def(name, { aiUse: () => true }, (g, gc) => { gain(gc, n); g.addLog(`${gc.owner.name} gains ${n} LP.`); });
    heal("Red Medicine", 500); heal("Soul of the Pure", 800);
    def("Rain of Mercy", { aiUse: () => false }, g => { g.player1.lifePoints += 1000; g.player2.lifePoints += 1000; g.addLog("Both players gain 1000 LP."); });
    def("Gift Card", { aiUse: () => false }, (g, gc) => { foe(g, gc).lifePoints += 3000; g.addLog(`${foe(g, gc).name} gains 3000 LP.`); });
    def("Upstart Goblin", { condition: (g, gc) => gc.owner.zone.deck.length >= 1, aiUse: () => true }, (g, gc) => { gc.owner.drawCard(1); foe(g, gc).lifePoints += 1000; g.addLog(`${gc.owner.name} draws 1 card; ${foe(g, gc).name} gains 1000 LP.`); });
    def("Reckless Greed", { condition: (g, gc) => gc.owner.zone.deck.length >= 2, aiUse: () => false }, (g, gc) => { gc.owner.drawCard(2); gc.owner.skipDrawPhases = (gc.owner.skipDrawPhases || 0) + 2; g.addLog(`${gc.owner.name} draws 2 cards and will skip their next 2 Draw Phases.`); });
    def("Time Seal", { aiUse: () => false }, (g, gc) => { const o = foe(g, gc); o.skipDrawPhases = (o.skipDrawPhases || 0) + 1; g.addLog(`${o.name} skips their next Draw Phase.`); });
    def("Threatening Roar", { condition: (g, gc) => g.currentPlayer !== gc.owner, aiUse: (g, gc) => L.mons(foe(g, gc)).length > 0 }, (g, gc) => { g.noAttackTurn = g.turn; g.noAttackPlayer = foe(g, gc); g.addLog(`${foe(g, gc).name} cannot declare an attack this turn.`); });
    def("Simultaneous Loss", { aiUse: () => false }, g => { [g.player1, g.player2].forEach(p => { if (p.zone.deck.length) L.send(p.zone.deck[0], "graveyard"); }); g.addLog("Each player sends the top card of their Deck to the Graveyard."); });
    def("Trade-In", { condition: (g, gc) => gc.owner.zone.hand.some(c => c !== gc && L.isMonster(c) && (c.card.level || 0) === 8) && gc.owner.zone.deck.length >= 2, aiUse: () => true }, (g, gc) => {
        const o = gc.owner;
        L.choose(g, o, { prompt: "Trade-In: discard 1 Level 8 monster", candidates: o.zone.hand.filter(c => L.isMonster(c) && (c.card.level || 0) === 8), min: 1, max: 1, alwaysAsk: true }, ([c]) => { L.send(c, "graveyard"); o.drawCard(2); g.addLog(`${o.name} discards ${c.card.name} and draws 2 cards.`); });
    });
    def("Destiny Draw", { condition: (g, gc) => gc.owner.zone.hand.some(c => c !== gc && /destiny hero/i.test(c.card.name)) && gc.owner.zone.deck.length >= 2, aiUse: () => true }, (g, gc) => {
        const o = gc.owner;
        L.choose(g, o, { prompt: "Destiny Draw: discard 1 \"Destiny HERO\" card", candidates: o.zone.hand.filter(c => /destiny hero/i.test(c.card.name)), min: 1, max: 1, alwaysAsk: true }, ([c]) => { L.send(c, "graveyard"); o.drawCard(2); g.addLog(`${o.name} discards ${c.card.name} and draws 2 cards.`); });
    });
    def("Dark World Dealings", { condition: g => g.player1.zone.deck.length > 0 && g.player2.zone.deck.length > 0, aiUse: () => false }, (g, gc) => {
        const ps = [gc.owner, foe(g, gc)]; ps.forEach(p => p.drawCard(1));
        const next = i => { if (i >= ps.length) return; const p = ps[i];
            L.choose(g, p, { prompt: "Dark World Dealings: discard 1 card", candidates: p.zone.hand.slice(), min: 1, max: 1, alwaysAsk: true }, ([c]) => { L.send(c, "graveyard"); g.addLog(`${p.name} discards ${c.card.name}.`); next(i + 1); }) || next(i + 1); };
        next(0);
    });
    def("The Cheerful Coffin", { condition: (g, gc) => gc.owner.zone.hand.some(c => c !== gc && L.isMonster(c)), aiUse: () => false }, (g, gc) => {
        const o = gc.owner;
        g.requestChoice(o, { prompt: "The Cheerful Coffin: discard up to 3 monsters from your hand", candidates: o.zone.hand.filter(L.isMonster), min: 0, max: 3, optional: true,
            onChoose: picked => { picked.forEach(c => L.send(c, "graveyard")); g.addLog(`${o.name} discards ${picked.length} monster(s).`); } });
    });
    def("Pot of Generosity", { condition: (g, gc) => gc.owner.zone.hand.filter(c => c !== gc).length >= 2, aiUse: () => false }, (g, gc) => {
        const o = gc.owner;
        L.choose(g, o, { prompt: "Pot of Generosity: return 2 cards from your hand to your Deck", candidates: o.zone.hand.slice(), min: 2, max: 2, alwaysAsk: true }, picked => {
            picked.forEach(c => { o.moveCard(c, "hand", "deck"); }); o.shuffleDeck(); g.addLog(`${o.name} returns 2 cards to the Deck and shuffles.`);
        });
    });
    def("Disappear", { condition: (g, gc) => foe(g, gc).zone.graveyard.length > 0, aiUse: () => false }, (g, gc) => {
        L.choose(g, gc.owner, { prompt: "Disappear: banish 1 card from your opponent's Graveyard", candidates: foe(g, gc).zone.graveyard.slice(), min: 1, max: 1, alwaysAsk: true }, ([c]) => { L.send(c, "banished"); g.addLog(`Disappear banishes ${c.card.name}.`); });
    });
    def("Gravedigger Ghoul", { condition: (g, gc) => foe(g, gc).zone.graveyard.some(L.isMonster), aiUse: () => false }, (g, gc) => {
        const c = foe(g, gc).zone.graveyard.filter(L.isMonster);
        L.choose(g, gc.owner, { prompt: "Gravedigger Ghoul: banish up to 2 monsters from your opponent's Graveyard", candidates: c, min: 1, max: Math.min(2, c.length), alwaysAsk: true }, picked => { picked.forEach(x => L.send(x, "banished")); g.addLog(`Gravedigger Ghoul banishes ${picked.length} monster(s).`); });
    });
    def("Burial from a Different Dimension", { condition: (g, gc) => gc.owner.zone.banished.some(L.isMonster), aiUse: () => true }, (g, gc) => {
        const c = gc.owner.zone.banished.filter(L.isMonster);
        L.choose(g, gc.owner, { prompt: "Return up to 3 banished monsters to the Graveyard", candidates: c, min: 1, max: Math.min(3, c.length), alwaysAsk: true }, picked => { picked.forEach(x => gc.owner.moveCard(x, "banished", "graveyard")); g.addLog(`${picked.length} banished monster(s) return to the Graveyard.`); });
    });
    // searches / recoveries
    const searchSpell = (name, filter, prompt, from = "deck") => def(name, { condition: (g, gc) => gc.owner[from === "deck" ? "zone" : "zone"][from].some(filter), aiUse: () => true }, (g, gc) => L.addToHand(g, gc, filter, { from, prompt }));
    searchSpell("Terraforming", c => /Spell/.test(c.card.type) && c.card.race === "Field", "Add 1 Field Spell from your Deck to your hand");
    searchSpell("Fusion Sage", c => Effects.normalize(c.card.name) === "polymerization", "Add \"Polymerization\" to your hand");
    searchSpell("Toon Table of Contents", c => /toon/i.test(c.card.name), "Add 1 \"Toon\" card to your hand");
    searchSpell("Reinforcement of the Army", c => L.isMonster(c) && c.card.race === "Warrior" && (c.card.level || 99) <= 4, "Add 1 Level 4 or lower Warrior to your hand");
    searchSpell("Summoner's Art", c => L.isMonster(c) && /Normal/.test(c.card.type) && (c.card.level || 0) >= 5, "Add 1 Level 5 or higher Normal Monster to your hand");
    def("The Warrior Returning Alive", { needsTarget: "custom", targets: (g, gc) => gc.owner.zone.graveyard.filter(c => L.isMonster(c) && c.card.race === "Warrior"), aiTarget: (g, gc) => gc.owner.zone.graveyard.filter(c => L.isMonster(c) && c.card.race === "Warrior")[0] || null, aiUse: () => true },
        (g, gc, t) => { if (t && t.location === "graveyard") { gc.owner.moveCard(t, "graveyard", "hand"); g.addLog(`${t.card.name} is added to the hand.`); } });
    def("Dark Factory of Mass Production", { condition: (g, gc) => gc.owner.zone.graveyard.filter(c => L.isMonster(c) && /Normal/.test(c.card.type)).length >= 2, aiUse: () => true }, (g, gc) => {
        L.choose(g, gc.owner, { prompt: "Add 2 Normal Monsters from your Graveyard to your hand", candidates: gc.owner.zone.graveyard.filter(c => L.isMonster(c) && /Normal/.test(c.card.type)), min: 2, max: 2, alwaysAsk: true }, picked => { picked.forEach(c => gc.owner.moveCard(c, "graveyard", "hand")); g.addLog("2 Normal Monsters are added to the hand."); });
    });

    // =========================== board position ===========================
    def("Earthquake", { condition: g => L.allMons(g).some(m => m.faceUp && m.position === "attack"), aiUse: () => false }, g => { L.allMons(g).filter(m => m.faceUp).forEach(m => { m.position = "defense"; }); g.addLog("All face-up monsters are changed to Defense Position."); });
    def("No Entry!!", { aiUse: (g, gc) => L.mons(foe(g, gc)).some(m => m.position === "attack") }, g => { L.allMons(g).filter(m => m.position === "attack").forEach(m => { m.position = "defense"; }); g.addLog("All Attack Position monsters are changed to Defense Position."); });
    def("Zero Gravity", { condition: g => L.allMons(g).some(m => m.faceUp), aiUse: () => false }, g => { L.allMons(g).filter(m => m.faceUp).forEach(m => { m.position = m.position === "attack" ? "defense" : "attack"; }); g.addLog("The battle positions of all face-up monsters are changed."); });

    // =========================== equips / field / continuous ===========================
    const eq = (name, test, atk, d) => def(name, { needsTarget: "custom", aiUse: () => true, targets: g => L.allMons(g).filter(m => m.faceUp && test(m)), aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp && test(m))) },
        (g, gc, t) => { if (t && t.location === "monster") L.equip(g, gc, t, atk, d); });
    eq("Power of Kaishin", m => raceOf(m) === "Aqua", 300, 300); eq("Machine Conversion Factory", m => raceOf(m) === "Machine", 300, 300);
    eq("Legendary Sword", m => raceOf(m) === "Warrior", 300, 300); eq("Laser Cannon Armor", m => raceOf(m) === "Insect", 300, 300);
    eq("Raise Body Heat", m => raceOf(m) === "Dinosaur", 300, 300);
    def("Mist Body", { needsTarget: "custom", aiUse: () => true, targets: g => L.allMons(g).filter(m => m.faceUp), aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp)) }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        t.modifiers.battleIndestructible = true; gc.equippedTo = t.instanceId;
        gc.linkedRevert = () => { if (t.location === "monster") t.modifiers.battleIndestructible = false; };
        g.addLog(`Mist Body equips to ${t.card.name}: it cannot be destroyed by battle.`);
    });
    def("Paralyzing Potion", { needsTarget: "custom", aiUse: () => false, targets: g => L.allMons(g).filter(m => m.faceUp && raceOf(m) !== "Machine"), aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc)).filter(m => m.faceUp && raceOf(m) !== "Machine")) }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        t.modifiers.cannotAttack = true; gc.equippedTo = t.instanceId;
        gc.linkedRevert = () => { if (t.location === "monster") t.modifiers.cannotAttack = false; };
        g.addLog(`Paralyzing Potion: ${t.card.name} cannot attack.`);
    });
    def("Acidic Downpour", { aiUse: () => true }, g => g.addLog("Acidic Downpour is active."));
    R.continuous("Acidic Downpour", (g, s, t) => (t.card.attribute === "EARTH" ? { atk: -500, def: 400 } : null));
    def("Chorus of Sanctuary", { aiUse: () => true }, g => g.addLog("Chorus of Sanctuary is active."));
    R.continuous("Chorus of Sanctuary", (g, s, t) => (t.position === "defense" ? { def: 500 } : null));
    def("Gravity Bind", { aiUse: (g, gc) => L.mons(gc.owner).some(m => (m.card.level || 0) <= 3) || L.mons(foe(g, gc)).some(m => (m.card.level || 0) >= 4), needsTarget: undefined }, g => g.addLog("Gravity Bind: Level 4 or higher monsters cannot attack."));
    R.attackRestriction("Gravity Bind", (g, src, a) => (a.card.level || 0) >= 4);
    // Vengeful Bog Spirit is a MONSTER: while it is face-up on the field the restriction applies.
    R.attackRestriction("Vengeful Bog Spirit", (g, src, a) => !!a.state.hasBeenSummonedThisTurn);
    R.graveRedirect("Banisher of the Light", () => true);
    R.graveRedirect("Banisher of the Radiance", () => true);
    def("Dimensional Fissure", { aiUse: () => false }, g => g.addLog("Dimensional Fissure: monsters sent to the Graveyard are banished instead."));
    R.graveRedirect("Dimensional Fissure", (g, src, c) => L.isMonster(c));

    // =========================== Counter Traps ===========================
    const negateEquip = { condition: g => { const t = g.chain[g.chain.length - 1]; return !!t && !t.negated && t.meta && t.meta.subtype === "equip"; }, aiUse: () => true };
    def("Armor Break", negateEquip, g => { const t = g.chain[g.chain.length - 1]; if (t) { t.negated = true; g.addLog(`Armor Break negates ${t.gc.card.name} and destroys it.`); if (t.gc.location === "spellTrap") L.destroy(g, t.gc); } });
    def("Counter Counter", { condition: g => { const t = g.chain[g.chain.length - 1]; return !!t && !t.negated && t.meta && t.meta.subtype === "counter"; }, aiUse: () => true },
        g => { const t = g.chain[g.chain.length - 1]; if (t) { t.negated = true; g.addLog(`Counter Counter negates ${t.gc.card.name} and destroys it.`); if (t.gc.location === "spellTrap") L.destroy(g, t.gc); } });
}
module.exports = { install };
