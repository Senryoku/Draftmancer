export default {
	name: "Card",
	template: `
	<div class="card clickable" :data-arena-id="card.id" :data-cmc="card.border_crop"  @click="selectcard($event, card)" @dblclick="ondblclick($event, card)"  :title="card.printed_name[language]">
		<clazy-load :ratio="0.01" margin="200px" :src="card.image_uris[language]" loadingClass="card-loading">
			<img v-if="card.image_uris[language]" :src="card.image_uris[language]"  :class="{ selected: selected, burned: burned }" />
			<img v-else src="img/missing.svg">
			<div class="card-placeholder" slot="placeholder" :class="{ selected: selected }">
				<div class="card-name">{{card.printed_name[language]}}</div>
			</div>
		</clazy-load>
		<div v-if="!selected && canbeburned && !burned" class="burn-card red clickable" @click="burn($event, card)"><i class="fas fa-ban fa-2x"></i></div>
		<div v-if="!selected && canbeburned && burned" class="restore-card blue clickable" @click="restore($event, card)"><i class="fas fa-undo-alt fa-2x"></i></div>
	</div>
	`,
	props: {
		card: { type: Object, required: true },
		language: String,
		selectcard: { type: Function, default: function() {} },
		selected: Boolean,
		ondblclick: { type: Function, default: function() {} },
		burn: { type: Function, default: function() {} },
		restore: { type: Function, default: function() {} },
		canbeburned: { type: Boolean, default: false },
		burned: { type: Boolean, default: false },
	},
	created: function() {
		// Preload Carback
		const img = new Image();
		img.src = "img/cardback.png";
	},
};

export const MissingCard = {
	name: "MissingCard",
	template: `
	<div class="card">
		<clazy-load :ratio="0.01" margin="200px" :src="card.image_uris[language]" loadingClass="card-loading">
			<img v-if="card.image_uris[language]" :src="card.image_uris[language]" :title="card.printed_name[language]" />
			<img v-else src="img/missing.svg">
			<div class="card-placeholder" slot="placeholder">
				<div class="card-name">{{card.printed_name[language]}}</div>
			</div>
		</clazy-load>
		<div class="not-booster" v-if="!card.in_booster">Can't be obtained in boosters.</div>
		<div class="card-count" v-if="card.count < 4">x{{4 - card.count}}</div>
	</div>
	`,
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
	},
	created: function() {
		// Preload Carback
		const img = new Image();
		img.src = "img/cardback.png";
	},
};
