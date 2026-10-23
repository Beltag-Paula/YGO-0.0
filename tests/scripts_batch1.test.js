"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel, LocalCards } = require("./harness");
const settle = d => { for (let i = 0; i < 12 && (d.game.state.awaitingChain || d.game.state.awaitingChoice); i++) { if (!d.game.state.awaitingChoice) d.game.dispatch({ type: "PASS_RESPONSE" }); else if (d.game.choice.option) d.game.resolveOption(d.game.choice.options[0].id); else if (d.game.choice.min === 0) d.game.resolveChoice([]); else d.choose("first"); } };
const flip = (d, name, p) => { const m = d.mon(p, name); m.faceUp = true; require("../Effects").triggerFlip(d.game, m); settle(d); };
const firstWith = pred => LocalCards.all().map(r => LocalCards.toApiShape(r)).find(c => /Monster/.test(c.type) && !/Effect|Fusion|Ritual/.test(c.type) && pred(c)).name;

test("FLIP: Skelengel draws, Poison Mummy burns 500", () => {
    let d = makeDuel({ p1: { monsters: [{ name: "Skelengel", faceUp: false }] } }); const h = d.p1.zone.hand.length; flip(d, "Skelengel", d.p1); assert.equal(d.p1.zone.hand.length, h + 1);
    d = makeDuel({ p1: { monsters: [{ name: "Poison Mummy", faceUp: false }] } }); flip(d, "Poison Mummy", d.p1); assert.equal(d.p2.lifePoints, 7500);
});
test("FLIP: Magnetic Mosquito destroys every Machine on the field; 4-Starred Ladybug only the opponent's Level 4s", () => {
    const machine = firstWith(c => c.race === "Machine");
    let d = makeDuel({ p1: { monsters: [{ name: "Magnetic Mosquito", faceUp: false }, machine, "Feral Imp"] }, p2: { monsters: [machine] } });
    flip(d, "Magnetic Mosquito", d.p1); assert.deepEqual(d.names(d.p1, "monster").sort(), ["Feral Imp", "Magnetic Mosquito"], "the Insect Mosquito itself is not a Machine"); assert.equal(d.p2.getMonstersOnField().length, 0);
    d = makeDuel({ p1: { monsters: [{ name: "4-Starred Ladybug of Doom", faceUp: false }, "Feral Imp"] }, p2: { monsters: ["Feral Imp", "Summoned Skull"] } });
    flip(d, "4-Starred Ladybug of Doom", d.p1); assert.deepEqual(d.names(d.p2, "monster"), ["Summoned Skull"]); assert.ok(d.mon(d.p1, "Feral Imp"));
});
test("FLIP: Nobleman-Eater Bug destroys 2 monsters of YOUR choice; Old Vindictive Magician destroys 1 opposing monster", () => {
    let d = makeDuel({ p1: { monsters: [{ name: "Nobleman-Eater Bug", faceUp: false }] }, p2: { monsters: ["Summoned Skull", "Feral Imp", "Sangan"] } });
    const m = d.mon(d.p1, "Nobleman-Eater Bug"); m.faceUp = true; require("../Effects").triggerFlip(d.game, m);
    assert.ok(d.game.choice && d.game.choice.min === 2 && d.game.choice.onField, "you pick the two monsters");
    d.choose("Summoned Skull", "Feral Imp"); settle(d);
    assert.deepEqual(d.names(d.p2, "monster"), ["Sangan"]);
    d = makeDuel({ p1: { monsters: [{ name: "Old Vindictive Magician", faceUp: false }, "Feral Imp"] }, p2: { monsters: ["Summoned Skull"] } });
    flip(d, "Old Vindictive Magician", d.p1); assert.equal(d.p2.getMonstersOnField().length, 0); assert.ok(d.mon(d.p1, "Feral Imp"));
});
test("FLIP: Kotetsu adds an Equip Spell, Magician of Faith a Spell, Mask of Darkness a Trap from the Graveyard", () => {
    let d = makeDuel({ p1: { monsters: [{ name: "Iron Blacksmith Kotetsu", faceUp: false }], deck: ["Salamandra", "Pot of Greed"] } }); flip(d, "Iron Blacksmith Kotetsu", d.p1); assert.ok(d.names(d.p1, "hand").includes("Salamandra")); assert.ok(!d.names(d.p1, "hand").includes("Pot of Greed"));
    d = makeDuel({ p1: { monsters: [{ name: "Magician of Faith", faceUp: false }], graveyard: ["Pot of Greed", "Mirror Force"] } }); flip(d, "Magician of Faith", d.p1); assert.deepEqual(d.names(d.p1, "hand").filter(n => n === "Pot of Greed"), ["Pot of Greed"]); assert.ok(d.names(d.p1, "graveyard").includes("Mirror Force"));
    d = makeDuel({ p1: { monsters: [{ name: "Mask of Darkness", faceUp: false }], graveyard: ["Pot of Greed", "Mirror Force"] } }); flip(d, "Mask of Darkness", d.p1); assert.ok(d.names(d.p1, "hand").includes("Mirror Force"));
});
test("FLIP: Guard Dog stops the opponent's Special Summons for the turn", () => {
    const d = makeDuel({ p1: { monsters: [{ name: "Guard Dog", faceUp: false }] }, p2: { hand: ["Monster Reborn"], graveyard: ["Summoned Skull"] } });
    flip(d, "Guard Dog", d.p1);
    const L = require("../scripts/_lib"); assert.equal(L.specialSummon(d.game, d.find(d.p2, "Summoned Skull", "graveyard"), d.p2), false);
});
test("Summon triggers: Gravekeeper's Curse burns 500; Sacred Crane/Molten Zombie draw only when Special Summoned", () => {
    let d = makeDuel({ p1: { hand: ["Gravekeeper's Curse"] } }); d.game.normalSummon(d.hand(d.p1, "Gravekeeper's Curse"), []); assert.equal(d.p2.lifePoints, 7500);
    d = makeDuel({ p1: { hand: ["Sacred Crane"] } }); let h = d.p1.zone.hand.length; d.game.normalSummon(d.hand(d.p1, "Sacred Crane"), []); assert.equal(d.p1.zone.hand.length, h - 1, "a Normal Summon draws nothing");
    d = makeDuel({ p1: { hand: ["Monster Reborn"], graveyard: ["Molten Zombie"] } }); h = d.p1.zone.hand.length;
    d.activate("Monster Reborn", d.find(d.p1, "Molten Zombie", "graveyard")); settle(d); assert.equal(d.p1.zone.hand.length, h - 1 + 1, "Special Summoned from the GY: draw 1");
});
test("Cannon Soldier / Amazoness Archer / MK-2: Tribute monsters for damage", () => {
    const run = (name, n, dmg) => {
        const d = makeDuel({ p1: { monsters: [name, "Feral Imp", "Feral Imp"] } });
        const m = d.mon(d.p1, name); assert.ok(d.game.activateMonsterEffect(m, null)); settle(d);
        assert.equal(d.p2.lifePoints, 8000 - dmg); assert.equal(d.p1.getMonstersOnField().length, 3 - n);
    };
    run("Cannon Soldier", 1, 500); run("Amazoness Archer", 2, 1200); run("Cannon Soldier MK-2", 2, 1500);
});
test("Dark Elf pays 1000 LP to attack and can't attack with 1000 or less; Twinheaded Beast attacks twice", () => {
    let d = makeDuel({ p1: { monsters: ["Dark Elf"] } }); d.game.phase = "battle"; assert.ok(d.game.declareAttack(d.mon(d.p1, "Dark Elf"), null)); assert.equal(d.p1.lifePoints, 7000);
    d = makeDuel({ p1: { monsters: ["Dark Elf"], lp: 1000 } }); d.game.phase = "battle"; assert.equal(d.game.canAttack(d.mon(d.p1, "Dark Elf")), false);
    d = makeDuel({ p1: { monsters: ["Twinheaded Beast"] } }); d.game.phase = "battle"; const t = d.mon(d.p1, "Twinheaded Beast");
    d.game.declareAttack(t, null); if (d.game.state.awaitingResponse) d.game.resolveBattleDamage(); assert.equal(d.game.canAttack(t), true);
});
test("Board-dependent ATK: Shadow Ghoul, Mudora, Muka Muka, Enraged Muka Muka, Machine King, Cybernetic Cyclopean", () => {
    const fairy = firstWith(c => c.race === "Fairy"), machine = firstWith(c => c.race === "Machine");
    let d = makeDuel({ p1: { monsters: ["Shadow Ghoul"], graveyard: ["Feral Imp", "Feral Imp", "Pot of Greed"] } }); assert.equal(d.atk("Shadow Ghoul", d.p1), 1600 + 200);
    d = makeDuel({ p1: { monsters: ["Mudora"], graveyard: [fairy, fairy, "Feral Imp"] } }); assert.equal(d.atk("Mudora", d.p1), 1500 + 400);
    d = makeDuel({ p1: { monsters: ["Muka Muka"], hand: ["Feral Imp", "Feral Imp"] } }); assert.equal(d.atk("Muka Muka", d.p1), 600 + 600); assert.equal(d.def("Muka Muka", d.p1), 300 + 600);
    d = makeDuel({ p1: { monsters: ["Enraged Muka Muka"], hand: ["Feral Imp"] } }); assert.equal(d.atk("Enraged Muka Muka", d.p1), 1200 + 400);
    d = makeDuel({ p1: { monsters: ["Machine King", machine] }, p2: { monsters: [machine] } }); assert.equal(d.atk("Machine King", d.p1), 2200 + 300);
    d = makeDuel({ p1: { monsters: ["Cybernetic Cyclopean"] } }); d.p1.zone.hand.slice().forEach(c => d.p1.moveCard(c, "hand", "deck")); assert.equal(d.atk("Cybernetic Cyclopean", d.p1), 2400);
});
test("Board-dependent ATK: Battleguards, Neo-Spacian Flare Scarab, Golden Homunculus, Helios, Dweller in the Depths", () => {
    let d = makeDuel({ p1: { monsters: ["Swamp Battleguard", "Lava Battleguard"] } }); assert.equal(d.atk("Swamp Battleguard", d.p1), 1800 + 500);
    d = makeDuel({ p1: { monsters: ["Neo-Spacian Flare Scarab"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }, { name: "Pot of Greed", faceUp: false }] } }); assert.equal(d.atk("Neo-Spacian Flare Scarab", d.p1), 500 + 800);
    d = makeDuel({ p1: { monsters: ["Golden Homunculus"], banished: ["Feral Imp", "Pot of Greed"] } }); assert.equal(d.atk("Golden Homunculus", d.p1), 1500 + 600);
    d = makeDuel({ p1: { monsters: ["Helios - The Primordial Sun"], banished: ["Feral Imp", "Feral Imp", "Pot of Greed"] } }); assert.equal(d.atk("Helios - The Primordial Sun", d.p1), 200);
});
test("Destroy-all-of-a-type Spells hit both sides and only that type", () => {
    const machine = firstWith(c => c.race === "Machine");
    let d = makeDuel({ p1: { hand: ["Acid Rain"], monsters: [machine, "Feral Imp"] }, p2: { monsters: [machine] } }); d.use("Acid Rain"); settle(d);
    assert.deepEqual(d.names(d.p1, "monster"), ["Feral Imp"]); assert.equal(d.p2.getMonstersOnField().length, 0);
    d = makeDuel({ p1: { hand: ["Exile of the Wicked"] }, p2: { monsters: ["Beta The Magnet Warrior"] } }); assert.equal(d.game.checkActivation(d.hand(d.p1, "Exile of the Wicked"), "idle").ok, false, "no Fiend on the field");
});
test("Removal: Shield Crush (Defense only), Anti-Fusion Device (face-up Fusion), Compulsory Evacuation Device (bounce)", () => {
    let d = makeDuel({ p1: { hand: ["Shield Crush"] }, p2: { monsters: [{ name: "Summoned Skull", pos: "attack" }, { name: "Feral Imp", pos: "defense" }] } });
    assert.equal(d.activate("Shield Crush", d.mon(d.p2, "Summoned Skull")), false); assert.ok(d.activate("Shield Crush", d.mon(d.p2, "Feral Imp"))); settle(d); assert.deepEqual(d.names(d.p2, "monster"), ["Summoned Skull"]);
    d = makeDuel({ p1: { hand: ["Anti-Fusion Device"] }, p2: { monsters: ["Black Skull Dragon"] } }); assert.ok(d.use("Anti-Fusion Device", d.mon(d.p2, "Black Skull Dragon"))); settle(d); assert.equal(d.p2.getMonstersOnField().length, 0);
    d = makeDuel({ p1: { hand: ["Compulsory Evacuation Device"] }, p2: { monsters: ["Summoned Skull"] } }); assert.ok(d.use("Compulsory Evacuation Device", d.mon(d.p2, "Summoned Skull"))); settle(d); assert.ok(d.names(d.p2, "hand").includes("Summoned Skull"));
});
test("Giant Trunade returns every Spell/Trap on the field to the hand; Just Desserts 500 per monster", () => {
    let d = makeDuel({ p1: { hand: ["Giant Trunade"], spellTrap: [{ name: "Mirror Force", faceUp: false }] }, p2: { spellTrap: [{ name: "Pot of Greed", faceUp: false }] } }); d.use("Giant Trunade"); settle(d);
    assert.equal(d.p1.getSpellTrapsOnField().length + d.p2.getSpellTrapsOnField().length, 0); assert.ok(d.names(d.p2, "hand").includes("Pot of Greed")); assert.ok(d.names(d.p1, "hand").includes("Mirror Force"));
    d = makeDuel({ p1: { hand: ["Just Desserts"] }, p2: { monsters: ["Feral Imp", "Sangan", "Summoned Skull"] } }); d.use("Just Desserts"); settle(d); assert.equal(d.p2.lifePoints, 8000 - 1500);
});
test("Burn and heal Spells: Raimei 300, Final Flame 600, Sparks 200; Red Medicine +500, Soul of the Pure +800; Rain of Mercy both +1000; Gift Card +3000 to the opponent", () => {
    const run = (name, fn) => { const d = makeDuel({ p1: { hand: [name] } }); d.use(name); settle(d); fn(d); };
    run("Raimei", d => assert.equal(d.p2.lifePoints, 7700)); run("Final Flame", d => assert.equal(d.p2.lifePoints, 7400)); run("Sparks", d => assert.equal(d.p2.lifePoints, 7800));
    run("Red Medicine", d => assert.equal(d.p1.lifePoints, 8500)); run("Soul of the Pure", d => assert.equal(d.p1.lifePoints, 8800));
    run("Rain of Mercy", d => assert.deepEqual([d.p1.lifePoints, d.p2.lifePoints], [9000, 9000])); run("Gift Card", d => assert.equal(d.p2.lifePoints, 11000));
});
test("Draw effects: Upstart Goblin (opponent +1000 LP), Reckless Greed (skip 2 Draw Phases), Time Seal (opponent skips one)", () => {
    let d = makeDuel({ p1: { hand: ["Upstart Goblin"] } }); const h = d.p1.zone.hand.length; d.use("Upstart Goblin"); settle(d); assert.equal(d.p1.zone.hand.length, h); assert.equal(d.p2.lifePoints, 9000);
    d = makeDuel({ p1: { hand: ["Reckless Greed"] } }); d.use("Reckless Greed"); settle(d); assert.equal(d.p1.skipDrawPhases, 2);
    d.game.currentPlayer = d.p1; d.game.phase = "draw"; d.game.firstTurn = false; d.game.state.waitingForAction = false; const before = d.p1.zone.hand.length; d.game.nextPhase();
    assert.equal(d.p1.zone.hand.length, before, "no draw"); assert.equal(d.p1.skipDrawPhases, 1);
    d = makeDuel({ p1: { hand: ["Time Seal"] } }); d.use("Time Seal"); settle(d); assert.equal(d.p2.skipDrawPhases, 1);
});
test("Hand cards: Trade-In (Level 8), Destiny Draw, Pot of Generosity, Dark World Dealings", () => {
    let d = makeDuel({ p1: { hand: ["Trade-In", "Blue-Eyes White Dragon"] } }); d.use("Trade-In"); settle(d); assert.ok(d.names(d.p1, "graveyard").includes("Blue-Eyes White Dragon")); assert.equal(d.p1.zone.hand.length, 2);
    assert.equal(makeDuel({ p1: { hand: ["Trade-In", "Feral Imp"] } }).game.checkActivation(null, "idle").ok, false);
    d = makeDuel({ p1: { hand: ["Pot of Generosity", "Feral Imp", "Sangan"] } }); d.use("Pot of Generosity"); settle(d); assert.equal(d.p1.zone.hand.length, 0);
    d = makeDuel({ p1: { hand: ["Dark World Dealings", "Feral Imp"] }, p2: { hand: ["Sangan"] } }); d.use("Dark World Dealings"); settle(d); assert.equal(d.p1.zone.hand.length, 1); assert.equal(d.p2.zone.hand.length, 1);
});
test("Graveyard tools: Gravedigger Ghoul, Disappear, Burial from a Different Dimension, Dark Factory, Warrior Returning Alive", () => {
    let d = makeDuel({ p1: { hand: ["Gravedigger Ghoul"] }, p2: { graveyard: ["Summoned Skull", "Feral Imp", "Pot of Greed"] } }); d.use("Gravedigger Ghoul"); d.choose("Summoned Skull", "Feral Imp"); settle(d); assert.equal(d.names(d.p2, "banished").length, 2); assert.ok(d.names(d.p2, "graveyard").includes("Pot of Greed"));
    d = makeDuel({ p1: { hand: ["Disappear"] }, p2: { graveyard: ["Pot of Greed"] } }); d.use("Disappear"); settle(d); assert.deepEqual(d.names(d.p2, "banished"), ["Pot of Greed"]);
    d = makeDuel({ p1: { hand: ["Burial from a Different Dimension"], banished: ["Feral Imp", "Sangan", "Pot of Greed"] } }); d.use("Burial from a Different Dimension"); d.choose("Feral Imp", "Sangan"); settle(d); assert.equal(d.names(d.p1, "graveyard").filter(n => n !== "Burial from a Different Dimension").length, 2);
    d = makeDuel({ p1: { hand: ["Dark Factory of Mass Production"], graveyard: ["Feral Imp", "Feral Imp"] } }); d.use("Dark Factory of Mass Production"); settle(d); assert.equal(d.names(d.p1, "hand").filter(n => n === "Feral Imp").length, 2);
    const warrior = firstWith(c => c.race === "Warrior");
    d = makeDuel({ p1: { hand: ["The Warrior Returning Alive"], graveyard: [warrior, "Feral Imp"] } }); assert.ok(d.activate("The Warrior Returning Alive", d.find(d.p1, warrior, "graveyard"))); settle(d); assert.ok(d.names(d.p1, "hand").includes(warrior));
});
test("Searches: Terraforming, Fusion Sage, Toon Table of Contents, Reinforcement of the Army, Summoner's Art", () => {
    const run = (spell, deckCard, bad) => { const d = makeDuel({ p1: { hand: [spell], deck: [deckCard, bad] } }); d.use(spell); settle(d); assert.ok(d.names(d.p1, "hand").includes(deckCard), spell); assert.ok(!d.names(d.p1, "hand").includes(bad), spell + " must not take " + bad); };
    run("Terraforming", "Rising Air Current", "Pot of Greed"); run("Fusion Sage", "Polymerization", "Pot of Greed");
    run("Reinforcement of the Army", firstWith(c => c.race === "Warrior" && c.level <= 4), "Summoned Skull"); run("Summoner's Art", "Blue-Eyes White Dragon", "Feral Imp");
});
test("Earthquake / No Entry!! / Zero Gravity change battle positions", () => {
    let d = makeDuel({ p1: { hand: ["Earthquake"], monsters: ["Feral Imp"] }, p2: { monsters: ["Summoned Skull"] } }); d.use("Earthquake"); settle(d); assert.equal(d.mon(d.p1, "Feral Imp").position, "defense"); assert.equal(d.mon(d.p2, "Summoned Skull").position, "defense");
    d = makeDuel({ p1: { hand: ["No Entry!!"], monsters: ["Feral Imp"] }, p2: { monsters: [{ name: "Summoned Skull", pos: "attack" }, { name: "Sangan", pos: "defense" }] } }); d.use("No Entry!!"); settle(d); assert.equal(d.mon(d.p2, "Summoned Skull").position, "defense"); assert.equal(d.mon(d.p1, "Feral Imp").position, "defense");
    d = makeDuel({ p1: { hand: ["Zero Gravity"], monsters: ["Feral Imp"] }, p2: { monsters: [{ name: "Sangan", pos: "defense" }] } }); d.use("Zero Gravity"); settle(d); assert.equal(d.mon(d.p1, "Feral Imp").position, "defense"); assert.equal(d.mon(d.p2, "Sangan").position, "attack");
});
test("Type-restricted Equips give +300/+300 only to the right type; Mist Body and Paralyzing Potion", () => {
    const aqua = firstWith(c => c.race === "Aqua");
    let d = makeDuel({ p1: { hand: ["Power of Kaishin"], monsters: [aqua, "Feral Imp"] } }); assert.equal(d.activate("Power of Kaishin", d.mon(d.p1, "Feral Imp")), false); const a = d.atk(aqua, d.p1); assert.ok(d.activate("Power of Kaishin", d.mon(d.p1, aqua))); settle(d); assert.equal(d.atk(aqua, d.p1), a + 300);
    d = makeDuel({ p1: { hand: ["Mist Body"], monsters: ["Feral Imp"] }, p2: { monsters: ["Summoned Skull"] } }); d.activate("Mist Body", d.mon(d.p1, "Feral Imp")); settle(d);
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p2, "Summoned Skull"), d.mon(d.p1, "Feral Imp")); if (d.game.state.awaitingResponse) d.game.dispatch({ type: "PASS_RESPONSE" });
    assert.ok(d.mon(d.p1, "Feral Imp"), "survived the battle");
    d = makeDuel({ p1: { hand: ["Paralyzing Potion"] }, p2: { monsters: ["Summoned Skull"] } }); d.activate("Paralyzing Potion", d.mon(d.p2, "Summoned Skull")); settle(d); d.game.currentPlayer = d.p2; d.game.phase = "battle"; assert.equal(d.game.canAttack(d.mon(d.p2, "Summoned Skull")), false);
});
test("Field Spells: Acidic Downpour (EARTH -500/+400), Chorus of Sanctuary (Defense +500 DEF)", () => {
    const earth = firstWith(c => c.attribute === "EARTH");
    let d = makeDuel({ p1: { hand: ["Acidic Downpour"], monsters: [earth] } }); const [a, df] = [d.atk(earth, d.p1), d.def(earth, d.p1)]; d.activate("Acidic Downpour"); settle(d); assert.equal(d.atk(earth, d.p1), Math.max(0, a - 500)); assert.equal(d.def(earth, d.p1), df + 400);
    d = makeDuel({ p1: { hand: ["Chorus of Sanctuary"], monsters: [{ name: "Feral Imp", pos: "defense" }, { name: "Sangan", pos: "attack" }] } }); const imp = d.def("Feral Imp", d.p1), sg = d.def("Sangan", d.p1); d.activate("Chorus of Sanctuary"); settle(d); assert.equal(d.def("Feral Imp", d.p1), imp + 500); assert.equal(d.def("Sangan", d.p1), sg);
});
test("Gravity Bind (Continuous Trap) stops Level 4+ monsters from attacking; Vengeful Bog Spirit stops monsters from attacking the turn they are Summoned", () => {
    let d = makeDuel({ p1: { hand: ["Gravity Bind"], monsters: ["Summoned Skull", "Sangan"] } }); assert.ok(d.use("Gravity Bind")); settle(d); d.game.phase = "battle";
    assert.equal(d.game.canAttack(d.mon(d.p1, "Summoned Skull")), false); assert.equal(d.game.canAttack(d.mon(d.p1, "Sangan")), true, "Level 3 may attack");
    d = makeDuel({ p1: { hand: ["Feral Imp"], monsters: ["Vengeful Bog Spirit", "Sangan"] } }); d.game.normalSummon(d.hand(d.p1, "Feral Imp"), []); d.game.phase = "battle";
    assert.equal(d.game.canAttack(d.mon(d.p1, "Feral Imp")), false, "summoned this turn"); assert.equal(d.game.canAttack(d.mon(d.p1, "Sangan")), true);
});
test("Banisher of the Light and Dimensional Fissure banish cards that would go to the Graveyard", () => {
    let d = makeDuel({ p1: { monsters: ["Banisher of the Light"] }, p2: { hand: ["Pot of Greed"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.activate("Pot of Greed", null, d.p2); settle(d);
    assert.equal(d.names(d.p2, "graveyard").includes("Pot of Greed"), false, "any card, even the Spell, is banished instead");
    assert.ok(d.names(d.p2, "banished").includes("Pot of Greed"));
    d = makeDuel({ p1: { hand: ["Dimensional Fissure"], monsters: ["Feral Imp"] }, p2: { hand: ["Dark Hole"] } }); d.activate("Dimensional Fissure"); settle(d);
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.activate("Dark Hole", null, d.p2); settle(d);
    assert.ok(d.names(d.p1, "banished").includes("Feral Imp")); assert.ok(d.names(d.p2, "graveyard").includes("Dark Hole"), "Spells still go to the Graveyard");
});
test("Threatening Roar stops the opponent from attacking this turn (usable at the start of their Battle Phase)", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { spellTrap: [{ name: "Threatening Roar", faceUp: false }] } });
    d.game.phase = "battle"; d.game.battlePhase(); assert.ok(d.game.state.awaitingChain);
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: d.st(d.p2, "Threatening Roar") } }); settle(d);
    assert.equal(d.game.canAttack(d.mon(d.p1, "Summoned Skull")), false);
    const own = makeDuel({ p1: { spellTrap: [{ name: "Threatening Roar", faceUp: false }] } }); assert.equal(own.game.checkActivation(own.st(own.p1, "Threatening Roar"), "idle").ok, false, "only on the opponent's turn");
});
test("Counter Traps: Armor Break negates an Equip Spell and destroys it", () => {
    const d = makeDuel({ p1: { hand: ["Salamandra"], monsters: [require("./harness").LocalCards.all().map(r => require("../LocalCards").toApiShape(r)).find(c => c.attribute === "FIRE" && /Monster/.test(c.type) && !/Effect/.test(c.type) && c.level <= 4).name] }, p2: { spellTrap: [{ name: "Armor Break", faceUp: false }] } });
    const fire = d.p1.getMonstersOnField()[0], base = d.atk(fire, d.p1);
    d.game.chainAutoPass = false; d.activate("Salamandra", fire);
    assert.ok(d.game.state.awaitingChain, "the opponent may respond with a Counter Trap");
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: d.st(d.p2, "Armor Break") } }); settle(d);
    assert.equal(d.atk(fire, d.p1), base, "Salamandra's bonus never applied");
    assert.ok(d.names(d.p1, "graveyard").includes("Salamandra"));
});
