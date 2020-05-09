# MTGADraft

## Contact

Join the discord for development related discussions: https://discord.gg/KYKzx9m

## How to run the project in local

-   Clone repository
-   Open repository
-   Execute `npm install`
-   Execute `npm start`
-   Navigate to `http://localhost:3000/`

### Setup DynamoDB (local)

-   Download [DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html)
-   Extract and run `java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb`
-   Setup environment variables, for development create a '.env' file at the root of MTGADraft with the following:

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
AWS_ENDPOINT=http://localhost:8000
```

-   Run `node createDynamoDBTables.js`

## Todo

### Important

-   Make the rarity distribution in boosters customizable (it's been asked multiple times).
-   Re-think color balance for multi-colored cards?
-   Improve bot distribution (they're clumping up at the end of the table when bots >> players)
-   CardPerBooster in frontend isn't accurate after a disconnection (and consequently Booster and Pick Number aren't either)

---

-   Revamp menu: Can take whole screen and disappear during drafting, (add a button to have it reappear?)
-   Display foils as... foils in front end?

---

-   Move pick time out to server side?
-   Multiple prevention is only done by ID, maybe we should check the card name
-   (I finally found out about socket.io room feature... I should use that instead of manually handling sessions.)

### Distant Future

-   Add some stats on deck/drafted cards (will increase card DB size, not a fan.)

## Check

-   Glimpse/Burn Draft
-   Card count/set code/Collector number support to cube import
-   Winston Draft
-   Import. Collection: Detect multiple accounts and ask the user if they want to intersect all found collections
-   Add a way to randomize seatings
-   Monitor persistence
-   Wait for card image to be loaded before displaying it? (Seems hard to do when updating booster for example)
-   Optimize DLScryfallCards.py; Use MTGA data as base for cards and ids
-   Set Multiple Selection
-   Rarity selection
-   Prevent multiple copies of the same card in a single booster

## Bugs

-   "Bonders' Enclave" (Bonder's Enclave) doesn't export to Arena (Check: Possibly fixed with updated data)
-   Missing Historic Cards : Cinder Barrens
-   Guildgates won't import in arena : Guildgates do not have localized names

## Notes on Arena Importer

-   Splits Cards (Ravnica) needs both card names, e.g. Discovery // Dispersal
-   Adventures (ELD) and Dual Faces (IXL) need only one.

## Custom Set format

Rarity Header:

    [SlotName(CardPerBooster)]
    Card 1
    Card 2
    ...
