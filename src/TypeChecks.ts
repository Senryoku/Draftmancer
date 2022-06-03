export const isBoolean = (x: any): x is boolean => typeof x === "boolean";
export const isNumber = (x: any): x is number => typeof x === "number";
export const isString = (x: any): x is string => typeof x === "string";
export const isArray = (x: any): x is any[] => Array.isArray(x);
export const isObject = (x: any): x is object => typeof x === "object" && x !== null;
