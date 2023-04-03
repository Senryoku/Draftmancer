export const isAny = (x: any): x is any => true;

export const isBoolean = (x: any): x is boolean => typeof x === "boolean";
export const isNumber = (x: any): x is number => typeof x === "number";
export const isString = (x: any): x is string => typeof x === "string";
export const isArray = (x: any): x is any[] => Array.isArray(x);
export const isObject = (x: any): x is object => typeof x === "object" && x !== null;

export function isArrayOfStrings(x: unknown): x is string[] {
	if (!isArray(x)) return false;
	if (x.some((v) => typeof v !== "string")) return false;
	return true;
}

type Guard<T = unknown> = (x: unknown) => x is T;

type KeyGuard = Guard<string | number | symbol>;

type GuardReturnType<T extends Guard> = T extends Guard<infer U> ? U : never;

export const isRecord =
	<K extends KeyGuard, V extends Guard>(isK: K, isV: V) =>
	(x: unknown): x is Record<GuardReturnType<K>, GuardReturnType<V>> =>
		typeof x === "object" && Object.entries(x as object).every(([k, v]) => (isK(k) ? isV(v) : true));
