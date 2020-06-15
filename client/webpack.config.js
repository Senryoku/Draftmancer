const path = require("path");

module.exports = {
	mode: "production",
	entry: "./client/src/index.js",
	output: {
		filename: "index.js",
		path: path.resolve(__dirname, "public/dist/"),
	},
	// Includes vue compiler - TEMP!
	resolve: {
		alias: {
			vue$: "vue/dist/vue.esm.js",
		},
	},
};
