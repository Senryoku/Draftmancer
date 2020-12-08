import LZString from './lz-string.min.js';

onmessage = function(e) {
	switch(e.data[0]) {
		case 'decompress': {
			const str = LZString.decompressFromUTF16(e.data[1]);
			postMessage(JSON.parse(str));
			break;
		}
		case 'compress': {
			const str = JSON.stringify(e.data[1]);
			postMessage(LZString.compressToUTF16(str));
			break;
		}
	}
}