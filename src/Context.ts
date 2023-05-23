// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const InTesting = typeof (global as any).it === "function"; // Testing in mocha
export const InProduction = process.env.NODE_ENV === "production";
