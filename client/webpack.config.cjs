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
	resolve: {
		extensions: [".ts", ".tsx", ".js"],
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
				test: /\.(png|svg|jpg|gif|webp)$/,
				type: "asset/resource",
			},
			{
				test: /\.worker\.js$/,
				use: { loader: "worker-loader" },
			},
			// all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
			{ test: /\.tsx?$/, loader: "ts-loader" },
			{
				test: /\.(woff(2)?|ttf|eot)$/,
				type: "asset/resource",
			},
		],
	},
	plugins: [
		new VueLoaderPlugin(), //new BundleAnalyzerPlugin()
	],
};
