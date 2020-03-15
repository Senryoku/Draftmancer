# Todo
 * Revamp menu: Can take whole screen and disappear during drafting, (add a button to have it reappear?)
 * Add double click to pick? (as an option, saved in a cookie?)
 * Add basic lands in draft: fill to 40 cards, 5 little number inputs, auto fill using deck color distribution.
 * Limit sideboard to 15 cards (breaks arena import)
 * Reduce pick timer after each pick (change the pick timer option to have fewer possibilities, like [0, 30, 60, 90, 120])
 * Make the session owner launch the draft
 * Guildgates do not have localized names
 * Move pick time out to server side?
 * Multiple prevention is only done by ID, maybe we should check the card name?
 * I finally found out about socket.io room feature... I should use that instead of manually handling sessions.
 
# Check
 * Set Multiple Selection
 * Player limit
 * Rarity selection
 * Prevent multiple copies of the same card in a single booster
 * Add a sideboard option (rename "Your Cards" to "Deck" and move what's currently the deck bellow and rename it to "Sideboard". Update exported to support the sideboard)
 
# Bugs
 * Player list messed during draft (triggered by a disconnect? - maybe by a quick disconnect/reconnect)
 * Guildgates won't import in arena