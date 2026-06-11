/**
 * This is the static definition
 */
class Card {
    constructor(data) {
        //all
        this.id = data.id;
        this.name = data.name;
        this.type = data.type;
        this.frameType = data.frameType;
        this.desc = data.desc;
        this.race = data.race;

        //maybe need it later, idk
        this.humanReadableCardType = data.humanReadableCardType;

        //this is specific for monster cards only
        this.atk = data.atk;
        this.def = data.def;
        this.level = data.level;
        this.attribute = data.attribute;

        //all
        this.image = data.card_images?.[0]?.image_url_small;
    }
}


/**
 * GameCard is the dinamical of a card
 * Game Card knows what it is right now
 */

class GameCard {
    constructor(card, owner) {
        this.card = card;
        this.owner = owner;

        //1st zone state + position
        this.location = "deck";  //hand, monster, spell+trap, field, extra, graveyard, banished
        this.zoneIndex = null; //0-4 monster & spell-trap zone

        //monsters
        this.faceUp = false;   //faceDown-false, faceUp-true
        this.position = null; //"attack" //attack, defense

        //2nd turn
        this.state = {
            hasAttacked: false, //if the monster attacked yet or not
            effectUsedThisTurn: false //if the monster has used their effect not
        }

        //spell-trap state
        this.spellTrap = {
            set: false,
            activated: false
        }
        //3rd modifiers
        this.modifiers = {
            atk: 0,
            def: 0,
            cannotAttack: false,
            effectsNegated: false,
            indestructible: false
        }

    }
}


module.exports = { Card, GameCard };
