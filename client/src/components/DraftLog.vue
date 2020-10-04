<template>
	<div>
		<p>Click on a player to display the details of their draft.</p>

		<div>
			<ul :class="{
				'player-table': tableSummary.length <= 8,
				'player-list': tableSummary.length > 8,
				'six': tableSummary.length === 6,
			}">
				<li
					v-for="(log, index) of tableSummary"
					:key="index"
					:class="{
						clickable: log.userName != '(empty)',
						'selected-player': log.userID == displayOptions.detailsUserID,
						teama: teamDraft && index % 2 === 0,
						teamb: teamDraft && index % 2 === 1,
					}"
					@click="
						() => {
							if (log.userName != '(empty)') displayOptions.detailsUserID = log.userID;
						}
					"
				>
					<span>{{ log.userName }}</span>
					<span class="color-list">
						<img
							v-for="c in ['W', 'U', 'B', 'R', 'G'].filter((c) => log.colors[c] >= 10)"
							:key="c"
							:src="'img/mana/' + c + '.svg'"
							class="mana-icon"
							v-tooltip="log.colors[c]"
						/>
					</span>
				</li>
			</ul>
		</div>

		<div v-if="Object.keys(draftlog.users).includes(displayOptions.detailsUserID)">
			<h2>{{ selectedLog.userName }}</h2>
			<select v-model="displayOptions.category">
				<option>Cards</option>
				<option>Picks</option>
				<option v-if="selectedLogDecklist !== undefined || displayOptions.category === 'Deck'">Deck</option>
			</select>
			<button @click="exportSingleLog(selectedLog.userID)">
				<i class="fas fa-clipboard-list"></i> Export in MTGA format
			</button>
			<button @click="downloadMPT(selectedLog.userID)">
				<i class="fas fa-file-download"></i> Download in MTGO format
			</button>
			<button @click="submitToMPT(selectedLog.userID)">
				<i class="fas fa-external-link-alt"></i> Submit to MagicProTools
			</button>

			<template v-if="displayOptions.category == 'Picks'">
				<div v-for="(pick, index) in selectedLog.picks" :key="index">
					<h3>Pick {{ index + 1 }}: {{ getCard(pick.pick).name }}</h3>
					<draft-log-pick :pick="pick" :language="language"></draft-log-pick>
				</div>
			</template>
			<template v-else-if="displayOptions.category == 'Cards'">
				<div class="card-container card-columns">
					<card-pool
						:cards="selectedLogCards"
						:language="language"
						:group="`cardPool-${selectedLog.userID}`"
						:key="`cardPool-${selectedLog.userID}`"
					></card-pool>
				</div>
			</template>
			<template v-else-if="displayOptions.category == 'Deck'">
				<div class="card-container card-columns" v-if="selectedLogDecklist">
					<div class="section-title">
						<h2>Mainboard ({{ selectedLogDecklist.main.length }})</h2>
						<div class="controls">
							Added basics:
							<span
								v-for="c in ['W', 'U', 'B', 'R', 'G'].filter((c) => selectedLogDecklist.lands[c] > 0)"
								:key="c"
							>
								<img :src="`img/mana/${c}.svg`" class="mana-icon" style="vertical-align: text-bottom" />
								{{ selectedLogDecklist.lands[c] }}
							</span>
							<div>
								<button type="button" @click="exportDeck" v-tooltip="'Export deck and sideboard'">
									<i class="fas fa-clipboard-list"></i> Export Deck to MTGA
								</button>
								<button
									type="button"
									@click="exportDeck(false)"
									v-tooltip="'Export without set information'"
								>
									<i class="fas fa-clipboard"></i> Export (Simple)
								</button>
							</div>
							<template v-if="selectedLogDecklist.hashes">
								<span>Cockatrice: {{ selectedLogDecklist.hashes.cockatrice }}</span>
								<span>MWS: {{ selectedLogDecklist.hashes.mws }}</span>
							</template>
						</div>
					</div>
					<card-pool
						:cards="selectedLogDecklistMainboard"
						:language="language"
						:group="`deck-${selectedLog.userID}`"
						:key="`deck-${selectedLog.userID}`"
					></card-pool>
					<div class="section-title">
						<h2>Sideboard ({{ selectedLogDecklist.side.length }})</h2>
					</div>
					<card-pool
						:cards="selectedLogDecklistSideboard"
						:language="language"
						:group="`side-${selectedLog.userID}`"
						:key="`side-${selectedLog.userID}`"
					></card-pool>
				</div>
				<div class="card-container" v-else>
					<p>{{ selectedLog.userName }} did not submit their decklist.</p>
				</div>
			</template>
		</div>
	</div>
</template>

<script>
import * as helper from "../helper.js";
import { fireToast } from "../alerts.js";
import { Cards, genCard } from "../Cards.js";
import exportToMTGA from "../exportToMTGA.js";

import CardPool from "./CardPool.vue";
import DraftLogPick from "./DraftLogPick.vue";

export default {
	name: "DraftLog",
	components: { CardPool, DraftLogPick },
	props: {
		draftlog: { type: Object, required: true },
		language: { type: String, required: true },
	},
	data: () => {
		return {
			displayOptions: {
				detailsUserID: undefined,
				category: "Cards",
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
		getCard: function (cid) {
			return Cards[cid];
		},
		downloadMPT: function (id) {
			helper.download(`DraftLog_${id}.txt`, helper.exportToMagicProTools(Cards, this.draftlog, id));
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
					helper.exportToMagicProTools(Cards, this.draftlog, id)
				)}&apiKey=yitaOuTvlngqlKutnKKfNA&platform=mtgadraft`,
				method: "POST",
				mode: "cors",
			}).then((response) => {
				if (response.status !== 200) {
					fireToast("error", "An error occured submiting log to MagicProTools.");
				} else {
					response.json().then((json) => {
						if (json.error) {
							fireToast("error", `Error: ${json.error}.`);
						} else {
							if (json.url) {
								helper.copyToClipboard(json.url);
								fireToast("success", "MagicProTools URL copied to clipboard.");
								window.open(json.url, "_blank");
							} else {
								fireToast("error", "An error occured submiting log to MagicProTools.");
							}
						}
					});
				}
			});
		},
		exportSingleLog: function (id) {
			let cards = [];
			for (let c of this.draftlog.users[id].cards) cards.push(Cards[c]);
			helper.copyToClipboard(exportToMTGA(cards, null, this.language), null, "\t");
			fireToast("success", "Card list exported to clipboard!");
		},
		exportDeck: function (full = true) {
			helper.copyToClipboard(
				exportToMTGA(
					this.selectedLogDecklistMainboard,
					this.selectedLogDecklistSideboard,
					this.language,
					this.selectedLogDecklist.lands,
					full
				)
			);
			fireToast("success", "Deck exported to clipboard!");
		},
		colorsInCardIDList: function (cardids) {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			if (!cardids) return r;
			for (let card of cardids) {
				for (let color of Cards[card].colors) {
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
		selectedLogCards: function () {
			return this.selectedLog.cards.map((cid) => genCard(cid));
		},
		selectedLogDecklist: function () {
			return this.selectedLog.decklist;
		},
		selectedLogDecklistMainboard: function () {
			return this.selectedLogDecklist.main.map((cid) => genCard(cid));
		},
		selectedLogDecklistSideboard: function () {
			return this.selectedLogDecklist.side.map((cid) => genCard(cid));
		},
		tableSumary: function () {
			let tableSumary = [];
			for (let userID in this.draftlog.users) {
				tableSummary.push({
					userID: userID,
					userName: this.draftlog.users[userID].userName,
					colors: this.colorsInCardIDList(this.draftlog.users[userID].cards),
				});
			}
			while (Object.keys(tableSummary).length < 6 || Object.keys(tableSummary).length === 7)
				tableSummary.push({
					userID: "none",
					userName: "(empty)",
					colors: this.colorsInCardIDList([]),
				});
			return tableSummary;
		},
		teamDraft: function () {
			return this.draftlog.teamDraft === true;
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

<style scoped>
ul.player-table {
	display: flex;
	flex-wrap: wrap;
	list-style: none;
	--margin: 1rem;
	--halflength: 4;
}

ul.player-table.six {
	--halflength: 3;
}

ul.player-list li,
ul.player-table li {
	width: calc(100%/var(--halflength) - 1% - 2 * var(--margin) - 1em);
	max-width: calc(100%/var(--halflength) - 1% - 2 * var(--margin) - 1em);
	border: 1px solid black;
	margin: var(--margin);
	position: relative;
	padding: 0.5em;
	border-radius: 0.2em;

	display: inline-flex;
	justify-content: space-between;
}

ul.player-list > li {
	margin-right: 0.5em;
}

.color-list > img {
	margin-left: 0.25em;
	margin-right: 0.25em;
}

ul.player-list li.selected-player,
ul.player-table li.selected-player {
	-webkit-box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
	-moz-box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
	box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
	font-weight: bold;
}

ul.player-table li:nth-child(1) {
	order: 5;
}
ul.player-table li:nth-child(2) {
	order: 6;
}
ul.player-table li:nth-child(3) {
	order: 7;
}
ul.player-table li:nth-child(4) {
	order: 8;
}
ul.player-table li:nth-child(5) {
	order: 4;
}
ul.player-table li:nth-child(6) {
	order: 3;
}
ul.player-table li:nth-child(7) {
	order: 2;
}
ul.player-table li:nth-child(8) {
	order: 1;
}

ul.player-table.six li:nth-child(4) {
	order: 3;
}
ul.player-table.six li:nth-child(5) {
	order: 2;
}
ul.player-table.six li:nth-child(6) {
	order: 1;
}

ul.player-table li:nth-child(1):after,
ul.player-table li:nth-child(2):after,
ul.player-table li:nth-child(3):after {
	position: absolute;
	top: 0;
	right: calc(-2rem + 1px);
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100";
}

ul.player-table li:nth-child(5):after,
ul.player-table li:nth-child(6):after,
ul.player-table li:nth-child(7):after,
ul.player-table.six li:nth-child(4):after,
ul.player-table.six li:nth-child(5):after {
	position: absolute;
	top: 0;
	left: calc(-2rem + 1px);
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f101";
}

ul.player-table li:nth-child(4):before,
ul.player-table.six li:nth-child(3):before {
	position: absolute;
	top: calc(-2rem - 2px);
	left: calc(50%);
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100";
	transform: translateX(-50%) rotate(-90deg);
}

ul.player-table li:nth-child(8):before,
ul.player-table.six li:nth-child(6):before {
	position: absolute;
	bottom: calc(-2rem - 2px);
	left: calc(50%);
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100";
	transform: translateX(-50%) rotate(90deg);
}

ul.player-table.six li:nth-child(3):after,
ul.player-table.six li:nth-child(6):after,
ul.player-table.six li:nth-child(4):before {
	content: ""
}

</style>
