<template>
	<div class="draft-log-history">
		<input type="file" id="log-input" @change="importLog" style="display: none" accept=".txt" />
		<div class="controls">
			<button onclick="document.querySelector('#log-input').click()" v-tooltip="'Import a saved game log.'">
				Import Game Log
			</button>
			<span>({{ draftLogs.length }} / 25 logs)</span>
			<span v-if="draftLogs.length >= 25"
				><i class="fas fa-exclamation-triangle yellow"></i> Your history is full, new logs will overwrite the
				oldest ones.</span
			>
		</div>
		<div v-if="!draftLogs || draftLogs.length === 0" class="log empty-history">
			No saved game logs.
			<br />Your logs will be visible here after you've completed a game.
		</div>
		<div v-for="(draftLog, idx) in orderedLogs" :key="idx" class="log">
			<div class="log-controls" @click.self="toggle(idx)">
				<span @click="toggle(idx)" class="clickable flex-row">
					<i
						v-if="!draftLog.delayed"
						class="fa"
						:class="{
							'fa-chevron-down': expandedLogs[idx],
							'fa-chevron-up': !expandedLogs[idx],
						}"
					></i>
					<i class="fas fa-lock" v-else></i>
					<span>
						{{ printableType(draftLog) }}
						- Session '{{ draftLog.sessionID }}'
						<span v-if="draftLog.time">({{ new Date(draftLog.time).toLocaleString() }})</span>
					</span>
				</span>
				<template v-if="draftLog.delayed">
					<template v-if="shareable(draftLog)">
						<!-- User (the session owner during the draft) has the full logs ready to be shared -->
						<span style="pointer-events: none">
							(Partial: The complete log is locked until you share it)
						</span>
						<button @click="$emit('sharelog', draftLog)">
							<i class="fas fa-share-square"></i> Share with session and unlock
						</button>
					</template>
					<template v-else
						><span style="pointer-events: none"
							>(Partial: Complete log is locked until the session owner shares it)</span
						></template
					>
				</template>
				<span class="flex-row">
					<button class="flat" @click="toggle(idx)">
						<template v-if="expandedLogs[idx]"> <i class="far fa-eye-slash"></i> Close</template>
						<template v-else> <i class="far fa-eye"></i> Review</template>
					</button>
					<dropdown v-if="!draftLog.delayed" :class="{ disabled: !hasDecks(draftLog) }">
						<template v-slot:handle>
							<span>Download all decks</span>
						</template>
						<template v-slot:dropdown>
							<div class="more-dropdown">
								<div
									style="
										display: grid;
										grid-template-columns: auto auto;
										justify-items: center;
										align-items: center;
									"
								>
									<label for="deck-export-format">Format:</label>
									<select id="deck-export-format" v-model="deckExportFormat">
										<option value=".dek">MTGO (.dek)</option>
										<option value="MTGA">MTGA</option>
										<option value="card names">Card Names</option>
									</select>
									<label for="deck-export-with-lands">Basics:</label>
									<input type="checkbox" id="deck-export-with-lands" v-model="deckExportWithBasics" />
								</div>
								<button
									type="button"
									@click="downloadAllDecks(draftLog, deckExportFormat, deckExportWithBasics)"
								>
									Download
								</button>
							</div>
						</template>
					</dropdown>
					<button type="button" @click="downloadLog(draftLog)" v-if="!draftLog.delayed">
						<i class="fas fa-file-download"></i> Download
					</button>
					<button type="button" class="disabled" v-else><i class="fas fa-file-download"></i> Download</button>
					<button type="button" class="stop" @click="deleteLog(draftLog)">
						<i class="fas fa-trash"></i> Delete
					</button>
				</span>
			</div>
			<transition name="scale">
				<draft-log
					v-if="expandedLogs[idx]"
					:draftlog="draftLog"
					:language="language"
					:userID="userID"
					:userName="userName"
					@storelogs="$emit('storelogs')"
				></draft-log>
			</transition>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { ButtonColor, Alert } from "../alerts";
import * as helper from "../helper";
import Dropdown from "./Dropdown.vue";
import DraftLogComponent from "./DraftLog.vue";
import { DraftLog } from "../../../src/DraftLog";
import { Language } from "../../../src/Types";
import { UserID } from "../../../src/IDTypes";
import exportToMTGO from "../exportToMTGO";
import { exportToMTGA } from "../exportToMTGA";

export default defineComponent({
	components: { DraftLog: DraftLogComponent, Dropdown },
	props: {
		draftLogs: { type: Array as PropType<DraftLog[]>, required: true },
		language: { type: String as PropType<Language>, required: true },
		userID: { type: String as PropType<UserID>, required: true },
		userName: { type: String },
	},
	data: () => {
		return {
			expandedLogs: {} as { [idx: number]: boolean },
			deckExportFormat: ".dek" as ".dek" | "MTGA" | "card names",
			deckExportWithBasics: false,
		};
	},
	computed: {
		orderedLogs: function () {
			return [...this.draftLogs].sort((lhs: DraftLog, rhs: DraftLog) => rhs.time - lhs.time);
		},
	},
	methods: {
		shareable(draftlog: DraftLog) {
			// Returns true if the draftlog is shareable, i.e. the full log is locally available and is marked as delayed (other players in the session should only have a partial log)
			return draftlog?.delayed && draftlog.users && Object.values(draftlog.users).every((user) => user.cards);
		},
		downloadLog(draftLog: DraftLog) {
			helper.download(
				`DraftLog_${draftLog.sessionID.replace(/\W/g, "")}.txt`,
				JSON.stringify(draftLog, null, "\t")
			);
		},
		hasDecks(draftLog: DraftLog) {
			return Object.values(draftLog.users).some(
				(user) =>
					user.decklist !== undefined && (user.decklist.main?.length > 0 || user.decklist.side?.length > 0)
			);
		},
		async downloadAllDecks(draftLog: DraftLog, format: ".dek" | "MTGA" | "card names", withBasics: boolean) {
			for (const user of Object.values(draftLog.users)) {
				if (user.decklist) {
					const filename = `Session_${draftLog.sessionID.replace(/\W/g, "")}_Deck_${user.userName}`;
					const main = user.decklist.main.map((cid) => draftLog.carddata[cid]);
					const side = user.decklist.side.map((cid) => draftLog.carddata[cid]);
					const lands = withBasics ? user.decklist.lands : undefined;
					if (format === ".dek") {
						await exportToMTGO(main, side, {
							lands: lands,
							filename: `${filename}.dek`,
						});
					} else if (format === "MTGA" || format === "card names") {
						helper.download(
							`${filename}.txt`,
							exportToMTGA(main, side, this.language, lands, {
								preferredBasics: "",
								sideboardBasics: 0,
								full: format === "MTGA",
							})
						);
					}
				}
			}
		},
		deleteLog(draftLog: DraftLog) {
			Alert.fire({
				position: "center",
				icon: "question",
				title: "Delete log?",
				text: `Are you sure you want to delete draft log for session '${draftLog.sessionID}'? This cannot be reverted.`,
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Critical,
				cancelButtonColor: ButtonColor.Safe,
				confirmButtonText: "Delete",
				cancelButtonText: "Cancel",
				allowOutsideClick: false,
			}).then((result) => {
				if (result.isConfirmed) {
					this.draftLogs.splice(
						this.draftLogs.findIndex((e) => e === draftLog),
						1
					);
					this.expandedLogs = {};
					this.$emit("storelogs");
				}
			});
		},
		importLog: function (e: Event) {
			if (this.draftLogs.length >= 25) {
				Alert.fire({
					icon: "error",
					title: "Limit Reached",
					text: "Game logs history is limited to 25. Please delete a game log before importing a new one.",
				});
				return;
			}
			let file = (e.target as HTMLInputElement)?.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			const displayError = (e: string) => {
				Alert.fire({
					icon: "error",
					title: "Parsing Error",
					text: "An error occurred during parsing. Please make sure that you selected the correct file.",
					footer: `Full error: ${helper.escapeHTML(e)}`,
				});
			};
			reader.onload = (e) => {
				try {
					let contents = e.target?.result as string;
					let json = JSON.parse(contents);
					if (json.users) {
						this.draftLogs.push(json);
						this.expandedLogs = {};
						this.expandedLogs[this.orderedLogs.findIndex((e) => e === json)] = !this.expandedLogs[json];
						this.$emit("storelogs");
					} else displayError("Missing required data.");
				} catch (e) {
					displayError(e as string);
				}
			};
			reader.readAsText(file);
		},
		toggle(idx: number) {
			this.expandedLogs[idx] = !this.expandedLogs[idx];
		},
		printableType(draftLog: DraftLog) {
			let r = draftLog.type ? draftLog.type : "Draft";
			if (r === "Draft" && draftLog.teamDraft) return "Team Draft";
			return r;
		},
	},
});
</script>

<style scoped>
.draft-log-history {
	min-height: 85vh; /* Takes the whole modal height by default, avoiding some shifting */
}

.draft-log-history .controls {
	margin-bottom: 0.5em;
}

.flex-row {
	display: flex;
	gap: 0.3em;
	align-items: center;
}

.log {
	width: 90vw;
	margin-bottom: 0.5em;
	border-radius: 0.5em;
	padding: 0.5em;
	background-color: rgba(255, 255, 255, 0.05);
	transition: 0.1s;
}

.log:hover {
	background-color: rgba(255, 255, 255, 0.1);
}

.log-controls {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	width: 100%;
	gap: 0.2em;
}

:deep(.dropdown-container),
:deep(.dropdown) {
	background-color: #333;
}

.more-dropdown {
	display: flex;
	flex-direction: column;
}

.more-dropdown .cat-title {
	font-variant: small-caps;
}

#main-container .more-dropdown button {
	white-space: normal;
	line-height: normal;
	height: auto;
	padding: 0.5em;
}

.empty-history {
	text-align: center;
}

.scale-enter-active,
.scale-leave-active {
	transform-origin: top center;
	transition: all 0.2s ease-out;
}

.scale-enter-from,
.scale-leave-to {
	transform: scale(1, 0);
	opacity: 0;
}

/* Modals are scrollable, deeper modals fixed position will be relative to this new scrollable context and not the main one, not behaving as expected.
   As a workaround, this overrides the style of modals inside decklists (i.e. the Deck Stats. modals) to be confined to their decklist container. 
*/
:deep(.decklist) {
	position: relative;
}
:deep(.decklist) .modal-mask {
	position: absolute;
}
</style>
