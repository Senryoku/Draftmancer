function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function arrayRemove(arr, value) {
	return arr.filter(function(ele) {
	   return ele != value;
	});
}

function guid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
		  .toString(16)
		  .substring(1);
	}
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function shortguid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
		  .toString(16)
		  .substring(1);
	}
	return s4() + s4() + s4();
}

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    return vars;
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
	if(set == "DOM") set = "DAR"; // DOM is called DAR in MTGA
	if(set == "CON") set = "CONF"; // CON is called CONF in MTGA
	let name = c.printed_name[language];
	let idx = name.indexOf('//');
	// Ravnica Splits cards needs both names to be imported, others don't
	if(idx != -1 && (c.set != 'grn' && c.set != 'rna'))
		name = name.substr(0, idx - 1);
	return `1 ${name} (${set}) ${c.collector_number}\n`
}

function exportMTGA(deck, sideboard, language, lands) {
	let str = "";
	for(let c of deck)
		str += cardToMTGAExport(c, language);
	if(lands) {
		for(let c in lands)
			str += `${lands[c]} ${window.constants.BasicLandNames[language][c]}\n`;
	}
	if(sideboard && sideboard.length > 0) {
		str += '\n';
		for(let c of sideboard)
			str += cardToMTGAExport(c, language);
	}
	return str;
}

function exportToMagicProTools(cardsdb, draftLog, userID) {
	let str = "";
	str += `Event #: ${draftLog.sessionID}_${draftLog.time}\n`;
	str += `Time: ${new Date(draftLog.time).toUTCString()}\n`;
	str += `Players:\n`; 
	for(let c in draftLog.users) {
		if(c == userID)
			str += `--> ${draftLog.users[c].userName}\n`;
		else
			str += `    ${draftLog.users[c].userName}\n`;
	}
	
	str += '\n';
	
	let boosterNumber = 0;
	let pickNumber = 1;
	let lastLength = 0;
	for(let p of draftLog.users[userID].picks) {
		if(p.booster.length > lastLength) {
			boosterNumber += 1;
			pickNumber = 1;
			if(draftLog.setRestriction && draftLog.setRestriction.length === 1)
				str += `------ ${draftLog.setRestriction[0].toUpperCase()} ------\n\n`;
			else 
				str += `------ THB ------\n\n`;
		}
		lastLength = p.booster.length;
		str += `Pack ${boosterNumber} pick ${pickNumber}:\n`;
		for(let c of p.booster)
			if(c == p.pick)
				str += `--> ${cardsdb[c].name}\n`;
			else
				str += `    ${cardsdb[c].name}\n`;
		str += '\n';
		pickNumber += 1;
	}
	
	return str;
}

function download(filename, text) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}
