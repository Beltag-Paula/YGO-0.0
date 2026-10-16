"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel, LocalCards } = require("./harness");

const fx = (name, fn) => test(name, fn);
const firstOf = (race, attr) => LocalCards.all().map(r => LocalCards.toApiShape(r)).find(c => /Monster/.test(c.type) && !/Effect/.test(c.type) && (!race || c.race === race) && (!attr || c.attribute === attr) && c.level >= 3 && c.level <= 4).name;

// ------------------------------------------------------------- equips
for (const [spell, race, attr, a, d] of [
    ["Dragon Treasure", "Dragon", null, 300, 300], ["Silver Bow and Arrow", "Fairy", null, 300, 300], ["Dark Energy", "Fiend", null, 300, 300],
    ["Violet Crystal", "Zombie", null, 300, 300], ["Steel Shell", null, "WATER", 400, -200], ["Burning Spear", null, "FIRE", 400, -200],
    ["Sword of Dark Destruction", null, "DARK", 400, -200]
]) {
    fx(`${spell}: +${a} ATK / ${d >= 0 ? "+" : ""}${d} DEF to a matching monster only, reverts when removed`, () => {
        const good = firstOf(race, attr);
        const bad = firstOf(race === "Dragon" ? "Warrior" : race ? "Dragon" : null, attr === "WATER" ? "EARTH" : attr ? "WATER" : null);
        const dd = makeDuel({ p1: { hand: [spell], monsters: [good, bad] } });
        const g = dd.mon(dd.p1, good), b = dd.mon(dd.p1, bad), [ga, gd] = [dd.atk(g), dd.def(g)];
        assert.equal(dd.use(spell, b), false, "wrong type is not a legal target");
        assert.ok(dd.use(spell, g));
        assert.equal(dd.atk(g), ga + a); assert.equal(dd.def(g), Math.max(0, gd + d));
        dd.game.player1.moveCard(dd.st(dd.p1, spell), "spellTrap", "graveyard");
        assert.equal(dd.atk(g), ga); assert.equal(dd.def(g), gd);
    });
}

// ------------------------------------------------------------- continuous / field boosts
fx("Mystic Plasma Zone: DARK +500/-400 for both sides", () => {
    const d = makeDuel({ p1: { hand: ["Mystic Plasma Zone"], monsters: ["Summoned Skull"] }, p2: { monsters: ["Beta The Magnet Warrior"] } });
    const [a, df, ea] = [d.atk("Summoned Skull", d.p1), d.def("Summoned Skull", d.p1), d.atk("Beta The Magnet Warrior", d.p2)];
    d.use("Mystic Plasma Zone");
    assert.equal(d.atk("Summoned Skull", d.p1), a + 500); assert.equal(d.def("Summoned Skull", d.p1), df - 400);
    assert.equal(d.atk("Beta The Magnet Warrior", d.p2), ea);
});
fx("Molten Destruction: FIRE +500/-400", () => {
    const fire = firstOf(null, "FIRE");
    const d = makeDuel({ p1: { hand: ["Molten Destruction"], monsters: [fire] } });
    const a = d.atk(fire, d.p1); d.use("Molten Destruction"); assert.equal(d.atk(fire, d.p1), a + 500);
});
fx("Jurassic World: Dinosaurs +300/+300", () => {
    const dino = firstOf("Dinosaur", null);
    const d = makeDuel({ p1: { hand: ["Jurassic World"], monsters: [dino] } });
    const a = d.atk(dino, d.p1); d.use("Jurassic World"); assert.equal(d.atk(dino, d.p1), a + 300); assert.equal(d.def(dino, d.p1) > 0, true);
});
fx("Yellow Luster Shield: +300 DEF to your monsters only", () => {
    const d = makeDuel({ p1: { hand: ["Yellow Luster Shield"], monsters: ["Feral Imp"] }, p2: { monsters: ["Feral Imp"] } });
    const mine = d.mon(d.p1, "Feral Imp"), theirs = d.mon(d.p2, "Feral Imp"), [m0, t0] = [d.def(mine), d.def(theirs)];
    d.use("Yellow Luster Shield"); assert.equal(d.def(mine), m0 + 300); assert.equal(d.def(theirs), t0);
});
fx("Banner of Courage: +200 ATK only during your own Battle Phase", () => {
    const d = makeDuel({ p1: { hand: ["Banner of Courage"], monsters: ["Feral Imp"] } });
    const m = d.mon(d.p1, "Feral Imp"), a = d.atk(m);
    d.use("Banner of Courage"); assert.equal(d.atk(m), a);
    d.game.phase = "battle"; assert.equal(d.atk(m), a + 200);
});
fx("The A. Forces: Warriors gain 200 per Warrior/Spellcaster you control", () => {
    const w = firstOf("Warrior", null), s = firstOf("Spellcaster", null);
    const d = makeDuel({ p1: { hand: ["The A. Forces"], monsters: [w, s] } });
    const a = d.atk(w, d.p1); d.use("The A. Forces"); assert.equal(d.atk(w, d.p1), a + 400);
});

// ------------------------------------------------------------- life points & draw
fx("Ookazi / Hinotama inflict 800 / 500", () => {
    let d = makeDuel({ p1: { hand: ["Ookazi"] } }); d.use("Ookazi"); assert.equal(d.p2.lifePoints, 7200);
    d = makeDuel({ p1: { hand: ["Hinotama"] } }); d.use("Hinotama"); assert.equal(d.p2.lifePoints, 7500);
});
fx("Blue Medicine / Goblin's Secret Remedy gain 400 / 600", () => {
    let d = makeDuel({ p1: { hand: ["Blue Medicine"] } }); d.use("Blue Medicine"); assert.equal(d.p1.lifePoints, 8400);
    d = makeDuel({ p1: { hand: ["Goblin's Secret Remedy"] } }); d.use("Goblin's Secret Remedy"); assert.equal(d.p1.lifePoints, 8600);
});
fx("Jar of Greed (trap) draws 1; The Gift of Greed makes the OPPONENT draw 2", () => {
    let d = makeDuel({ p1: { spellTrap: [{ name: "Jar of Greed", faceUp: false }] } });
    const h = d.p1.zone.hand.length; assert.ok(d.activateSet("Jar of Greed")); assert.equal(d.p1.zone.hand.length, h + 1);
    d = makeDuel({ p1: { hand: ["The Gift of Greed"] } }); const o = d.p2.zone.hand.length; d.use("The Gift of Greed"); assert.equal(d.p2.zone.hand.length, o + 2);
});
fx("D.D. Dynamite: 300 per banished opposing card", () => {
    const d = makeDuel({ p1: { hand: ["D.D. Dynamite"] }, p2: { banished: ["Feral Imp", "Feral Imp", "Feral Imp"] } });
    assert.ok(d.use("D.D. Dynamite")); assert.equal(d.p2.lifePoints, 8000 - 900);
    assert.equal(makeDuel({ p1: { hand: ["D.D. Dynamite"] } }).use("D.D. Dynamite"), false);
});
fx("Rock Bombardment: send a Rock from the Deck, inflict 500", () => {
    const rock = firstOf("Rock", null);
    const d = makeDuel({ p1: { hand: ["Rock Bombardment"], deck: [rock] } });
    assert.ok(d.use("Rock Bombardment")); d.choose(rock); assert.equal(d.p2.lifePoints, 7500); assert.ok(d.names(d.p1, "graveyard").includes(rock));
});
fx("Destruction Ring: destroy own face-up monster, 1000 damage to both", () => {
    const d = makeDuel({ p1: { hand: ["Destruction Ring"], monsters: ["Feral Imp"] } });
    assert.ok(d.use("Destruction Ring", d.mon(d.p1, "Feral Imp")));
    assert.deepEqual([d.p1.lifePoints, d.p2.lifePoints], [7000, 7000]); assert.equal(d.p1.getMonstersOnField().length, 0);
});

// ------------------------------------------------------------- removal
fx("Raigeki Break: discard 1, destroy 1 target card", () => {
    const d = makeDuel({ p1: { hand: ["Raigeki Break", "Feral Imp"] }, p2: { monsters: ["Summoned Skull"] } });
    assert.ok(d.use("Raigeki Break", d.mon(d.p2, "Summoned Skull"))); d.choose("Feral Imp");
    assert.equal(d.p2.getMonstersOnField().length, 0);
    assert.equal(makeDuel({ p1: { hand: ["Raigeki Break"] }, p2: { monsters: ["Summoned Skull"] } }).use("Raigeki Break"), false);
});
fx("Breath of Light destroys only face-up Rock monsters", () => {
    const rock = firstOf("Rock", null);
    const d = makeDuel({ p1: { hand: ["Breath of Light"], monsters: [rock, "Feral Imp"] }, p2: { monsters: [rock] } });
    d.use("Breath of Light"); assert.deepEqual(d.names(d.p1, "monster"), ["Feral Imp"]); assert.equal(d.p2.getMonstersOnField().length, 0);
});
fx("Disarmament destroys every Equip Card", () => {
    const d = makeDuel({ p1: { hand: ["Disarmament"], monsters: [firstOf("Dragon", null)], spellTrap: ["Dragon Treasure"] }, p2: {} });
    d.use("Disarmament"); assert.equal(d.st(d.p1, "Dragon Treasure"), null);
});
fx("Final Destiny: discard 5 cards, destroy everything on the field", () => {
    const d = makeDuel({ p1: { hand: ["Final Destiny", "Feral Imp", "Feral Imp", "Feral Imp", "Feral Imp", "Feral Imp"], monsters: ["Summoned Skull"] }, p2: { monsters: ["Feral Imp"], spellTrap: ["Salamandra"] } });
    assert.ok(d.use("Final Destiny")); d.choose("first");
    assert.equal(d.p1.getMonstersOnField().length + d.p2.getMonstersOnField().length + d.p2.getSpellTrapsOnField().length, 0);
});
fx("Ritual Sealing: only a face-up Ritual Monster is a legal target", () => {
    const d = makeDuel({ p1: { hand: ["Ritual Sealing"] }, p2: { monsters: ["Black Luster Soldier", "Feral Imp"] } });
    assert.equal(d.use("Ritual Sealing", d.mon(d.p2, "Feral Imp")), false);
    assert.ok(d.use("Ritual Sealing", d.mon(d.p2, "Black Luster Soldier"))); assert.deepEqual(d.names(d.p2, "monster"), ["Feral Imp"]);
});
fx("Spell Purification / Malice Dispersion destroy face-up Continuous Spells / Traps", () => {
    let d = makeDuel({ p1: { hand: ["Spell Purification", "Feral Imp"] }, p2: { spellTrap: ["Rising Air Current", "Yellow Luster Shield", "Ultimate Offering"] } });
    assert.ok(d.use("Spell Purification")); d.choose("first");
    assert.equal(d.st(d.p2, "Yellow Luster Shield"), null, "Continuous Spell destroyed");
    assert.notEqual(d.st(d.p2, "Rising Air Current"), null, "a Field Spell is not a Continuous Spell");
    assert.notEqual(d.st(d.p2, "Ultimate Offering"), null, "a Continuous Trap is not a Continuous Spell");
    d = makeDuel({ p1: { hand: ["Malice Dispersion", "Feral Imp"] }, p2: { spellTrap: [{ name: "Dragon Capture Jar", faceUp: true }] } });
    assert.ok(d.use("Malice Dispersion")); d.choose("first"); assert.equal(d.p2.getSpellTrapsOnField().length, 0);
});
fx("Dark Magic Attack needs Dark Magician; destroys opposing Spells/Traps", () => {
    assert.equal(makeDuel({ p1: { hand: ["Dark Magic Attack"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } }).use("Dark Magic Attack"), false);
    const d = makeDuel({ p1: { hand: ["Dark Magic Attack"], monsters: ["Dark Magician"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.ok(d.use("Dark Magic Attack")); assert.equal(d.p2.getSpellTrapsOnField().length, 0);
});
fx("Ojama Delta Hurricane!! needs all three Ojamas", () => {
    const three = ["Ojama Green", "Ojama Yellow", "Ojama Black"];
    assert.equal(makeDuel({ p1: { hand: ["Ojama Delta Hurricane!!"], monsters: three.slice(0, 2) } }).use("Ojama Delta Hurricane!!"), false);
    const d = makeDuel({ p1: { hand: ["Ojama Delta Hurricane!!"], monsters: three }, p2: { monsters: ["Summoned Skull"], spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.ok(d.use("Ojama Delta Hurricane!!")); assert.equal(d.p2.getMonstersOnField().length + d.p2.getSpellTrapsOnField().length, 0);
});
fx("Soul Release banishes up to 5 cards from Graveyards", () => {
    const d = makeDuel({ p1: { hand: ["Soul Release"], graveyard: ["Feral Imp", "Feral Imp"] }, p2: { graveyard: ["Feral Imp"] } });
    assert.ok(d.use("Soul Release")); d.choose("first", "first");
});
fx("Dark Mirror Force (trap) banishes Defense Position monsters on an attack", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull", { name: "Feral Imp", pos: "defense" }] }, p2: { monsters: [{ name: "Beta The Magnet Warrior", pos: "defense" }], spellTrap: [{ name: "Dark Mirror Force", faceUp: false }] } });
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), d.mon(d.p2, "Beta The Magnet Warrior"));
    assert.ok(d.game.state.awaitingResponse); assert.ok(d.activateSet("Dark Mirror Force", null, d.p2, "battle"));
    assert.deepEqual(d.names(d.p1, "banished"), ["Feral Imp"], "the ATTACKER's Defense Position monsters are banished");
    assert.deepEqual(d.names(d.p1, "monster"), ["Summoned Skull"]);
});
fx("Malevolent Catastrophe destroys all Spell/Trap Cards on an attack", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"], spellTrap: [{ name: "Mirror Force", faceUp: false }] }, p2: { spellTrap: [{ name: "Malevolent Catastrophe", faceUp: false }] } });
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), null);
    assert.ok(d.game.state.awaitingResponse); assert.ok(d.activateSet("Malevolent Catastrophe", null, d.p2, "battle"));
    assert.equal(d.p1.getSpellTrapsOnField().length + d.p2.getSpellTrapsOnField().length, 0);
});

// ------------------------------------------------------------- stat tricks
fx("Shield Spear +400/+400, Snake Fang -500 DEF, Reliable Guardian +700 DEF: until end of turn", () => {
    const d = makeDuel({ p1: { hand: ["Shield Spear", "Snake Fang", "The Reliable Guardian"], monsters: ["Giant Soldier of Stone"] } });
    const m = d.mon(d.p1, "Giant Soldier of Stone"), [a, df] = [d.atk(m), d.def(m)];
    d.use("Shield Spear", m); assert.equal(d.atk(m), a + 400); assert.equal(d.def(m), df + 400);
    d.use("Snake Fang", m); assert.equal(d.def(m), df + 400 - 500);
    d.use("The Reliable Guardian", m); assert.equal(d.def(m), df + 400 - 500 + 700);
    d.endTurn(); assert.equal(d.atk(m), a); assert.equal(d.def(m), df);
});
fx("Micro Ray sets DEF to 0 until end of turn", () => {
    const d = makeDuel({ p1: { hand: ["Micro Ray"] }, p2: { monsters: ["Giant Soldier of Stone"] } });
    const m = d.mon(d.p2, "Giant Soldier of Stone"); d.use("Micro Ray", m); assert.equal(d.def(m), 0); d.endTurn(); assert.equal(d.def(m), 2000);
});
fx("The Big March of Animals: +200 per Beast", () => {
    const b = firstOf("Beast", null);
    const d = makeDuel({ p1: { hand: ["The Big March of Animals"], monsters: [b, b] } });
    const m = d.p1.getMonstersOnField()[0], a = d.atk(m); d.use("The Big March of Animals"); assert.equal(d.atk(m), a + 400);
});
fx("Book of Moon turns a face-up monster face-down in Defense", () => {
    const d = makeDuel({ p1: { hand: ["Book of Moon"] }, p2: { monsters: ["Summoned Skull"] } });
    const m = d.mon(d.p2, "Summoned Skull"); assert.ok(d.use("Book of Moon", m)); assert.equal(m.faceUp, false); assert.equal(m.position, "defense");
});

// ------------------------------------------------------------- search / recovery
fx("E - Emergency Call and Emblem of Dragon Destroyer search the Deck", () => {
    let d = makeDuel({ p1: { hand: ["E - Emergency Call"], deck: ["Elemental HERO Avian"] } });
    d.use("E - Emergency Call"); if (d.game.state.awaitingChoice) d.choose("first"); assert.ok(d.names(d.p1, "hand").includes("Elemental HERO Avian"));
    d = makeDuel({ p1: { hand: ["Emblem of Dragon Destroyer"], graveyard: ["Buster Blader"] } });
    d.use("Emblem of Dragon Destroyer"); if (d.game.state.awaitingChoice) d.choose("first"); assert.ok(d.names(d.p1, "hand").includes("Buster Blader"));
});
fx("Dark Eruption only targets DARK monsters with 1500 or less ATK in your GY", () => {
    const d = makeDuel({ p1: { hand: ["Dark Eruption"], graveyard: ["Summoned Skull", "Feral Imp"] } });
    assert.equal(d.use("Dark Eruption", d.find(d.p1, "Summoned Skull", "graveyard")), false);
    assert.ok(d.use("Dark Eruption", d.find(d.p1, "Feral Imp", "graveyard"))); assert.ok(d.names(d.p1, "hand").includes("Feral Imp"));
});
fx("Light of Redemption: pay 800 LP, return a banished LIGHT monster to the hand", () => {
    const light = firstOf(null, "LIGHT");
    const d = makeDuel({ p1: { hand: ["Light of Redemption"], banished: [light] } });
    assert.ok(d.use("Light of Redemption", d.find(d.p1, light, "banished"))); assert.equal(d.p1.lifePoints, 7200); assert.ok(d.names(d.p1, "hand").includes(light));
});
fx("Sage's Stone: needs Dark Magician Girl, summons Dark Magician", () => {
    assert.equal(makeDuel({ p1: { hand: ["Sage's Stone", "Dark Magician"] } }).use("Sage's Stone"), false);
    const d = makeDuel({ p1: { hand: ["Sage's Stone", "Dark Magician"], monsters: ["Dark Magician Girl"] } });
    assert.ok(d.use("Sage's Stone")); if (d.game.state.awaitingChoice) d.choose("first"); assert.ok(d.names(d.p1, "monster").includes("Dark Magician"));
});
fx("Next to be Lost: sends the same-name card from the Deck to the Graveyard", () => {
    const d = makeDuel({ p1: { hand: ["Next to be Lost"], monsters: ["Summoned Skull"], deck: ["Summoned Skull"] } });
    assert.ok(d.use("Next to be Lost", d.mon(d.p1, "Summoned Skull"))); assert.ok(d.names(d.p1, "graveyard").includes("Summoned Skull"));
});

// ------------------------------------------------------------- hand manipulation
fx("Confiscation: pay 1000 LP, discard a card of your choice from their hand", () => {
    const d = makeDuel({ p1: { hand: ["Confiscation"] }, p2: { hand: ["Summoned Skull", "Feral Imp"] } });
    assert.ok(d.use("Confiscation")); d.choose("Summoned Skull");
    assert.equal(d.p1.lifePoints, 7000); assert.ok(d.names(d.p2, "graveyard").includes("Summoned Skull"));
});
fx("Exchange: each player takes a card from the other's hand", () => {
    const d = makeDuel({ p1: { hand: ["Exchange", "Feral Imp"] }, p2: { hand: ["Summoned Skull"] } });
    assert.ok(d.use("Exchange")); d.choose("Summoned Skull"); d.choose("Feral Imp");
    assert.ok(d.names(d.p1, "hand").includes("Summoned Skull")); assert.ok(d.names(d.p2, "hand").includes("Feral Imp"));
    assert.equal(d.find(d.p1, "Summoned Skull", "hand").owner, d.p1);
});
fx("Spiritual Water Art - Aoi: Tribute a WATER monster, send a card from their hand", () => {
    const water = firstOf(null, "WATER");
    const d = makeDuel({ p1: { hand: ["Spiritual Water Art - Aoi"], monsters: [water] }, p2: { hand: ["Summoned Skull"] } });
    assert.ok(d.use("Spiritual Water Art - Aoi")); while (d.game.state.awaitingChoice) d.choose("first");
    assert.ok(d.names(d.p2, "graveyard").includes("Summoned Skull"));
});
fx("Success Probability 0% sends 2 random Fusion Monsters from their Extra Deck", () => {
    const d = makeDuel({ p1: { hand: ["Success Probability 0%"] }, p2: { extra: ["Flame Swordsman", "Black Skull Dragon", "Thousand Dragon"] } });
    assert.ok(d.use("Success Probability 0%")); assert.equal(d.p2.zone.extraDeck.length, 1); assert.equal(d.names(d.p2, "graveyard").length, 2);
});
