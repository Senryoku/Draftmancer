"use strict";

function getCookie(cname, def = "") {
	var name = cname + "=";
	var decodedCookie = decodeURIComponent(document.cookie);
	var ca = decodedCookie.split(';');
	for(var i = 0; i < ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0) == ' ') {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	console.log(def);
	return def;
}

Vue.component('card', {
	template: `
<figure class="card" :data-arena-id="card.id" :data-cmc="card.border_crop" v-on:click="selectcard($event, card)">
	<img v-if="card.image_uris[language]" :src="card.image_uris[language]"  v-bind:class="{ selected: selected }"/>
	<img v-else src="img/missing.svg">
	<figcaption>{{ card.printed_name[language] }}</figcaption>
</figure>
	`,
	props: ['card', 'language', 'selectcard', 'selected']
});

async function getUserID() {
	return await fetch('/getUserID').then((data) => data.text());
}

async function getSessionID() {
	return await fetch('/getSessionID').then((data) => data.text());
}

var app = new Vue({
	el: '#main-vue',
	data: {
		// Card Data
		cards: undefined,
		
		// User Data
		userID: getCookie("userID", getUserID()),
		userName: getCookie("userName", "Anonymous"),
		collection: {},
		socket: undefined,
		
		// Session status
		sessionID: getCookie("sessionID", getSessionID()),
		sessionUsers: [],
		boostersPerPlayer: 3,
		setRestriction: "",
		readyToDraft: false,
		drafting: false,
		booster: [],
		
		// Front-end options & data
		language: 'en',
		languages: [
			{code: 'en',  name: 'English'},
			{code: 'es',  name: 'Spanish'},
			{code: 'fr',  name: 'French'},
			{code: 'de',  name: 'German'},
			{code: 'it',  name: 'Italian'},
			{code: 'pt',  name: 'Portuguese'},
			{code: 'ja',  name: 'Japanese'},
			{code: 'ko',  name: 'Korean'},
			{code: 'ru',  name: 'Russian'},
			{code: 'zhs', name: 'Simplified Chinese'},
			{code: 'zht', name: 'Traditional Chinese'}
		],
		sets: ["m19", "xln", "rix", "dom", "grn", "rna", "war"],
		boosterIndex: undefined,
		draftingState: undefined,
		selectedCardId: undefined,
		cardSelection: [],
		deck: []
	},
	methods: {
		selectCard: function(e, c) {
			this.selectedCardId = c.id;
		},
		pickCard: function() {
			this.draftingState = "waiting";
			this.socket.emit('pickCard', this.sessionID, this.boosterIndex, this.selectedCardId);
			this.cardSelection.push(this.cards[this.selectedCardId]);
			this.selectedCardId = undefined;
		},
		addToDeck: function(e, c) {
			if(this.draftingState != "brewing")
				return;
			for(let i = 0; i < this.cardSelection.length; ++i) {
				if(this.cardSelection[i] == c) {
					this.cardSelection.splice(i, 1);
					break;
				}
			}
			this.deck.push(c);
		},
		removeFromDeck: function(e, c) {
			if(this.draftingState != "brewing")
				return;
			for(let i = 0; i < this.deck.length; ++i) {
				if(this.deck[i] == c) {
					this.deck.splice(i, 1);
					break;
				}
			}
			this.cardSelection.push(c);
		},
		setCollection: function(json) {
			this.collection = json;
			this.socket.emit('setCollection', this.collection);
		},
		parseMTGALog: function(e) {
			let file = e.target.files[0];
			if (!file) {
				return;
			}
			var reader = new FileReader();
			reader.onload = function(e) {
				let contents = e.target.result;
				let call_idx = contents.lastIndexOf("PlayerInventory.GetPlayerCardsV3");
				let collection_start = contents.indexOf('{', call_idx);
				let collection_end = contents.indexOf('}', collection_start);
				
				try {
					let collStr = contents.slice(collection_start, collection_end + 1);
					localStorage.setItem("Collection", collStr);
					localStorage.setItem("CollectionDate", new Date().toLocaleDateString());
					app.setCollection(JSON.parse(collStr));
					alert("Ok");
				} catch(e) {
					alert(e);
				}		
			};
			reader.readAsText(file);
		},
		exportDeck: function() {
			copyToClipboard(exportMTGA(this.deck, this.language));
			alert('Deck exported to clipboard!');
		}
	},
	computed: {
		hasCollection: function() {
			return !isEmpty(this.collection);
		},
		deckCMC: function() {
			let a = this.deck.reduce((acc, item) => {
			  if (!acc[item.cmc])
				acc[item.cmc] = [];
			  acc[item.cmc].push(item);
			  return acc;
			}, {});
			return a;
		},
	},
	mounted: async function() {		
		// Socket Setup
		this.socket = io({query: {
			userID: this.userID, 
			sessionID: this.sessionID,
			userName: this.userName
		}});
		
		this.socket.on('reconnect', (attemptNumber) => {
			this.socket.emit('setCollection', app.collection);
		});
		
		this.socket.on('alreadyConnected', function(data) {
			alert("You seem to already be connected on another window.");
			throw new Error("You seem to already be connected on another window.");
		});
		
		this.socket.on('signalPick', function(data) {
			for(let u of app.sessionUsers) {
				if(u.userID == data) {
					u.pickedCard = true;
					break;
				}
			}
		});
		
		this.socket.on('sessionUsers', function(data) {
			let users = JSON.parse(data);
			for(let u of users) {
				u.pickedCard = false;
			}
			app.sessionUsers = users;
		});
		
		this.socket.on('boostersPerPlayer', function(data) {
			app.boostersPerPlayer = parseInt(data);
		});
		
		this.socket.on('setRestriction', function(data) {
			app.setRestriction = data;
		});
		
		this.socket.on('startDraft', function(data) {
			app.drafting = true;
			app.cardSelection = [];
			alert('Everybody is ready!');
		});
		
		this.socket.on('nextBooster', function(data) {
			app.boosterIndex = data.boosterIndex;
			app.booster = [];
			for(let c of data.booster) {
				app.booster.push({
					id: c, 
					name: app.cards[c].name, 
					printed_name: app.cards[c].printed_name, 
					image_uris: app.cards[c].image_uris, 
					set: app.cards[c].set, 
					cmc: app.cards[c].cmc, 
					collector_number: app.cards[c].collector_number, 
					colors: app.cards[c].color_identity, 
					in_booster: app.cards[c].in_booster
				});
			}
			for(let u of app.sessionUsers) {
				u.pickedCard = false;
			}
			app.draftingState = "picking";
		});
		
		this.socket.on('endDraft', function(data) {
			alert('Done drafting!');
			app.draftingState = 'brewing';
		});
		
		// Look for a localy stored collection
		let localStorageCollection = localStorage.getItem("Collection");
		if(localStorageCollection) {
			try {
				let json = JSON.parse(localStorageCollection);
				this.setCollection(json);
				console.log("Loaded collection from local storage");
			} catch(e) {
				console.error(e);
			}
		}
		
		// Load all card informations
		fetch("data/MTGACards.json").then(function (response) {
			response.text().then(function (text) {
				try {
					app.cards = JSON.parse(text);
					for(let c in app.cards) {
						if(!('in_booster' in app.cards[c]))
							app.cards[c].in_booster = true;
						for(let l of app.languages) {
							if(!(l.code in app.cards[c]['printed_name']))
								app.cards[c]['printed_name'][l.code] = app.cards[c]['name'];
							if(!(l.code in app.cards[c]['image_uris']))
								app.cards[c]['image_uris'][l.code] = app.cards[c]['image_uris']['en'];
						}
					}
				} catch(e) {
					alert(e);
				}
			});
		});
	},
	watch: {
		sessionID: function() {
			fetch('/setSession/'+this.sessionID);
		},
		userName: function() {
			fetch('/setUserName/'+this.userName);
		},
		readyToDraft: function() {
			this.socket.emit('readyToDraft', this.readyToDraft);
		},
		boostersPerPlayer: function() {
			this.socket.emit('boostersPerPlayer', this.boostersPerPlayer);
		},
		setRestriction: function() {
			this.socket.emit('setRestriction', this.setRestriction);
		}
	}
});
