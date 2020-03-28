# Todo
 * Revamp menu: Can take whole screen and disappear during drafting, (add a button to have it reappear?)
 * Optimize DLScryfallCards.py; Use MTGA data as base for cards and ids
 * Add back ready to draft... "I'm ready!" ? All it does is signaling the session owner that you're here and ready; a button on the right of SessionID ?
 * Display foils as... foils in front end?
 * Should the disconnect player event be broadcast my the server rather by detected by clients?
 * Front end: Color Columns
 * Add some stats on deck/drafted cards
 * -----
 * Move pick time out to server side?
 * Multiple prevention is only done by ID, maybe we should check the card name?
 * (I finally found out about socket.io room feature... I should use that instead of manually handling sessions.)
 
# Check
 * Add notification option: In a sub menu add a way to activate notifications (HTML5 Notification?) fired when a draft is launched.
 * Set Multiple Selection
 * Player limit
 * Rarity selection
 * Prevent multiple copies of the same card in a single booster
 
# Bugs
 * Missing Historic Cards : Cinder Barrens
 * Once again, Dual faced cards won't import correctly in Arena! Yay! (Ravnica split cards, Discovery // Dispersal  etc)
 * Guildgates won't import in arena : Guildgates do not have localized names 