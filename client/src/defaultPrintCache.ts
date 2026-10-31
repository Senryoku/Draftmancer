import axios from "axios";
import { MaxCardsPerRequest, ScryfallCard } from "./Scryfall";
import { ref } from "vue";
import { Card, CardID } from "@/CardTypes";
import { wait } from "./helper";

export type DefaultPrint = { id: CardID; image: string; backImage?: string } | null; // Here `null` means it was requested but Scryfall returned 'not found'.

type DefaultPrintIdentifier = { name: string; set: string };

const defaultPrints = ref<Map<string, DefaultPrint>>(new Map<string, DefaultPrint>());
const queuedDefaultPrints = new Map<string, DefaultPrintIdentifier>();
let defaultPrintsFlushTimeout: ReturnType<typeof setTimeout> | null = null;

export const getDefaultPrint = (card: Card): DefaultPrint | undefined => {
	const identifier = { name: frontFaceName(card.name), set: card.set };
	queueDefaultPrint(identifier);
	return defaultPrints.value.get(defaultPrintKey(identifier));
};

const queueDefaultPrint = (identifier: DefaultPrintIdentifier) => {
	const key = defaultPrintKey(identifier);
	if (defaultPrints.value.has(key) || queuedDefaultPrints.has(key)) {
		return;
	}
	queuedDefaultPrints.set(key, identifier);
	if (!defaultPrintsFlushTimeout) {
		defaultPrintsFlushTimeout = setTimeout(flushQueuedDefaultPrints, 100);
	}
};

const flushQueuedDefaultPrints = async () => {
	const DelayBetweenRequests = 500;
	while (queuedDefaultPrints.size > 0) {
		const batch = [...queuedDefaultPrints.entries()].slice(0, MaxCardsPerRequest);
		for (const key of batch.map((e) => e[0])) {
			queuedDefaultPrints.delete(key);
		}
		await requestDefaultPrints(batch.map((e) => e[1]));
		if (queuedDefaultPrints.size > 0) {
			await wait(DelayBetweenRequests);
		}
	}
	defaultPrintsFlushTimeout = null;
};

const requestDefaultPrints = async (identifiers: DefaultPrintIdentifier[]) => {
	try {
		const response = await axios.post(
			`https://api.scryfall.com/cards/collection`,
			{ identifiers },
			{ timeout: 10000 }
		);
		for (const card of response.data.data as ScryfallCard[]) {
			defaultPrints.value.set(
				defaultPrintKey({ name: frontFaceName(card.name), set: card.set }),
				toDefaultPrint(card)
			);
		}
		for (const identifier of response.data.not_found as DefaultPrintIdentifier[]) {
			defaultPrints.value.set(defaultPrintKey(identifier), null);
		}
	} catch (error) {
		console.error("Error fetching default prints:", error);
	}
};

const toDefaultPrint = (card: ScryfallCard): DefaultPrint => {
	const image = card.image_uris?.crop ?? card.card_faces?.[0]?.image_uris?.crop;
	if (!image) {
		return null;
	}
	return { id: card.id, image, backImage: card.card_faces?.[1]?.image_uris?.crop };
};

const defaultPrintKey = (identifier: DefaultPrintIdentifier) => `${identifier.set}:${identifier.name}`.toLowerCase();

const frontFaceName = (name: string) => name.split(" //")[0];
