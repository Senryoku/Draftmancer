<template>
	<div>
		<template v-if="show">
			<div v-if="player in draftlog.users">
				<div class="draft-log-live-title">
					<h2>Live Review: {{ draftlog.users[player].userName }}</h2>
					<span v-if="player in draftlog.users && draftlog.users[player].picks.length > 0">
						<label>Pick #</label>
						<i :class="{ disabled: pick <= 0 }" class="fas fa-chevron-left clickable" @click="prevPick"></i>
						<select v-model="pick">
							<option
								v-for="index in draftlog.users[player].picks.length"
								:key="index"
								:value="index - 1"
							>
								{{ index }}
							</option>
						</select>
						<i
							:class="{ disabled: pick >= draftlog.users[player].picks.length - 1 }"
							class="fas fa-chevron-right clickable"
							@click="nextPick"
						></i>
						<h2>{{ pickNames }}</h2>
					</span>
				</div>
				<template v-if="draftlog.users[player].picks.length === 0"
					>Waiting for {{ draftlog.users[player].userName }} to make their first pick...</template
				>
				<template v-else>
					<div v-if="pick < draftlog.users[player].picks.length">
						<draft-log-pick
							:pick="draftlog.users[player].picks[pick]"
							:carddata="draftlog.carddata"
							:language="language"
						></draft-log-pick>
					</div>
				</template>
			</div>
			<p class="draft-log-live-instructions" v-else>Click on a player to inspect their picks!</p>
		</template>
		<template v-else>
			<p class="draft-log-live-instructions">
				(Live review is only available when draft logs are immediatly send to the owner (Option set to 'Owner'
				or 'Everyone'))
			</p>
		</template>
	</div>
</template>

<script>
import DraftLogPick from "./DraftLogPick.vue";

export default {
	name: "DraftLogLive",
	components: { DraftLogPick },
	props: {
		show: { type: Boolean, default: true },
		draftlog: { type: Object, required: true },
		language: { type: String, required: true },
	},
	data: () => {
		return {
			player: undefined,
			pick: 0,
			eventListeners: [],
		};
	},
	mounted: function () {
		const self = this;
		const playerEls = document.querySelectorAll("ul.player-list li");
		for (let el of playerEls) {
			const callback = () => {
				const id = el.dataset.userid;
				self.setPlayer(id);
			};
			this.eventListeners.push({ element: el, callback: callback });
			el.classList.add("clickable");
			el.addEventListener("click", callback);
		}
	},
	beforeDestroy: function () {
		for (let tuple of this.eventListeners) {
			tuple.element.removeEventListener("click", tuple.callback);
			tuple.element.classList.remove("clickable");
		}
	},
	methods: {
		getCardName: function (cid) {
			return this.language in this.draftlog.carddata[cid].printed_names
				? this.draftlog.carddata[cid].printed_names[this.language]
				: this.draftlog.carddata[cid].name;
		},
		setPlayer: function (userID) {
			if (!(userID in this.draftlog.users)) return;
			this.player = userID;
			this.pick = Math.max(0, Math.min(this.pick, this.draftlog.users[userID].picks.length - 1));
		},
		prevPick() {
			this.pick = Math.max(0, this.pick - 1);
		},
		nextPick() {
			this.pick = Math.min(this.pick + 1, this.draftlog.users[this.player].picks.length - 1);
		},
	},
	computed: {
		pickNames() {
			const pick = this.draftlog.users[this.player].picks[this.pick];
			return pick.pick
				.map((idx) => pick.booster[idx])
				.map(this.getCardName)
				.join(", ");
		},
	},
};
</script>
