"use strict";

function getCookie(cname) {
	var name = cname + "=";
	var decodedCookie = decodeURIComponent(document.cookie);
	var ca = decodedCookie.split(';');
	for(var i = 0; i <ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0) == ' ') {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return "";
}

var app = new Vue({
	el: '#main-vue',
	data: {
		userID: getCookie("userID"),
		userName: getCookie("userName"),
		collection: {},
		socket: getCookie("sessionID"),
		
		sessionID: undefined,
		sessionUsers: [],
		boostersPerPlayer: 3,
		readyToDraft: false,
		drafting: false
	},
	methods: {
		pickCard: function() {
			this.socket.emit('pickCard', this.sessionID, 45687);
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
		}
	},
	computed: {
		hasCollection: function() {
			return !isEmpty(this.collection);
		}
	},
	mounted: async function() {
		console.log(document.cookie);
		
		if(!this.userID)
			this.userID = await fetch('/getUserID').then((data) => data.text());
		
		let inputSessionID = document.querySelector('#session-id');
		if(!this.sessionID)
			this.sessionID = await fetch('/getSession').then((data) => data.text());
		
		// Socket Setup
		this.socket = io({query: {
			userID: this.userID, 
			sessionID: this.sessionID,
			userName: this.userName
		}});
		
		this.socket.on('reconnect', (attemptNumber) => {
			this.socket.emit('setCollection', this.collection);
		});
		
		this.socket.on('signalPick', function(data) {
			console.log('signalPick ' + data);
		});
		
		this.socket.on('sessionUsers', function(data) {
			app.sessionUsers = JSON.parse(data);
		});
		
		this.socket.on('boostersPerPlayer', function(data) {
			app.boostersPerPlayer = parseInt(data);
		});
		
		this.socket.on('startDraft', function(data) {
			app.drafting = true;
			alert('Everybody is ready!');
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
		}
	}
});
