<template>
	<div>
		<span v-if="draftlog.sessionID">Draft log for Session '{{draftlog.sessionID}}'</span>
		<span v-if="draftlog.time">({{new Date(draftlog.time).toLocaleString()}})</span>
		<button type="button" @click="downloadLog">Download full log</button>
		<p>Click on a player to display the details of their draft.</p>
		
		<div>
			<ul :class="{'player-table': tableSumary.length <= 8, 'player-list': tableSumary.length > 8}">
				<li v-for="(log, index) of tableSumary" :key="index" :class="{clickable: log.userName != '(empty)', selected: log.userID == displayOptions.detailsUserID}" @click="(_) => { if(log.userName != '(empty)') { displayOptions.detailsUserID = log.userID; } }">
					{{log.userName}}
					<span>
						<img v-for="c in ['W', 'U', 'B', 'R', 'G'].filter(c => log.colors[c] >= 10)" :key="c" :src="'img/mana/'+c+'.svg'" class="mana-icon" v-tooltip="log.colors[c]">
					</span>
				</li>
			</ul>
		</div>
		
		<div v-if="Object.keys(draftlog.users).includes(displayOptions.detailsUserID)">
			<h2>{{selectedLog.userName}}</h2>
			<select v-model="displayOptions.category">
				<option>Picks</option>
				<option>Cards</option>
				<option>Cards (CMC Columns)</option>
			</select>
			<button @click="exportSingleLog(selectedLog.userID)">Export in MTGA format</button>
			<button @click="downloadMPT(selectedLog.userID)">Download in MTGO format</button>
			<button @click="submitToMPT(selectedLog.userID)">Submit to MagicProTools</button></h1>
			
			<template v-if="displayOptions.category == 'Picks'">
				<div v-for="(pick, index) in selectedLog.picks" :key="index">
					<h3>Pick {{index + 1}}: {{$root.cards[pick.pick].name}}</h3>
					<draft-log-pick :pick="pick"></draft-log-pick>
				</div>
			</template>
			<template v-else-if="displayOptions.category == 'Cards (CMC Columns)'">
				<div class="card-container card-columns">
					<div v-for="(cmc_column, colIndex) in $root.idColumnCMC(selectedLog.cards)" :key="colIndex" class="cmc-column">
						<card v-for="(card, index) in cmc_column" v-bind:key="index" v-bind:card="$root.cards[card]" v-bind:language="$root.language"></card>
					</div>
				</div>
			</template>
			<template v-else>
				<input type="checkbox" name="draft-log-card-list" v-model="displayOptions.textList"><label for="draft-log-card-list">Show simple card list</label>
				<template v-if="displayOptions.textList">
					<ol class="draft-log-boosters-list">
						<li v-for="card in selectedLog.cards" :key="card.uniqueID">{{$root.cards[card].printed_name[$root.language]}}</li>
					</ol>
				</template>
				<template v-else>
					<div class="card-container">
						<card v-for="(card, index) in selectedLog.cards" v-bind:key="index" v-bind:card="$root.cards[card]" v-bind:language="$root.language"></card>
					</div>
				</template>
			</template>
		</div>
	</div>
</template>

<script>
import * as helper from "./../helper.js";
import Card from "./Card.vue";
import DraftLogPick from "./DraftLogPick.vue";

export default {
	name: "DraftLog",
	components: { Card, DraftLogPick },
	props: { draftlog: { type: Object, required: true } },
	data: () => {
		return {
			displayOptions: {
				detailsUserID: undefined,
				category: "Picks",
				textList: false,
			},
		};
	},
	methods: {
		mounted: () => {
			// Displayed log defaults to first player
			if (this.draftLog && this.draftLog.users && Object.keys(this.draftLog.users)[0])
				this.displayOptions.detailsUserID = Object.keys(this.draftLog.users)[0];
		},
		downloadLog: function () {
			let draftLogFull = this.draftlog;
			for (let e in this.draftlog.users) {
				let cards = [];
				for (let c of this.draftlog.users[e].cards) cards.push(this.$root.cards[c]);
				this.draftlog.users[e].exportString = this.$root.exportMTGA(cards, null, this.$root.language);
			}
			helper.download(`DraftLog_${this.draftlog.sessionID}.txt`, JSON.stringify(draftLogFull, null, "\t"));
		},
		downloadMPT: function (id) {
			helper.download(`DraftLog_${id}.txt`, helper.exportToMagicProTools(this.$root.cards, this.draftlog, id));
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
					helper.exportToMagicProTools(this.$root.cards, this.draftlog, id)
				)}&apiKey=yitaOuTvlngqlKutnKKfNA&platform=mtgadraft`,
				method: "POST",
				mode: "cors",
			}).then((response) => {
				if (response.status !== 200) {
					this.$root.fireToast("error", "An error occured submiting log to MagicProTools.");
				} else {
					response.json().then((json) => {
						if (json.error) {
							this.$root.fireToast("error", `Error: ${json.error}.`);
						} else {
							if (json.url) {
								helper.copyToClipboard(json.url);
								this.$root.fireToast("success", "MagicProTools URL copied to clipboard.");
								window.open(json.url, "_blank");
							} else {
								this.$root.fireToast("error", "An error occured submiting log to MagicProTools.");
							}
						}
					});
				}
			});
		},
		exportSingleLog: function (id) {
			let cards = [];
			for (let c of this.draftlog.users[id].cards) cards.push(this.$root.cards[c]);
			helper.copyToClipboard(this.$root.exportMTGA(cards, null, this.$root.language), null, "\t");
			this.$root.fireToast("success", "Card list exported to clipboard!");
		},
		colorsInCardIDList: function(cardids) {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			if (!cardids) return r;
			for (let card of cardids) {
				for (let color of this.$root.cards[card].color_identity) {
					r[color] += 1;
				}
			}
			return r;
		},
	},
	computed: {
		selectedLog: function () {
			return this.draftlog.users[this.displayOptions.detailsUserID];
		},
		tableSumary: function () {
			let tableSumary = [];
			for (let userID in this.draftlog.users) {
				tableSumary.push({
					userID: userID,
					userName: this.draftlog.users[userID].userName,
					colors: this.colorsInCardIDList(this.draftlog.users[userID].cards),
				});
			}
			while (Object.keys(tableSumary).length < 8)
				tableSumary.push({
					userID: "none",
					userName: "(empty)",
					colors: this.colorsInCardIDList([]),
				});
			return tableSumary;
		},
	},
	watch: {
		draftlog: {
			deep: true,
			immediate: true,
			handler() {
				// Displayed log defaults to first player
				if (this.draftlog && this.draftlog.users && Object.keys(this.draftlog.users)[0])
					this.displayOptions.detailsUserID = Object.keys(this.draftlog.users)[0];
			},
		},
	},
};

</script>