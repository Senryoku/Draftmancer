# MTGADraft

## Contact

Join the discord for development related discussions: https://discord.gg/XscXXNw

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

### Tests

`npm test` runs all tests in the `test` folder (non recursive). This is the command run by GitHub actions for each commit.
`npm run manualtest` runs tests from the `test/manual` folder, it contains additional (and long) statistical tests.

## TODOs

### Important

-   Improve bot distribution (they're clumping up at the end of the table when bots >> players)
-   Cleanup draft state? (See Winston Draft State for a better example)

### Minor Improvements

-   Improve deck stats (Get some inspiration from MTGA)
-   Display foils as... foils in front end?

## Check

Features that may need some additional testing:

-   Rochester Draft / Grid Draft

## Notes on Arena Importer

-   Splits Cards (Ravnica) needs both card names, e.g. Discovery // Dispersal
-   Adventures (ELD) and Dual Faces (IXL) need only one.
-   AKR Splits Cards uses triple forward slashes (///) instead of double.

## Custom Set format

See cubeformat.html
