# Todo
 * Revamp menu: Can take whole screen and disappear during drafting, (add a button to have it reappear?)
 * Add basic lands in draft: fill to 40 cards, 5 little number inputs, auto fill using deck color distribution.
 * Let session owner pass ownership to another player
 * -----
 * Move pick time out to server side?
 * Multiple prevention is only done by ID, maybe we should check the card name?
 * (I finally found out about socket.io room feature... I should use that instead of manually handling sessions.)
 
# Check
 * Set Multiple Selection
 * Player limit
 * Rarity selection
 * Prevent multiple copies of the same card in a single booster
 * Add a sideboard option (rename "Your Cards" to "Deck" and move what's currently the deck bellow and rename it to "Sideboard". Update exported to support the sideboard)
 
# Bugs
 * Player list messed during draft (triggered by a disconnect? - maybe by a quick disconnect/reconnect)
 * Guildgates won't import in arena : Guildgates do not have localized names