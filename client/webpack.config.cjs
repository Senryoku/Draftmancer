const path = require("path");
const VueLoaderPlugin = require("vue-loader/lib/plugin");
//const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;

module.exports = {
	mode: "production",
	entry: { index: "./client/src/index.js", readOnlyBracket: "./client/src/readOnlyBracket.js" },
	output: {
		filename: "[name].js",
		path: path.resolve(__dirname, "public/dist/"),
		publicPath: "/dist/",
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
			{
				test: /\.(png|svg|jpg|gif)$/,
				use: [
					{
						loader: "file-loader",
						options: {
							publicPath: "dist/assets/",
							outputPath: "assets/",
							esModule: false,
						},
					},
				],
			},
			{
			  test: /\.worker\.js$/,
			  use: { loader: "worker-loader" },
			},
		],
	},
	plugins: [
		new VueLoaderPlugin(), //new BundleAnalyzerPlugin()
	],
};
