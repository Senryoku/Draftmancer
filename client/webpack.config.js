import webpack from "webpack";
import path from "path";
import { VueLoaderPlugin } from "vue-loader";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
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
			title: "Draftmancer - Multiplayer MTG Draft Simulator",
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
			__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
		}),
	],
};
