export const isAny = (x: any): x is any => true;

export const isBoolean = (x: unknown): x is boolean => typeof x === "boolean";
export const isNumber = (x: unknown): x is number => typeof x === "number";
export const isString = (x: unknown): x is string => typeof x === "string";
export const isArray = (x: unknown): x is any[] => Array.isArray(x);
export const isObject = (x: unknown): x is object => typeof x === "object" && x !== null;

export const isInteger = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

type Guard<T = unknown> = (x: unknown) => x is T;

type KeyGuard = Guard<string | number | symbol>;

type GuardReturnType<T extends Guard> = T extends Guard<infer U> ? U : never;

export const isRecord =
	<K extends KeyGuard, V extends Guard>(isK: K, isV: V) =>
	(x: unknown): x is Record<GuardReturnType<K>, GuardReturnType<V>> =>
		typeof x === "object" && Object.entries(x as object).every(([k, v]) => (isK(k) ? isV(v) : true));

export const isArrayOf =
	<E extends Guard>(isE: E) =>
	(x: unknown): x is GuardReturnType<E>[] =>
		Array.isArray(x) && !x.some((e) => !isE(e));
