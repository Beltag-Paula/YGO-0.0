/**
 * so we use this in order the convert the data from the deck_inventory
 * which are just decks in json format to be converted to game objects
 */
const { Card, GameCard } = require("./CardLogic.js");

function buildDeckForPlayer(json_deck, player) {
    const mainDeck = json_deck.mainDeck.map(cardData => {
        const card = new Card(cardData);
        return new GameCard(card, player);
    });

    const extraDeck = json_deck.extraDeck.map(cardData => {
        const card = new Card(cardData);
        return new GameCard(card, player);
    })

    const sideDeck = json_deck.sideDeck.map(cardData => {
        const card = new Card(cardData);
        return new GameCard(card, player);
    })

    return { mainDeck, extraDeck, sideDeck };
}

module.exports = { buildDeckForPlayer };