// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const InTesting = typeof (global as any).it === "function"; // Testing in mocha
export const InProduction = process.env.NODE_ENV === "production";

export const TestingOnly = <Args extends unknown[], Ret>(f: (...args: Args) => Ret | void) => {
	return (...args: Args) => {
		if (!InTesting) {
			console.error(`Error: this function should only be used in testing! (Call ignored)`);
			console.trace();
			return;
		} else return f(...args);
	};
};
