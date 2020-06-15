const path = require("path");
const VueLoaderPlugin = require("vue-loader/lib/plugin");
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;

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
	plugins: [
		new VueLoaderPlugin(),
		/*new BundleAnalyzerPlugin()*/
	],
	// Includes VueJS compiler - Could be removed by switching to precompiled templates... which means refactor everything in index.html to gain these 20kb \o/
	resolve: {
		alias: {
			vue$: "vue/dist/vue.esm.js",
		},
	},
};
