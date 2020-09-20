<template>
	<div class="draft-log-history">
		<input type="file" id="log-input" @change="importLog" style="display: none;" accept=".txt" />
		<div class="controls">
			<button onclick="document.querySelector('#log-input').click()" v-tooltip="'Import a saved draft log.'">
				Import Draft Log
			</button>
			<span>({{ draftLogs.length }} / 25 logs)</span>
		</div>
		<div v-if="!draftLogs || draftLogs.length === 0" class="log empty-history">
			No saved draft logs.
			<br />Your draft logs will be visible here after you've completed a draft.
		</div>
		<div v-for="(draftLog, idx) in orderedLogs" :key="idx" class="log">
			<div class="log-controls">
				<span>
					<template v-if="!draftLog.delayed">
						<i
							class="fa fa-chevron-down clickable"
							v-if="selectedLog !== draftLog"
							@click="selectedLog = draftLog"
						></i>
						<i
							class="fa fa-chevron-up clickable"
							v-if="selectedLog === draftLog"
							@click="selectedLog = null"
						></i>
					</template>
					<template v-else>
						<i class="fas fa-lock"></i>
					</template>
					Session '{{ draftLog.sessionID }}'
					<span v-if="draftLog.time">({{ new Date(draftLog.time).toLocaleString() }})</span>
				</span>
				<span>
					<template v-if="!draftLog.delayed">
						<button type="button" @click="downloadLog(draftLog)">
							<i class="fas fa-file-download"></i> Download
						</button>
					</template>
					<template v-else>
						(Delayed: No one can review this log until you share it)
						<button @click="$emit('shareLog', draftLog)">
							<i class="fas fa-share-square"></i> Share with session and unlock
						</button>
					</template>
					<button type="button" class="stop" @click="deleteLog(draftLog)">
						<i class="fas fa-trash"></i> Delete
					</button>
				</span>
			</div>
			<transition-collapse-height>
				<draft-log
					v-if="!draftLog.delayed && selectedLog === draftLog"
					:draftlog="draftLog"
					:language="language"
				></draft-log>
			</transition-collapse-height>
		</div>
	</div>
</template>

<script>
import Swal from "sweetalert2";
import { ButtonColor, SwalCustomClasses } from "../alerts.js";
import * as helper from "../helper.js";
import { Cards } from "../Cards.js";
import exportToMTGA from "../exportToMTGA.js";
import TransitionCollapseHeight from "./TransitionCollapseHeight.vue";
import DraftLog from "./DraftLog.vue";

export default {
	components: {
		DraftLog,
		TransitionCollapseHeight,
	},
	props: {
		draftLogs: { type: Array, required: true },
		language: { type: String, required: true },
	},
	data: () => {
		return {
			selectedLog: null,
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
			for (let e in draftLog.users) {
				let cards = [];
				for (let c of draftLogFull.users[e].cards) cards.push(Cards[c]);
				draftLogFull.users[e].exportString = exportToMTGA(cards, null, this.language);
			}
			helper.download(`DraftLog_${draftLogFull.sessionID}.txt`, JSON.stringify(draftLogFull, null, "\t"));
		},
		deleteLog: function(draftLog) {
			Swal.fire({
				position: "center",
				icon: "question",
				title: "Delete log?",
				text: `Are you sure you want to delete draft log for session '${draftLog.sessionID}'? This cannot be reverted.`,
				customClass: SwalCustomClasses,
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
					localStorage.setItem("draftLogs", JSON.stringify(this.draftLogs));
				}
			});
		},
		importLog: function(e) {
			let file = e.target.files[0];
			if (!file) return;
			const reader = new FileReader();
			const displayError = e => {
				Swal.fire({
					icon: "error",
					title: "Parsing Error",
					text: "An error occurred during parsing. Please make sure that you selected the correct file.",
					footer: `Full error: ${e}`,
					customClass: SwalCustomClasses,
				});
			};
			reader.onload = e => {
				try {
					let contents = e.target.result;
					let json = JSON.parse(contents);
					if (json.users) {
						this.draftLogs.push(json);
						this.selectedLog = json;
						localStorage.setItem("draftLogs", JSON.stringify(this.draftLogs));
					} else displayError("Missing required data.");
				} catch (e) {
					displayError(e);
				}
			};
			reader.readAsText(file);
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
</style>
