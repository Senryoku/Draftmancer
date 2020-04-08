'use strict'

const constants = require('./public/js/constants'); 
const ConnectionModule = require('./Connection');
const Connections = ConnectionModule.Connections;
const Cards = require('./Cards');
const Bot = require('./Bot');
const randomjs = require("random-js");
const random = new randomjs.Random(randomjs.nodeCrypto);
		
function isEmpty(obj) {
	return obj && Object.entries(obj).length === 0 && obj.constructor === Object;
}

function negMod(m, n) {
	return ((m%n)+n)%n;
}

function get_random(arr) {
	return arr[random.integer(0, arr.length - 1)];
}

function get_random_key(dict) {
	return Object.keys(dict)[random.integer(0, Object.keys(dict).length - 1)];
}

// https://stackoverflow.com/a/12646864
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function Session(id, owner) {
	this.id = id;
	this.owner = owner;
	this.users = new Set();
	this.userOrder = [];
	
	// Options
	this.setRestriction = [constants.MTGSets[constants.MTGSets.length-1]];
	this.isPublic = false;
	this.ignoreCollections = false;
	this.boostersPerPlayer = 3;
	this.bots = 0;
	this.maxPlayers = 8;
	this.maxRarity = 'mythic';
	this.colorBalance = true;
	this.maxDuplicates = {
		'common': 8,
		'uncommon': 4,
		'rare': 2,
		'mythic': 1,
	};
	this.foil = true;
	this.useCustomCardList = false;
	this.customCardList = [];
	this.draftLogRecipients = 'everyone';
	
	// Draft state
	this.drafting = false;
	this.boosters = [];
	this.round = 0;
	this.pickedCardsThisRound = 0; 
	this.disconnectedUsers = {};
	
	this.addUser = function (userID) {
		if(Connections[userID].sessionID === this.id) {
			console.error(`Session::addUser Connections[${userID}].sessionID === ${this.id}`);
			return;
		}
		if(this.users.has(userID)) {
			console.error(`Session::addUser: this.users.has(${user})`);
			return;
		}
		
		Connections[userID].sessionID = this.id;
		this.users.add(userID);
		if(this.userOrder.indexOf(userID) < 0)
			this.userOrder.push(userID);
		this.notifyUserChange();
		this.syncSessionOptions(userID);
	};

	this.remUser = function (userID) {
		this.users.delete(userID);
		if(this.drafting) {
			this.stopCountdown();
			this.disconnectedUsers[userID] = {
				userName: Connections[userID].userName,
				pickedThisRound: Connections[userID].pickedThisRound,
				pickedCards: Connections[userID].pickedCards,
				boosterIndex: Connections[userID].boosterIndex
			};
			for(let u of this.users)
				Connections[u].socket.emit('userDisconnected', Connections[userID].userName);
		} else {
			this.userOrder.splice(this.userOrder.indexOf(userID), 1);
		}
	};

	this.movePlayer = function(userID, dir) {
		if(this.drafting) return;
		
		let idx = this.userOrder.indexOf(userID);
		let other = dir === 'right'
			? negMod(idx + 1, this.userOrder.length)
			: negMod(idx - 1, this.userOrder.length);
		[this.userOrder[idx], this.userOrder[other]] = [this.userOrder[other], this.userOrder[idx]];
		this.notifyUserChange();
	};
	
	this.syncSessionOptions = function(userID) {
		Connections[userID].socket.emit('sessionOptions', {
			sessionOwner: this.owner,
			setRestriction: this.setRestriction,
			isPublic: this.isPublic,
			ignoreCollections: this.ignoreCollections,
			boostersPerPlayer: this.boostersPerPlayer,
			bots: this.bots,
			maxPlayers: this.maxPlayers,
			maxRarity: this.maxRarity,
			colorBalance: this.colorBalance,
			maxDuplicates: this.maxDuplicates,
			foil: this.foil,
			useCustomCardList: this.useCustomCardList,
			customCardList: this.customCardList
		});
	};
	
	this.collection = function () {
		if(this.useCustomCardList) {
			let r = {};
			for(let cardId of this.customCardList)
				if(cardId in r) // Duplicates adds one copy of the card
					r[cardId] += 1;
				else
					r[cardId] = 1;
			return r;
		}
		
		// Compute collections intersection
		let user_list = [...this.users];
		let intersection = [];
		let collection = {};
		
		// If none of the user has uploaded their collection/doesn't want to use it, or the ignoreCollections flag is set, return all cards.
		let all_cards = true;
		for(let i = 0; i < user_list.length; ++i) {
			all_cards = all_cards && (!Connections[user_list[i]].useCollection || isEmpty(Connections[user_list[i]].collection));
		}
		if(this.ignoreCollections || all_cards) {
			for(let c of Object.keys(Cards))
				if(Cards[c].in_booster)
					collection[c] = this.maxDuplicates[Cards[c].rarity];
			return collection;
		}
		
		let useCollection = [];
		for(let i = 0; i < user_list.length; ++i)
			useCollection[i] = Connections[user_list[i]].useCollection && !isEmpty(Connections[user_list[i]].collection);
		
		// Start from the first user's collection, or the list of all cards if not available/used
		if(!useCollection[0])
			intersection = Object.keys(Cards).filter(c => Cards[c].in_booster);
		else
			intersection = Object.keys(Connections[user_list[0]].collection).filter(c => c in Cards && Cards[c].in_booster);
		
		// Shave every useless card id
		for(let i = 1; i < user_list.length; ++i)
			if(useCollection[i])
				intersection = Object.keys(Connections[user_list[i]].collection).filter(value => intersection.includes(value))
			
		// Compute the minimum count of each remaining card
		for(let c of intersection) {
			collection[c] = useCollection[0] ? Connections[user_list[0]].collection[c] : 4;
			for(let i = 1; i < user_list.length; ++i)
				if(useCollection[i])
					collection[c] = Math.min(collection[c], Connections[user_list[i]].collection[c]);
		}
		return collection;
	};
	
	// Prune cards according to set selection in setRestriction; Categorize cards by rarity
	this.restrictedCollectionByRarity = function() {
		let localCollection = {'common':{}, 'uncommon':{}, 'rare':{}, 'mythic':{}};
		const collection = this.collection();
		for(let c in collection) {
			if(!(c in Cards)) {
				console.warn(`Warning: Card ${c} not in database.`);
				continue;
			}
			if(this.setRestriction.length == 0 || this.setRestriction.includes(Cards[c].set))
				localCollection[Cards[c].rarity][c] = collection[c];
		}
		return localCollection;
	};
	
	this.generateBoosters = function(boosterQuantity) {			
		const removeCardFromDict = function(c, dict) {
			if(!dict || !c || !Object.keys(dict).includes(c)) { // FIXME: Should not be useful!
				console.error(`removeCardFromDict: ${c} not in dictionary! Dict. dump:`);
				console.error(dict);
				return;
			}
			dict[c] -= 1;
			if(dict[c] == 0)
				delete dict[c];
		};
		
		// TODO: Prevent multiples by name?
		const pick_card = function (dict, booster) {
			let c = get_random_key(dict);
			if(booster != undefined) {
				let prevention_attempts = 0; // Fail safe-ish
				while(booster.indexOf(c) != -1 && prevention_attempts < Object.keys(dict).length) {
					c = get_random_key(dict);
					++prevention_attempts;
				}
			}
			removeCardFromDict(c, dict);
			return c;
		};
		
		const count_cards = function(coll) { return Object.values(coll).reduce((acc, val) => acc + val, 0); };
		
		// Generate fully random 15-cards booster for cube (not considering rarity)
		if(this.useCustomCardList) {
			if(this.customCardList.customSheets) {
				// TODO
				let cardsByRarity = {};
				for(let r in this.customCardList.cardsPerBooster) {
					cardsByRarity[r] = {};
					for(let cardId of this.customCardList.cards[r])
						if(cardId in cardsByRarity[r]) // Duplicates adds one copy of the card
							cardsByRarity[r][cardId] += 1;
						else
							cardsByRarity[r][cardId] = 1;
						
					const comm_count = count_cards(cardsByRarity[r]);
					if(comm_count < this.customCardList.cardsPerBooster[r] * boosterQuantity) {
						this.emitMessage('Error generating boosters', `Not enough cards (${comm_count}/${this.customCardList.cardsPerBooster[r] * boosterQuantity} ${r}) in custom card list.`);
						console.warn(`Not enough cards (${comm_count}/${10 * boosterQuantity} ${r}) in custom card list.`);
						return false;
					}
				}
				
				// Generate Boosters
				this.boosters = [];
				for(let i = 0; i < boosterQuantity; ++i) {
					let booster = [];
					
					for(let r in this.customCardList.cardsPerBooster) {
						for(let i = 0; i < this.customCardList.cardsPerBooster[r]; ++i)
							booster.push(pick_card(cardsByRarity[r], booster));
					}
					
					this.boosters.push(booster);
				}
			} else {
				// Getting custom card list
				let localCollection = this.collection();
				
				const cardsPerBooster = 15;
				let cardsByColor = {};
				if(this.colorBalance) {
					for(let card in localCollection) {
						if(!(Cards[card].color_identity in cardsByColor))
							cardsByColor[Cards[card].color_identity] = {};
						cardsByColor[Cards[card].color_identity][card] = localCollection[card];
					}
				}
				
				let card_count = count_cards(localCollection)
				if(card_count < cardsPerBooster * boosterQuantity) {
					this.emitMessage('Error generating boosters', `Not enough cards (${card_count}/${cardsPerBooster * boosterQuantity}) in custom list.`);
					console.log(`Error generating boosters: Not enough cards (${card_count}/${cardsPerBooster * boosterQuantity}) in custom list.`);
					return false;
				}
				
				this.boosters = [];
				for(let i = 0; i < boosterQuantity; ++i) {
					let booster = [];
					
					if(this.colorBalance) {
						for(let c of 'WUBRG') {
							if(cardsByColor[c] && !isEmpty(cardsByColor[c])) {
								let pickedCard = pick_card(cardsByColor[c], booster);
								removeCardFromDict(pickedCard, localCollection);
								booster.push(pickedCard);
							}
						}
					}
					
					for(let i = booster.length; i < cardsPerBooster; ++i) {
						let pickedCard = pick_card(localCollection, booster)
						if(this.colorBalance)
							removeCardFromDict(pickedCard, cardsByColor[Cards[pickedCard].color_identity]);
						booster.push(pickedCard);
					}
					
					shuffleArray(booster);
					this.boosters.push(booster);
				}
			}
		} else {
			let localCollection = this.restrictedCollectionByRarity();
			
			let commonsByColor = {};
			if(this.colorBalance) {
				for(let card in localCollection['common']) {
					if(!(Cards[card].color_identity in commonsByColor))
						commonsByColor[Cards[card].color_identity] = {};
					commonsByColor[Cards[card].color_identity][card] = localCollection['common'][card];
				}
			}
			
			let targets;
			
			switch(this.maxRarity) {
				case 'uncommon':
					targets = {
						'rare': 0,
						'uncommon': 3,
						'common': 11
					};
				break;
				case 'common':
					targets = {
						'rare': 0,
						'uncommon': 0,
						'common': 14
					};
				break;
				case 'mythic':
				case 'rare':
				default:
					targets = {
						'rare': 1,
						'uncommon': 3,
						'common': 10
					};
			}
			
			const foilFrequency = 15.0/63.0;
			// 1/16 chances of a foil basic land added to the common slot. Mythic to common
			const foilRarityFreq = {'mythic': 1.0/128, 'rare': 1.0/128 + 7.0/128, 'uncommon': 1.0/16 + 3.0/16, 'common': 1.0};

			// Making sure we have enough cards of each rarity
			const comm_count = count_cards(localCollection['common']);
			if(comm_count < targets['common'] * boosterQuantity) {
				this.emitMessage('Error generating boosters', `Not enough cards (${comm_count}/${10 * boosterQuantity} commons) in collection.`);
				console.warn(`Not enough cards (${comm_count}/${targets['common'] * boosterQuantity} commons) in collection.`);
				return false;
			}
			
			const unco_count = count_cards(localCollection['uncommon']);
			if(unco_count < targets['uncommon'] * boosterQuantity) {
				this.emitMessage('Error generating boosters', `Not enough cards (${unco_count}/${3 * boosterQuantity} uncommons) in collection.`);
				console.warn(`Not enough cards (${unco_count}/${targets['uncommon'] * boosterQuantity} uncommons) in collection.`);
				return false;
			}
			
			const rm_count = count_cards(localCollection['rare']) + count_cards(localCollection['mythic']);
			if(rm_count < targets['rare'] * boosterQuantity) {
				this.emitMessage('Error generating boosters', `Not enough cards (${rm_count}/${boosterQuantity} rares & mythics) in collection.`);
				console.warn(`Not enough cards (${rm_count}/${targets['rare'] * boosterQuantity} rares & mythics) in collection.`, FgYellow);
				return false;
			}
			
			// Generate Boosters
			this.boosters = [];
			for(let i = 0; i < boosterQuantity; ++i) {
				let booster = [];
				
				let addedFoils = 0;
				if(this.foil && Math.random() <= foilFrequency) {
					const rarityCheck = Math.random();
					for(let r in foilRarityFreq)
						if(rarityCheck <= foilRarityFreq[r] && !isEmpty(localCollection[r])) {
							let pickedCard = pick_card(localCollection[r]);
							if(this.colorBalance && Cards[pickedCard].rarity == 'common')
								removeCardFromDict(pickedCard, commonsByColor[Cards[pickedCard].color_identity]);
							booster.push(pickedCard);
							addedFoils += 1;
							break;
						}
				}
				
				for(let i = 0; i < targets['rare']; ++i) {
					// 1 Rare/Mythic
					if(isEmpty(localCollection['mythic']) && isEmpty(localCollection['rare'])) {
						// Should not happen, right?
						this.emitMessage('Error generating boosters', `Not enough rare or mythic cards in collection`);
						console.error("Not enough cards in collection.");
						return false;
					} else if(isEmpty(localCollection['mythic'])) {
						booster.push(pick_card(localCollection['rare']));
					} else if(this.maxRarity === 'mythic' && isEmpty(localCollection['rare'])) {
						booster.push(pick_card(localCollection['mythic']));
					} else {
						if(this.maxRarity === 'mythic' && Math.random() * 8 < 1)
							booster.push(pick_card(localCollection['mythic']));
						else
							booster.push(pick_card(localCollection['rare']));
					}
				}
				
				for(let i = 0; i < targets['uncommon']; ++i)
					booster.push(pick_card(localCollection['uncommon'], booster));
				
				// Color balance the booster by adding one common of each color if possible
				let pickedCommons = [];
				if(this.colorBalance) {
					for(let c of 'WUBRG') {
						if(commonsByColor[c] && !isEmpty(commonsByColor[c])) {
							let pickedCard = pick_card(commonsByColor[c], pickedCommons);
							removeCardFromDict(pickedCard, localCollection['common']);
							pickedCommons.push(pickedCard);
						}
					}
				}
				
				for(let i = pickedCommons.length; i < targets['common'] - addedFoils; ++i) {
					let pickedCard = pick_card(localCollection['common'], pickedCommons);
					if(this.colorBalance)
						removeCardFromDict(pickedCard, commonsByColor[Cards[pickedCard].color_identity]);
					pickedCommons.push(pickedCard);
				}
				
				// Shuffle commons to avoid obvious signals to other players when color balancing
				shuffleArray(pickedCommons);
				booster = booster.concat(pickedCommons);

				this.boosters.push(booster);
			}
		}
		return true;
	}
	
	this.notifyUserChange = function() {
		// Send only necessary data
		let user_info = [];
		for(let userID of this.getSortedHumanPlayers()) {
			let u = Connections[userID];
			if(u) {
				user_info.push({
					userID: u.userID, 
					userName: u.userName,
					collection: !isEmpty(u.collection),
					useCollection: u.useCollection
				});
			}
		}
				
		// Send to all session users
		for(let user of this.users)
			if(Connections[user])
				Connections[user].socket.emit('sessionOwner', this.owner);
		for(let user of this.users)
			if(Connections[user])
				Connections[user].socket.emit('sessionUsers', user_info);
	};
	
	this.startDraft = function() {
		this.drafting = true;
		this.emitMessage('Preparing draft!', 'Your draft will start soon...', false, 0);
		
		// boostersPerPlayer works fine, what's the problem here?...
		if(typeof this.bots != "number") {
			this.bots = parseInt(this.bots);
		}
		
		let boosterQuantity = (this.users.size + this.bots) * this.boostersPerPlayer;
		console.log(`Session ${this.id}: Starting draft!`);
		
		this.disconnectedUsers = {};
		// Generate bots
		this.botsInstances = []
		for(let i = 0; i < this.bots; ++i)
			this.botsInstances.push(new Bot(`Bot #${i}`, [...this.users][i % this.users.size].concat(i)))
		
		if(!this.generateBoosters(boosterQuantity)) {
			this.drafting = false;
			return;
		}
		
		// Draft Log initialization
		this.draftLog = {
			sessionID: this.id,
			time: Date.now(),
			setRestriction: this.setRestriction,
			boosters: JSON.parse(JSON.stringify(this.boosters)),
			users: {}
		};
		let virtualPlayers = this.getSortedVirtualPlayers();
		for(let userID in virtualPlayers) {
			if(virtualPlayers[userID].isBot) {
				this.draftLog.users[userID] = {
					isBot: true,
					userName: virtualPlayers[userID].instance.name,
					userID: virtualPlayers[userID].instance.id,
					picks: []
				};
			} else {
				this.draftLog.users[userID] = {
					userName: Connections[userID].userName,
					userID: userID,
					picks: []
				};
			}
		}
		
		for(let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit('sessionOptions', {virtualPlayersData: virtualPlayers});
			Connections[user].socket.emit('startDraft');
		}
		this.round = 0;
		//console.debug(this);
		this.nextBooster();
	};

	this.pickCard = function(userID, cardID) {
		if(!this.drafting || !this.users.has(userID))
			return;
		
		const boosterIndex = Connections[userID].boosterIndex;
		if(typeof boosterIndex === 'undefined' || boosterIndex < 0 || boosterIndex >= this.boosters.length) {
			console.error(`Session.pickCard: boosterIndex ('${boosterIndex}') out of bounds.`);
			return;
		}
		console.log(`Session ${this.id}: ${Connections[userID].userName} [${userID}] picked card ${cardID} from booster n°${boosterIndex}.`);
		this.draftLog.users[userID].picks.push({pick: cardID, booster: JSON.parse(JSON.stringify(this.boosters[boosterIndex]))});
		
		Connections[userID].pickedCards.push(cardID);
		Connections[userID].pickedThisRound = true;
		// Removes the first occurence of cardID
		for(let i = 0; i < this.boosters[boosterIndex].length; ++i) {
			if(this.boosters[boosterIndex][i] == cardID) {
				this.boosters[boosterIndex].splice(i, 1);
				break;
			}
		}
		
		// Signal users
		for(let user of this.users) {
			Connections[user].socket.emit('updateUser', {
				userID: userID,
				updatedProperties: {
					pickedThisRound: true
				}
			});
		}
		
		++this.pickedCardsThisRound;
		if(this.pickedCardsThisRound == this.getHumanPlayerCount()) {
			this.nextBooster();
		}
	};
	
	this.nextBooster = function() {
		this.stopCountdown();
		
		const totalVirtualPlayers = this.getVirtualPlayersCount();
		
		// Boosters are empty
		if(this.boosters[0].length == 0) {
			this.round = 0;
			// Remove empty boosters
			this.boosters.splice(0, totalVirtualPlayers);
		}
		
		// End draft if there is no more booster to distribute
		if(this.boosters.length == 0) {
			this.endDraft();
			return;
		}
		
		this.pickedCardsThisRound = 0; // Only counting cards picked by human players (including disconnected ones)
		
		let index = 0;
		const evenRound = ((this.boosters.length / totalVirtualPlayers) % 2) == 0;
		const boosterOffset = evenRound ? -this.round : this.round;
		
		let virtualPlayers = this.getSortedVirtualPlayers();
		for(let userID in virtualPlayers) {
			const boosterIndex = negMod(boosterOffset + index, totalVirtualPlayers);
			if(virtualPlayers[userID].isBot) {
				const removedIdx = virtualPlayers[userID].instance.pick(this.boosters[boosterIndex]);
				this.draftLog.users[userID].picks.push({pick: this.boosters[boosterIndex][removedIdx], booster: JSON.parse(JSON.stringify(this.boosters[boosterIndex]))});
				this.boosters[boosterIndex].splice(removedIdx, 1);
			} else {
				if(virtualPlayers[userID].disconnected) { // This user has been replaced by a bot, pick immediately
					let pickIdx;
					if(!this.disconnectedUsers[userID].bot) {
						console.error("Trying to use bot that doesn't exist... That should not be possible!");
						console.error(this.disconnectedUsers[userID])
						pickIdx = 0;
					} else {
						pickIdx = this.disconnectedUsers[userID].bot.pick(this.boosters[boosterIndex]);
					}
					this.disconnectedUsers[userID].pickedThisRound = true;
					this.disconnectedUsers[userID].pickedCards.push(this.boosters[boosterIndex][pickIdx]);
					this.disconnectedUsers[userID].boosterIndex = boosterIndex;
					this.draftLog.users[userID].picks.push({pick: this.boosters[boosterIndex][pickIdx], booster: JSON.parse(JSON.stringify(this.boosters[boosterIndex]))});
					this.boosters[boosterIndex].splice(pickIdx, 1);
					++this.pickedCardsThisRound;
				} else {
					Connections[userID].pickedThisRound = false;
					Connections[userID].boosterIndex = boosterIndex;
					Connections[userID].socket.emit('nextBooster', {booster: this.boosters[boosterIndex]});
				}
			}
			++index;
		}
		
		this.startCountdown(); // Starts countdown now that everyone has their booster
		++this.round;
	};
	
	this.reconnectUser = function(userID) {
		Connections[userID].pickedThisRound = this.disconnectedUsers[userID].pickedThisRound;
		Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;
		Connections[userID].boosterIndex = this.disconnectedUsers[userID].boosterIndex;
		
		this.addUser(userID);
		Connections[userID].socket.emit('rejoinDraft', {
			pickedThisRound: this.disconnectedUsers[userID].pickedThisRound,
			pickedCards: this.disconnectedUsers[userID].pickedCards,
			booster: this.boosters[Connections[userID].boosterIndex]
		});
		delete this.disconnectedUsers[userID];

		if(Object.keys(this.disconnectedUsers).length == 0)
			this.resumeDraft();
	}

	this.resumeDraft = function() {
		console.warn(`Restarting draft for session ${this.id}.`);
		for(let userID of this.users)
			Connections[userID].socket.emit('sessionOptions', {virtualPlayersData: this.getSortedVirtualPlayers()});
		this.resumeCountdown();
		this.emitMessage('Player reconnected', `Resuming draft...`);
	};

	this.endDraft = function() {
		this.drafting = false;
		this.stopCountdown();
		this.boosters = [];
		
		let virtualPlayers = this.getSortedVirtualPlayers();
		for(let userID in virtualPlayers) {
			if(virtualPlayers[userID].isBot) {
				this.draftLog.users[userID].cards = virtualPlayers[userID].instance.cards;
			} else {
				if(virtualPlayers[userID].disconnected) { // This user has been replaced by a bot
					this.draftLog.users[userID].cards = this.disconnectedUsers[userID].pickedCards;
				} else {
					this.draftLog.users[userID].cards = Connections[userID].pickedCards;
				}
			}
		}
		
		switch(this.draftLogRecipients) {
			case 'none':
				break;
			case 'owner':
				Connections[this.owner].socket.emit('draftLog', this.draftLog);
				break;
			default:
			case 'delayed':
				Connections[this.owner].socket.emit('draftLog', {delayed: true, draftLog: this.draftLog});
				break;
			case 'everyone':
				for(let userID of this.users)
					Connections[userID].socket.emit('draftLog', this.draftLog);
				break;
		}
		
		for(let userID of this.users)
			Connections[userID].socket.emit('endDraft');
		
		console.log(`Session ${this.id} draft ended.`);
	};
	
	this.replaceDisconnectedPlayers = function() {
		if(!this.drafting)
			return;
		
		console.warn("Replacing disconnected players with bots!");

		for(let uid in this.disconnectedUsers) {
			this.disconnectedUsers[uid].bot = new Bot(`${this.disconnectedUsers[uid].userName} (Bot)`, uid);
			for(let c of this.disconnectedUsers[uid].pickedCards) {
				this.disconnectedUsers[uid].bot.pick([c]);
			}
			
			// Immediately pick cards
			if(!this.disconnectedUsers[uid].pickedThisRound) {
				const pickIdx = this.disconnectedUsers[uid].bot.pick(this.boosters[this.disconnectedUsers[uid].boosterIndex]);
				this.disconnectedUsers[uid].pickedCards.push(this.boosters[this.disconnectedUsers[uid].boosterIndex][pickIdx]);
				this.boosters[this.disconnectedUsers[uid].boosterIndex].splice(pickIdx, 1);
				this.disconnectedUsers[uid].pickedThisRound = true;
				++this.pickedCardsThisRound;
				if(this.pickedCardsThisRound == this.getHumanPlayerCount()) {
					this.nextBooster();
				}
			}
		}
		
		for(let userID of this.users)
			Connections[userID].socket.emit('sessionOptions', {virtualPlayersData: this.getSortedVirtualPlayers()});
		this.notifyUserChange();
		this.resumeCountdown();
		this.emitMessage('Resuming draft', `Disconnected player(s) has been replaced by bot(s).`);
	};

	this.countdown = 60;
	this.maxTimer = 60;
	this.countdownInterval = null;
	this.startCountdown = function() {
		let dec = Math.floor(this.maxTimer/15);
		this.countdown = this.maxTimer - this.round * dec;
		this.resumeCountdown();
	};
	this.resumeCountdown = function() {
		this.stopCountdown(); // Cleanup if one is still running
		if(this.maxTimer <= 0) { // maxTimer <= 0 means no timer
			for(let user of this.users)
				Connections[user].socket.emit('disableTimer');
		} else {
			// Immediately propagate current state
			for(let user of this.users)
				Connections[user].socket.emit('timer', { countdown: this.countdown});
				// Connections[user].socket.emit('timer', { countdown: 0 }); // Easy Debug
			this.countdownInterval = setInterval(((sess) => {
				return () => {
					sess.countdown--;
					for(let user of sess.users)
						Connections[user].socket.emit('timer', { countdown: sess.countdown });
				};
			})(this), 1000);
		}
	};
	this.stopCountdown = function() {
		if(this.countdownInterval != null)
			clearInterval(this.countdownInterval);
	};
	
	// Includes disconnected players!
	this.getHumanPlayerCount = function() {
		return this.users.size + Object.keys(this.disconnectedUsers).length;
	};
	
	// Includes disconnected players!
	// Distribute order has to be deterministic (especially for the reconnect feature), sorting by ID is an easy solution...
	this.getSortedHumanPlayers = function() {
		let players = Array.from(this.users).concat(Object.keys(this.disconnectedUsers));
		return this.userOrder.filter(e => players.includes(e));
	};

	this.getVirtualPlayersCount = function() {
		return this.users.size + Object.keys(this.disconnectedUsers).length + this.bots;
	}
	
	this.getSortedVirtualPlayers = function() {
		let tmp = {};
		let humanPlayers = this.getSortedHumanPlayers();
		for(let idx = 0; idx < Math.max(humanPlayers.length, this.botsInstances.length); ++idx) {
			if(idx < humanPlayers.length) {
				let userID = humanPlayers[idx];
				tmp[userID] = { isBot: false, disconnected: userID in this.disconnectedUsers };
			}
			if(idx < this.botsInstances.length) {
				let bot = this.botsInstances[idx];
				tmp[bot.id] = {isBot: true, instance: bot};
			}
		}
		
		return tmp;
	}

	this.emitMessage = function(title, text, showConfirmButton = true, timer = 1500) {
		for(let user of this.users) {
			Connections[user].socket.emit('message', {title: title, text: text, showConfirmButton: showConfirmButton, timer: timer});
		}
	}
}

module.exports = Session;
