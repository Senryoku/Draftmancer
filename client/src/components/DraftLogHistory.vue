<template>
	<div class="draft-log-history">
		<input type="file" id="log-input" @change="importLog" style="display: none" accept=".txt" />
		<div class="controls">
			<button
				onclick="document.querySelector('#log-input').click()"
				v-tooltip="'Upload a saved game log file.'"
				>
				<i class="fas fa-file-upload"></i> Upload Game Log
			</button>
			<span>({{ draftLogs.length }} / 25 logs)</span>
			<span v-if="draftLogs.length >= 25"
				><i class="fas fa-exclamation-triangle yellow"></i> Your history is full, new logs will overwrite the
				oldest ones.</span
			>
		</div>
		<div v-if="!draftLogs || draftLogs.length === 0" class="log empty-history">
			No saved game logs.<br /><br />
			Your logs will be visible here after you've completed a game.
		</div>
		<div v-for="(draftLog, idx) in orderedLogs" :key="idx" class="log">
			<div
				class="log-controls"
				v-tooltip="{
					title: 'Delayed Game Log: No one can view details until released!',
					disabled: '!draftLog.delayed'
					}"
			>
				<span @click="toggle(idx)" class="clickable" v-bind:class="{ 'disabled-simple': draftLog.delayed }">
					<div class="inline" style="min-width: 20px; text-align: center">
						<i
							v-if="!draftLog.delayed"
							class="fa"
							:class="{
								'fa-chevron-down': expandedLogs[idx],
								'fa-chevron-right': !expandedLogs[idx],
							}"
						></i>
						<i v-else class="fas fa-lock"></i>
					</div>
					<span>
						<strong>{{ printableType(draftLog) }}</strong>
						- Session '{{ draftLog.sessionID }}'
						<span v-if="draftLog.time">({{ new Date(draftLog.time).toLocaleString() }})</span>
					</span>
				</span>
				<span>
					<button
						class="flat"
						@click="toggle(idx)"
						v-show="!draftLog.delayed"
					>
						<template v-if="expandedLogs[idx]"> <i class="far fa-eye-slash"></i> Hide</template>
						<template v-else> <i class="far fa-eye"></i> Show</template>
					</button>
					<template v-if="draftLog.version === '2.0'">
						<template v-if="!draftLog.delayed">
							<div class="inline" style="min-width: 20px; text-align: center">
								<i
									class="fas fa-file-download"
									@click="downloadLog(draftLog)"
									v-tooltip="'Download Game Log'"
								></i>
							</div>
						</template>
					</template>
					<template v-else>Incompatible game log version</template>
					<div class="inline" style="min-width: 20px; text-align: center">
						<i
							class="fas fa-trash"
							@click="deleteLog(draftLog)"
							v-tooltip="'Delete Game Log'"
						></i>
					</div>
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

<script>
import Vue from "vue";
import { ButtonColor, Alert } from "../alerts.js";
import * as helper from "../helper.js";
import exportToMTGA from "../exportToMTGA.js";
import DraftLog from "./DraftLog.vue";

export default {
	components: {
		DraftLog,
	},
	props: {
		draftLogs: { type: Array, required: true },
		language: { type: String, required: true },
		userID: { type: String },
		userName: { type: String },
	},
	data: () => {
		return {
			expandedLogs: {},
		};
	},
	computed: {
		orderedLogs: function() {
			return [...this.draftLogs].sort((lhs, rhs) => rhs.time - lhs.time);
		},
	},
	methods: {
		downloadLog: function(draftLog) {
			let draftLogFull = JSON.parse(JSON.stringify(draftLog));
			for (let uid in draftLog.users) {
				draftLogFull.users[uid].exportString = exportToMTGA(
					draftLogFull.users[uid].cards.map(cid => draftLogFull.carddata[cid]),
					null,
					this.language
				);
			}
			helper.download(`DraftLog_${draftLogFull.sessionID}.txt`, JSON.stringify(draftLogFull, null, "\t"));
		},
		deleteLog: function(draftLog) {
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
			}).then(result => {
				if (result.isConfirmed) {
					this.draftLogs.splice(
						this.draftLogs.findIndex(e => e === draftLog),
						1
					);
					this.expandedLogs = {};
					this.$emit("storelogs");
				}
			});
		},
		importLog: function(e) {
			let file = e.target.files[0];
			if (!file) return;
			const reader = new FileReader();
			const displayError = e => {
				Alert.fire({
					icon: "error",
					title: "Parsing Error",
					text: "An error occurred during parsing. Please make sure that you selected the correct file.",
					footer: `Full error: ${e}`,
				});
			};
			reader.onload = e => {
				try {
					let contents = e.target.result;
					let json = JSON.parse(contents);
					if (json.users) {
						this.draftLogs.push(json);
						this.expandedLogs = {};
						Vue.set(
							this.expandedLogs,
							this.orderedLogs.findIndex(e => e === json),
							!this.expandedLogs[json]
						);
						this.$emit("storelogs");
					} else displayError("Missing required data.");
				} catch (e) {
					displayError(e);
				}
			};
			reader.readAsText(file);
		},
		toggle: function(idx) {
			Vue.set(this.expandedLogs, idx, !this.expandedLogs[idx]);
		},
		printableType: function(draftLog) {
			let r = draftLog.type ? draftLog.type : "Draft";
			if (r === "Draft" && draftLog.teamDraft) return "Team Draft";
			return r;
		},
	},
};
</script>

<style scoped>
.draft-log-history .controls {
	margin-bottom: 0.5em;
}

.log {
	width: 90vw;
	margin-bottom: 0.5em;
	border-radius: 0.5em;
	padding: 0.5em;
	background-color: rgba(255, 255, 255, 0.05);
}

.log-controls {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	width: 100%;
}

.empty-history {
	text-align: center;
}

.scale-enter-active,
.scale-leave-active {
	transform-origin: top center;
	transition: all 0.2s ease-out;
}

.scale-enter,
.scale-leave-to {
	transform: scale(1, 0);
	opacity: 0;
}
</style>
