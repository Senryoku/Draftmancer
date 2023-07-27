const { merge } = require("webpack-merge");
const commonConfig = require("./webpack.config.cjs");

const CompressionPlugin = require("compression-webpack-plugin");
const zlib = require("zlib");

module.exports = merge(commonConfig, {
	mode: "production",
	plugins: [
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
});
