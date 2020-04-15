"use strict";

const ColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };
function orderColor(lhs, rhs) {
	if (!lhs || !rhs) return 0;
	if (lhs.length == 1 && rhs.length == 1) return ColorOrder[lhs[0]] - ColorOrder[rhs[0]];
	else if (lhs.length == 1) return -1;
	else if (rhs.length == 1) return 1;
	else return String(lhs.flat()).localeCompare(String(rhs.flat()));
}

const SwalCustomClasses = {
	popup: "custom-swal-popup",
	title: "custom-swal-title",
	content: "custom-swal-content",
};

Vue.component("modal", {
	template: "#modal-template",
});

Vue.component("card", {
	template: `
	<div class="card" class="card clickable" :data-arena-id="card.id" :data-cmc="card.border_crop"  @click="selectcard($event, card)" @dblclick="ondblclick($event, card)"  :title="card.printed_name[language]">
		<clazy-load ratio="0.01" margin="200px" :src="card.image_uris[language]" loadingClass="card-loading">
			<img v-if="card.image_uris[language]" :src="card.image_uris[language]"  :class="{ selected: selected }" />
			<img v-else src="img/missing.svg">
			<div class="card-placeholder" slot="placeholder" :class="{ selected: selected }">
				<div class="card-name">{{card.printed_name[language]}}</div>
			</div>
		</clazy-load>
	</div>
	`,
	props: {
		card: { type: Object, required: true },
		language: String,
		selectcard: { type: Function, default: function () {} },
		selected: Boolean,
		ondblclick: { type: Function, default: function () {} },
	},
	created: function () {
		// Preload Carback
		const img = new Image();
		img.src = "img/cardback.png";
	},
});

Vue.component("missingCard", {
	template: `
	<div class="card">
		<clazy-load ratio="0.01" margin="200px" :src="card.image_uris[language]" loadingClass="card-loading">
			<img v-if="card.image_uris[language]" :src="card.image_uris[language]" :title="card.printed_name[language]" />
			<img v-else src="img/missing.svg">
			<div class="card-placeholder" slot="placeholder">
				<div class="card-name">{{card.printed_name[language]}}</div>
			</div>
		</clazy-load>
		<div class="not-booster" v-if="!card.in_booster">Can't be obtained in boosters.</div>
		<div class="card-count" v-if="card.count < 4">x{{4 - card.count}}</div>
	</div>
	`,
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
	},
	created: function () {
		// Preload Carback
		const img = new Image();
		img.src = "img/cardback.png";
	},
});

const DraftState = {
	Waiting: "Waiting",
	Picking: "Picking",
	Brewing: "Brewing",
};

const ReadyState = {
	Unknown: "Unknown",
	Ready: "Ready",
	NotReady: "NotReady",
	DontCare: "DontCare",
};

const Sounds = {
	start: new Audio("sound/drop_003.ogg"),
	next: new Audio("sound/next.mp3"),
	countdown: new Audio("sound/click_001.ogg"),
	readyCheck: new Audio("sound/drop_003.ogg"),
};

let UniqueID = 0;

Vue.use(window.VueClazyLoad);

var app = new Vue({
	el: "#main-vue",
	components: {
		Multiselect: window.VueMultiselect.default,
		draggable: window.vuedraggable,
		VueClazyLoad: window.VueClazyLoad,
	},
	data: {
		// Card Data
		cards: undefined,

		// User Data
		userID: guid(),
		userName: getCookie("userName", "Anonymous"),
		useCollection: getCookie("useCollection", true),
		collection: {},
		socket: undefined,

		// Session status
		sessionID: getCookie("sessionID", shortguid()),
		sessionOwner: null,
		isPublic: false,
		ignoreCollections: false,
		sessionUsers: [],
		boostersPerPlayer: 3,
		maxPlayers: 8,
		maxRarity: "Mythic",
		colorBalance: true,
		maxDuplicates: {
			common: 8,
			uncommon: 4,
			rare: 2,
			mythic: 1,
		},
		foil: false,
		bots: 0,
		virtualPlayersData: undefined,
		setRestriction: "",
		drafting: false,
		useCustomCardList: false,
		customCardList: [],
		booster: [],
		maxTimer: 75,
		pickTimer: 75,
		draftLogRecipients: "everyone",
		draftLog: undefined,
		savedDraftLog: false,

		publicSessions: [],
		selectedPublicSession: "",

		// Front-end options & data
		hideSessionID: false,
		languages: window.constants.Languages,
		language: getCookie("language", "en"),
		sets: window.constants.MTGSets,
		pendingReadyCheck: false,
		cardOrder: getCookie("cardOrder", "DraggableCMC"),
		setsInfos: undefined,
		draftingState: undefined,
		pickOnDblclick: getCookie("pickOnDblclick", false),
		enableSound: getCookie("enableSound", true),
		enableNotifications:
			Notification && Notification.permission == "granted" && getCookie("enableNotifications", false),
		notificationPermission: Notification && Notification.permission,
		selectedCard: undefined,
		deck: [],
		sideboard: [],
		autoLand: true,
		lands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
		deckColumn: [[], [], [], [], [], [], []],
		sideboardColumn: [[], [], [], [], [], [], []],
		cardsPerBooster: undefined, // Used to compute pick number

		showSessionOptionsDialog: false,
		displayAbout: false,
		// Draft Log Modal
		displayDraftLog: false,
		draftLogDisplayOptions: {
			detailsUserID: undefined,
			category: "Picks",
			textList: false,
		},
		// Collection Stats Modal
		showCollectionStats: false,
		statsMissingRarity: "rare",
		statsShowNonBooster: false,
		statsSelectedSet: "thb",

		// Chat
		currentChatMessage: "",
		displayChatHistory: false,
		messagesHistory: [],
	},
	methods: {
		initialize: function () {
			let storedUserID = getCookie("userID", null);
			if (storedUserID != null) {
				this.userID = storedUserID;
				// Server will handle the reconnect attempt if draft is still ongoing
				console.log("storedUserID: " + storedUserID);
			}

			// Socket Setup
			this.socket = io({
				query: {
					userID: this.userID,
					sessionID: this.sessionID,
					userName: this.userName,
				},
			});

			this.socket.on("disconnect", function () {
				console.log("Disconnected from server.");
				Swal.fire({
					customClass: SwalCustomClasses,
					type: "error",
					title: "Disconnected!",
					showConfirmButton: false,
				});
			});

			this.socket.on("reconnect", function (attemptNumber) {
				console.log(`Reconnected to server (attempt ${attemptNumber}).`);

				Swal.fire({
					customClass: SwalCustomClasses,
					type: "warning",
					title: "Reconnected!",
					timer: 1500,
				});
			});

			this.socket.on("alreadyConnected", function (newID) {
				app.userID = newID;
				this.query.userID = newID;
			});

			this.socket.on("chatMessage", function (message) {
				app.messagesHistory.push(message);
				// TODO: Cleanup this?
				let bubble = document.querySelector("#chat-bubble-" + message.author);
				bubble.innerText = message.text;
				bubble.style.opacity = 1;
				if (bubble.timeoutHandler) clearTimeout(bubble.timeoutHandler);
				bubble.timeoutHandler = window.setTimeout(() => (bubble.style.opacity = 0), 5000);
			});

			this.socket.on("publicSessions", function (sessions) {
				app.publicSessions = sessions;
			});

			this.socket.on("setSession", function (sessionID) {
				app.sessionID = sessionID;
				this.query.sessionID = sessionID;
				if (app.drafting) {
					// Expelled during drafting
					app.drafting = false;
					app.draftingState = DraftState.Brewing;
				}
			});

			this.socket.on("sessionUsers", function (users) {
				for (let u of users) {
					u.pickedThisRound = false;
					u.readyState = ReadyState.DontCare;
				}

				app.sessionUsers = users;
			});

			this.socket.on("userDisconnected", function (userNames) {
				if (!app.drafting) return;

				if (app.userID == app.sessionOwner) {
					Swal.fire({
						position: "center",
						customClass: SwalCustomClasses,
						type: "error",
						title: `Player(s) disconnected`,
						text: `Wait for ${userNames.join(", ")} to come back or...`,
						showConfirmButton: true,
						allowOutsideClick: false,
						confirmButtonText: "Replace with a bot",
					}).then((result) => {
						if (result.value) app.socket.emit("replaceDisconnectedPlayers");
					});
				} else {
					Swal.fire({
						position: "center",
						customClass: SwalCustomClasses,
						type: "error",
						title: `Player(s) disconnected`,
						text: `Wait for ${userNames.join(
							", "
						)} to come back or for the owner to replace them by a bot.`,
						showConfirmButton: false,
						allowOutsideClick: false,
					});
				}
			});

			this.socket.on("updateUser", function (data) {
				let user = app.userByID[data.userID];
				if (!user) return;

				for (let prop in data.updatedProperties) {
					user[prop] = data.updatedProperties[prop];
				}
			});

			this.socket.on("sessionOptions", function (sessionOptions) {
				for (let prop in sessionOptions) {
					app[prop] = sessionOptions[prop];
				}
			});
			this.socket.on("sessionOwner", function (ownerID) {
				// TODO: Validate OwnerID?
				app.sessionOwner = ownerID;
			});
			this.socket.on("isPublic", function (data) {
				app.isPublic = data;
			});
			this.socket.on("ignoreCollections", function (ignoreCollections) {
				app.ignoreCollections = ignoreCollections;
			});
			this.socket.on("boostersPerPlayer", function (data) {
				app.boostersPerPlayer = parseInt(data);
			});
			this.socket.on("bots", function (data) {
				app.bots = parseInt(data);
			});
			this.socket.on("setMaxPlayers", function (maxPlayers) {
				app.maxPlayers = parseInt(maxPlayers);
			});
			this.socket.on("setMaxRarity", function (maxRarity) {
				app.maxRarity = maxRarity;
			});
			this.socket.on("setRestriction", function (setRestriction) {
				app.setRestriction = setRestriction;
			});
			this.socket.on("setPickTimer", function (timer) {
				app.maxTimer = timer;
			});

			this.socket.on("message", function (data) {
				if (data.title === undefined) data.title = "[Missing Title]";
				if (data.text === undefined) data.text = "[Missing Text]";

				if (data.showConfirmButton === undefined) data.showConfirmButton = true;
				else if (!data.showConfirmButton && data.timer === undefined) data.timer = 1500;

				Swal.fire({
					position: "center",
					type: "info",
					title: data.title,
					text: data.text,
					customClass: SwalCustomClasses,
					showConfirmButton: data.showConfirmButton,
					timer: data.timer,
				});
			});

			this.socket.on("readyCheck", function () {
				if (app.drafting) return;

				app.initReadyCheck();

				if (app.enableNotifications) {
					let notification = new Notification("Are you ready?", {
						body: `${app.userByID[app.sessionOwner].userName} has initiated a ready check`,
					});
				}

				Swal.fire({
					position: "center",
					type: "question",
					title: "Are you ready?",
					text: `${app.userByID[app.sessionOwner].userName} has initiated a ready check`,
					customClass: SwalCustomClasses,
					showCancelButton: true,
					confirmButtonColor: "#3085d6",
					cancelButtonColor: "#d33",
					confirmButtonText: "I'm ready!",
					cancelButtonText: "Not Ready",
				}).then((result) => {
					app.socket.emit("setReady", result.value ? ReadyState.Ready : ReadyState.NotReady);
				});
			});

			this.socket.on("setReady", function (userID, readyState) {
				if (!app.pendingReadyCheck) return;
				app.userByID[userID].readyState = readyState;
				if (app.sessionUsers.every((u) => u.readyState === ReadyState.Ready))
					app.fireToast("success", "Everybody is ready!");
			});

			this.socket.on("startDraft", function () {
				// Save user ID in case of disconnect
				setCookie("userID", app.userID);

				app.drafting = true;
				app.stopReadyCheck();
				app.sideboard = [];
				app.deck = [];
				app.cardsPerBooster = undefined;
				Swal.fire({
					position: "center",
					type: "success",
					title: "Now drafting!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});

				app.playSound("start");

				if (app.enableNotifications) {
					let notification = new Notification("Now drafting!", {
						body: `Your draft '${app.sessionID}' is starting!`,
					});
				}
			});

			this.socket.on("rejoinDraft", function (data) {
				app.drafting = true;

				app.sideboard = [];
				app.deck = [];
				for (let c of data.pickedCards) app.deck.push(app.cards[c]);

				app.booster = [];
				for (let c of data.booster) {
					app.booster.push(app.genCard(c));
				}

				app.pickedThisRound = data.pickedThisRound;
				if (app.pickedThisRound) app.draftingState = DraftState.Waiting;
				else app.draftingState = DraftState.Picking;
				app.selectedCard = undefined;

				Swal.fire({
					position: "center",
					type: "success",
					title: "Reconnected to the draft!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});
			});

			this.socket.on("nextBooster", function (data) {
				app.booster = [];
				if (!app.cardsPerBooster) app.cardsPerBooster = data.booster.length;
				for (let c of data.booster) {
					app.booster.push(app.genCard(c));
				}
				for (let u of app.sessionUsers) {
					u.pickedThisRound = false;
				}
				app.playSound("next");
				app.draftingState = DraftState.Picking;
			});

			this.socket.on("endDraft", function (data) {
				Swal.fire({
					position: "center",
					type: "success",
					title: "Done drafting!",
					showConfirmButton: false,
					customClass: SwalCustomClasses,
					timer: 1500,
				});
				app.drafting = false;
				app.draftingState = DraftState.Brewing;
				eraseCookie("userID");
			});

			this.socket.on("draftLog", function (draftLog) {
				if (draftLog.delayed && draftLog.delayed === true) {
					localStorage.setItem("draftLog", JSON.stringify(draftLog));
					app.draftLog = undefined;
					app.savedDraftLog = true;
				} else {
					localStorage.setItem("draftLog", JSON.stringify(draftLog));
					app.draftLog = draftLog;
				}
			});

			this.socket.on("setCardSelection", function (data) {
				app.sideboard = [];
				app.deck = [];
				for (let c of data.flat()) {
					app.deck.push(app.genCard(c));
				}
				app.draftingState = DraftState.Brewing;
				// Hide waiting popup for sealed
				if (Swal.isVisible()) Swal.close();
			});

			this.socket.on("timer", function (data) {
				if (data.countdown == 0) app.forcePick(app.booster);
				if (data.countdown < 10) {
					let chrono = document.getElementById("chrono");
					if (chrono) {
						chrono.classList.add("pulsing");
						setTimeout(() => {
							let chrono = document.getElementById("chrono");
							if (chrono) chrono.classList.remove("pulsing");
						}, 500);
					}
				}
				if (data.countdown > 0 && data.countdown <= 5) app.playSound("countdown");
				app.pickTimer = data.countdown;
			});

			this.socket.on("disableTimer", function () {
				app.pickTimer = -1;
			});

			// Look for a locally stored collection
			let localStorageCollection = localStorage.getItem("Collection");
			if (localStorageCollection) {
				try {
					let json = JSON.parse(localStorageCollection);
					this.setCollection(json);
					console.log("Loaded collection from local storage");
				} catch (e) {
					console.error(e);
				}
			}

			// Look for a previous draftLog
			let tmpDraftLog = JSON.parse(localStorage.getItem("draftLog"));
			if (tmpDraftLog) {
				if (tmpDraftLog.delayed) this.savedDraftLog = true;
				else this.draftLog = tmpDraftLog;
			}

			let urlParamSession = getUrlVars()["session"];
			if (urlParamSession) this.sessionID = decodeURI(urlParamSession);

			for (let key in Sounds) Sounds[key].volume = 0.4;
		},
		playSound: function (key) {
			if (this.enableSound) Sounds[key].play();
		},
		// Chat Methods
		sendChatMessage: function (e) {
			if (!this.currentChatMessage || this.currentChatMessage == "") return;
			this.socket.emit("chatMessage", {
				author: this.userID,
				timestamp: Date.now(),
				text: this.currentChatMessage,
			});
			this.currentChatMessage = "";
		},
		// Draft Methods
		selectCard: function (e, c) {
			this.selectedCard = c;
		},
		doubleClickCard: function (e, c) {
			this.selectCard(e, c);
			if (this.pickOnDblclick) this.pickCard();
		},
		addToDeck: function (card) {
			// Handle column sync.
			this.deck.push(card);
			this.deckColumn[Math.min(card.cmc, this.deckColumn.length - 1)].push(card);
		},
		addToSideboard: function (card) {
			// Handle column sync.
			this.sideboard.push(card);
			this.sideboardColumn[Math.min(card.cmc, this.sideboardColumn.length - 1)].push(card);
		},
		pickCard: function () {
			if (this.draftingState != DraftState.Picking || !this.selectedCard) return;

			if (this.socket.disconnected) {
				this.disconnectedReminder();
				return;
			}

			this.socket.emit("pickCard", this.selectedCard.id, (answer) => {
				if (answer.code === 0) {
					this.draftingState = DraftState.Waiting;
					this.addToDeck(this.selectedCard);
					this.selectedCard = undefined;
				} else console.log(`pickCard: Unexpected answer:`, anwser);
			});
		},
		forcePick: function () {
			if (this.draftingState != DraftState.Picking) return;
			// Forces a random card if none is selected
			if (!this.selectedCard) {
				const randomIdx = Math.floor(Math.random() * this.booster.length);
				this.selectedCard = this.booster[randomIdx];
			}
			this.socket.emit("pickCard", this.selectedCard.id, (anwser) => {
				if (anwser.code === 0) {
					this.addToDeck(this.selectedCard);
					this.selectedCard = undefined;
					this.draftingState = DraftState.Waiting;
				} else console.log(`pickCard: Unexpected answer:`, anwser);
			});
		},
		checkNotificationPermission: function (e) {
			if (e.target.value && Notification.permission != "granted") {
				Notification.requestPermission().then(function (permission) {
					this.notificationPermission = permission;
					if (permission != "granted") {
						this.enableNotifications = false;
					}
				});
			}
		},
		deckToSideboard: function (e, c) {
			// From deck to sideboard
			let idx = this.deck.indexOf(c);
			if (idx >= 0) {
				this.deck.splice(idx, 1);
				this.addToSideboard(c);
			} else return;

			for (let col of this.deckColumn) {
				let idx = col.indexOf(c);
				if (idx >= 0) {
					col.splice(idx, 1);
					break;
				}
			}
		},
		sideboardToDeck: function (e, c) {
			// From sideboard to deck
			let idx = this.sideboard.indexOf(c);
			if (idx >= 0) {
				this.sideboard.splice(idx, 1);
				this.addToDeck(c);
			} else return;

			for (let col of this.sideboardColumn) {
				let idx = col.indexOf(c);
				if (idx >= 0) {
					col.splice(idx, 1);
					break;
				}
			}
		},
		// Collection management
		setCollection: function (json) {
			if (this.collection == json) return;
			this.collection = Object.freeze(json);
			this.socket.emit("setCollection", this.collection);
		},
		parseMTGALog: function (e) {
			let file = e.target.files[0];
			if (!file) {
				return;
			}
			var reader = new FileReader();
			reader.onload = function (e) {
				let contents = e.target.result;
				let call_idx = contents.lastIndexOf("PlayerInventory.GetPlayerCardsV3");
				let collection_start = contents.indexOf("{", call_idx);
				let collection_end = contents.indexOf("}}", collection_start) + 2;

				try {
					let collStr = contents.slice(collection_start, collection_end);
					let collJson = JSON.parse(collStr)["payload"];
					//for (let c of Object.keys(collJson).filter((c) => !(c in app.cards))) console.log(c, " not found.");
					localStorage.setItem("Collection", JSON.stringify(collJson));
					localStorage.setItem("CollectionDate", new Date().toLocaleDateString());
					app.setCollection(collJson);
					Swal.fire({
						position: "top-end",
						customClass: "swal-container",
						type: "success",
						title: "Collection updated",
						customClass: SwalCustomClasses,
						showConfirmButton: false,
						timer: 1500,
					});
				} catch (e) {
					Swal.fire({
						type: "error",
						title: "Parsing Error",
						text:
							"An error occurred during parsing. Please make sure that you selected the correct file and that the detailed logs option (found in Options > View Account > Detailed Logs (Plugin Support)) is activated in game.",
						footer: "Full error: " + e,
						customClass: SwalCustomClasses,
					});
					//alert(e);
				}
			};
			reader.readAsText(file);
		},
		fireToast: function (type, title) {
			Swal.fire({
				toast: true,
				position: "top-end",
				type: type,
				title: title,
				customClass: SwalCustomClasses,
				showConfirmButton: false,
				timer: 1500,
			});
		},
		disconnectedReminder: function () {
			this.fireToast("error", "Disconnected from server!");
		},
		parseCustomCardList: function (e) {
			let file = e.target.files[0];
			if (!file) {
				return;
			}
			Swal.fire({
				position: "center",
				customClass: SwalCustomClasses,
				type: "info",
				title: "Parsing card list...",
				showConfirmButton: false,
			});
			var reader = new FileReader();
			reader.onload = function (e) {
				let contents = e.target.result;

				const searchCardID = function (line) {
					let cardID = Object.keys(app.cards).find((id) => app.cards[id].name == line);
					if (typeof cardID !== "undefined") {
						return cardID;
					} else {
						// If not found, try doubled faced cards before giving up!
						return Object.keys(app.cards).find((id) => app.cards[id].name.startsWith(line + " //"));
					}
				};

				try {
					const lines = contents.split(/\r\n|\n/);
					// Custom rarity sheets
					if (lines[0].trim()[0] === "[") {
						let line = 0;
						let cardCount = 0;
						let cardList = {
							customSheets: true,
							cardsPerBooster: {},
							cards: {},
						};
						let headerRegex = new RegExp(String.raw`\[([^\(\]]+)(\((\d+)\))?\]`); // Groups: SlotName, '(Count)', Count
						while (line < lines.length) {
							// TODO
							let header = lines[line].match(headerRegex);
							if (!header) {
								Swal.fire({
									type: "error",
									title: `Slot`,
									text: `Error parsing slot '${lines[line]}'.`,
									customClass: SwalCustomClasses,
								});
								return;
							}
							cardList.cardsPerBooster[header[1]] = parseInt(header[3]);
							cardList.cards[header[1]] = [];
							line += 1;
							while (line < lines.length && lines[line].trim()[0] !== "[") {
								if (lines[line]) {
									let cardID = searchCardID(lines[line].trim());
									if (typeof cardID !== "undefined") {
										cardList.cards[header[1]].push(cardID);
										cardCount += 1;
									} else {
										Swal.fire({
											type: "error",
											title: `Card not found`,
											text: `Could not find ${lines[line]} in our database.`,
											customClass: SwalCustomClasses,
										});
										return;
									}
								}
								line += 1;
							}
						}
						cardList.length = cardCount;
						app.customCardList = cardList;
					} else {
						let cardList = [];
						for (let line of lines) {
							if (line) {
								let cardID = searchCardID(line);
								if (typeof cardID !== "undefined") {
									cardList.push(cardID);
								} else {
									Swal.fire({
										type: "error",
										title: `Card not found`,
										text: `Could not find ${line} in our database.`,
										customClass: SwalCustomClasses,
									});
									return;
								}
							}
						}
						app.customCardList = cardList;
					}
					app.socket.emit("customCardList", app.customCardList, (answer) => {
						if (answer.code === 0) {
							app.fireToast("success", `Card list uploaded (${app.customCardList.length} cards)`);
						} else {
							app.fireToast("error", `Error while uploading card list: ${answer.error}`);
						}
					});
				} catch (e) {
					Swal.fire({
						type: "error",
						title: "Parsing Error",
						text: "An error occurred during parsing, please check you input file.",
						footer: "Full error: " + e,
						customClass: SwalCustomClasses,
					});
				}
			};
			reader.readAsText(file);
		},
		exportDeck: function () {
			copyToClipboard(exportMTGA(this.deck, this.sideboard, this.language, this.lands));
			this.fireToast("success", "Deck exported to clipboard!");
		},
		downloadLog: function () {
			let draftLogFull = this.draftLog;
			for (let e in this.draftLog.users) {
				let cards = [];
				for (let c of this.draftLog.users[e].cards) cards.push(this.cards[c]);
				this.draftLog.users[e].exportString = exportMTGA(cards, null, this.language);
			}
			download(`DraftLog_${this.draftLog.sessionID}.txt`, JSON.stringify(draftLogFull, null, "\t"));
		},
		openLog: function (e) {
			let file = e.target.files[0];
			if (!file) {
				return;
			}
			var reader = new FileReader();
			reader.onload = function (e) {
				try {
					let contents = e.target.result;
					let json = JSON.parse(contents);
					if (json.users) {
						app.draftLog = json;
						app.displayDraftLog = true;
					} else {
						Swal.fire({
							type: "error",
							title: "Parsing Error",
							text:
								"An error occurred during parsing. Please make sure that you selected the correct file.",
							footer: "Full error: Missing required data",
							customClass: SwalCustomClasses,
						});
					}
				} catch (e) {
					Swal.fire({
						type: "error",
						title: "Parsing Error",
						text: "An error occurred during parsing. Please make sure that you selected the correct file.",
						footer: "Full error: " + e,
						customClass: SwalCustomClasses,
					});
				}
			};
			reader.readAsText(file);
		},
		exportSingleLog: function (id) {
			let cards = [];
			for (let c of this.draftLog.users[id].cards) cards.push(this.cards[c]);
			copyToClipboard(exportMTGA(cards, null, this.language), null, "\t");
			this.fireToast("success", "Card list exported to clipboard!");
		},
		downloadMPT: function (id) {
			download(`DraftLog_${id}.txt`, exportToMagicProTools(this.cards, this.draftLog, id));
		},
		submitToMPT: function (id) {
			fetch("https://magicprotools.com/api/draft/add", {
				credentials: "omit",
				headers: {
					Accept: "application/json, text/plain, */*",
					"Content-Type": "application/x-www-form-urlencoded",
				},
				referrer: "https://mtgadraft.herokuapp.com",
				body: `draft=${encodeURI(
					exportToMagicProTools(this.cards, this.draftLog, id)
				)}&apiKey=yitaOuTvlngqlKutnKKfNA&platform=mtgadraft`,
				method: "POST",
				mode: "cors",
			}).then(function (response) {
				if (response.status !== 200) {
					app.fireToast("error", "An error occured submiting log to MagicProTools.");
				} else {
					response.json().then(function (json) {
						if (json.error) {
							app.fireToast("error", `Error: ${json.error}.`);
						} else {
							if (json.url) {
								copyToClipboard(json.url);
								app.fireToast("success", "MagicProTools URL copied to clipboard.");
								window.open(json.url, "_blank");
							} else {
								app.fireToast("error", "An error occured submiting log to MagicProTools.");
							}
						}
					});
				}
			});
		},
		sessionURLToClipboard: function () {
			copyToClipboard(
				`${window.location.protocol}//${window.location.hostname}:${window.location.port}/?session=${encodeURI(
					this.sessionID
				)}`
			);
			this.fireToast("success", "Session link copied to clipboard!");
		},
		setSessionOwner: function (newOwnerID) {
			if (this.userID != this.sessionOwner) return;
			let user = this.sessionUsers.find((u) => u.userID === newOwnerID);
			if (!user) return;
			Swal.fire({
				title: "Are you sure?",
				text: `Do you want to surrender session ownership to ${user.userName}?`,
				type: "warning",
				showCancelButton: true,
				customClass: SwalCustomClasses,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "Yes",
			}).then((result) => {
				if (result.value) {
					this.socket.emit("setSessionOwner", newOwnerID);
				}
			});
		},
		removePlayer: function (userID) {
			if (this.userID != this.sessionOwner) return;
			let user = this.sessionUsers.find((u) => u.userID === userID);
			if (!user) return;
			Swal.fire({
				title: "Are you sure?",
				text: `Do you want to remove player '${user.userName}' from the session? They'll still be able to rejoin if they want.`,
				type: "warning",
				showCancelButton: true,
				customClass: SwalCustomClasses,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "Yes",
			}).then((result) => {
				if (result.value) {
					this.socket.emit("removePlayer", userID);
				}
			});
		},
		movePlayer: function (userID, dir) {
			if (this.userID != this.sessionOwner) return;
			let user = this.sessionUsers.find((u) => u.userID === userID);
			if (!user) return;
			this.socket.emit("movePlayer", userID, dir);
		},
		distributeSealed: function (boosterCount) {
			if (this.deck.length > 0) {
				Swal.fire({
					title: "Are you sure?",
					text: "Distributing sealed boosters will reset everyone's cards/deck!",
					type: "warning",
					showCancelButton: true,
					customClass: SwalCustomClasses,
					confirmButtonColor: "#3085d6",
					cancelButtonColor: "#d33",
					confirmButtonText: "Yes, distribute!",
				}).then((result) => {
					if (result.value) {
						this.doDistributeSealed(boosterCount);
					}
				});
			} else {
				this.doDistributeSealed(boosterCount);
			}
		},
		doDistributeSealed: function (boosterCount) {
			this.socket.emit("distributeSealed", boosterCount);
		},
		genCard: function (c) {
			if (!(c in this.cards)) return undefined;
			return {
				id: c,
				uniqueID: UniqueID++,
				name: this.cards[c].name,
				printed_name: this.cards[c].printed_name,
				image_uris: this.cards[c].image_uris,
				set: this.cards[c].set,
				rarity: this.cards[c].rarity,
				cmc: this.cards[c].cmc,
				collector_number: this.cards[c].collector_number,
				color_identity: this.cards[c].color_identity,
				in_booster: this.cards[c].in_booster,
			};
		},
		joinPublicSession: function () {
			this.sessionID = this.selectedPublicSession;
		},
		readyCheck: function () {
			if (this.userID != this.sessionOwner || this.drafting) return;

			if (this.socket.disconnected) {
				this.disconnectedReminder();
				return;
			}

			this.socket.emit("readyCheck", (anwser) => {
				if (anwser.code === 0) {
					this.initReadyCheck();
					this.socket.emit("setReady", ReadyState.Ready);
				}
			});
		},
		initReadyCheck: function () {
			this.pendingReadyCheck = true;

			for (let u of app.sessionUsers) u.readyState = ReadyState.Unknown;

			this.playSound("readyCheck");
		},
		stopReadyCheck: function () {
			this.pendingReadyCheck = false;

			for (let u of app.sessionUsers) u.readyState = ReadyState.DontCare;
		},
		startDraft: function () {
			if (this.userID != this.sessionOwner) return;
			if (this.deck.length > 0) {
				Swal.fire({
					title: "Are you sure?",
					text: "Launching a draft will reset everyones cards/deck!",
					type: "warning",
					showCancelButton: true,
					customClass: SwalCustomClasses,
					confirmButtonColor: "#3085d6",
					cancelButtonColor: "#d33",
					confirmButtonText: "I'm sure!",
				}).then((result) => {
					if (result.value) {
						this.socket.emit("startDraft");
					}
				});
			} else {
				this.socket.emit("startDraft");
			}
		},
		stopDraft: function () {
			if (this.userID != this.sessionOwner) return;
			Swal.fire({
				title: "Are you sure?",
				text: "Do you really want to stop the draft here?",
				type: "warning",
				showCancelButton: true,
				customClass: SwalCustomClasses,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "I'm sure!",
			}).then((result) => {
				if (result.value) {
					this.socket.emit("stopDraft");
				}
			});
		},
		shareSavedDraftLog: function () {
			if (this.userID != this.sessionOwner) {
				Swal.fire({
					title: "You need to be the session owner to share logs.",
					type: "error",
					customClass: SwalCustomClasses,
				});
				return;
			}
			let storedDraftLog = localStorage.getItem("draftLog");
			if (!storedDraftLog) {
				this.fireToast("error", "No saved draft log");
				this.savedDraftLog = false;
				return;
			} else {
				let parsedLogs = JSON.parse(storedDraftLog).draftLog;
				if (parsedLogs.sessionID !== this.sessionID) {
					Swal.fire({
						title: "Wrong Session ID",
						text: `Can't share logs: The session ID of your saved draft log ('${parsedLogs.sessionID}') doesn't match the id of yout current session ('${this.sessionID}').`,
						type: "error",
						customClass: SwalCustomClasses,
					});
					return;
				}
				this.savedDraftLog = false;
				this.draftLog = parsedLogs;
				this.socket.emit("shareDraftLog", this.draftLog);
				localStorage.setItem("draftLog", this.draftLog);
				this.fireToast("success", "Shared draft log with session!");
			}
		},
		sealedDialog: async function () {
			if (this.userID != this.sessionOwner) return;
			const { value: boosterCount } = await Swal.fire({
				title: "Start Sealed",
				showCancelButton: true,
				text: "How many booster for each player?",
				inputPlaceholder: "Booster count",
				input: "range",
				inputAttributes: {
					min: 4,
					max: 12,
					step: 1,
				},
				inputValue: 6,
				customClass: SwalCustomClasses,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "Distribute boosters",
			});

			if (boosterCount) {
				this.distributeSealed(boosterCount);
			}
		},
		addDeckColumn: function () {
			this.deckColumn.push([]);
			this.deckColumn[this.deckColumn.length - 1] = this.deckColumn[this.deckColumn.length - 2].filter(
				(c) => c.cmc > this.deckColumn.length - 2
			);
			this.deckColumn[this.deckColumn.length - 2] = this.deckColumn[this.deckColumn.length - 2].filter(
				(c) => c.cmc <= this.deckColumn.length - 2
			);
		},
		addSideboardColumn: function () {
			this.sideboardColumn.push([]);
			this.sideboardColumn[this.sideboardColumn.length - 1] = this.sideboardColumn[
				this.sideboardColumn.length - 2
			].filter((c) => c.cmc > this.sideboardColumn.length - 2);
			this.sideboardColumn[this.sideboardColumn.length - 2] = this.sideboardColumn[
				this.sideboardColumn.length - 2
			].filter((c) => c.cmc <= this.sideboardColumn.length - 2);
		},
		removeDeckColumn: function () {
			if (this.deckColumn.length < 2) return;
			this.deckColumn[this.deckColumn.length - 2] = [].concat(
				this.deckColumn[this.deckColumn.length - 2],
				this.deckColumn[this.deckColumn.length - 1]
			);
			this.deckColumn.pop();
		},
		removeSideboardColumn: function () {
			if (this.sideboardColumn.length < 2) return;
			this.sideboardColumn[this.sideboardColumn.length - 2] = [].concat(
				this.sideboardColumn[this.sideboardColumn.length - 2],
				this.sideboardColumn[this.sideboardColumn.length - 1]
			);
			this.sideboardColumn.pop();
		},
		// Sync. column changes with deck and sideboard
		columnDeckChange: function (e) {
			if (e.removed)
				this.deck.splice(
					this.deck.findIndex((c) => c === e.removed.element),
					1
				);
			if (e.added) this.deck.push(e.added.element);
		},
		columnSideboardChange: function (e) {
			if (e.removed)
				this.sideboard.splice(
					this.sideboard.findIndex((c) => c === e.removed.element),
					1
				);
			if (e.added) this.sideboard.push(e.added.element);
		},
		columnCMC: function (cards) {
			let a = cards.reduce((acc, item) => {
				if (!acc[item.cmc]) acc[item.cmc] = [];
				acc[item.cmc].push(item);
				return acc;
			}, {});
			for (let col in a) a[col] = this.orderByColor(a[col]);
			return a;
		},
		columnColor: function (cards) {
			let a = cards.reduce(
				(acc, item) => {
					if (item.color_identity.length > 1) {
						if (!acc["multi"]) acc["multi"] = [];
						acc["multi"].push(item);
					} else {
						if (!acc[item.color_identity]) acc[item.color_identity] = [];
						acc[item.color_identity].push(item);
					}
					return acc;
				},
				{ "": [], W: [], U: [], B: [], R: [], G: [], multi: [] }
			);
			for (let col in a) a[col] = this.orderByCMC(a[col]);
			return a;
		},
		orderByColorInPlace: function (cards) {
			return cards.sort(function (lhs, rhs) {
				if (orderColor(lhs.color_identity, rhs.color_identity) == 0)
					if (lhs.cmc != rhs.cmc) return lhs.cmc - rhs.cmc;
					else return lhs.name < rhs.name;
				return orderColor(lhs.color_identity, rhs.color_identity);
			});
		},
		orderByCMC: function (cards) {
			return [...cards].sort(function (lhs, rhs) {
				if (lhs.cmc == rhs.cmc) return orderColor(lhs.color_identity, rhs.color_identity);
				return lhs.cmc - rhs.cmc;
			});
		},
		orderByColor: function (cards) {
			return this.orderByColorInPlace([...cards]);
		},
		orderByRarity: function (cards) {
			const order = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
			return [...cards].sort(function (lhs, rhs) {
				if (order[lhs.rarity] == order[rhs.rarity]) return lhs.cmc - rhs.cmc;
				return order[lhs.rarity] - order[rhs.rarity];
			});
		},
		updateAutoLands: function () {
			if (this.autoLand) {
				if (!this.deck || this.deck.length === 0) return;

				const targetDeckSize = 40;
				const landToAdd = targetDeckSize - this.deck.length;
				if (landToAdd < 0) return;
				if (landToAdd === 0) {
					this.lands = { W: 0, U: 0, B: 0, R: 0, G: 0 };
					return;
				}

				const colorCount = this.colorsInDeck;
				let totalColor = 0;
				for (let c in colorCount) totalColor += colorCount[c];
				if (totalColor <= 0) return;

				for (let c in this.lands) this.lands[c] = Math.round(landToAdd * (colorCount[c] / totalColor));
				let addedLands = this.totalLands;

				if (this.deck.length + addedLands > targetDeckSize) {
					let max = "W";
					for (let i = 0; i < this.deck.length + addedLands - targetDeckSize; ++i) {
						for (let c in this.lands) if (this.lands[c] > this.lands[max]) max = c;
						this.lands[max] = Math.max(0, this.lands[max] - 1);
					}
				} else if (this.deck.length + addedLands < targetDeckSize) {
					let min = "W";
					for (let i = 0; i < targetDeckSize - (this.deck.length + addedLands); ++i) {
						for (let c in this.lands)
							if (
								this.colorsInDeck[min] == 0 ||
								(this.colorsInDeck[c] > 0 && this.lands[c] < this.lands[min])
							)
								min = c;
						this.lands[min] += 1;
					}
				}
			}
		},
		colorsInCardIDList: function (cardids) {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			for (let card of cardids) {
				for (let color of this.cards[card].color_identity) {
					r[color] += 1;
				}
			}
			return r;
		},
		colorsInCardPool: function (pool) {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			for (let card of pool) {
				for (let color of card.color_identity) {
					r[color] += 1;
				}
			}
			return r;
		},
	},
	computed: {
		DraftState: function () {
			return DraftState;
		},
		ReadyState: function () {
			return ReadyState;
		},
		draftRound: function () {
			return Math.floor((this.deck.length + this.sideboard.length) / (this.useCustomCardList ? 15 : 14)) + 1;
		},
		virtualPlayers: function () {
			if (!this.drafting || !this.virtualPlayersData || Object.keys(this.virtualPlayersData).length == 0)
				return this.sessionUsers;

			let r = [];
			for (let id in this.virtualPlayersData) {
				if (this.virtualPlayersData[id].isBot) {
					r.push(this.virtualPlayersData[id]);
					r[r.length - 1].userName = r[r.length - 1].instance.name;
					r[r.length - 1].userID = r[r.length - 1].instance.id;
				} else if (this.virtualPlayersData[id].disconnected) {
					r.push({
						userName: "(Disconnected)",
						userID: "",
						disconnected: true,
					});
				} else {
					r.push(this.sessionUsers.find((u) => u.userID === id));
				}
			}

			return r;
		},
		displaySets: function () {
			let dSets = [];
			for (let s of this.sets) {
				if (this.setsInfos && s in this.setsInfos)
					dSets.push({
						code: s,
						fullName: this.setsInfos[s].fullName,
						icon: this.setsInfos[s].icon,
					});
			}
			return dSets;
		},
		collectionStats: function () {
			if (!this.hasCollection || !this.cards || !this.setsInfos) return undefined;
			let stats = [];
			for (let id in this.cards) {
				let card = this.genCard(id);
				if (card && !["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(card["name"])) {
					card.count = this.collection[id] ? this.collection[id] : 0;
					if (!(card.set in stats))
						stats[card.set] = {
							name: card.set,
							fullName: this.setsInfos[card.set].fullName,
							cards: [],
							cardCount: 0,
							common: [],
							uncommon: [],
							rare: [],
							mythic: [],
							commonCount: 0,
							uncommonCount: 0,
							rareCount: 0,
							mythicCount: 0,
							total: {
								unique: this.setsInfos[card.set].cardCount,
								commonCount: this.setsInfos[card.set]["commonCount"],
								uncommonCount: this.setsInfos[card.set]["uncommonCount"],
								rareCount: this.setsInfos[card.set]["rareCount"],
								mythicCount: this.setsInfos[card.set]["mythicCount"],
							},
						};
					stats[card.set].cards.push(card);
					stats[card.set].cardCount += card.count;
					stats[card.set][card.rarity].push(card);
					stats[card.set][card.rarity + "Count"] += card.count;
				}
			}
			return stats;
		},
		hasCollection: function () {
			return !isEmpty(this.collection);
		},

		extendedDraftLog: function () {
			let extendedDraftLog = [];
			for (let userID in this.draftLog.users) {
				extendedDraftLog.push({
					userID: userID,
					userName: this.draftLog.users[userID].userName,
					colors: this.colorsInCardIDList(this.draftLog.users[userID].cards),
				});
			}
			while (Object.keys(extendedDraftLog).length < 8)
				extendedDraftLog.push({
					userID: "none",
					userName: "(empty)",
					colors: this.colorsInCardIDList([]),
				});
			return extendedDraftLog;
		},

		colorsInDeck: function () {
			return this.colorsInCardPool(this.deck);
		},
		totalLands: function () {
			let addedLands = 0;
			for (let c in this.lands) addedLands += this.lands[c];
			return addedLands;
		},

		deckColumnCMC: function () {
			return this.columnCMC(this.deck);
		},
		deckColumnColor: function () {
			return this.columnColor(this.deck);
		},
		deckCMC: function () {
			return this.orderByCMC(this.deck);
		},
		deckColor: function () {
			return this.orderByColor(this.deck);
		},
		deckRarity: function () {
			return this.orderByRarity(this.deck);
		},

		sideboardColumnCMC: function () {
			return this.columnCMC(this.sideboard);
		},
		sideboardColumnColor: function () {
			return this.columnColor(this.sideboard);
		},
		sideboardCMC: function () {
			return this.orderByCMC(this.sideboard);
		},
		sideboardColor: function () {
			return this.orderByColor(this.sideboard);
		},
		sideboardRarity: function () {
			return this.orderByRarity(this.sideboard);
		},

		userByID: function () {
			let r = {};
			for (let u of this.sessionUsers) r[u.userID] = u;
			return r;
		},
	},
	mounted: async function () {
		// Load all card informations
		fetch("data/MTGACards.json").then(function (response) {
			response.text().then(function (text) {
				try {
					let parsed = JSON.parse(text);
					for (let c in parsed) {
						if (!("in_booster" in parsed[c])) parsed[c].in_booster = true;
						for (let l of app.languages) {
							if (!(l.code in parsed[c]["printed_name"]))
								parsed[c]["printed_name"][l.code] = parsed[c]["name"];
							if (!(l.code in parsed[c]["image_uris"]))
								parsed[c]["image_uris"][l.code] = parsed[c]["image_uris"]["en"];
						}
					}
					app.cards = Object.freeze(parsed); // Object.freeze so Vue doesn't make everything reactive.

					app.initialize();
				} catch (e) {
					alert(e);
				}
			});
		});

		// Load set informations
		fetch("data/SetsInfos.json").then(function (response) {
			response.text().then(function (text) {
				try {
					app.setsInfos = Object.freeze(JSON.parse(text));
				} catch (e) {
					alert(e);
				}
			});
		});
	},
	watch: {
		sessionID: function () {
			this.socket.query.sessionID = this.sessionID;
			this.socket.emit("setSession", this.sessionID);
			history.replaceState(
				{ sessionID: this.sessionID },
				`MTGADraft Session ${this.sessionID}`,
				`?session=${this.sessionID}`
			);
			setCookie("sessionID", this.sessionID);
		},
		userName: function () {
			this.socket.query.userName = this.userName;
			this.socket.emit("setUserName", this.userName);
			setCookie("userName", this.userName);
		},
		useCollection: function () {
			this.socket.emit("useCollection", this.useCollection);
			setCookie("useCollection", this.useCollection);
		},
		// Front-end options
		language: function () {
			setCookie("language", this.language);
		},
		pickOnDblclick: function () {
			setCookie("pickOnDblclick", this.pickOnDblclick);
		},
		enableSound: function () {
			setCookie("enableSound", this.enableSound);
		},
		cardOrder: function () {
			setCookie("cardOrder", this.cardOrder);
		},
		deck: function (newDeck, oldDeck) {
			this.updateAutoLands();

			// When replacing deck (not mutating it)
			if (oldDeck != newDeck) {
				this.deckColumn = [[], [], [], [], [], [], []];
				for (let c of newDeck) this.deckColumn[Math.min(c.cmc, this.deckColumn.length - 1)].push(c);
				for (let col = 0; col < this.deckColumn.length; ++col) this.orderByColorInPlace(this.deckColumn[col]);
			}
		},
		sideboard: function (newSide, oldSide) {
			// When replacing deck (not mutating it)
			if (newSide != oldSide) {
				this.sideboardColumn = [[], [], [], [], [], [], []];
				for (let c of newSide) this.sideboardColumn[Math.min(c.cmc, this.sideboardColumn.length - 1)].push(c);
			}
		},
		autoLand: function () {
			this.updateAutoLands();
		},
		// Session options
		setRestriction: function () {
			if (this.userID != this.sessionOwner) return;

			this.socket.emit("setRestriction", this.setRestriction);
		},
		isPublic: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setPublic", this.isPublic);
		},
		boostersPerPlayer: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("boostersPerPlayer", this.boostersPerPlayer);
		},
		bots: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("bots", this.bots);
		},
		maxPlayers: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setMaxPlayers", this.maxPlayers);
		},
		maxRarity: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setMaxRarity", this.maxRarity);
		},
		maxTimer: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setPickTimer", this.maxTimer);
		},
		ignoreCollections: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("ignoreCollections", this.ignoreCollections);
		},
		maxDuplicates: {
			deep: true,
			handler() {
				if (this.userID != this.sessionOwner) return;
				this.socket.emit("setMaxDuplicates", this.maxDuplicates);
			},
		},
		colorBalance: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setColorBalance", this.colorBalance);
		},
		foil: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setFoil", this.foil);
		},
		useCustomCardList: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setUseCustomCardList", this.useCustomCardList);
		},
		draftLogRecipients: function () {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setDraftLogRecipients", this.draftLogRecipients);
		},
		enableNotifications: function () {
			setCookie("enableNotifications", this.enableNotifications);
		},
		draftLog: {
			deep: true,
			handler() {
				if (this.draftLog && this.draftLog.users && Object.keys(this.draftLog.users)[0])
					this.draftLogDisplayOptions.detailsUserID = Object.keys(this.draftLog.users)[0];
			},
		},
	},
});
