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

-   Running `nodemon --experimental-json-modules` instead of `npm start` will restart the node server on any changes. (Install nodemon globally with `npm install nodemon -g`)
-   Use `npm run build-dev` to watch for changes in the client js code and automatically re-build it.

### Tests

-   `npm test` runs all tests in the `test` folder (non recursive). This is the command run by GitHub actions on each commit.
-   `npm run manualtest` runs tests from the `test/manual` folder, it contains additional (and long) statistical tests.

## Notes on Arena Importer

-   Splits Cards (Ravnica) needs both card names, e.g. Discovery // Dispersal
-   Adventures (ELD) and Dual Faces (IXL) need only one.
-   AKR Splits Cards uses triple forward slashes (///) instead of double.

## Custom Set format

See cubeformat.html

## Acknowledgement

-   Card data and images provided by [Scryfall](https://scryfall.com/)
-   Data used for automatic collation from https://github.com/taw/magic-sealed-data ; Used https://www.lethe.xyz/mtg/collation/ as reference for manual implementations.
