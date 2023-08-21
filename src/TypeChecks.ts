// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isAny = (x: unknown): x is any => true;
export const isUnknown = (x: unknown): x is unknown => true;

export const isBoolean = (x: unknown): x is boolean => typeof x === "boolean";
export const isNumber = (x: unknown): x is number => typeof x === "number";
export const isString = (x: unknown): x is string => typeof x === "string";
export const isArray = (x: unknown): x is unknown[] => Array.isArray(x);
export const isObject = (x: unknown): x is object => typeof x === "object" && x !== null;

export const isInteger = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

export type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType extends readonly (infer ElementType)[]
	? ElementType
	: never;

type Guard<T = unknown> = (x: unknown) => x is T;

type KeyGuard = Guard<string | number | symbol>;

type GuardReturnType<T extends Guard> = T extends Guard<infer U> ? U : never;

type GuardArrayReturnType<T extends Guard[]> = T extends Guard<infer U>[] ? U : never;

export const isUnion =
	<G extends Guard[]>(...guards: G) =>
	(x: unknown): x is GuardArrayReturnType<G> =>
		guards.some((f) => f(x));

export const isRecord =
	<K extends KeyGuard, V extends Guard>(isK: K, isV: V) =>
	(x: unknown): x is Record<GuardReturnType<K>, GuardReturnType<V>> =>
		typeof x === "object" && Object.entries(x as object).every(([k, v]) => (isK(k) ? isV(v) : true));

export const isArrayOf =
	<E extends Guard>(isE: E) =>
	(x: unknown): x is GuardReturnType<E>[] =>
		Array.isArray(x) && !x.some((e) => !isE(e));

export const hasProperty =
	<Prop extends PropertyKey, E extends Guard>(key: Prop, isE: E) =>
	(x: object): x is Record<Prop, GuardReturnType<E>> =>
		Object.hasOwn(x, key) && isE(x[key as keyof typeof x]);

export const hasOptionalProperty =
	<Prop extends PropertyKey, E extends Guard>(key: Prop, isE: E) =>
	(x: object): x is Record<Prop, GuardReturnType<E>> =>
		!Object.hasOwn(x, key) || x[key as keyof typeof x] === undefined || isE(x[key as keyof typeof x]);

type EnumValueType = string | number | symbol;
type EnumType = { [key in EnumValueType]: EnumValueType };

export const isSomeEnum =
	<T extends EnumType>(e: T) =>
	(token: unknown): token is T[keyof T] =>
		Object.values(e).includes(token as T[keyof T]);
