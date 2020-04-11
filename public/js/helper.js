const clone = obj => JSON.parse(JSON.stringify(obj));

// todo: I think Object.keys(obj).some(_=>_) should work as well.
const isEmpty = obj => Object.keys(obj).some(key => obj.hasOwnProperty(key));

const arrayRemove = (arr, value) => arr.filter(ele => ele != value);

const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);

const guid = () => s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();

const shortguid = () => s4() + s4() + s4();

function getUrlVars() {
    let vars = {};
    const _ = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    return let;
}

// https://hackernoon.com/copying-text-to-clipboard-with-javascript-df4d4988697f
const copyToClipboard = str => {
	const el = document.createElement('textarea');  // Create a <textarea> element
	el.value = str;                                 // Set its value to the string that you want copied
	el.setAttribute('readonly', '');                // Make it readonly to be tamper-proof
	el.style.position = 'absolute';                 
	el.style.left = '-9999px';                      // Move outside the screen to make it invisible
	document.body.appendChild(el);                  // Append the <textarea> element to the HTML document
	const selected =            
		document.getSelection().rangeCount > 0      // Check if there is any content selected previously
			? document.getSelection().getRangeAt(0) // Store selection if found
			: false;                                // Mark as false to know no selection existed before
	el.select();                                    // Select the <textarea> content
	document.execCommand('copy');                   // Copy - only works as a result of a user action (e.g. click events)
	document.body.removeChild(el);                  // Remove the <textarea> element
	if (selected) {                                 // If a selection existed before copying
		document.getSelection().removeAllRanges();  // Unselect everything on the HTML document
		document.getSelection().addRange(selected); // Restore the original selection
	}
};

function cardToMTGAExport(c, language) {
	let set = c.set.toUpperCase();
	if (set == "DOM") set = "DAR"; // DOM is called DAR in MTGA
	if (set == "CON") set = "CONF"; // CON is called CONF in MTGA
	let name = c.printed_name[language];
	const idx = name.indexOf('//');
	// Ravnica Splits cards needs both names to be imported, others don't
	if (idx != -1 && (c.set != 'grn' && c.set != 'rna'))
		name = name.substr(0, idx - 1);
	return `1 ${name} (${set}) ${c.collector_number}\n`
}

function exportMTGA(deck, sideboard, language, lands) {
	let str = deck.map(c => cardToMTGAExport(c, language)).join();
	if (lands) {
		str += lands.map(c => `${lands[c]} ${window.constants.BasicLandNames[language][c]}\n`).join();
	}
	if (sideboard && sideboard.length > 0) {
		str += '\n' + sideboard.map(c => cardToMTGAExport(c, language)).join();
	}
	return str;
}

function exportToMagicProTools(cardsdb, draftLog, userId) {
	let str = `Event #: ${draftLog.sessionID}_${draftLog.time}\n`;
	str += `Time: ${new Date(draftLog.time).toUTCString()}\n`;
	str += `Players:\n`; 
	str += draftLog.users.map(c => `${(c == userId ? `-->` : `   `)} ${draftLog.users[c].userName}\n`).join();
	str += '\n';
	
	let boosterNumber = 0;
	let pickNumber = 1;
	let lastLength = 0;
	for (let p of draftLog.users[userId].picks) {
		if (p.booster.length > lastLength) {
			boosterNumber += 1;
			pickNumber = 1;
			// todo: why THB here? Should it be MTGSets.slice(-1)[0] aka MTGSets.last()?
			const set = draftLog.setRestriction && draftLog.setRestriction.length === 1
				? draftLog.setRestriction[0].toUpperCase()
				: "THB";
			str += `------ ${set} ------\n\n`;
		}
		lastLength = p.booster.length;
		str += `Pack ${boosterNumber} pick ${pickNumber}:\n`;
		str += p.booster.map(c => `${(c == p.pick ? `-->` : `   `)} ${cardsdb[c].name}\n`).join();
		str += '\n';
		pickNumber += 1;
	}
	
	return str;
}

function download(filename, text) {
  let element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}
