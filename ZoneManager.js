class ZoneManager {
    constructor(player) {
        this.player = player;
    }

    getZone(zoneName) {
        if (!(zoneName in this.player.zone)) {
            throw new Error(`Invalid zone: ${zoneName}`);
        }
        return this.player.zone[zoneName];
    }

    isSlotZone(zoneName) {
        return zoneName === "monster" || zoneName === "spellTrap";
    }

    removeCard(card, zoneName) {
        const zone = this.getZone(zoneName);

        // slot zones (monster / spellTrap)
        if (this.isSlotZone(zoneName)) {
            const index = zone.findIndex(
                c => c?.card?.id === card.card.id
            );

            if (index === -1) throw new Error("Card not found");

            zone[index] = null;
            return;
        }

        // list zones
        const index = zone.findIndex(
            c => c?.card?.id === card.card.id
        );

        if (index === -1) throw new Error("Card not found");

        zone.splice(index, 1);
    }

    addCard(card, zoneName) {
        const zone = this.getZone(zoneName);

        // SLOT ZONES → AUTO-PLACE HERE
        if (this.isSlotZone(zoneName)) {

            const index = zone.findIndex(slot => slot === null);

            if (index === -1) {
                throw new Error(`No free slot in ${zoneName}`);
            }

            zone[index] = card;

            card.zoneIndex = index;
            card.location = zoneName;

            return;
        }

        // LIST ZONES
        zone.push(card);

        card.zoneIndex = null;
        card.location = zoneName;
    }

    moveCard(card, fromZone, toZone) {
        this.removeCard(card, fromZone);
        this.addCard(card, toZone);
    }
}

module.exports = ZoneManager;