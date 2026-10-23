/**
 * scripts/70_from_card_text.js
 *
 * Registers behaviour for every card in the database whose text is made ONLY of sentences the engine
 * implements exactly — nothing is guessed:
 *
 *   Fusion Monsters   "A" + "B" [+ "C"]            -> Fusion recipe (Polymerization & co. can summon it)
 *   Ritual Spells     Ritual Summon "X" ... Levels N or more  -> Ritual recipe + the Ritual Summon flow
 *   Passive monsters  every sentence is one of the supported passives below
 *
 * A card with an additional clause that is NOT supported is marked PARTIAL with a note naming what
 * is missing (the recipe/passive part still works). Hand-written scripts always win: a card that
 * already has a script is left alone.
 */
"use strict";
const LocalCards = require("../LocalCards");

const FOOTER = /\*\s*The above text is unofficial[^\n]*/gi;

/** Sentences the engine implements exactly -> what to register. */
const PASSIVES = [
    [/^(?:This monster|This card) may attack your opponent's Life Points directly\.?$/i, (R, n) => R.directAttacker(n, {}), "may attack directly"],
    [/^If this card attacks a Defense Position monster, inflict piercing battle damage\.?$/i, (R, n) => R.piercing(n), "piercing battle damage"],
    [/^(?:This card )?cannot be destroyed by battle\.?$/i, (R, n) => R.battleIndestructible(n), "cannot be destroyed by battle"],
    [/^When this card is Normal Summoned successfully, no Trap Cards can be activated\.?$/i, (R, n) => R.noSummonResponse(n), "no Traps when Normal Summoned"],
    [/^(?:This card )?cannot be Special Summoned\.?$/i, (R, n) => R.noSpecialSummon(n), "cannot be Special Summoned"]
];
const FUSION_BOILERPLATE = [
    /^Must be Fusion Summoned and cannot be Special Summoned by other ways\.?$/i,
    /^Must be Fusion Summoned\.?$/i,
    /^This (?:monster|card) can only be (?:Special Summoned|Summoned) by (?:a )?Fusion Summon\.?$/i,
    /^This (?:monster|card) cannot be Special Summoned except by Fusion Summon\.?$/i
];
const RITUAL_MONSTER_BOILERPLATE = [
    /^This (?:monster|card) can only be Ritual Summoned with the Ritual Spell Card,? "[^"]+"\.?$/i,
    /^You can Ritual Summon this card with "[^"]+"\.?$/i,
    /^You must also (?:offer|Tribute) monsters[^.]*(?:Levels?|Level Stars) equal \d+ or more[^.]*\.?$/i
];

function sentences(desc) {
    return (desc || "").replace(FOOTER, "").split(/\n+/).flatMap(l => l.split(/(?<=[.;])\s+/)).map(s => s.trim()).filter(Boolean);
}

function install(Effects) {
    const R = Effects.Registry;
    const has = name => Effects.scriptKinds(name).length > 0;
    const stats = { fusion: 0, fusionPartial: 0, ritualSpell: 0, passive: 0, partial: 0 };

    const rows = LocalCards.all().map(r => ({ r, c: LocalCards.toApiShape(r) }));

    // ---- Ritual Spells first (so Ritual Monsters can see their recipe) -------------------
    for (const { r, c } of rows) {
        const t = r.metadata.type;
        if (!((t & LocalCards.T.SPELL) && (t & LocalCards.T.RITUAL)) || has(c.name)) continue;
        const ss = sentences(c.desc);
        const m = /^This card is used to Ritual Summon "([^"]+)"\.?$/i.exec(ss[0] || "");
        const lv = ss.slice(1).map(s => /total Levels?(?: Stars)? equal (\d+) or more/i.exec(s)).find(Boolean);
        const extraOk = ss.slice(1).every(s => /^You must also .*equal \d+ or more/i.test(s) || /total Levels/i.test(s));
        if (!m || !lv || !extraOk || !LocalCards.rowByName(m[1])) continue;
        R.ritual(c.name, { summons: m[1], tributeLevel: Number(lv[1]) });
        R.spellTrap(c.name, { kind: "spell", subtype: "normal", window: "main", precheck: "ritual", summons: true, aiUse: () => false },
            (game, gc) => { game.ritualSummon(gc.owner, gc); });
        stats.ritualSpell++;
    }

    for (const { r, c } of rows) {
        if (has(c.name)) continue;
        const t = r.metadata.type;
        if (!(t & LocalCards.T.MONSTER)) continue;
        let ss = sentences(c.desc);

        // ---- Fusion Monsters ---------------------------------------------------------------
        if (t & LocalCards.T.FUSION) {
            const first = /^((?:"[^"]+"\s*\+\s*)+"[^"]+")(.*)$/s.exec((c.desc || "").replace(FOOTER, "").trim());
            if (!first) continue;
            const materials = [...first[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
            R.fusion(c.name, { materials, method: "polymerization" });
            if (/cannot be Special Summoned by other ways/i.test(first[2])) R.noSpecialSummon(c.name);
            ss = sentences(first[2]).filter(s => !FUSION_BOILERPLATE.some(re => re.test(s)));
            const unknown = [];
            for (const s of ss) {
                const p = PASSIVES.find(([re]) => re.test(s));
                if (p) p[1](R, c.name); else unknown.push(s);
            }
            if (unknown.length) { R.partial(c.name, `Fusion Summon with its materials works; this part of its text is not implemented: "${unknown.join(" ").slice(0, 140)}"`); stats.fusionPartial++; }
            else stats.fusion++;
            continue;
        }

        // ---- Ritual Monsters ---------------------------------------------------------------
        if (t & LocalCards.T.RITUAL) {
            const isTarget = rows.length && Effects.scriptKinds(c.name).includes("ritual-monster");
            if (!isTarget) continue;
            const rest = ss.filter(s => !RITUAL_MONSTER_BOILERPLATE.some(re => re.test(s)));
            const unknown = [];
            for (const s of rest) { const p = PASSIVES.find(([re]) => re.test(s)); if (p) p[1](R, c.name); else unknown.push(s); }
            if (unknown.length) { R.partial(c.name, `Ritual Summon works; this part of its text is not implemented: "${unknown.join(" ").slice(0, 140)}"`); stats.partial++; }
            continue;
        }

        // ---- plain passive monsters: ALL sentences must be supported ----------------------------
        if (!ss.length) continue;
        const matched = ss.map(s => PASSIVES.find(([re]) => re.test(s)));
        if (matched.every(Boolean)) { matched.forEach(p => p[1](R, c.name)); stats.passive++; }
    }
    install.stats = stats;
}
module.exports = { install };
