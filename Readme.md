# MTGADraft

## Contact

Join the discord for development related discussions: https://discord.gg/KYKzx9m

## How to run the project in local

-   Clone repository
-   Open repository
-   Execute `npm install`
-   Execute `npm start`
-   Navigate to `http://localhost:3000/`

## Todo

### Important

-   Be more resillient: [Let It Crash: Best Practices for Handling Node.js Errors on Shutdown](https://blog.heroku.com/best-practices-nodejs-errors) ; use beforeExit to save Connections and Sessions in a database? (Should also solve "Save session options and reapply them when the user is the owner?")
-   Heroku dynos are recycled once per day... Everything is in RAM, this is not good... I could find a way to find some persistance, but it will require a massive refactoring, and I'm not sure about the websocket connections...

---

-   Add more display option for the cards in draft logs (Even make them draggable?)
-   Re-think color balance for multi-colored cards?
-   Improve bot distribution (they're clumping up at the end of the table when bots >> players)
-   Add set code support to cube import?
-   rewrite cubeformat.html

---

-   Brackets (simplebracket project)
-   Revamp menu: Can take whole screen and disappear during drafting, (add a button to have it reappear?)
-   Display foils as... foils in front end?

---

-   Move pick time out to server side?
-   Multiple prevention is only done by ID, maybe we should check the card name
-   (I finally found out about socket.io room feature... I should use that instead of manually handling sessions.)

### Distant Future

-   Add some stats on deck/drafted cards (will increase card DB size, not a fan.)
-   Look into [Winston Draft](https://mtg.gamepedia.com/Winston_Draft) ?

## Check

-   Wait for card image to be loaded before displaying it? (Seems hard to do when updating booster for example)
-   Add a way to re-order players (Need to change all ordering logic)
-   Add an upload saved draft logs
-   Should the disconnect player event be broadcast my the server rather by detected by clients?
-   Distribute bots around the table rather than having them all at the end
-   Optimize DLScryfallCards.py; Use MTGA data as base for cards and ids
-   Dragging cards
-   Ready Check
-   Add notification option: In a sub menu add a way to activate notifications (HTML5 Notification?) fired when a draft is launched.
-   Set Multiple Selection
-   Rarity selection
-   Prevent multiple copies of the same card in a single booster

## Bugs

-   Missing Historic Cards : Cinder Barrens
-   Guildgates won't import in arena : Guildgates do not have localized names
-   "Truebanks#69050Aujourd’hui à 05:42
    @Senryoku just a heads up. We had a strange spot where two people had two different sessions with the same ID and both were leader
    The chat log here might give a few hints. But I felt it was worth a quick note. Easily addressed by just picking a new id or having a leader join the other group"

## Notes on Arena Importer

-   Splits Cards (Ravnica) needs both card names, e.g. Discovery // Dispersal
-   Adventures (ELD) and Dual Faces (IXL) need only one.

### Custom Set format

Rarity Header:

    [SlotName(CardPerBooster)]
    Card 1
    Card 2
    ...
