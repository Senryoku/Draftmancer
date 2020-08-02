# MTGADraft

## Contact

Join the discord for development related discussions: https://discord.gg/KYKzx9m

## How to run the project locally

-   Clone repository
-   Open repository
-   Execute `npm install` to install dependencies.
-   Execute `npm run build` to build the client using webpack.
-   Execute `npm start` to start the server (which also serves the webapp).
-   Navigate to `http://localhost:3000/`

### Development tips

-   Running `nodemon` instead of `npm start` will restart the node server on any changes.
-   Use `npm run build-dev` to watch for changes in the client js code and automatically re-build it.

### Setup DynamoDB (local)

Persistence can be disabled by setting environment variable DISABLE_PERSISTENCE to TRUE.

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

-   Re-think color balance for multi-colored cards?
-   Improve bot distribution (they're clumping up at the end of the table when bots >> players)
-   Cleanup draft state? (See Winston Draft State for a better example)

---

-   Improve deck stats (Get some inspiration from MTGA. Add text form below charts. Mana Curve: Differentiate between creature and non-creature.)
-   Regroup Game Mode besides Draft in a single dropdown menu; Change "More" into "Setting" + Cog Icon
-   Display foils as... foils in front end?

### Distant Future

-   Set specificy booster generation rules, examples: WAR: One planeswalker/pack. DOM: One Legendary/pack.

## Check

Features that may need some additional testing:

-   Picks by Drag & Drop
-   Load translations on-demand.
-   Chaos Draft with specific boosters? (e.g. 2 RIX 1 IXL)
-   Glimpse/Burn Draft
-   Card count/set code/Collector number support to cube import
-   Monitor persistence
-   Rarity selection

## Notes on Arena Importer

-   Splits Cards (Ravnica) needs both card names, e.g. Discovery // Dispersal
-   Adventures (ELD) and Dual Faces (IXL) need only one.

## Custom Set format

See cubeformat.html
