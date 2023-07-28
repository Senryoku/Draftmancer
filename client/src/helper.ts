import { DeprecatedDraftPick, DraftLog, DraftPick } from "@/DraftLog";
import { UserID } from "@/IDTypes";
import { SortableEvent } from "sortablejs";

export function clone(obj: object) {
	return JSON.parse(JSON.stringify(obj));
}

export function isEmpty(obj: object) {
	for (const key in obj) {
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

export function groupPicksPerPack(picks: DraftPick[]) {
	const r: DraftPick[][] = [];
	let lastPackNum = -1;
	for (const p of picks) {
		if (p.packNum !== lastPackNum) {
			lastPackNum = p.packNum;
			r.push([]);
		}
		r[r.length - 1].push(p);
	}
	return r;
}

export function exportToMagicProTools(draftLog: DraftLog, userID: UserID) {
	let str = "";
	str += `Event #: ${draftLog.sessionID}_${draftLog.time}\n`;
	str += `Time: ${new Date(draftLog.time).toUTCString()}\n`;
	str += `Players:\n`;
	for (const c in draftLog.users) {
		if (c == userID) str += `--> ${draftLog.users[c].userName}\n`;
		else str += `    ${draftLog.users[c].userName}\n`;
	}

	str += "\n";

	const boosterHeader =
		draftLog.setRestriction && draftLog.setRestriction.length === 1
			? `------ ${draftLog.setRestriction[0].toUpperCase()} ------\n\n`
			: `------ THB ------\n\n`;

	if (draftLog.version === "2.0") {
		let boosterNumber = 0;
		let pickNumber = 1;
		let lastLength = 0;
		for (const p of draftLog.users[userID].picks) {
			const dp = p as DeprecatedDraftPick;
			if (dp.booster.length > lastLength) {
				boosterNumber += 1;
				pickNumber = 1;
				str += boosterHeader;
			}
			lastLength = dp.booster.length;
			str += `Pack ${boosterNumber} pick ${pickNumber}:\n`;
			for (const [idx, cid] of dp.booster.entries())
				if (dp.pick.includes(idx)) str += `--> ${draftLog.carddata[cid].name}\n`;
				else str += `    ${draftLog.carddata[cid].name}\n`;
			str += "\n";
			pickNumber += 1;
		}
	} else {
		// >= v2.1
		const r = groupPicksPerPack(draftLog.users[userID].picks as DraftPick[]);
		for (const pack of r) {
			str += boosterHeader;
			for (const pick of pack) {
				str += `Pack ${pick.packNum + 1} pick ${pick.pickNum + 1}:\n`;
				for (const [idx, cid] of pick.booster.entries())
					if (pick.pick.includes(idx)) str += `--> ${draftLog.carddata[cid].name}\n`;
					else str += `    ${draftLog.carddata[cid].name}\n`;
				str += "\n";
			}
		}
	}

	return str;
}

export function download(filename: string, text: string) {
	const element = document.createElement("a");
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
	const entries = [];
	if (e.oldIndicies.length > 0) {
		for (let i = 0; i < e.oldIndicies.length; ++i)
			entries.push({
				item: arr[e.oldIndicies[i].index],
				oldIndex: e.oldIndicies[i].index,
				newIndex: e.newIndicies[i].index,
			});
	} else entries.push({ item: arr[e.oldIndex!], oldIndex: e.oldIndex!, newIndex: e.newIndex! });

	entries.sort((l, r) => r.oldIndex - l.oldIndex);
	for (const { oldIndex } of entries) arr.splice(oldIndex, 1)[0];
	entries.sort((l, r) => l.newIndex - r.newIndex);
	for (const { item, newIndex } of entries) arr.splice(Math.min(newIndex, arr.length), 0, item);
}

export function checkOverflow(el: HTMLElement) {
	const curOverflow = el.style.overflow;
	if (!curOverflow || curOverflow === "visible") el.style.overflow = "hidden";
	const isOverflowing = el.clientWidth < el.scrollWidth || el.clientHeight < el.scrollHeight;
	el.style.overflow = curOverflow;
	return isOverflowing;
}

export function fitFontSize(
	target: HTMLElement,
	container: HTMLElement | undefined = undefined,
	initial_size = 1,
	unit = "em"
) {
	if (!container) container = target;
	target.classList.add("fitting");
	let curr_font_size = initial_size;
	target.style.fontSize = curr_font_size + unit;
	while (checkOverflow(container) && curr_font_size > 0.1) {
		curr_font_size *= 0.9;
		target.style.fontSize = curr_font_size + unit;
	}
	target.classList.remove("fitting");
}
