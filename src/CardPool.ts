import { CardID } from "./CardTypes";
import { getRandomMapKey, random } from "./utils.js";

// Implements a MultiSet using a standard Map.
export class CardPool extends Map<CardID, number> {
	private _count = 0;
	private _asArray: CardID[] | null = null;

	constructor() {
		super();
	}

	// Set the number of copies of a card in the pool.
	// Note: If count is <= 0, the card entry will be removed entirely.
	set(cid: CardID, count: number) {
		this.invalidateArrayCache();
		if (super.has(cid)) {
			this._count -= super.get(cid)!;
			if (count <= 0) super.delete(cid);
		}
		if (count > 0) {
			super.set(cid, count);
			this._count += count;
		}
		return this;
	}

	clear(): void {
		super.clear();
		this._count = 0;
	}

	delete(key: string): boolean {
		const oldValue = super.get(key);
		if (oldValue) {
			this._count -= oldValue;
			this.invalidateArrayCache();
		}
		return super.delete(key);
	}

	// Remove a single copy of a card from the pool.
	removeCard(cid: CardID) {
		const oldValue = this.get(cid);
		if (!oldValue) {
			console.error(`Called removeCard on a non-existing card (${cid}).`);
			console.trace();
			throw `Called removeCard on a non-existing card (${cid}).`;
		}
		// Purposefully bypassing our caching overload and calling super.set() and super.delete() directly here.
		if (oldValue === 1) super.delete(cid);
		else super.set(cid, oldValue - 1);
		if (this._asArray) this._asArray.splice(this._asArray.indexOf(cid), 1);
		--this._count;
	}

	pick(uniformAll: boolean): CardID {
		if (this.size === 0) {
			console.error(`Called pick on an empty card pool.`);
			console.trace();
			throw `Called pick on an empty card pool.`;
		}
		if (uniformAll) {
			if (!this._asArray) {
				this._asArray = [];
				for (const [cid, count] of this.entries()) {
					for (let i = 0; i < count; ++i) {
						this._asArray.push(cid);
					}
				}
			}
			return this._asArray[random.integer(0, this._asArray.length - 1)];
		} else {
			return getRandomMapKey(this);
		}
	}

	count() {
		return this._count;
	}

	private invalidateArrayCache() {
		this._asArray = null;
	}
}

export type SlotedCardPool = { [slot: string]: CardPool };
