const webpack = require("webpack");
const path = require("path");
const { VueLoaderPlugin } = require("vue-loader");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const CompressionPlugin = require("compression-webpack-plugin");
const zlib = require("zlib");

module.exports = {
	mode: "production",
	entry: { index: "./client/src/index.ts", readOnlyBracket: "./client/src/readOnlyBracket.ts" },
	output: {
		filename: "[name].[contenthash].js",
		path: path.resolve(__dirname, "dist/"),
		publicPath: "/",
		clean: true,
	},
	devtool: "source-map",
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
			{
				test: /\.tsx?$/,
				loader: "ts-loader",
				options: {
					appendTsSuffixTo: [/\.vue$/],
					transpileOnly: true,
				},
			},
			{
				test: /\.(woff(2)?|ttf|eot)$/,
				type: "asset/resource",
			},
		],
	},
	plugins: [
		new CopyPlugin({
			patterns: [{ from: "./client/public", to: "." }],
		}),
		new HtmlWebpackPlugin({
			filename: "index.html",
			template: "./client/template/index.html",
			inject: "body",
			chunks: ["index"],
			title: "Draftmancer - Multiplayer MTG Limited Simulator",
			hash: true,
		}),
		new HtmlWebpackPlugin({
			filename: "bracket.html",
			template: "./client/template/index.html",
			inject: "body",
			chunks: ["readOnlyBracket"],
			title: "Draftmancer - Bracket",
			hash: true,
		}),
		new VueLoaderPlugin(),
		new webpack.DefinePlugin({
			__VUE_OPTIONS_API__: true,
			__VUE_PROD_DEVTOOLS__: false,
		}),
		new CompressionPlugin({
			filename: "[path][base].gz",
			algorithm: "gzip",
			test: /\.(js|css|html|svg)$/,
			threshold: 2048,
			minRatio: 0.8,
		}),
		new CompressionPlugin({
			filename: "[path][base].br",
			algorithm: "brotliCompress",
			test: /\.(js|css|html|svg)$/,
			compressionOptions: {
				params: {
					[zlib.constants.BROTLI_PARAM_QUALITY]: 11,
				},
			},
			threshold: 2048,
			minRatio: 0.8,
		}),
	],
};
