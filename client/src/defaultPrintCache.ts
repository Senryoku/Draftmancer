import axios from "axios";
import { MaxCardsPerRequest, ScryfallCard } from "./Scryfall";
import { ref } from "vue";
import { Card, CardID } from "@/CardTypes";

export type DefaultPrint = { id: CardID; image: string; backImage?: string } | null;

type DefaultPrintIdentifier = { name: string; set: string };

const defaultPrints = ref<Record<string, DefaultPrint>>({});
const queuedDefaultPrints = new Map<string, DefaultPrintIdentifier>();
const requestedDefaultPrintKeys = new Set<string>();
let defaultPrintsFlushScheduled = false;

export const getDefaultPrint = (card: Card): DefaultPrint | undefined => {
	const identifier = { name: frontFaceName(card.name), set: card.set };
	const key = defaultPrintKey(identifier);
	if (!(key in defaultPrints.value)) {
		queueDefaultPrint(key, identifier);
	}
	return defaultPrints.value[key];
};

const queueDefaultPrint = (key: string, identifier: DefaultPrintIdentifier) => {
	if (requestedDefaultPrintKeys.has(key)) {
		return;
	}
	requestedDefaultPrintKeys.add(key);
	queuedDefaultPrints.set(key, identifier);
	if (!defaultPrintsFlushScheduled) {
		defaultPrintsFlushScheduled = true;
		setTimeout(flushQueuedDefaultPrints, 50);
	}
};

const flushQueuedDefaultPrints = async () => {
	const delayBetweenRequests = 500;
	while (queuedDefaultPrints.size > 0) {
		const batch = [...queuedDefaultPrints.values()].slice(0, MaxCardsPerRequest);
		for (const identifier of batch) {
			queuedDefaultPrints.delete(defaultPrintKey(identifier));
		}
		await requestDefaultPrints(batch);
		if (queuedDefaultPrints.size > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayBetweenRequests));
		}
	}
	defaultPrintsFlushScheduled = false;
};

const requestDefaultPrints = async (identifiers: DefaultPrintIdentifier[]) => {
	try {
		const response = await axios.post(
			`https://api.scryfall.com/cards/collection`,
			{ identifiers },
			{ timeout: 10000 }
		);
		for (const card of response.data.data as ScryfallCard[]) {
			const key = defaultPrintKey({ name: frontFaceName(card.name), set: card.set });
			defaultPrints.value[key] = toDefaultPrint(card);
		}
		for (const identifier of response.data.not_found as DefaultPrintIdentifier[]) {
			defaultPrints.value[defaultPrintKey(identifier)] = null;
		}
	} catch (error) {
		console.error("Error fetching default prints:", error);
		for (const identifier of identifiers) {
			requestedDefaultPrintKeys.delete(defaultPrintKey(identifier));
		}
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
