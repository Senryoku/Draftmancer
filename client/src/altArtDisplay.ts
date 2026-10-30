import { ref } from "vue";
import { Card } from "@/CardTypes";
import { getDefaultPrint } from "./vueCardCache";

type ImageURIs = Card["image_uris"];

export const replaceAltArts = ref(false);

export const displayedFrontImageURIs = (card: Card): ImageURIs => {
	const defaultPrint = defaultPrintToDisplay(card);
	if (!defaultPrint) {
		return card.image_uris;
	}
	return { en: defaultPrint.image };
};

export const displayedBackImageURIs = (card: Card): ImageURIs | undefined => {
	const defaultPrint = defaultPrintToDisplay(card);
	if (!defaultPrint?.backImage) {
		return card.back?.image_uris;
	}
	return { en: defaultPrint.backImage };
};

const defaultPrintToDisplay = (card: Card) => {
	if (!replaceAltArts.value || card.is_custom) {
		return undefined;
	}
	const defaultPrint = getDefaultPrint(card);
	if (!defaultPrint || defaultPrint.id === card.id) {
		return undefined;
	}
	return defaultPrint;
};
