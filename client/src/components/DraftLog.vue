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
					class="player-button"
					:class="{
						clickable: log.userName !== '(empty)',
						disabled: log.userName === '(empty)',
						'selected-player': log.userID == displayOptions.detailsUserID,
						teama: type === 'Draft' && teamDraft && index % 2 === 0,
						teamb: type === 'Draft' && teamDraft && index % 2 === 1,
						self: userID === log.userID || userName === log.userName,
					}"
					@click="selectPlayer(log)"
				>
					<div>
						{{ log.userName }}
						<i
							class="fas fa-clipboard-check green"
							v-if="log.hasDeck"
							@click="displayOptions.category = 'Deck'"
							v-tooltip="`${log.userName} submitted their deck.`"
							style="margin: 0 0.5em"
						></i>
					</div>
					<!-- Color Summary of the picks, explicitly hidden for other players if the details are supposed to be delayed (Don't leak it to the owner) -->
					<span class="color-list" v-if="(!draftlog.delayed || log.userID === userID) && log.colors">
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

		<!-- Cards of selected player -->
		<div v-if="Object.keys(draftlog.users).includes(displayOptions.detailsUserID)">
			<!-- Display the log if available (contains cards) and is not delayed or is personal, otherwise only display the deck hash -->
			<template
				v-if="
					(!draftlog.delayed || (draftlog.personalLogs && userID === selectedLog.userID)) &&
					selectedLog.cards?.length > 0
				"
			>
				<div class="section-title">
					<h2>{{ selectedLog.userName }}</h2>
					<div class="controls">
						<select
							v-model="displayOptions.category"
							@change="displayOptions.pack = displayOptions.pick = 0"
						>
							<option>Cards</option>
							<!-- Winston Draft picks display is not implemented -->
							<option v-if="type.includes('Draft') && type !== 'Winston Draft'">Picks</option>
							<option v-if="type.includes('Draft') && type !== 'Winston Draft' && type !== 'Grid Draft'">
								Picks Summary
							</option>
							<option v-if="selectedLogDecklist !== undefined || displayOptions.category === 'Deck'">
								Deck
							</option>
						</select>
						<button
							@click="downloadMPT(selectedLog.userID)"
							v-tooltip="`Download ${selectedLog.userName} picks in MTGO draft log format.`"
							v-if="type === 'Draft'"
						>
							<i class="fas fa-file-download"></i> Download log in MTGO format
						</button>
						<button
							@click="submitToMPT(selectedLog.userID)"
							v-tooltip="
								`Submit ${selectedLog.userName}'s picks to MagicProTools and open it in a new tab.`
							"
							v-if="type === 'Draft'"
						>
							<i class="fas fa-external-link-alt"></i> Submit log to MagicProTools
						</button>
					</div>
				</div>

				<template v-if="displayOptions.category === 'Picks'">
					<template
						v-if="
							displayOptions.pack < picksPerPack.length &&
							displayOptions.pick < picksPerPack[displayOptions.pack].length
						"
					>
						<div style="display: flex; align-items: center; gap: 1em; margin-left: 1em">
							<div>
								<i
									:class="{ disabled: displayOptions.pack <= 0 && displayOptions.pick <= 0 }"
									class="fas fa-chevron-left clickable"
									@click="prevPick"
								></i>
								<label>Pack #</label>
								<select v-model="displayOptions.pack" style="width: 4em">
									<option v-for="index in picksPerPack.length" :key="index" :value="index - 1">
										{{ index }}
									</option>
								</select>
								,
								<label>Pick #</label>
								<select v-model="displayOptions.pick" style="width: 4em">
									<option
										v-for="index in picksPerPack[displayOptions.pack].length"
										:key="index"
										:value="index - 1"
									>
										{{ index }}
									</option>
								</select>
								<i
									:class="{
										disabled:
											displayOptions.pack >= picksPerPack.length - 1 &&
											displayOptions.pick >= picksPerPack[displayOptions.pack].length - 1,
									}"
									class="fas fa-chevron-right clickable"
									@click="nextPick"
								></i>
							</div>
							<h2>
								{{
									picksPerPack[displayOptions.pack][displayOptions.pick].data.pick
										.map(
											(idx) =>
												draftlog.carddata[
													picksPerPack[displayOptions.pack][displayOptions.pick].data.booster[
														idx
													]
												].name
										)
										.join(", ")
								}}
							</h2>
						</div>
						<draft-log-pick
							:pick="picksPerPack[displayOptions.pack][displayOptions.pick].data"
							:carddata="draftlog.carddata"
							:language="language"
							:type="draftlog.type"
						></draft-log-pick>
					</template>
					<template v-else><div class="log-container">No picks.</div></template>
				</template>
				<template v-else-if="displayOptions.category === 'Cards'">
					<div class="log-container">
						<card-pool
							:cards="selectedLogCards"
							:language="language"
							:readOnly="true"
							:group="`cardPool-${selectedLog.userID}`"
							:key="`cardPool-${selectedLog.userID}`"
						>
							<template v-slot:title>Cards ({{ selectedLogCards.length }})</template>
							<template v-slot:controls>
								<ExportDropdown :language="language" :deck="selectedLogCards" />
							</template>
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
				<template v-else-if="displayOptions.category === 'Picks Summary'">
					<div class="log-container">
						<draft-log-picks-summary
							:picks="picksPerPack"
							:carddata="draftlog.carddata"
							:language="language"
							@selectPick="
								(pack, pick) => {
									displayOptions.pack = pack;
									displayOptions.pick = pick;
									displayOptions.category = 'Picks';
								}
							"
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
	</div>
</template>

<script>
import * as helper from "../helper";
import { fireToast } from "../alerts";

import CardPool from "./CardPool.vue";
import Decklist from "./Decklist.vue";
import DraftLogPick from "./DraftLogPick.vue";
import DraftLogPicksSummary from "./DraftLogPicksSummary.vue";
import ExportDropdown from "./ExportDropdown.vue";

export default {
	name: "DraftLog",
	components: { CardPool, DraftLogPick, DraftLogPicksSummary, Decklist, ExportDropdown },
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
				pack: 0,
				pick: 0,
			},
		};
	},
	mounted() {
		if (this.draftlog && this.draftlog.users) {
			const userIDs = Object.keys(this.draftlog.users);
			if (userIDs.length > 0) {
				this.displayOptions.detailsUserID = userIDs[0]; // Fallback to the first player in the list
				// Tries to display the user's picks by default, checking by ID then username
				if (userIDs.includes(this.userID)) this.displayOptions.detailsUserID = this.userID;
				else
					for (let uid of userIDs)
						if (this.draftlog.users[uid].userName === this.userName)
							this.displayOptions.detailsUserID = uid;
				// Defaults to deck display if available
				if (
					this.displayOptions.detailsUserID &&
					this.hasSubmittedDeck(this.draftlog.users[this.displayOptions.detailsUserID]) &&
					(this.draftlog.users[this.displayOptions.detailsUserID].decklist.main?.length > 0 ||
						this.draftlog.users[this.displayOptions.detailsUserID].decklist.side?.length > 0)
				)
					this.displayOptions.category = "Deck";
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
		prevPick() {
			if (this.displayOptions.pick === 0) {
				if (this.displayOptions.pack === 0) return;
				--this.displayOptions.pack;
				this.displayOptions.pick = this.picksPerPack[this.displayOptions.pack].length - 1;
			} else {
				--this.displayOptions.pick;
			}
		},
		nextPick() {
			if (this.displayOptions.pick === this.picksPerPack[this.displayOptions.pack].length - 1) {
				if (this.displayOptions.pack === this.picksPerPack.length - 1) return;
				++this.displayOptions.pack;
				this.displayOptions.pick = 0;
			} else {
				++this.displayOptions.pick;
			}
		},
		hasSubmittedDeck(log) {
			return (
				log?.decklist && (log.decklist.main?.length > 0 || log.decklist.side?.length > 0 || log.decklist.hashes)
			);
		},
		selectPlayer(userLogSummary) {
			if (userLogSummary.userName !== "(empty)") {
				this.displayOptions.detailsUserID = userLogSummary.userID;
				if (userLogSummary.hasDeck) {
					if (this.displayOptions.category === "Cards") this.displayOptions.category = "Deck";
				} else {
					if (this.displayOptions.category === "Deck") this.displayOptions.category = "Cards";
				}
				this.displayOptions.pack = this.displayOptions.pick = 0;
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
			return this.selectedLog.cards.map((cid) =>
				Object.assign({ uniqueID: ++uniqueID }, this.draftlog.carddata[cid])
			);
		},
		selectedLogDecklist() {
			if (!this.hasSubmittedDeck(this.selectedLog)) return undefined;
			return this.selectedLog.decklist;
		},
		tableSummary() {
			// Aggregate information about each player
			let tableSummary = [];
			for (let userID in this.draftlog.users) {
				tableSummary.push({
					userID: userID,
					userName: this.draftlog.users[userID].userName,
					hasDeck: this.hasSubmittedDeck(this.draftlog.users[userID]),
					colors:
						this.draftlog.users[userID].decklist?.main?.length > 0
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
		picksPerPack() {
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
							r.push([]);
						} else ++currPickNumber;
						r[currBooster].push({
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
					return this.selectedLog.picks.map((p) => {
						return [
							{
								key: key,
								data: p,
								packNumber: key++,
								pickNumber: 0,
							},
						];
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
				if (
					this.draftlog &&
					this.draftlog.users &&
					Object.keys(this.draftlog.users)[0] &&
					!this.draftlog.users[this.displayOptions.detailsUserID]
				)
					this.displayOptions.detailsUserID = Object.keys(this.draftlog.users)[0];
			},
		},
		displayOptions: {
			deep: true,
			immediate: true,
			handler() {
				if (this.picksPerPack.length > this.displayOptions.pack)
					this.displayOptions.pick = Math.min(
						this.displayOptions.pick,
						this.picksPerPack[this.displayOptions.pack].length - 1
					); // Make sure pick is still valid.
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

	border: 1px solid #282828;
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

ul.player-table li:nth-child(1) {
	order: 1;
}
ul.player-table li:nth-child(2) {
	order: 2;
}
ul.player-table li:nth-child(3) {
	order: 3;
}
ul.player-table li:nth-child(4) {
	order: 4;
}
ul.player-table li:nth-child(5) {
	order: 8;
}
ul.player-table li:nth-child(6) {
	order: 7;
}
ul.player-table li:nth-child(7) {
	order: 6;
}
ul.player-table li:nth-child(8) {
	order: 5;
}

ul.player-table.six li:nth-child(4) {
	order: 6;
}
ul.player-table.six li:nth-child(5) {
	order: 5;
}
ul.player-table.six li:nth-child(6) {
	order: 4;
}

ul.player-table li:nth-child(6):after,
ul.player-table li:nth-child(7):after,
ul.player-table li:nth-child(8):after,
ul.player-table.six li:nth-child(5):after,
ul.player-table.six li:nth-child(6):after {
	position: absolute;
	top: 0;
	right: calc(-2rem + 1px);
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100"; /* << */
}

ul.player-table li:nth-child(2):after,
ul.player-table li:nth-child(3):after,
ul.player-table li:nth-child(4):after,
ul.player-table.six li:nth-child(2):after,
ul.player-table.six li:nth-child(3):after {
	position: absolute;
	top: 0;
	left: calc(-2rem + 1px);
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f101"; /* >> */
}

ul.player-table li:nth-child(5):before,
ul.player-table.six li:nth-child(4):before {
	position: absolute;
	top: calc(-2rem - 2px);
	left: calc(50%);
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100";
	transform: translateX(-50%) rotate(-90deg);
}

ul.player-table li:nth-child(1):before,
ul.player-table.six li:nth-child(1):before {
	position: absolute;
	bottom: calc(-2rem - 2px);
	left: calc(50%);
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100";
	transform: translateX(-50%) rotate(90deg);
}

ul.player-table.six li:nth-child(4):after,
ul.player-table.six li:nth-child(5):before {
	content: "";
}

.player-button.selected-player {
	box-shadow: inset 0px 0px 8px 2px rgb(99, 101, 149);
	background-color: #666;
}

.player-button.self {
	background-color: #505056;
}

.player-button.selected-player {
	background-color: #606068;
}

.player-button.clickable:not(.selected-player) {
	box-shadow: inset 2px 2px 2px 0px rgba(255, 255, 255, 0.2), inset -2px -2px 2px 0px rgba(0, 0, 0, 0.2);
}

.player-button.clickable:not(.selected-player):hover {
	background-color: #585858;
	color: white;
}

.player-button.clickable:not(.selected-player):active {
	box-shadow: inset 2px 2px 2px 0px rgba(0, 0, 0, 0.2), inset -2px -2px 2px 0px rgba(255, 255, 255, 0.2);
}
</style>
