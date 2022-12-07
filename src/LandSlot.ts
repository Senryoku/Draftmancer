"use strict";

import { CardID, CardPool, getUnique, Cards, getCard } from "./Cards.js";
import { getRandomMapKey, getRandom } from "./utils.js";
import { removeCardFromCardPool } from "./cardUtils.js";
import BasicLandIDs from "./data/BasicLandIDs.json";

export class BasicLandSlot {
	basicLandsIds: Array<CardID>;

	constructor(set: string) {
		this.basicLandsIds = (BasicLandIDs as { [set: string]: CardID[] })[set];
	}

	setup(commons: CardPool) {}
	pick() {
		return getUnique(getRandom(this.basicLandsIds));
	}
}

export class SpecialLandSlot extends BasicLandSlot {
	commonLandsIds: Array<CardID>;
	rate: number;
	landsToDistribute: CardPool = new Map();

	constructor(set: string, commonLandsIds: Array<CardID>, rate: number, basicLandsIds?: Array<CardID>) {
		super(set);
		this.commonLandsIds = commonLandsIds;
		this.rate = rate;
		if (basicLandsIds) this.basicLandsIds = basicLandsIds;
	}

	setup(commons: CardPool) {
		for (let c of this.commonLandsIds) {
			if (commons.has(c)) {
				this.landsToDistribute.set(c, commons.get(c) as number);
				commons.delete(c);
			}
		}
	}

	pick() {
		if (Math.random() <= this.rate && this.landsToDistribute.size > 0) {
			let c = getRandomMapKey(this.landsToDistribute);
			removeCardFromCardPool(c, this.landsToDistribute);
			return getUnique(c);
		} else {
			return getUnique(getRandom(this.basicLandsIds));
		}
	}
}

// Eldraine common lands appears in the standard common slot, no need for a special rule.
export const SpecialLandSlots: { [set: string]: SpecialLandSlot } = {
	grn: new SpecialLandSlot(
		"grn",
		[
			"c52ceefc-90d0-49d1-ae54-9a4eab819849",
			"95f52d32-c04b-4711-9edc-8fd1d3547a44",
			"b7129bdf-de02-4ed2-b5de-f774b8a7d302",
			"3694ac90-e71e-4736-8945-7dbf5b5fd6a9",
			"86706d8e-de08-4778-94ba-ae75ed522472",
			"f0a021e9-b11a-4028-86c9-01b62eae1877",
			"2055a83a-99c8-4808-90b9-1c2fdcda79b4",
			"fc36bb2a-115d-4e24-a1e9-02b21773e945",
			"6d5ee7a5-937a-4c2b-af8c-6e5734677c53",
			"ee1db693-5dd9-48de-8520-014d9ad5b596",
		],
		1
	), // Gateway Plaza (68728) appear in the common slot.
	rna: new SpecialLandSlot(
		"rna",
		[
			"93cf5412-c711-41b4-ab3b-7788a0a22228",
			"e52013ba-9b17-497b-a844-1e7eb5607019",
			"33d10573-1695-4a73-b92d-d478572b85ec",
			"8fffd445-de4f-45de-95b9-6e0855926a6a",
			"cba5fb67-e161-4e89-be3e-c8021122ff19",
			"f7046b5e-622f-4ae8-9ddd-709ccd61000e",
			"26f7e55d-d4c9-4755-ab87-a592ba3fb64f",
			"d88b90fa-a7f1-4739-a507-d22dede9384f",
			"6e73e082-b16a-45d5-bc4a-24c694b0b9af",
			"62537433-3c49-417d-89ef-c12d5288bb6f",
		],
		1
	), // Gateway Plaza (69395) appear in the common slot.
	m19: new SpecialLandSlot(
		"m19",
		[
			"db41b554-2bb1-4f11-be29-233d36cc955a",
			"b376c8c9-cd35-4c2b-8b5b-95ea9735b366",
			"6b28e1e1-0813-4e4a-a7a7-058b7787272c",
			"b538a465-81c6-4282-9ac3-061167ac7dc3",
			"f47ee724-da0f-4eb1-b07b-b07e04e9f5b3",
			"bac2b853-f788-4b29-a76d-880da61ad91a",
			"df8c56fa-fae6-48ba-813d-0d971b640896",
			"07076412-18fe-4e15-bdb5-17111b4a66db",
			"78b33867-5ccf-49a1-8e9b-9d2ddac78f17",
			"303224d6-9769-4127-8e33-9129f337e2a8",
		],
		1 / 2
	),
	m20: new SpecialLandSlot(
		"m20",
		[
			"9b7ec5a3-3c40-4090-b9e3-11fb5b06fb8f",
			"31514c67-4c55-4f28-9872-08e4d9bc6505",
			"a5ff247f-82d1-4b79-9ac0-1471a1f0f58b",
			"9b6b7a1d-943b-43f8-a70b-1a3a205476cf",
			"f05dd57c-91ca-4c79-b6da-1e504d806f28",
			"3b9edd33-a64e-4526-a89f-edd31ac4b175",
			"804db4ef-712f-4a39-a00f-51e99b05274c",
			"ef1b12d2-2f4f-4cfd-9728-edf8232c99e7",
			"75fa37aa-ef2e-49ff-9496-86b0e69128a7",
			"91c0b1ba-fd3d-4f1c-9e8e-22280eeeff7d",
			"ad0fa2fb-6770-4a81-b830-4acfa957655a",
			"bac2b853-f788-4b29-a76d-880da61ad91a",
			"df8c56fa-fae6-48ba-813d-0d971b640896",
			"07076412-18fe-4e15-bdb5-17111b4a66db",
			"78b33867-5ccf-49a1-8e9b-9d2ddac78f17",
			"303224d6-9769-4127-8e33-9129f337e2a8",
		],
		1 / 2
	), // Gain Lands and Evoling Wilds (70031)
	iko: new SpecialLandSlot(
		"iko",
		[
			"0c8269e6-b30c-4fdc-82a7-d503c133afa6",
			"828044d6-0f53-4caf-a581-d71919df4175",
			"9de0981e-54fc-4919-96a4-a9608a5452fc",
			"01926862-bf2d-4a2b-af94-1ea5e4dd7444",
			"9a69fa8f-1c2b-453d-8d54-2748890ce925",
			"2282018a-46c8-41ca-ab93-f7dbf32cd295",
			"7108c071-5f1c-4cf5-90c6-530cee3f7685",
			"8d011b0f-1681-4a51-9f5d-47ad135d03fe",
			"366ac097-39cb-4401-87c7-1dd73bf34329",
			"86367edc-9587-4f3b-aa95-c3a2bfc8c6f4",
		],
		1 / 2
	), // Gain Lands; Evoling Wilds (71314) is found in the common slot
	m21: new SpecialLandSlot(
		"m21",
		[
			"5d89a0e2-1163-4a11-b0df-deef2e6c8108",
			"c8483586-9a07-4f54-a390-7dd97fcea5cb",
			"b3b1afa0-9bb5-4566-a85e-86a5c03e0187",
			"69f28d7a-6480-4725-9719-2354921e6410",
			"9daef8db-56a5-4b1e-b4bf-734d0516557c",
			"feb3d45c-a28c-49d2-ab79-53ab42c7fdfd",
			"e649fc68-fca5-4234-aff4-0ec2382a66d4",
			"f82851a5-5f70-488a-b21c-bdd65d2fca7c",
			"0fee9b4b-1510-4b78-bdde-2e0bb319ee33",
			"56d7428b-25a7-4185-8c3e-69017bd1ba6d",
			"2282018a-46c8-41ca-ab93-f7dbf32cd295",
			"7108c071-5f1c-4cf5-90c6-530cee3f7685",
			"8d011b0f-1681-4a51-9f5d-47ad135d03fe",
			"366ac097-39cb-4401-87c7-1dd73bf34329",
			"86367edc-9587-4f3b-aa95-c3a2bfc8c6f4",
		],
		1 / 2
	), // Gain Lands; Radiant Fountain (72030) is found in the common slot
	khm: new SpecialLandSlot(
		"khm",
		[
			// Dual Snow Taplands
			"8702d6b9-bb01-4841-a76d-4a576066c772", // Alpine Meadow
			"b20e3117-f1e4-4449-ae9d-0b66abfc717d", // Arctic Treeline
			"9de5fadd-4559-479f-b45d-abe792f0f6e5", // Glacial Floodplain
			"682eee5f-7986-45d3-910f-407303fdbcc4", // Highland Forest
			"8cff3ef0-4dfb-472e-aa1e-77613dd0f6d8", // Ice Tunnel
			"da1db084-f235-4e26-8867-5f0835a0d283", // Rimewood Falls
			"6611dc5e-6acc-48df-b8c4-4b327314578b", // Snowfield Sinkhole
			"35ebe245-ebb5-493c-b9c1-56fbfda9bd66", // Sulfurous Mire
			"f2392fbb-d9c4-4688-b99c-4e7614c60c12", // Volatile Fjord
			"b2dd0b71-5a60-418c-82fc-f13d1b5075d0", // Woodland Chasm
		],
		5 / 12,
		BasicLandIDs["khm"].filter((cid: CardID) => getCard(cid)["type"].startsWith("Basic Snow"))
	), // Always one snow-covered land, either basic or tapped. Shimmerdrift Vale (f09d98db-0176-41a7-b99b-ead29876cdab) appears in the common slot
	neo: new SpecialLandSlot(
		"neo",
		[
			// Dual Taplands
			"ba06fcda-7ab8-48d4-8656-2a911e73dc44", // Bloodfell Caves
			"d290ec6b-15a6-49e8-abd2-b8c4d0f556eb", // Blossoming Sands
			"fab0660b-81f8-40ca-8098-5f8d51219a40", // Dismal Backwater
			"deadca61-0be9-4eeb-ba12-bc73a49bae74", // Jungle Hollow
			"58d511be-60e0-4755-abec-18eebb530605", // Rugged Highlands
			"00538414-90f3-41da-b67e-d81cfa643de3", // Scoured Barrens
			"ea6c2670-e6fd-40d6-afe0-7d3c4db96a4d", // Swiftwater Cliffs
			"68f822b7-efc5-42c8-93ea-7dd17b4c3e7a", // Tranquil Cove
			"cf9b1d47-11ef-4f06-94b2-94b6727de3bd", // Wind-Scarred Crag
			"d5af3569-3e66-4a50-aca0-c17c799dca28", // Thornwood Falls
		],
		5 / 12 // FIXME: This is arbitrary, we don't know the actual rate for now.
	),
	// Double Masters 2022: Always a Cryptic Spires
	"2x2": new SpecialLandSlot("2x2", ["309a6684-ecb3-491c-899a-3aa15a51130b"], 1, [
		"309a6684-ecb3-491c-899a-3aa15a51130b",
	]),
};

export const BasicLandSlots: { [set: string]: BasicLandSlot } = {};
for (let set in BasicLandIDs) BasicLandSlots[set] = new BasicLandSlot(set);
