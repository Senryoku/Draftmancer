const path = require("path");
const VueLoaderPlugin = require("vue-loader/lib/plugin");

module.exports = {
	mode: "production",
	entry: "./client/src/index.js",
	output: {
		filename: "index.js",
		path: path.resolve(__dirname, "public/dist/"),
	},
	module: {
		rules: [
			// Handles .vue files and <script> and <style> blocks within
			{
				test: /\.vue$/,
				loader: "vue-loader",
			},
			{
				test: /\.js$/,
				loader: "babel-loader",
			},
			{
				test: /\.css$/,
				use: ["vue-style-loader", "css-loader"],
			},
		],
	},
	plugins: [new VueLoaderPlugin()],
	// Includes VueJS compiler - TEMP! Switching to precompiled templates
	resolve: {
		alias: {
			vue$: "vue/dist/vue.esm.js",
		},
	},
};
