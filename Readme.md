# Todo
 * Heroku dynos are recycled once per day... Everything is in RAM, this is not good... I could find a way to find some persistance, but it will require a massive refactoring, and I'm not sure about the websocket connections...
 * Add some stats on deck/drafted cards
 * Look into https://mtg.gamepedia.com/Winston_Draft ?
 * Wait for card image to be loaded before displaying it? (Seems hard to do when updating booster for example)
 -----
 * Brackets (simplebracket project)
 * Revamp menu: Can take whole screen and disappear during drafting, (add a button to have it reappear?)
 * Display foils as... foils in front end?
 -----
 * Move pick time out to server side?
 * Multiple prevention is only done by ID, maybe we should check the card name
 * (I finally found out about socket.io room feature... I should use that instead of manually handling sessions.)

# Check
 * Add a way to re-order players (Need to change all ordering logic)
 * Add an upload saved draft logs
 * Should the disconnect player event be broadcast my the server rather by detected by clients?
 * Distribute bots around the table rather than having them all at the end
 * Optimize DLScryfallCards.py; Use MTGA data as base for cards and ids
 * Dragging cards
 * Ready Check
 * Add notification option: In a sub menu add a way to activate notifications (HTML5 Notification?) fired when a draft is launched.
 * Set Multiple Selection
 * Rarity selection
 * Prevent multiple copies of the same card in a single booster
 
# Bugs
 * Missing Historic Cards : Cinder Barrens
 * Guildgates won't import in arena : Guildgates do not have localized names 
 * "Truebanks#69050Aujourd’hui à 05:42
@Senryoku  just a heads up. We had a strange spot where two people had two different sessions with the same ID and both were leader
The chat log here might give a few hints. But I felt it was worth a quick note. Easily addressed by just picking a new id or having a leader join the other group"
 
# Notes on Arena Importer
 * Splits Cards (Ravnica) needs both card names, e.g. Discovery // Dispersal
 * Adventures (ELD) and Dual Faces (IXL) need only one.