export function genCustomCardID(name: string, set: string, collector_number: string): string {
	return `${name}_${set.toLowerCase()}_${collector_number}`;
}
