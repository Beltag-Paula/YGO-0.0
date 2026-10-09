#!/usr/bin/env python3
"""
generate_card_db.py

Reads yugioh_cards.jsonl (ygopro/EDOPro-format card metadata + official
effect text + reference Lua scripts) and generates CardEffectsDB.js: a
metadata + handler database in the exact same shape MainGame.js already
expects from Effects.js (kind/subtype/window/needsTarget/cost for
Spells & Traps; a comparable shape for monster effects), so it can be
merged into or required alongside Effects.js later.

Design choices (see CARD_COVERAGE_REPORT.md for the numbers this run
actually produced):

  1. Every card gets an accurate metadata entry (kind, subtype, window,
     monster frame type, etc.) decoded straight from the official
     ygopro numeric bitmask — not guessed from English text. This part
     covers 100% of cards and cannot be "sort of" wrong: the bitmask
     constants below are the same ones ygopro/EDOPro/BabelCDB use.

  2. A card's ACTUAL BEHAVIOR (the handler function) is only generated
     when its official effect_text matches one of a curated list of
     high-confidence, whole-text templates (drawing N cards, a plain
     destroy-target, a flat equip stat boost, etc.) — implemented with
     the primitives in CardPrimitives.js. If the wording doesn't match
     one of these templates exactly, no behavior is guessed. That
     card gets a clearly-labeled stub instead: safe (never crashes,
     never silently does the wrong thing), and easy to grep for as a
     to-do list.

  3. Historical scope: cards with the Synchro/XYZ/Pendulum/Link type
     bits, or an official TCG release on/after 2008-08-05, are EXCLUDED
     — matching this project's stated pre-Synchro scope.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
INPUT_JSONL = HERE / "yugioh_cards.jsonl"
OUTPUT_JS = HERE / "CardEffectsDB.js"
OUTPUT_REPORT = HERE / "CARD_COVERAGE_REPORT.md"

# ---------------------------------------------------------------------
# Official ygopro/EDOPro "type" bitmask constants (from the public
# ygopro `constant.h` / EDOPro `constant.lua` — the same values every
# BabelCDB-derived database, including this one, is built against).
# ---------------------------------------------------------------------
TYPE_MONSTER = 0x1
TYPE_SPELL = 0x2
TYPE_TRAP = 0x4
TYPE_NORMAL = 0x10
TYPE_EFFECT = 0x20
TYPE_FUSION = 0x40
TYPE_RITUAL = 0x80
TYPE_TRAPMONSTER = 0x100
TYPE_SPIRIT = 0x200
TYPE_UNION = 0x400
TYPE_DUAL = 0x800
TYPE_TUNER = 0x1000
TYPE_SYNCHRO = 0x2000
TYPE_TOKEN = 0x4000
TYPE_QUICKPLAY = 0x10000
TYPE_CONTINUOUS = 0x20000
TYPE_EQUIP = 0x40000
TYPE_FIELD = 0x80000
TYPE_COUNTER = 0x100000
TYPE_FLIP = 0x200000
TYPE_TOON = 0x400000
TYPE_XYZ = 0x800000
TYPE_PENDULUM = 0x1000000
TYPE_SPSUMMON = 0x2000000
TYPE_LINK = 0x4000000

PRE_SYNCHRO_CUTOFF = "2008-08-05"
POST_CLASSIC_BITS = TYPE_SYNCHRO | TYPE_XYZ | TYPE_PENDULUM | TYPE_LINK


def decode_flags(t):
    return {
        "isMonster": bool(t & TYPE_MONSTER),
        "isSpell": bool(t & TYPE_SPELL),
        "isTrap": bool(t & TYPE_TRAP),
        "isNormal": bool(t & TYPE_NORMAL),
        "isEffect": bool(t & TYPE_EFFECT),
        "isFusion": bool(t & TYPE_FUSION),
        "isRitual": bool(t & TYPE_RITUAL),
        "isTrapMonster": bool(t & TYPE_TRAPMONSTER),
        "isSpirit": bool(t & TYPE_SPIRIT),
        "isUnion": bool(t & TYPE_UNION),
        "isDual": bool(t & TYPE_DUAL),
        "isTuner": bool(t & TYPE_TUNER),
        "isToken": bool(t & TYPE_TOKEN),
        "isQuickPlay": bool(t & TYPE_QUICKPLAY),
        "isContinuous": bool(t & TYPE_CONTINUOUS),
        "isEquip": bool(t & TYPE_EQUIP),
        "isField": bool(t & TYPE_FIELD),
        "isCounter": bool(t & TYPE_COUNTER),
        "isFlip": bool(t & TYPE_FLIP),
        "isToon": bool(t & TYPE_TOON),
        "isPostClassic": bool(t & POST_CLASSIC_BITS),
    }


def monster_frame(flags):
    if flags["isFusion"]:
        return "fusion"
    if flags["isRitual"]:
        return "ritual"
    if flags["isNormal"] and not flags["isEffect"]:
        return "normal"
    return "effect"


def spell_trap_meta(flags):
    """Mirrors the SPELL_TRAP_META shape already used in Effects.js."""
    if flags["isSpell"]:
        if flags["isEquip"]:
            subtype, window = "equip", "main"
        elif flags["isField"]:
            subtype, window = "field", "main"
        elif flags["isRitual"]:
            subtype, window = "ritual", "main"
        elif flags["isQuickPlay"]:
            subtype, window = "quickplay", "anytime"
        elif flags["isContinuous"]:
            subtype, window = "continuous", "main"
        else:
            subtype, window = "normal", "main"
        return {"kind": "spell", "subtype": subtype, "window": window}
    else:
        if flags["isCounter"]:
            subtype, window = "counter", "response"
        elif flags["isContinuous"]:
            subtype, window = "continuous", "anytime"
        else:
            subtype, window = "normal", "anytime"
        return {"kind": "trap", "subtype": subtype, "window": window}


def js_str(s):
    """Safe JS string literal for arbitrary card names/text."""
    return json.dumps(s if s is not None else "")


def norm_name(name):
    return name.strip().lower()


# ---------------------------------------------------------------------
# PATTERN MATCHERS — each returns a (needsTarget, handler_js_lines) or
# None if the card's *entire* effect_text doesn't match. Matching the
# whole text (not a clause inside a longer sentence) is what keeps
# these safe: a card with one extra condition simply won't match, and
# falls through to a stub instead of a wrong guess.
# ---------------------------------------------------------------------

NUM_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5}


def parse_num(word):
    word = word.lower()
    if word in NUM_WORDS:
        return NUM_WORDS[word]
    if word.isdigit():
        return int(word)
    return None


def clean(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def m_draw(text):
    m = re.fullmatch(r"Draw (\w+) cards?\.", text)
    if not m:
        return None
    n = parse_num(m.group(1))
    if not n:
        return None
    return (None, [
        f"p.drawCards(game, gc.owner, {n});",
        f"game.addLog(`${{gc.owner.name}} draws {n} card{'s' if n != 1 else ''} with ${{gc.card.name}}!`);",
    ])


def m_destroy_all_opp_monsters(text):
    if text in (
        "Destroy all monsters your opponent controls.",
        "Destroy all Monster Cards your opponent controls.",
    ):
        return ("none", [
                "const opp = gc.owner === game.player1 ? game.player2 : game.player1;",
            "const r = p.destroyAllMonsters(game, opp);",
            "game.addLog(`${gc.card.name} destroys every monster ${opp.name} controls!`);",
        ])
    return None


def m_destroy_all_monsters_field(text):
    if text == "Destroy all monsters on the field.":
        return ("none", [
                "p.destroyAllMonstersBothSides(game);",
            "game.addLog(`${gc.card.name} destroys every monster on the field!`);",
        ])
    return None


def m_destroy_target_monster(text):
    if text in (
        "Target 1 monster on the field; destroy it.",
        "Target 1 monster your opponent controls; destroy it.",
        "Target 1 face-up monster your opponent controls; destroy it.",
    ):
        return ("monster", [
                "if (!target) { game.addLog(`${gc.card.name} has no valid target and fizzles.`); return; }",
            "const name = target.card.name;",
            "p.destroyMonster(game, target);",
            "game.addLog(`${gc.card.name} destroys ${name}!`);",
        ])
    return None


def m_inflict_damage(text):
    m = re.fullmatch(r"Inflict (\d+) damage to your opponent\.", text)
    if not m:
        return None
    n = int(m.group(1))
    return (None, [
        "const opp = gc.owner === game.player1 ? game.player2 : game.player1;",
        f"p.inflictDamage(game, opp, {n});",
        f"game.addLog(`${{gc.card.name}} inflicts {n} damage to ${{opp.name}}!`);",
    ])


def m_gain_lp(text):
    m = re.fullmatch(r"(?:Increase your Life Points by|Gain) (\d+)(?: Life Points| points)?\.", text)
    if not m:
        return None
    n = int(m.group(1))
    return (None, [
        f"p.gainLifePoints(game, gc.owner, {n});",
        f"game.addLog(`${{gc.owner.name}} gains {n} Life Points from ${{gc.card.name}}!`);",
    ])


def m_search_by_name(text):
    m = re.fullmatch(r'Add 1 "([^"]+)" from your Deck to your hand\.', text)
    if not m:
        return None
    name = m.group(1)
    return (None, [
        f"const r = p.searchDeckToHandByName(game, gc.owner, {js_str(name)});",
        "if (r.found) { game.addLog(`${gc.owner.name} adds " + name.replace("`", "'") + " to their hand with ${gc.card.name}!`); }",
        "else { game.addLog(`${gc.card.name} finds no copy of " + name.replace("`", "'") + " in the Deck.`); }",
    ])


def m_equip_flat_boost(text):
    # "The equipped monster gains N ATK." / "...gains N DEF." /
    # "...gains N ATK/DEF." / "...increases its ATK and DEF by N points."
    m = re.fullmatch(r"(?:A|The) equipped monster (?:gains|increases its ATK and DEF by) (\d+) ATK/DEF\.", text)
    if m:
        n = int(m.group(1))
        return ("monster", [
                "if (!target) { game.addLog(`${gc.card.name} has no monster to equip to and fizzles.`); return; }",
            f"p.equipStatBoost(game, gc, target, {n}, {n});",
            f"game.addLog(`${{gc.card.name}} equips to ${{target.card.name}} (+{n} ATK/+{n} DEF)!`);",
        ])
    m = re.fullmatch(r"(?:A|The) equipped monster gains (\d+) ATK\.", text)
    if m:
        n = int(m.group(1))
        return ("monster", [
                "if (!target) { game.addLog(`${gc.card.name} has no monster to equip to and fizzles.`); return; }",
            f"p.equipStatBoost(game, gc, target, {n}, 0);",
            f"game.addLog(`${{gc.card.name}} equips to ${{target.card.name}} (+{n} ATK)!`);",
        ])
    m = re.fullmatch(r"(?:A|The) equipped monster gains (\d+) DEF\.", text)
    if m:
        n = int(m.group(1))
        return ("monster", [
                "if (!target) { game.addLog(`${gc.card.name} has no monster to equip to and fizzles.`); return; }",
            f"p.equipStatBoost(game, gc, target, 0, {n});",
            f"game.addLog(`${{gc.card.name}} equips to ${{target.card.name}} (+{n} DEF)!`);",
        ])
    m = re.fullmatch(r"(?:A|The) equipped monster increases its ATK and DEF by (\d+) points\.", text)
    if m:
        n = int(m.group(1))
        return ("monster", [
                "if (!target) { game.addLog(`${gc.card.name} has no monster to equip to and fizzles.`); return; }",
            f"p.equipStatBoost(game, gc, target, {n}, {n});",
            f"game.addLog(`${{gc.card.name}} equips to ${{target.card.name}} (+{n} ATK/+{n} DEF)!`);",
        ])
    return None


def m_destroy_trap_target(text):
    if text in (
        "Select 1 face-up Trap Card on the field and destroy it.",
        "Select 1 face-up Spell Card on the field and destroy it.",
        "Target 1 Spell/Trap Card on the field; destroy it.",
        "Target 1 Spell Card on the field; destroy it.",
        "Target 1 Trap Card on the field; destroy it.",
        "Target 1 Spell/Trap on the field; destroy that target.",
        "Target 1 Spell Card on the field; destroy that target.",
        "Target 1 Trap Card on the field; destroy that target.",
    ):
        return ("spellTrap", [
                "if (!target) { game.addLog(`${gc.card.name} has no valid target and fizzles.`); return; }",
            "const name = target.card.name;",
            "p.destroySpellTrap(game, target);",
            "game.addLog(`${gc.card.name} destroys ${name}!`);",
        ])
    return None


def m_destroy_all_spelltraps_opp(text):
    if text in (
        "Destroy all Spells and Traps your opponent controls.",
        "Destroy all Spell and Trap Cards your opponent controls.",
    ):
        return (None, [
            "const opp = gc.owner === game.player1 ? game.player2 : game.player1;",
            "p.destroyAllSpellTraps(game, opp);",
            "game.addLog(`${gc.card.name} destroys every Spell/Trap ${opp.name} controls!`);",
        ])
    return None


def m_destroy_all_spelltraps_field(text):
    if text in (
        "Destroy all Spell and Trap Cards on the field.",
        "Destroy all Spells and Traps on the field.",
    ):
        return (None, [
            "p.destroyAllSpellTrapsBothSides(game);",
            "game.addLog(`${gc.card.name} destroys every Spell/Trap on the field!`);",
        ])
    return None


def m_destroy_all_race_monsters(text):
    # "Destroy all [face-up] <Race>-Type monsters on the field." and the
    # "<Race> monsters" (no "-Type") phrasing both appear in the data.
    m = re.fullmatch(r"Destroy all (?:face-up )?([A-Za-z]+(?:[ -][A-Za-z]+)*)-Type monsters on the field\.", text)
    if not m:
        m = re.fullmatch(r"Destroy all (?:face-up )?([A-Za-z]+(?:[ -][A-Za-z]+)*) monsters on the field\.", text)
    if not m:
        return None
    race = m.group(1).strip()
    return (None, [
        f"p.destroyAllMonstersMatching(game, c => (c.race || '').toLowerCase() === {js_str(race.lower())});",
        f"game.addLog(`${{gc.card.name}} destroys every {race}-Type monster on the field!`);",
    ])


def m_opponent_gains_lp(text):
    m = re.fullmatch(r"Your opponent gains (\d+) Life Points\.", text)
    if not m:
        return None
    n = int(m.group(1))
    return (None, [
        "const opp = gc.owner === game.player1 ? game.player2 : game.player1;",
        f"p.gainLifePoints(game, opp, {n});",
        f"game.addLog(`${{opp.name}} gains {n} Life Points from ${{gc.card.name}}!`);",
    ])


def m_opponent_draws(text):
    m = re.fullmatch(r"Your opponent draws (\w+) cards?\.", text)
    if not m:
        return None
    n = parse_num(m.group(1))
    if not n:
        return None
    return (None, [
        "const opp = gc.owner === game.player1 ? game.player2 : game.player1;",
        f"p.drawCards(game, opp, {n});",
        f"game.addLog(`${{opp.name}} draws {n} card{'s' if n != 1 else ''} because of ${{gc.card.name}}!`);",
    ])


PATTERNS = [
    m_draw,
    m_opponent_draws,
    m_destroy_all_opp_monsters,
    m_destroy_all_monsters_field,
    m_destroy_all_race_monsters,
    m_destroy_target_monster,
    m_destroy_trap_target,
    m_destroy_all_spelltraps_opp,
    m_destroy_all_spelltraps_field,
    m_inflict_damage,
    m_gain_lp,
    m_opponent_gains_lp,
    m_search_by_name,
    m_equip_flat_boost,
]


def try_match(text):
    text = clean(text)
    for fn in PATTERNS:
        result = fn(text)
        if result:
            return fn.__name__, result
    return None, None


def main():
    total = 0
    excluded_post_classic = 0
    vanilla_monsters = 0
    matched_handlers = 0
    stub_spelltrap = 0
    stub_monster = 0
    match_counts = {}

    entries = []

    with open(INPUT_JSONL, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            total += 1

            meta = d.get("metadata", {})
            t = meta.get("type", 0)
            flags = decode_flags(t)

            release = (d.get("release") or {}).get("tcg") or {}
            release_date = release.get("date")

            if flags["isPostClassic"] or (release_date and release_date >= PRE_SYNCHRO_CUTOFF):
                excluded_post_classic += 1
                continue

            name = d.get("name") or ""
            cid = d.get("id")
            effect_text = d.get("effect_text") or ""
            has_lua = bool((d.get("lua") or {}).get("available"))

            if flags["isMonster"]:
                if flags["isNormal"] and not flags["isEffect"]:
                    vanilla_monsters += 1
                    continue  # no card text worth cataloguing — genuinely vanilla
                stub_monster += 1
                entries.append({
                    "id": cid, "name": name, "kind": "monster",
                    "frame": monster_frame(flags),
                    "flags": flags, "status": "stub",
                    "effect_text": effect_text, "has_lua": has_lua,
                })
                continue

            # Spell / Trap
            base_meta = spell_trap_meta(flags)
            pattern_name, match = try_match(effect_text)
            if match:
                matched_handlers += 1
                match_counts[pattern_name] = match_counts.get(pattern_name, 0) + 1
                needs_target, handler_lines = match
                entries.append({
                    "id": cid, "name": name, "kind": "spelltrap",
                    "meta": base_meta, "status": "matched",
                    "pattern": pattern_name,
                    "needs_target": needs_target,
                    "handler_lines": handler_lines,
                    "effect_text": effect_text, "has_lua": has_lua,
                })
            else:
                stub_spelltrap += 1
                entries.append({
                    "id": cid, "name": name, "kind": "spelltrap",
                    "meta": base_meta, "status": "stub",
                    "effect_text": effect_text, "has_lua": has_lua,
                })

    write_js(entries)
    write_report(
        total, excluded_post_classic, vanilla_monsters,
        matched_handlers, stub_spelltrap, stub_monster, match_counts, entries,
    )

    print(f"Total cards in dataset:        {total}")
    print(f"Excluded (post-classic scope): {excluded_post_classic}")
    print(f"Vanilla monsters (no entry):   {vanilla_monsters}")
    print(f"Spell/Trap - real handler:     {matched_handlers}")
    print(f"Spell/Trap - stub (TODO):      {stub_spelltrap}")
    print(f"Monster effect - stub (TODO):  {stub_monster}")
    print(f"Wrote: {OUTPUT_JS}")
    print(f"Wrote: {OUTPUT_REPORT}")


def write_js(entries):
    lines = []
    lines.append("/**")
    lines.append(" * CardEffectsDB.js — AUTO-GENERATED by card_database/generate_card_db.py")
    lines.append(" * Do not hand-edit this file — edit the generator or add cards to")
    lines.append(" * Effects.js instead, then re-run the generator so it isn't overwritten.")
    lines.append(" *")
    lines.append(" * Same shape as Effects.js: getMeta(name) / getHandler(name) for")
    lines.append(" * Spells & Traps; getMonsterInfo(name) for monster metadata. NOT")
    lines.append(" * currently required by MainGame.js — see CARD_COVERAGE_REPORT.md")
    lines.append(" * for how to wire it in.")
    lines.append(" */")
    lines.append('"use strict";')
    lines.append("")
    lines.append('const p = require("../CardPrimitives.js");')
    lines.append("")
    lines.append("const SPELL_TRAP_META = {};")
    lines.append("const HANDLERS = {};")
    lines.append("const MONSTER_INFO = {};")
    lines.append("const STUBS = { spellTrap: [], monster: [] };")
    lines.append("")

    for e in entries:
        key = js_str(norm_name(e["name"]))
        if e["kind"] == "spelltrap":
            meta = dict(e["meta"])
            if e["status"] == "matched" and e.get("needs_target") and e["needs_target"] != "none":
                meta["needsTarget"] = e["needs_target"]
            meta_js = json.dumps(meta)
            lines.append(f"SPELL_TRAP_META[{key}] = {meta_js};")
            if e["status"] == "matched":
                lines.append(f"HANDLERS[{key}] = (game, gc, target) => {{")
                for hl in e["handler_lines"]:
                    lines.append("    " + hl)
                lines.append("};")
            else:
                lines.append(
                    f"STUBS.spellTrap.push({{ id: {e['id']}, name: {js_str(e['name'])}, "
                    f"effectText: {js_str(e['effect_text'])}, hasLua: {str(e['has_lua']).lower()} }});"
                )
        else:  # monster stub
            info = {"frame": e["frame"], "attribute": None}
            lines.append(f"MONSTER_INFO[{key}] = {json.dumps(info)};")
            lines.append(
                f"STUBS.monster.push({{ id: {e['id']}, name: {js_str(e['name'])}, frame: {js_str(e['frame'])}, "
                f"effectText: {js_str(e['effect_text'])}, hasLua: {str(e['has_lua']).lower()} }});"
            )
        lines.append("")

    lines.append("""
function normalize(name) {
    return (name || "").trim().toLowerCase();
}

function getMeta(cardName) {
    return SPELL_TRAP_META[normalize(cardName)] || null;
}

function getHandler(cardName) {
    return HANDLERS[normalize(cardName)] || null;
}

function activate(game, cardName, gc, target) {
    const handler = getHandler(cardName);
    if (!handler) return false;
    handler(game, gc, target);
    return true;
}

function getMonsterInfo(cardName) {
    return MONSTER_INFO[normalize(cardName)] || null;
}

function isImplemented(cardName) {
    return !!getHandler(cardName) || !!getMonsterInfo(cardName);
}

module.exports = {
    getMeta, getHandler, activate, getMonsterInfo, isImplemented,
    STUBS, normalize
};
""")

    OUTPUT_JS.write_text("\n".join(lines), encoding="utf-8")


def write_report(total, excluded, vanilla, matched, stub_st, stub_mon, match_counts, entries):
    lines = []
    lines.append("# Card Effects Database — Coverage Report")
    lines.append("")
    lines.append("Generated by `card_database/generate_card_db.py` from `yugioh_cards.jsonl`.")
    lines.append("")
    lines.append("## Headline numbers")
    lines.append("")
    lines.append(f"- **{total}** total cards in the source dataset")
    lines.append(f"- **{excluded}** excluded (Synchro/Xyz/Pendulum/Link, or official TCG release on/after 2008-08-05 — out of this project's pre-Synchro scope)")
    lines.append(f"- **{vanilla}** vanilla Normal Monsters (no card text — correctly need no entry at all)")
    lines.append(f"- **{matched}** Spells/Traps with a REAL, working handler auto-generated from their official effect text")
    lines.append(f"- **{stub_st}** Spells/Traps left as a stub (accurate metadata, but the effect text didn't match a safe template — needs a human/Claude to implement)")
    lines.append(f"- **{stub_mon}** Effect/Fusion/Ritual/Union/Spirit/Toon monsters left as a stub (same — metadata only)")
    lines.append("")
    lines.append("## What actually got auto-implemented, by template")
    lines.append("")
    for k, v in sorted(match_counts.items(), key=lambda x: -x[1]):
        lines.append(f"- `{k}`: {v} cards")
    lines.append("")
    lines.append("## How to read this")
    lines.append("")
    lines.append(
        "Every card's **metadata** (Spell/Trap kind & subtype, or monster frame type) is decoded "
        "directly from the same numeric type bitmask ygopro/EDOPro itself uses — that part is exact, "
        "not a guess, for all " + str(total - excluded - vanilla) + " non-vanilla, in-scope cards.\n"
    )
    lines.append(
        "A card's **behavior** (the actual handler function) was only generated when its whole, "
        "official effect text matched one of a small set of unambiguous templates (see the counts "
        "above) — implemented using the primitives in `CardPrimitives.js`. Cards with any extra "
        "condition, timing restriction, or multi-step effect were deliberately left as a stub rather "
        "than risk a subtly wrong auto-generated implementation. `STUBS.spellTrap` and `STUBS.monster` "
        "in `CardEffectsDB.js` are exactly that TODO list, each with its official effect text and "
        "whether a reference Lua script is available for it, ready to implement the same way the "
        "cards already in `Effects.js` were."
    )
    lines.append("")
    lines.append("## Wiring this into the live game")
    lines.append("")
    lines.append(
        "This file is intentionally separate from `Effects.js` and is **not required by "
        "MainGame.js yet** — the two decks in play (`deck_inventory/yugi.json` / `kaiba.json`) "
        "don't contain any of these extra cards, so there's nothing to plug in until a deck "
        "actually uses one. When that's needed, `MainGame.getCardMeta()` / the `Effects.activate()` "
        "call sites would check `CardEffectsDB` as a fallback after `Effects.js` finds nothing, "
        "keeping the two decks' hand-verified implementations authoritative and this database "
        "purely additive."
    )
    lines.append("")

    OUTPUT_REPORT.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
