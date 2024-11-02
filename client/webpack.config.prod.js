import { merge } from "webpack-merge";
import commonConfig from "./webpack.config.js";

import CompressionPlugin from "compression-webpack-plugin";
import zlib from "zlib";

export default merge(commonConfig, {
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
