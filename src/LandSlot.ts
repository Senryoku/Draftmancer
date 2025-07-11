"use strict";

import { CardID } from "./CardTypes.js";
import { getUnique, getCard, BoosterCardsBySet } from "./Cards.js";
import { random, getRandomMapKey, getRandom } from "./utils.js";
import BasicLandIDs from "./data/BasicLandIDs.json" with { type: "json" };
import { CardPool } from "./CardPool.js";

export class BasicLandSlot {
	basicLandsIds: Array<CardID>;

	constructor(set: string) {
		this.basicLandsIds = (BasicLandIDs as { [set: string]: CardID[] })[set];
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	setup(commons: CardPool) {}
	pick() {
		return getUnique(getRandom(this.basicLandsIds));
	}
}

export class SpecialLandSlot extends BasicLandSlot {
	commonLandsIds: Array<CardID>;
	rate: number;
	landsToDistribute: CardPool = new CardPool();

	constructor(set: string, commonLandsIds: Array<CardID>, rate: number, basicLandsIds?: Array<CardID>) {
		super(set);
		this.commonLandsIds = commonLandsIds;
		this.rate = rate;
		if (basicLandsIds) this.basicLandsIds = basicLandsIds;
	}

	setup(commons: CardPool) {
		for (const c of this.commonLandsIds) {
			if (commons.has(c)) {
				this.landsToDistribute.set(c, commons.get(c)!);
				commons.delete(c);
			}
		}
	}

	pick() {
		if (random.realZeroToOneExclusive() <= this.rate && this.landsToDistribute.size > 0) {
			const c = getRandomMapKey(this.landsToDistribute);
			this.landsToDistribute.removeCard(c);
			return getUnique(c);
		} else {
			return getUnique(getRandom(this.basicLandsIds));
		}
	}
}

const PIOLandSlot = new SpecialLandSlot(
	"pio",
	BoosterCardsBySet["pio"].filter((c) => getCard(c).name.endsWith(" Guildgate")),
	1.0
);

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
		1 / 2
	),
	// Double Masters 2022: Always a Cryptic Spires
	"2x2": new SpecialLandSlot("2x2", ["309a6684-ecb3-491c-899a-3aa15a51130b"], 1, [
		"309a6684-ecb3-491c-899a-3aa15a51130b",
	]),
	mom: new SpecialLandSlot(
		"mom",
		[
			// Dual Taplands
			"85930f68-6f53-4921-9556-2887ac3abfd2", // Bloodfell Caves
			"e34684d6-2935-4776-9a86-b603ad8cf624", // Blossoming Sands
			"33cd4f63-3484-4cee-8603-1f89cabee6c3", // Dismal Backwater
			"b6ed20a4-bc8a-44b1-b9b7-c82518c287b8", // Jungle Hollow
			"3aeef1b1-a351-47ce-a686-a0eb0a35a894", // Rugged Highlands
			"66aefbfc-3f67-443d-8ec4-cc9beafb64ee", // Scoured Barrens
			"957efc4e-c2a9-46a2-b9e3-20dc419ffd05", // Swiftwater Cliffs
			"3799dcb2-7cd7-4d28-b9af-249e3ebe3d3b", // Tranquil Cove
			"7f2642cd-e3cc-4aab-8c00-4987284509b3", // Wind-Scarred Crag
			"f1b753e2-6e53-4ed1-9be4-66f8eb005a11", // Thornwood Falls
		],
		1 / 2
	),
	lci: new SpecialLandSlot(
		"lci",
		[
			// Non-Basic common Caves
			"1d1a645e-85c7-4044-b817-6e24744d245e", // Captivating Cave
			"69f317fc-f603-45b5-9208-545be4dcbf36", // Hidden Cataract
			"b8685d46-99fc-44b3-be95-707a4b7b8327", // Hidden Courtyard
			"f67fd04f-05da-4418-97de-abeb7346cc69", // Hidden Necropolis
			"a942939a-c06e-4b90-a404-ae5acfffcff9", // Hidden Nursery
			"9fa06aed-52c1-48f1-9906-362db12a3cf7", // Hidden Volcano
			"e9681a54-6413-4ff4-b6b1-ee4decb25bfa", // Promising Vein
		],
		0.7,
		// "Travel Poster" basic lands.
		BasicLandIDs["lci"].filter(
			(cid: CardID) =>
				parseInt(getCard(cid)["collector_number"]) >= 287 && parseInt(getCard(cid)["collector_number"]) <= 291
		)
	),
	otj: new SpecialLandSlot(
		"otj",
		// Mirage Mesa and Conduit Pylons appear in the common slot.
		[
			"19e96521-b4ce-4a36-a887-200e05ccc804",
			"d61dfeb7-7f6b-4601-8396-2cbb98165489",
			"c5523dac-7aa0-4486-89c8-3b22a1411f26",
			"5c9d080f-28d7-41d6-a4e0-5b3e3a5ed770",
			"4ad841eb-da0d-43d4-8b60-efe30922990b",
			"963c100e-4e12-438f-b5ae-14391406dff6",
			"5d809f5b-d965-4cb1-a9f8-2048f8534373",
			"4b778b63-e5fc-4d63-a93b-4372f32cade2",
			"988e44c5-4632-4ebb-b6ae-c3886e49d637",
			"67daa31c-d9c4-4c22-b29c-1b8a17d577e5",
		],
		0.5
	),
	dsk: new SpecialLandSlot(
		"dsk",
		// Dual lands
		[
			"ee0565f5-ebdb-43f9-bbb4-0485b1968937",
			"cb224874-aff5-461f-82ee-89b06663231a",
			"f8900b89-0e10-4602-bba2-da8d60ea5885",
			"a9367acd-393a-4966-ba60-af2ecd4e7596",
			"6098d8be-4e3f-455d-8799-91435bf45a1c",
			"11cf1531-8a3c-4e28-a114-d3a342b33bb6",
			"3a6e40c0-e70e-4353-a920-9851cfac71dd",
			"3604a211-9bf7-474e-bd78-32a862f4259c",
			"98d0d067-b52d-47ec-ba7b-8cfcd716c0e5",
			"c1ce9250-bdbe-4c77-9243-6db9ffffe69b",
		],
		0.5
	),
	pio: PIOLandSlot,
	pio0: PIOLandSlot,
	pio1: PIOLandSlot,
	pio2: PIOLandSlot,
};

export const BasicLandSlots: { [set: string]: BasicLandSlot } = {};
for (const set in BasicLandIDs) BasicLandSlots[set] = new BasicLandSlot(set);
