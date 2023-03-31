import { DraftLog, DraftPick } from "@/DraftLog";
import { UserID } from "@/IDTypes";
import { SortableEvent } from "sortablejs";

export function clone(obj: Object) {
	return JSON.parse(JSON.stringify(obj));
}

export function isEmpty(obj: Object) {
	for (var key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) return false;
	}
	return true;
}

export function arrayRemove<T>(arr: Array<T>, value: T) {
	return arr.filter((el) => el != value);
}

export function randomStr4() {
	return Math.floor((1 + Math.random()) * 0x10000)
		.toString(16)
		.substring(1);
}
const s4 = randomStr4; // Local alias

export function guid() {
	return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
}

export function shortguid() {
	return s4() + s4() + s4();
}

export function getUrlVars() {
	const vars: { [key: string]: string } = {};
	window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, (m, key: string, value: string) => {
		return (vars[key] = value);
	});
	return vars;
}

// https://hackernoon.com/copying-text-to-clipboard-with-javascript-df4d4988697f
export const copyToClipboard = (str: string) => {
	const el = document.createElement("textarea"); // Create a <textarea> element
	el.value = str; // Set its value to the string that you want copied
	el.setAttribute("readonly", ""); // Make it readonly to be tamper-proof
	el.style.position = "absolute";
	el.style.left = "-9999px"; // Move outside the screen to make it invisible
	document.body.appendChild(el); // Append the <textarea> element to the HTML document
	const selected =
		(document.getSelection()?.rangeCount as number) > 0 // Check if there is any content selected previously
			? document.getSelection()?.getRangeAt(0) // Store selection if found
			: false; // Mark as false to know no selection existed before
	el.select(); // Select the <textarea> content
	document.execCommand("copy"); // Copy - only works as a result of a user action (e.g. click events)
	document.body.removeChild(el); // Remove the <textarea> element
	if (selected) {
		// If a selection existed before copying
		document.getSelection()?.removeAllRanges(); // Unselect everything on the HTML document
		document.getSelection()?.addRange(selected); // Restore the original selection
	}
};

export function exportToMagicProTools(draftLog: DraftLog, userID: UserID) {
	let str = "";
	str += `Event #: ${draftLog.sessionID}_${draftLog.time}\n`;
	str += `Time: ${new Date(draftLog.time).toUTCString()}\n`;
	str += `Players:\n`;
	for (let c in draftLog.users) {
		if (c == userID) str += `--> ${draftLog.users[c].userName}\n`;
		else str += `    ${draftLog.users[c].userName}\n`;
	}

	str += "\n";

	let boosterNumber = 0;
	let pickNumber = 1;
	let lastLength = 0;
	for (let p of draftLog.users[userID].picks) {
		const dp = p as DraftPick;
		if (dp.booster.length > lastLength) {
			boosterNumber += 1;
			pickNumber = 1;
			if (draftLog.setRestriction && draftLog.setRestriction.length === 1)
				str += `------ ${draftLog.setRestriction[0].toUpperCase()} ------\n\n`;
			else str += `------ THB ------\n\n`;
		}
		lastLength = dp.booster.length;
		str += `Pack ${boosterNumber} pick ${pickNumber}:\n`;
		for (let [idx, cid] of dp.booster.entries())
			if (dp.pick.includes(idx)) str += `--> ${draftLog.carddata[cid].name}\n`;
			else str += `    ${draftLog.carddata[cid].name}\n`;
		str += "\n";
		pickNumber += 1;
	}

	return str;
}

export function download(filename: string, text: string) {
	var element = document.createElement("a");
	element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
	element.setAttribute("download", filename);

	element.style.display = "none";
	document.body.appendChild(element);

	element.click();

	document.body.removeChild(element);
}

export function escapeHTML(str: string) {
	return str
		?.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function sortableUpdate<T>(e: SortableEvent, arr: T[]) {
	const el = arr.splice(e.oldIndex!, 1)[0];
	arr.splice(Math.min(e.newIndex!, arr.length), 0, el);
}
