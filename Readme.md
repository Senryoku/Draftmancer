# Todo
 * Add a sound to Ready Check?
 * Brackets (Vue Module)
 * Add some stats on deck/drafted cards
 -----
 * Revamp menu: Can take whole screen and disappear during drafting, (add a button to have it reappear?)
 * Optimize DLScryfallCards.py; Use MTGA data as base for cards and ids
 * Display foils as... foils in front end?
 -----
 * Move pick time out to server side?
 * Should the disconnect player event be broadcast my the server rather by detected by clients?
 * Multiple prevention is only done by ID, maybe we should check the card name?
 * (I finally found out about socket.io room feature... I should use that instead of manually handling sessions.)

# Check
 * Dragging cards
 * Ready Check
 * Add notification option: In a sub menu add a way to activate notifications (HTML5 Notification?) fired when a draft is launched.
 * Set Multiple Selection
 * Rarity selection
 * Prevent multiple copies of the same card in a single booster
 
# Bugs
 * Missing Historic Cards : Cinder Barrens
 * Once again, Dual faced cards won't import correctly in Arena! Yay! (Ravnica split cards, Discovery // Dispersal  etc)
 * Guildgates won't import in arena : Guildgates do not have localized names 
 
# Notes on Arena Importer
 * Splits Cards (Ravnica) needs both card names, e.g. Discovery // Dispersal
 * Adventures (ELD) and Dual Faces (IXL) need only one.