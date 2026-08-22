export declare function copyToWasmBuffer(
	str: string,
	exports: {
		allocUint8: (size: number) => number;
		memory: any;
	}
): {
	ptr: number;
	length: number;
};
export declare function Uint16ArraytoString(buf: Uint16Array): string;
export declare function extractFooter(
	memory: WebAssembly.Memory,
	ptrToFooter: number
): {
	start: number;
	end: number;
	capacity: number;
};
