/**
 * Static blueprint/definition of a card from the database.
 */
class Card {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.type = data.type;
        this.frameType = data.frameType;
        this.desc = data.desc;
        this.race = data.race;
        this.humanReadableCardType = data.humanReadableCardType;

        // Specific for monster cards
        this.atk = data.atk;
        this.def = data.def;
        this.level = data.level;
        this.attribute = data.attribute;

        this.image = data.card_images?.[0]?.image_url_small;
    }
}

/**
 * Dynamic representation of a card during active gameplay.
 */
class GameCard {
    constructor(card, owner) {
        this.card = card;
        this.owner = owner;
        
        // CRITICAL FIX: Unique instance tracking for duplicate cards; in case you get 3 copies of Blue Eyes White Dragon
        this.instanceId = `${card.id}_${Math.random().toString(36).substr(2, 9)}`;

        this.location = "deck";  // hand, monster, spellTrap, field, extra, graveyard, banished
        this.zoneIndex = null;   // 0-4 for monster & spellTrap zones

        // Monsters
        this.faceUp = false;   
        this.position = null;    // "attack" or "defense"

        // Turn Flags
        this.state = {
            hasAttackedThisTurn: false,
            hasUsedEffectThisTurn: false,
            hasBeenSummonedThisTurn: false
        };

        // Spell/Trap Flags
        this.spellTrap = {
            set: false,
            activated: false
        };

        // Live Stat Modifiers
        this.modifiers = {
            atk: 0,
            def: 0,
            cannotAttack: false,
            effectsNegated: false,
            indestructible: false
        };
    }
}

module.exports = { Card, GameCard };