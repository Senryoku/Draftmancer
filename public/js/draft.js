"use strict";

const ColorOrder = {'W':0, 'U':1, 'B':2, 'R':3, 'G':4};
function orderColor(lhs, rhs) {
	if(!lhs || !rhs)
		return 0;
	if(lhs.length == 1 && rhs.length == 1)
		return ColorOrder[lhs[0]] - ColorOrder[rhs[0]];
	else if(lhs.length == 1)
		return -1;
	else if(rhs.length == 1)
		return 1;
	else
		return String(lhs.flat()).localeCompare(String(rhs.flat()));
}


function getCookie(cname, def = "") {
	let name = cname + "=";
	let decodedCookie = decodeURIComponent(document.cookie);
	let ca = decodedCookie.split(';');
	for(let i = 0; i < ca.length; i++) {
		let c = ca[i];
		while (c.charAt(0) == ' ') {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return def;
}

function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days*24*60*60*1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}

function eraseCookie(name) {   
    document.cookie = name+'=; Max-Age=-99999999;';  
}

Vue.component('modal', {
  template: '#modal-template'
})

Vue.component('card', {
	template: `
<figure class="card" :data-arena-id="card.id" :data-cmc="card.border_crop" v-on:click="selectcard($event, card)">
	<img v-if="card.image_uris[language]" :src="card.image_uris[language]" :title="card.printed_name[language]" v-bind:class="{ selected: selected }"/>
	<img v-else src="img/missing.svg">
	<!--<figcaption>{{ card.printed_name[language] }}</figcaption>-->
</figure>
	`,
	props: ['card', 'language', 'selectcard', 'selected']
});

Vue.component('missingCard', {
	template: `
<figure class="card">
	<img v-if="card.image_uris[language]" :src="card.image_uris[language]" :title="card.printed_name[language]" />
	<img v-else src="img/missing.svg">
	<div class="not-booster" v-if="!card.in_booster">Can't be obtained in boosters.</div>
	<div class="card-count" v-if="card.count < 4">x{{4 - card.count}}</div>
</figure>
	`,
	props: ['card', 'language']
});

var app = new Vue({
	el: '#main-vue',
	data: {
		// Card Data
		cards: undefined,
		
		// User Data
		userID: guid(),
		userName: getCookie("userName", "Anonymous"),
		useCollection: true,
		collection: {},
		socket: undefined,
		
		// Session status
		sessionID: getCookie("sessionID", shortguid()),
		sessionOwner: null,
		isPublic: false,
		sessionUsers: [],
		boostersPerPlayer: 3,
		bots: 0,
		setRestriction: "",
		readyToDraft: false,
		drafting: false,
		booster: [],
		maxTimer: 60,
		pickTimer: 60,
		
		sealedBoosterPerPlayer: 6,
		
		publicSessions: [],
		selectedPublicSession: "",
		
		// Front-end options & data
		hideSessionID: false,
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
		cardOrder: "",
		sets: ["m19", "xln", "rix", "dom", "grn", "rna", "war", "m20", "eld", "thb"],
		setsInfos: undefined,
		boosterIndex: undefined,
		draftingState: undefined,
		selectedCardId: undefined,
		cardSelection: [],
		deck: [],
		
		showCollectionStats: false,
		statsMissingRarity: "rare",
		statsShowNonBooster: false,
		statsSelectedSet: "thb",
		
		// Chat
		currentChatMessage: "",
		displayChatHistory: false,
		messagesHistory: []
	},
	methods: {
		initialize: function() {
			let storedUserID = getCookie("userID", null);
			if(storedUserID != null) {
				this.userID = storedUserID;
				// Server will handle the reconnect attempt if draft is still ongoing
				console.log("storedUserID: " + storedUserID);
			}
			
			// Socket Setup
			this.socket = io({query: {
				userID: this.userID, 
				sessionID: this.sessionID,
				userName: this.userName
			}});

			this.socket.on('disconnect', function() {
				console.log('Disconnected from server.');
				Swal.fire({
					customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
					type: 'error',
					title: 'Disconnected!',
					showConfirmButton: false
				});
			});
			
			this.socket.on('reconnect', function(attemptNumber) {
				console.log(`Reconnected to server (attempt ${attemptNumber}).`);
				app.socket.emit('setCollection', app.collection);
				// TODO: Could this be avoided?
				app.socket.emit('setSession', app.sessionID);
				app.socket.emit('setName', app.userName);
				
				Swal.fire({
					customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
					type: 'warning',
					title: 'Reconnected!',
					timer: 1500
				});
			});
			
			this.socket.on('alreadyConnected', function(newID) {
				app.userID = newID;
			});

			this.socket.on('publicSessions', function(sessions) {
				app.publicSessions = sessions;
			});
			
			this.socket.on('setSession', function(data) {
				app.sessionID = data;
			});
			
			this.socket.on('signalPick', function(data) {
				for(let u of app.sessionUsers) {
					if(u.userID == data) {
						u.pickedThisRound = true;
						break;
					}
				}
			});
			
			this.socket.on('sessionUsers', function(data) {
				let users = data;
				for(let u of users) {
					u.pickedThisRound = false;
				}
				
				if(app.drafting && users.length < app.sessionUsers.length) {
					if(app.userID == app.sessionOwner) {
						Swal.fire({
							position: 'center',
							customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
							type: 'error',
							title: 'A user disconnected, wait for them, or...',
							showConfirmButton: true,
							confirmButtonText: "Replace with a bot"
						}).then((result) => {
							if (result.value)
								app.socket.emit("replaceDisconnectedPlayers");
						});
					} else {
						Swal.fire({
							position: 'center',
							customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
							type: 'error',
							title: 'A user disconnected, wait for them or for the owner to replace them.',
							showConfirmButton: false
						});
					}
				}
				
				app.sessionUsers = users;
			});
			
			this.socket.on('sessionOwner', function(ownerID) {
				// TODO: Validate OwnerID?
				app.sessionOwner = ownerID;
			});
			
			this.socket.on('isPublic', function(data) {
				app.isPublic = data;
			});
			
			this.socket.on('chatMessage', function(message) {
				app.messagesHistory.push(message);
				// TODO: Cleanup this?
				let bubble = document.querySelector('#chat-bubble-' + message.author);
				bubble.innerText = message.text;
				bubble.style.opacity = 1;
				if(bubble.timeoutHandler)
					clearTimeout(bubble.timeoutHandler);
				bubble.timeoutHandler = window.setTimeout(() => bubble.style.opacity = 0, 5000);
			});
			
			this.socket.on('boostersPerPlayer', function(data) {
				app.boostersPerPlayer = parseInt(data);
			});
			
			this.socket.on('bots', function(data) {
				app.bots = parseInt(data);
			});
			
			this.socket.on('setRestriction', function(data) {
				app.setRestriction = data;
			});
			
			this.socket.on('message', function(data) {
				if(data.title === undefined)
					data.title = "[Missing Title]";
				if(data.text === undefined)
					data.text = "[Missing Text]";
				
				if(data.showConfirmButton === undefined)
					data.showConfirmButton = true;
				else if(!data.showConfirmButton && data.timer === undefined)
					data.timer = 1500;
				
				Swal.fire({
					position: 'center',
					type: 'info',
					title: data.title,
					text: data.text,
					customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
					showConfirmButton: data.showConfirmButton,
					timer: data.timer
				});
			});
			
			this.socket.on('startDraft', function(data) {
				// Save user ID in case of disconnect
				setCookie("userID", app.userID);
			
				app.drafting = true;
				app.readyToDraft = false;
				app.cardSelection = [];
				Swal.fire({
					position: 'center',
					type: 'success',
					title: 'Now drafting!',
					customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
					showConfirmButton: false,
					timer: 1500
				});
			});
			
			this.socket.on('rejoinDraft', function(data) {
				app.drafting = true;
				app.readyToDraft = false;
				
				app.cardSelection = [];
				for(let c of data.pickedCards)
					app.cardSelection.push(app.cards[c]);
				
				app.boosterIndex = data.boosterIndex;
				app.booster = [];
				for(let c of data.booster) {
					app.booster.push(app.genCard(c));
				}
				
				app.pickedThisRound = data.pickedThisRound;
				if(app.pickedThisRound)
					app.draftingState = "waiting";
				else
					app.draftingState = "picking";
				app.selectedCardId = undefined;
				
				Swal.fire({
					position: 'center',
					type: 'success',
					title: 'Reconnected to the draft!',
					customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
					showConfirmButton: false,
					timer: 1500
				});
			});
			
			this.socket.on('sessionOwner', function(ownerID) {
				// TODO: Validate OwnerID?
				app.sessionOwner = ownerID;
			});
			
			this.socket.on('nextBooster', function(data) {
				app.boosterIndex = data.boosterIndex;
				app.booster = [];
				for(let c of data.booster) {
					app.booster.push(app.genCard(c));
				}
				for(let u of app.sessionUsers) {
					u.pickedThisRound = false;
				}
				app.draftingState = "picking";
			});
			
			this.socket.on('endDraft', function(data) {
				Swal.fire({
					position: 'center',
					type: 'success',
					title: 'Drafting done!',
					showConfirmButton: false,
					customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
					timer: 1500
				});
				app.drafting = false;
				app.draftingState = 'brewing';
				eraseCookie("userID");
			});
			
			this.socket.on('setCardSelection', function(data) {
				app.deck = [];
				app.cardSelection = [];
				for(let c of data.flat()) {
					app.cardSelection.push(app.genCard(c));
				}
				app.draftingState = 'brewing';
				// Hide waiting popup for sealed
				if(Swal.isVisible())
					Swal.close();
			});

			this.socket.on('timer', function (data) {
				if (data.countdown == 0) {
					app.forcePick(app.booster);
					app.socket.emit('reset');
				} else {
					app.pickTimer = data.countdown;
				}

			});
			
			// Look for a locally stored collection
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
		},
		selectCard: function(e, c) {
			this.selectedCardId = c.id;
		},
		// Chat Methods
		sendChatMessage: function(e) {
			if(!this.currentChatMessage || this.currentChatMessage == "")
				return;
			this.socket.emit('chatMessage', {
				'author': this.userID,
				'timestamp': Date.now(),
				'text': this.currentChatMessage
			});
			this.currentChatMessage = "";
		},
		// Draft Methods
		pickCard: function() {
			this.draftingState = "waiting";
			this.socket.emit('pickCard', this.sessionID, this.boosterIndex, this.selectedCardId);
			this.cardSelection.push(this.cards[this.selectedCardId]);
			this.selectedCardId = undefined;
		},
		forcePick: function(booster) {
			this.draftingState = "waiting";
			if (this.selectedCardId) {
				this.socket.emit('pickCard', this.sessionID, this.boosterIndex, this.selectedCardId);
				this.cardSelection.push(this.cards[this.selectedCardId]);
				this.selectedCardId = undefined;
			} else {
				const randomIdx = Math.floor(Math.random() * booster.length)
				const cardId = booster[randomIdx].id;
				this.socket.emit('pickCard', this.sessionID, randomIdx, cardId);
				this.cardSelection.push(this.cards[cardId]);
				this.selectedCardId = undefined;
			}
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
		// Collection management
		setCollection: function(json) {
			if(this.collection == json)
				return;
			this.collection = Object.freeze(json);
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
				let collection_end = contents.indexOf('}}', collection_start) + 2;
				
				try {
					let collStr = contents.slice(collection_start, collection_end);
					let collJson = JSON.parse(collStr)['payload'];
					localStorage.setItem("Collection", JSON.stringify(collJson));
					localStorage.setItem("CollectionDate", new Date().toLocaleDateString());
					app.setCollection(collJson);
					Swal.fire({
						position: 'top-end',
						customClass: 'swal-container',
						type: 'success',
						title: 'Collection updated',
						customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
						showConfirmButton: false,
						timer: 1500
					});
				} catch(e) {
					Swal.fire({
						type: 'error',
						title: 'Parsing Error',
						text: 'An error occurred during parsing. Please make sure that you selected the correct file and that the detailed logs option (found in Options > View Account > Detailed Logs (Plugin Support)) is activated in game.',
						footer: 'Full error: ' + e,
						customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' }
					});
					//alert(e);
				}		
			};
			reader.readAsText(file);
		},
		exportDeck: function() {
			copyToClipboard(exportMTGA(this.deck, this.language));
			Swal.fire({
				toast: true,
				position: 'top-end',
				type: 'success',
				title: 'Deck exported to clipboard!',
				customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
				showConfirmButton: false,
				timer: 1500
			});
		},
		exportSelection: function() {
			copyToClipboard(exportMTGA(this.cardSelection, this.language));
			Swal.fire({
				toast: true,
				position: 'top-end',
				type: 'success',
				title: 'Cards exported to clipboard!',
				customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
				showConfirmButton: false,
				timer: 1500
			});
		},
		distributeSealed: function() {
			if(this.cardSelection.length > 0) {
				Swal.fire({
					title: 'Are you sure?',
					text: "Distributing sealed boosters will reset everyone's cards/deck!",
					type: 'warning',
					showCancelButton: true,
					customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
					confirmButtonColor: '#3085d6',
					cancelButtonColor: '#d33',
					confirmButtonText: "Yes, distribute!",
				}).then((result) => {
					if(result.value) {
						this.doDistributeSealed();
					}
				});
			} else {
				this.doDistributeSealed();
			}
		},
		doDistributeSealed: function() {
			this.socket.emit('distributeSealed', this.sealedBoosterPerPlayer);
		},
		genCard: function(c) {
			if(!(c in this.cards))
				return undefined;
			return {
				id: c, 
				name: this.cards[c].name, 
				printed_name: this.cards[c].printed_name, 
				image_uris: this.cards[c].image_uris, 
				set: this.cards[c].set,
				rarity: this.cards[c].rarity, 
				cmc: this.cards[c].cmc, 
				collector_number: this.cards[c].collector_number, 
				color_identity: this.cards[c].color_identity, 
				in_booster: this.cards[c].in_booster
			};
		},
		joinPublicSession: function() {
			this.sessionID = this.selectedPublicSession;
		}
	},
	computed: {
		collectionStats: function () {
			if(!this.hasCollection || !this.cards || !this.setsInfos) 
				return undefined;
			let stats = [];
			for(let id in this.cards) {
				let card = this.genCard(id);
				if(card && !['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(card['name'])) {
					card.count = this.collection[id] ? this.collection[id] : 0;
					if(!(card.set in stats))
						stats[card.set] = {
							name: card.set, 
							fullName: this.setsInfos[card.set].fullName, 
							cards: [],
							cardCount: 0,
							common : [], uncommon: [], rare: [], mythic: [],
							commonCount: 0, uncommonCount: 0, rareCount: 0, mythicCount: 0,
							total: {
								unique: this.setsInfos[card.set].cardCount,
								commonCount : this.setsInfos[card.set]['commonCount'], 
								uncommonCount: this.setsInfos[card.set]['uncommonCount'], 
								rareCount: this.setsInfos[card.set]['rareCount'], 
								mythicCount: this.setsInfos[card.set]['mythicCount']
							}
						};
					stats[card.set].cards.push(card);
					stats[card.set].cardCount += card.count;
					stats[card.set][card.rarity].push(card);
					stats[card.set][card.rarity + "Count"] += card.count;
				}
			}
			return stats;
		},
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
		selectionCMC: function() {
			return [...this.cardSelection].sort(function (lhs, rhs) {
				if(lhs.cmc == rhs.cmc)
					return orderColor(lhs.color_identity, rhs.color_identity);
				return lhs.cmc - rhs.cmc;
			});
		},
		selectionColor: function() {
			return [...this.cardSelection].sort(function (lhs, rhs) {
				if(orderColor(lhs.color_identity, rhs.color_identity) == 0)
					return lhs.cmc - rhs.cmc;
				return orderColor(lhs.color_identity, rhs.color_identity);
			});
		},
		selectionRarity: function() {
			const order = {'mythic' : 0, 'rare' : 1, 'uncommon': 2, 'common': 3};
			return [...this.cardSelection].sort(function (lhs, rhs) {
				if(order[lhs.rarity] == order[rhs.rarity])
					return lhs.cmc - rhs.cmc;
				return order[lhs.rarity] - order[rhs.rarity];
			});
		},
		userByID: function() {
			let r = {};
			for(let u of this.sessionUsers)
				r[u.userID] = u;
			return r;
		}
	},
	mounted: async function() {		
		// Load all card informations
		fetch("data/MTGACards.json").then(function (response) {
			response.text().then(function (text) {
				try {
					let parsed = JSON.parse(text);
					for(let c in parsed) {
						if(!('in_booster' in parsed[c]))
							parsed[c].in_booster = true;
						for(let l of app.languages) {
							if(!(l.code in parsed[c]['printed_name']))
								parsed[c]['printed_name'][l.code] = parsed[c]['name'];
							if(!(l.code in parsed[c]['image_uris']))
								parsed[c]['image_uris'][l.code] = parsed[c]['image_uris']['en'];
						}
					}
					app.cards = Object.freeze(parsed); // Object.freeze so Vue doesn't make everything reactive.
					
					app.initialize();
				} catch(e) {
					alert(e);
				}
			});
		});
		
		// Load set informations
		fetch("data/SetsInfos.json").then(function (response) {
			response.text().then(function (text) {
				try {
					app.setsInfos = Object.freeze(JSON.parse(text));
				} catch(e) {
					alert(e);
				}
			});
		});
	},
	watch: {
		sessionID: function() {
			this.readyToDraft = false;
			this.socket.emit('setSession', this.sessionID);
			setCookie('sessionID', this.sessionID);
		},
		userName: function() {
			this.socket.emit('setUserName', this.userName);
			setCookie('userName', this.userName);
		},
		readyToDraft: function() {
			if(this.readyToDraft && this.cardSelection.length > 0) {
				Swal.fire({
					title: 'Are you sure?',
					text: "Launching a draft will reset your cards/deck!",
					type: 'warning',
					showCancelButton: true,
					customClass: { popup: 'custom-swal-popup', title: 'custom-swal-title', content: 'custom-swal-content' },
					confirmButtonColor: '#3085d6',
					cancelButtonColor: '#d33',
					confirmButtonText: "I'm ready to draft",
				}).then((result) => {
					if(result.value) {
						this.socket.emit('setPickTimer', this.maxTimer);
						this.socket.emit('readyToDraft', this.readyToDraft);
					} else {
						this.readyToDraft = false;
						return;
					}
				});
			} else {
				this.socket.emit('setPickTimer', this.maxTimer);
				this.socket.emit('readyToDraft', this.readyToDraft);
			}
		},
		boostersPerPlayer: function() {
			this.socket.emit('boostersPerPlayer', this.boostersPerPlayer);
		},
		bots: function() {
			this.socket.emit('bots', this.bots);
		},
		useCollection: function() {
			this.socket.emit('useCollection', this.useCollection);
		},
		setRestriction: function() {
			this.socket.emit('setRestriction', this.setRestriction);
		},
		isPublic: function() {
			this.socket.emit('setPublic', this.isPublic);
		}
	}
});
