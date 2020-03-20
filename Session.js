'use strict'

const constants = require('./public/js/constants'); 
const ConnectionModule = require('./Connection');
const Connections = ConnectionModule.Connections;
const Cards = require('./Cards');
const Bot = require('./Bot');

function isEmpty(obj) {
	return Object.entries(obj).length === 0 && obj.constructor === Object;
}

function negMod(m, n) {
	return ((m%n)+n)%n;
}

function get_random(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function get_random_key(dict) {
	return Object.keys(dict)[Math.floor(Math.random() * Object.keys(dict).length)];
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
	
	// Options
	this.setRestriction = [constants.MTGSets[constants.MTGSets.length-1]];
	this.isPublic = false;
	this.ignoreCollections = false;
	this.boostersPerPlayer = 3;
	this.bots = 0;
	this.maxPlayers = 8;
	this.maxRarity = 'mythic';
	this.colorBalance = true;
	this.useCustomCardList = false;
	this.customCardList = [];
	
	// Draft state
	this.drafting = false;
	this.boosters = [];
	this.round = 0;
	this.pickedCardsThisRound = 0; 
	this.disconnectedUsers = {};
	
	this.addUser = function (userID) {
		Connections[userID].sessionID = this.id;
		this.users.add(userID);
		this.notifyUserChange();
		this.syncSessionOptions(userID);
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
			colorBalance: this.colorBalance
		});
	}
	
	this.collection = function () {
		if(this.useCustomCardList) {
			let r = {};
			for(let cardId of this.customCardList)
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
					collection[c] = 4;
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
	
	
	this.generateBoosters = function(boosterQuantity) {
		// Getting intersection of players' collections
		let collection = this.collection();
			
		const removeCardFromDict = function(c, dict) {
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
			const cardsPerBooster = 15;
			let cardsByColor = {};
			if(this.colorBalance) {
				for(let card in collection) {
					if(!(Cards[card].color_identity in cardsByColor))
						cardsByColor[Cards[card].color_identity] = {};
					cardsByColor[Cards[card].color_identity][card] = collection[card];
				}
			}
			
			let card_count = count_cards(collection)
			if(card_count < cardsPerBooster * boosterQuantity) {
				this.emitMessage('Error generating boosters', `Not enough cards (${card_count}/${cardsPerBooster * boosterQuantity}) in custom list.`);
				return false;
			}
			
			this.boosters = [];
			for(let i = 0; i < boosterQuantity; ++i) {
				let booster = [];
				
				if(this.colorBalance) {
					for(let c of 'WUBRG') {
						if(!isEmpty(cardsByColor[c])) {
							let pickedCard = pick_card(cardsByColor[c], booster);
							booster.push(pickedCard);
							removeCardFromDict(pickedCard, collection);
						}
					}
				}
				
				for(let i = booster.length; i < cardsPerBooster; ++i)
					booster.push(pick_card(collection, booster));
				
				shuffleArray(booster);
				this.boosters.push(booster);
			}
		} else {
			// Order by rarity
			let localCollection = {'common':{}, 'uncommon':{}, 'rare':{}, 'mythic':{}};
			for(let c in collection) {
				if(!(c in Cards)) {
					console.warn(`Warning: Card ${c} not in database.`);
					continue;
				}
				if(this.setRestriction.length == 0 || this.setRestriction.includes(Cards[c].set))
					localCollection[Cards[c].rarity][c] = collection[c];
			}
			
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

			// Making sure we have enough cards of each rarity
			const count_cards = function(coll) { return Object.values(coll).reduce((acc, val) => acc + val, 0); };
			
			const comm_count = count_cards(localCollection['common']);
			if(comm_count < targets['common'] * boosterQuantity) {
				this.emitMessage('Error generating boosters', `Not enough cards (${comm_count}/${10 * boosterQuantity} commons) in collection.`);
				console.warn(`Not enough cards (${comm_count}/${10 * boosterQuantity} commons) in collection.`);
				return false;
			}
			
			const unco_count = count_cards(localCollection['uncommon']);
			if(unco_count < targets['uncommon'] * boosterQuantity) {
				this.emitMessage('Error generating boosters', `Not enough cards (${unco_count}/${3 * boosterQuantity} uncommons) in collection.`);
				console.warn(`Not enough cards (${unco_count}/${3 * boosterQuantity} uncommons) in collection.`);
				return false;
			}
			
			const rm_count = count_cards(localCollection['rare']) + count_cards(localCollection['mythic']);
			if(rm_count < targets['rare'] * boosterQuantity) {
				this.emitMessage('Error generating boosters', `Not enough cards (${rm_count}/${boosterQuantity} rares & mythics) in collection.`);
				console.warn(`Not enough cards (${rm_count}/${boosterQuantity} rares & mythics) in collection.`, FgYellow);
				return false;
			}
			
			// Generate Boosters
			this.boosters = [];
			for(let i = 0; i < boosterQuantity; ++i) {
				let booster = [];
				
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
						if(!isEmpty(commonsByColor[c])) {
							let pickedCard = pick_card(commonsByColor[c], pickedCommons);
							pickedCommons.push(pickedCard);
							removeCardFromDict(pickedCard, localCollection['common']);
						}
					}
				}
				
				for(let i = pickedCommons.length; i < targets['common']; ++i)
					pickedCommons.push(pick_card(localCollection['common'], pickedCommons));
				
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
		for(let user of this.users) {
			let u = Connections[user];
			user_info.push({
				userID: u.userID, 
				userName: u.userName,
				collection: u.collection
			});
		}
		
		user_info.sort((lhs, rhs) => { return lhs.userID < rhs.userID; });
		
		// Send to all session users
		for(let user of this.users) {
			Connections[user].socket.emit('sessionOwner', this.owner);
			Connections[user].socket.emit('sessionUsers', user_info);
		}
	};
	
	this.startDraft = function() {
		this.drafting = true;
		this.emitMessage('Preparing draft!', 'Your draft will start soon...', false, 0);
		
		// boostersPerPlayer works fine, what's the problem here?...
		if(typeof this.bots != "number") {
			this.bots = parseInt(this.bots);
		}
		
		let boosterQuantity = (this.users.size + this.bots) * this.boostersPerPlayer;
		
		console.log("Starting draft!");
		console.debug(this);
		
		// Generate bots
		this.botsInstances = []
		for(let i = 0; i < this.bots; ++i)
			this.botsInstances.push(new Bot())
		
		if(!this.generateBoosters(boosterQuantity)) {
			this.drafting = false;
			return;
		}
		
		for(let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit('startDraft');
		}
		this.round = 0;
		this.nextBooster();
	};
		
	this.nextBooster = function() {
		this.stopCountdown();
		
		const totalVirtualPlayers = this.getTotalVirtualPlayers();
		
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
		const sortedPlayers = this.getSortedHumanPlayers();
		for(let userID of sortedPlayers) {
			const boosterIndex = negMod(boosterOffset + index, totalVirtualPlayers);
			if(userID in this.disconnectedUsers) { // This user has been replaced by a bot
				const pickIdx = this.disconnectedUsers[userID].bot.pick(this.boosters[boosterIndex]);
				this.disconnectedUsers[userID].pickedCards.push(this.boosters[boosterIndex][pickIdx]);
				this.boosters[boosterIndex].splice(pickIdx, 1);
				++this.pickedCardsThisRound;
			} else {
				Connections[userID].pickedThisRound = false;
				Connections[userID].socket.emit('nextBooster', {boosterIndex: boosterIndex, booster: this.boosters[boosterIndex]});
			}
			++index;
		}
		
		this.startCountdown(); // Starts countdown now that everyone has their booster
		
		// Bots picks
		for(let i = index; i < totalVirtualPlayers; ++i) {
			const boosterIndex = negMod(boosterOffset + i, totalVirtualPlayers);
			const booster = this.boosters[boosterIndex];
			const botIndex = i % this.bots; // ?
			const removedIdx = this.botsInstances[botIndex].pick(booster);
			this.boosters[boosterIndex].splice(removedIdx, 1);
		}
		++this.round;
	};
	
	this.reconnectUser = function(userID) {
		Connections[userID].pickedThisRound = this.disconnectedUsers[userID].pickedThisRound;
		Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;

		// Computes boosterIndex
		const playerIdx = this.getSortedHumanPlayers().indexOf(userID);
		const totalVirtualPlayers = this.getTotalVirtualPlayers();
		const evenRound = ((this.boosters.length / totalVirtualPlayers) % 2) == 0;
		const boosterOffset = evenRound ? -(this.round - 1) : (this.round - 1); // Round has already advanced (see nextBooster)
		const boosterIndex = negMod(boosterOffset + playerIdx, totalVirtualPlayers);
	
		this.addUser(userID);
		Connections[userID].socket.emit('rejoinDraft', {
			pickedThisRound: this.disconnectedUsers[userID].pickedThisRound,
			pickedCards: this.disconnectedUsers[userID].pickedCards,
			boosterIndex: boosterIndex,
			booster: this.boosters[boosterIndex]
		});
		delete this.disconnectedUsers[userID];

		if(Object.keys(this.disconnectedUsers).length == 0)
			this.resumeDraft();
	}

	this.resumeDraft = function() {
		console.warn(`Restarting draft for session ${this.id}.`);
		this.resumeCountdown();
		this.emitMessage('Player reconnected', `Resuming draft...`);
	};

	this.endDraft = function() {
		this.drafting = false;
		
		this.stopCountdown();
		
		let draftLog = {};
		for(let userID of this.getSortedHumanPlayers()) {
			if(userID in this.disconnectedUsers) { // This user has been replaced by a bot
				draftLog[userID] = {
					userName: "(Bot)",
					userID: userID,
					cards: this.disconnectedUsers[userID].pickedCards
				};
			} else {
				draftLog[userID] = {
					userName: Connections[userID].userName,
					userID: userID,
					cards: Connections[userID].pickedCards
				};
			}
		}
		for(let i = 0; i < this.bots; ++i) {
			draftLog[`Bot #${i}`] = {
				userName: `Bot #${i}`,
				userID: 0,
				cards: this.botsInstances[i].cards
			};
		}
		
		for(let userID of this.users) {
			Connections[userID].socket.emit('endDraft');
			Connections[userID].socket.emit('draftLog', draftLog);
		}
		console.log(`Session ${this.id} draft ended.`);
	};
	
	this.replaceDisconnectedPlayers = function() {
		if(!this.drafting)
			return;
		
		console.warn("Replacing disconnected players with bots!");

		for(let uid in this.disconnectedUsers) {
			this.disconnectedUsers[uid].bot = new Bot();
			for(let c of this.disconnectedUsers[uid].pickedCards) {
				this.disconnectedUsers[uid].bot.pick([c]);
			}
			
			// Immediately pick cards
			if(!this.disconnectedUsers[uid].pickedThisRound) {
				const totalVirtualPlayers = this.getTotalVirtualPlayers();
				const evenRound = ((this.boosters.length / totalVirtualPlayers) % 2) == 0;
				const boosterOffset = evenRound ? -(this.round - 1) : (this.round - 1); // Round has already advanced (see nextBooster)
				const playerIdx = this.getSortedHumanPlayers().indexOf(uid);
				const boosterIndex = negMod(boosterOffset + playerIdx, totalVirtualPlayers);
				const pickIdx = this.disconnectedUsers[uid].bot.pick(this.boosters[boosterIndex]);
				this.disconnectedUsers[uid].pickedCards.push(this.boosters[boosterIndex][pickIdx]);
				this.boosters[boosterIndex].splice(pickIdx, 1);
				this.disconnectedUsers[uid].pickedThisRound = true;
				++this.pickedCardsThisRound;
				if(this.pickedCardsThisRound == this.getHumanPlayerCount()) {
					this.nextBooster();
				}
			}
		}
		
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
		return Array.from(this.users).concat(Object.keys(this.disconnectedUsers)).sort();
	};

	this.getTotalVirtualPlayers = function() {
		return this.users.size + Object.keys(this.disconnectedUsers).length + this.bots
	}

	this.emitMessage = function(title, text, showConfirmButton = true, timer = 1500) {
		for(let user of this.users) {
			Connections[user].socket.emit('message', {title: title, text: text, showConfirmButton: showConfirmButton, timer: timer});
		}
	}
}

module.exports = Session;