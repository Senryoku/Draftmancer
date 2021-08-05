<template>
	<div v-if="draftlog.version === '2.0'">
		<!-- Table -->
		<div>
			<p>Click on a player to display their details.</p>
			<ul
				:class="{
					'player-table': type === 'Draft' && tableSummary.length <= 8,
					'player-list-log': type !== 'Draft' || tableSummary.length > 8,
					six: type === 'Draft' && tableSummary.length === 6,
				}"
			>
				<li
					v-for="(log, index) of tableSummary"
					:key="index"
					:class="{
						clickable: log.userName !== '(empty)',
						'selected-player': log.userID == displayOptions.detailsUserID,
						teama: type === 'Draft' && teamDraft && index % 2 === 0,
						teamb: type === 'Draft' && teamDraft && index % 2 === 1,
						self: userID === log.userID || userName === log.userName,
					}"
					@click="
						() => {
							if (log.userName !== '(empty)') displayOptions.detailsUserID = log.userID;
						}
					"
				>
					<div>
						{{ log.userName }}
						<i
							class="fas fa-clipboard-check green"
							v-if="log.hasDeck"
							@click="displayOptions.category = 'Deck'"
							v-tooltip="`${log.userName} submited their deck.`"
							style="margin: 0 0.5em"
						></i>
					</div>
					<span class="color-list" v-if="log.colors">
						<img
							v-for="c in ['W', 'U', 'B', 'R', 'G'].filter(c => log.colors[c] >= 10)"
							:key="c"
							:src="'img/mana/' + c + '.svg'"
							class="mana-icon"
							v-tooltip="log.colors[c]"
						/>
					</span>
				</li>
			</ul>
		</div>

		<!-- Cards of selected player -->
		<div v-if="Object.keys(draftlog.users).includes(displayOptions.detailsUserID)">
			<template v-if="!draftlog.delayed">
				<div class="section-title">
					<h2>{{ selectedLog.userName }}</h2>
					<div class="controls">
						<select v-model="displayOptions.category">
							<option>Cards</option>
							<!-- Winston Draft picks display is not implemented -->
							<option v-if="type.includes('Draft') && type !== 'Winston Draft'">Picks</option>
							<option v-if="selectedLogDecklist !== undefined || displayOptions.category === 'Deck'">
								Deck
							</option>
						</select>
						<button
							@click="exportSingleLog(selectedLog.userID)"
							v-tooltip="
								`Copy ${selectedLog.userName}'s cards to your clipboard in MTGA format.`
							"
						>
							<img class="set-icon" src="./assets/img/mtga-icon.png" /> Export Card List
						</button>
						<button
							@click="downloadMPT(selectedLog.userID)"
							v-tooltip="`Download ${selectedLog.userName} picks in MTGO draft log format.`"
							v-if="type === 'Draft'"
						>
							<i class="fas fa-file-download"></i> Download Log
						</button>
						<button
							@click="submitToMPT(selectedLog.userID)"
							v-tooltip="
								`Submit ${selectedLog.userName}'s picks to MagicProTools and copy link.`
							"
							v-if="type === 'Draft'"
						>
							<i class="fas fa-share-square"></i> Export Log to MagicProTools
						</button>
					</div>
				</div>

				<template v-if="displayOptions.category === 'Picks'">
					<div v-for="p in picks" :key="p.key">
						<h3>
							Pack {{ p.packNumber + 1 }}, Pick {{ p.pickNumber + 1 }}:
							{{ p.data.pick.map(idx => draftlog.carddata[p.data.booster[idx]].name).join(", ") }}
						</h3>
						<draft-log-pick
							:pick="p.data"
							:carddata="draftlog.carddata"
							:language="language"
							:type="draftlog.type"
						></draft-log-pick>
					</div>
				</template>
				<template v-else-if="displayOptions.category === 'Cards'">
					<div class="log-container">
						<card-pool
							:cards="selectedLogCards"
							:language="language"
							:group="`cardPool-${selectedLog.userID}`"
							:key="`cardPool-${selectedLog.userID}`"
						>
							<template v-slot:title>Cards ({{ selectedLogCards.length }})</template>
						</card-pool>
					</div>
				</template>
				<template v-else-if="displayOptions.category === 'Deck'">
					<div class="log-container">
						<decklist
							:list="selectedLogDecklist"
							:username="selectedLog.userName"
							:carddata="draftlog.carddata"
							:language="language"
							:hashesonly="selectedLog.delayed"
						/>
					</div>
				</template>
			</template>
			<template v-else>
				<decklist
					:list="selectedLogDecklist"
					:username="selectedLog.userName"
					:carddata="draftlog.carddata"
					:language="language"
					:hashesonly="true"
				/>
			</template>
		</div>
	</div>
	<div v-else>
		<h2>Incompatible draft log version</h2>
		<button @click="updateToV2">Convert Draft Log to latest version</button>
	</div>
</template>

<script>
import * as helper from "../helper.js";
import { fireToast } from "../alerts.js";
import exportToMTGA from "../exportToMTGA.js";
import parseCost from "../../../src/parseCost.ts";

import CardPool from "./CardPool.vue";
import Decklist from "./Decklist.vue";
import DraftLogPick from "./DraftLogPick.vue";

export default {
	name: "DraftLog",
	components: { CardPool, DraftLogPick, Decklist },
	props: {
		draftlog: { type: Object, required: true },
		language: { type: String, required: true },
		userID: { type: String },
		userName: { type: String },
	},
	data() {
		return {
			displayOptions: {
				detailsUserID: undefined,
				category: "Cards",
				textList: false,
			},
		};
	},
	mounted() {
		if (this.draftlog && this.draftlog.users) {
			const userIDs = Object.keys(this.draftlog.users);
			if (userIDs.length > 0) {
				this.displayOptions.detailsUserID = userIDs[0]; // Default to first player
				if (userIDs.includes(this.userID)) this.displayOptions.detailsUserID = this.userID;
				else
					for (let uid of userIDs)
						if (this.draftlog.users[uid].userName === this.userName)
							this.displayOptions.detailsUserID = uid;
			}
		}
	},
	methods: {
		downloadMPT(id) {
			helper.download(`DraftLog_${id}.txt`, helper.exportToMagicProTools(this.draftlog, id));
		},
		submitToMPT(id) {
			fetch("https://magicprotools.com/api/draft/add", {
				credentials: "omit",
				headers: {
					Accept: "application/json, text/plain, */*",
					"Content-Type": "application/x-www-form-urlencoded",
				},
				referrer: "https://www.mtgadraft.tk",
				body: `draft=${encodeURI(
					helper.exportToMagicProTools(this.draftlog, id)
				)}&apiKey=yitaOuTvlngqlKutnKKfNA&platform=mtgadraft`,
				method: "POST",
				mode: "cors",
			}).then(response => {
				if (response.status !== 200) {
					fireToast("error", "An error occured submiting log to MagicProTools.");
				} else {
					response.json().then(json => {
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
		exportSingleLog(id) {
			helper.copyToClipboard(
				exportToMTGA(
					this.draftlog.users[id].cards.map(cid => this.draftlog.carddata[cid]),
					null,
					this.language
				),
				null,
				"\t"
			);
			fireToast("success", "Card list exported to clipboard!");
		},
		colorsInCardList(cards) {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			if (!cards) return r;
			for (let cid of cards) {
				for (let color of this.draftlog.carddata[cid].colors) {
					r[color] += 1;
				}
			}
			return r;
		},
		async updateToV2() {
			if (!this.draftlog.version || this.draftlog.version === "1.0") {
				const MTGACards = await (() => import("../../public/data/MTGACards.json"))();
				for (let c in MTGACards) Object.assign(MTGACards[c], parseCost(MTGACards[c].mana_cost));
				const updateCIDs = arr => arr.map(cid => MTGACards[cid].id);
				// Replaces ArenaIDs by entire card objects for boosters and indices of the booster for picks
				for (let u in this.draftlog.users) {
					for (let p of this.draftlog.users[u].picks) {
						p.pick = [p.booster.findIndex(cid => cid === p.pick)];
						for (let i = 0; i < p.burn.length; ++i)
							p.burn[i] = p.booster.findIndex(cid => cid === p.burn[i]);
						// UniqueID should be consistent across pick and with the boosters array, but it's not used right now...
						p.booster = p.booster.map(cid => MTGACards[cid].id);
					}
					this.draftlog.users[u].cards = updateCIDs(this.draftlog.users[u].cards);
					if (this.draftlog.users[u].decklist) {
						this.draftlog.users[u].decklist.main = updateCIDs(this.draftlog.users[u].decklist.main);
						this.draftlog.users[u].decklist.side = updateCIDs(this.draftlog.users[u].decklist.side);
					}
				}
				this.draftlog.carddata = {};
				for (let cid of this.draftlog.boosters.flat())
					this.draftlog.carddata[MTGACards[cid].id] = MTGACards[cid];
				for (let i = 0; i < this.draftlog.boosters.length; ++i)
					this.draftlog.boosters[i] = updateCIDs(this.draftlog.boosters[i]);
				this.$set(this.draftlog, "version", "2.0");
				this.$emit("storelogs");
			}
		},
	},
	computed: {
		type() {
			return this.draftlog.type ? this.draftlog.type : "Draft";
		},
		selectedLog() {
			return this.draftlog.users[this.displayOptions.detailsUserID];
		},
		selectedLogCards() {
			let uniqueID = 0;
			return this.selectedLog.cards.map(cid =>
				Object.assign({ uniqueID: ++uniqueID }, this.draftlog.carddata[cid])
			);
		},
		selectedLogDecklist() {
			return this.selectedLog.decklist;
		},
		tableSummary() {
			// Aggregate information about each player
			let tableSummary = [];
			for (let userID in this.draftlog.users) {
				tableSummary.push({
					userID: userID,
					userName: this.draftlog.users[userID].userName,
					hasDeck: !!this.draftlog.users[userID].decklist,
					colors: this.draftlog.users[userID].decklist
						? this.colorsInCardList(this.draftlog.users[userID].decklist.main)
						: this.type === "Draft"
						? this.colorsInCardList(this.draftlog.users[userID].cards)
						: null,
				});
			}
			// Add empty seats to better visualize the draft table
			while ((this.type === "Draft" && tableSummary.length < 6) || tableSummary.length === 7)
				tableSummary.push({
					userID: "none",
					userName: "(empty)",
					colors: this.colorsInCardList([]),
				});
			return tableSummary;
		},
		teamDraft() {
			return this.draftlog.teamDraft;
		},
		picks() {
			if (!this.selectedLog || !this.selectedLog.picks || this.selectedLog.picks.length === 0) return [];
			switch (this.type) {
				default:
					return [];
				case "Rochester Draft":
				case "Draft": {
					// Infer PackNumber & PickNumber
					let r = [];
					let currPick = 0;
					let currBooster = -1;
					let lastSize = 0;
					let currPickNumber = 0;
					while (currPick < this.selectedLog.picks.length) {
						if (this.selectedLog.picks[currPick].booster.length > lastSize) {
							++currBooster;
							currPickNumber = 0;
						} else ++currPickNumber;
						r.push({
							key: currPick,
							data: this.selectedLog.picks[currPick],
							packNumber: currBooster,
							pickNumber: currPickNumber,
						});
						lastSize = this.selectedLog.picks[currPick].booster.length;
						++currPick;
					}
					return r;
				}
				case "Winston Draft": // TODO
					return [];
				case "Grid Draft": {
					let key = 0;
					return this.selectedLog.picks.map(p => {
						return {
							key: key,
							data: p,
							packNumber: key++,
							pickNumber: 0,
						};
					});
				}
			}
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
.log-container {
	background-color: #282828;
	border-radius: 10px;
	box-shadow: inset 0 0 8px #383838;
	padding: 0.5em;
}

.mana-icon {
	vertical-align: sub;
}

ul.player-list-log,
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

ul.player-list-log li,
ul.player-table li {
	display: inline-flex;
	justify-content: space-between;

	border: 1px solid black;
	margin: var(--margin);
	padding: 0.5em;
	border-radius: 0.2em;
	background-color: #555;
}

ul.player-table li {
	width: calc(100% / var(--halflength) - 1% - 2 * var(--margin) - 1em);
	max-width: calc(100% / var(--halflength) - 1% - 2 * var(--margin) - 1em);
	position: relative;
}

ul.player-list-log > li {
	margin-right: 0.75em;
}

.color-list > img {
	margin-left: 0.25em;
	margin-right: 0.25em;
}

ul.player-list-log li.selected-player,
ul.player-table li.selected-player {
	-webkit-box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
	-moz-box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
	box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
	font-weight: bold;
}

ul.player-list-log li.selected-player.self,
ul.player-table li.selected-player.self {
	-webkit-box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1), inset 0 0 5px 0px rgba(255, 255, 255, 0.3);
	-moz-box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1) inset 0 0 5px 0px rgba(255, 255, 255, 0.3);
	box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1), inset 0 0 5px 0px rgba(255, 255, 255, 0.3);
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
	content: "";
}
</style>
