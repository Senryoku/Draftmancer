<template>
	<div>
		<h1>Featured Communities</h1>
		<div class="controls">
			<div @click="prev" class="clickable">
				<font-awesome-icon icon="fa-solid fa-chevron-left"></font-awesome-icon>
			</div>
			<div class="bubbles">
				<div
					v-for="(c, idx) in communities"
					:key="c.name"
					class="clickable bubble"
					:class="{ active: selected === idx }"
					@click="select(idx)"
				>
					<font-awesome-icon :icon="['fas', 'circle']" />
				</div>
			</div>
			<div @click="next" class="clickable">
				<font-awesome-icon icon="fa-solid fa-chevron-right"></font-awesome-icon>
			</div>
		</div>
		<div class="community-carousel">
			<div class="scroller">
				<div v-for="c in communities" :key="c.name" class="community">
					<div
						class="icon"
						:style="`background-image: url(${require(`../assets/img/communities/${c.icon}`)})`"
					></div>
					<h2 class="name">{{ c.name }}</h2>
					<div class="description">{{ c.description }}</div>
					<div class="links">
						<a v-if="c.links.discord" :href="c.links.discord" target="_blank">
							<font-awesome-icon icon="fa-brands fa-discord"></font-awesome-icon> Discord server
						</a>
						<a v-if="c.links.website" :href="c.links.website" target="_blank">
							<font-awesome-icon :icon="['fas', 'globe']" /> Website
						</a>
					</div>
					<div class="tags">
						<div v-for="t in c.tags" :key="t" class="tag">{{ t }}</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const communities = [
	{
		name: "MTG Cube Talk",
		description: "A friendly server to discuss cube design and organise online cube play.",
		icon: "mtg_cube_talk.webp",
		tags: ["Cube", "Cockatrice", "Design", "Discussion"],
		links: { discord: "https://discord.gg/mtg-cube-talk-263828508126609420" },
	},
	{
		name: "Arena Pod Draft",
		description:
			"Community for frequent and new limited players. Great place to ask for assistance and start a new pod with active members.",
		icon: "arena_pod_draft.webp",
		tags: ["Cube", "Chaos", "Competitive", "Tournaments", "MTGA", "Duelist", "EU", "NA"],
		links: { discord: "https://discord.gg/wg8dcfD4j3" },
	},
	{
		name: "Arena Gauntlet League",
		description: "We are a Limited Magic Community on Discord running regular tournaments played out on Arena.",
		// "Each tournament uses the Gauntlet format (of our own creation) as a base: a six-week tournament where you make a 60-card sealed deck from 6 packs, play 5 matches a week against different players, and add a “punishment pack” to your pool after each loss. The Top 8 then compete in a 3-round 6-pack Megadraft for the coveted title of League Champion. We also run weekly Side-Quests which are one-time events usually run via Draftmancer trying out all kinds of different draft types.",
		icon: "gauntlet_league_logo.webp",
		tags: ["Sealed", "Draft", "Tournament", "Event", "Arena"],
		links: { discord: "https://discord.gg/Ssd6JB4GCY", website: "https://f2fleague.wordpress.com/" },
	},
];

const selected = ref(0);

const _next = () => {
	selected.value = (selected.value + 1) % communities.length;
};

const next = () => {
	_next();
	resetInterval();
};
const prev = () => {
	selected.value = (selected.value - 1) % communities.length;
	resetInterval();
};

let interval = setInterval(_next, 1000 * 10);

const resetInterval = () => {
	clearInterval(interval);
	interval = setInterval(_next, 1000 * 10);
};

const select = (idx: number) => {
	selected.value = idx;
	resetInterval();
};
</script>

<style scoped>
.community-carousel {
	--card-width: 800px;
	--card-height: 250px;
	--count: v-bind(communities.length);
	--selected: v-bind(selected);

	position: relative;
	overflow: hidden;
	width: var(--card-width);
	height: var(--card-height);
}

.controls {
	display: flex;
	gap: 1em;
}

.bubbles {
	display: flex;
	gap: 1em;
}

.bubble {
	color: rgba(255, 255, 255, 0.5);
}

.bubble:hover,
.bubble.active {
	color: rgba(255, 255, 255, 1);
}

.scroller {
	position: absolute;
	display: flex;
	width: calc(var(--count) * var(--card-width));
	height: var(--card-height);
	transition: all 0.25s ease;

	left: calc(-1 * var(--selected) * var(--card-width));
}

.community {
	box-sizing: border-box;
	display: inline-grid;
	grid-template-areas:
		"icon name"
		"icon description"
		"icon links"
		"icon tags";
	grid-template-rows: auto 1fr auto auto;
	column-gap: 1em;
	row-gap: 0.25em;
	width: var(--card-width);
	height: var(--card-height);
	overflow: hidden;
	border-radius: 20px;
	background-color: rgba(255, 255, 255, 0.1);
}

h1 {
	margin: 0;
}

h2 {
	margin: 0.5em;
}

.icon {
	grid-area: icon;
	display: flex;
	justify-content: center;
	align-items: center;
	background-size: cover;
	background-position: center;
	width: var(--card-height);
}

.icon img {
	max-width: 200px;
	max-height: 200px;
}

.name {
	grid-area: name;
}

.description {
	grid-area: description;

	display: flex;
	justify-content: center;
	align-items: center;
}

.links {
	grid-area: links;
	display: flex;
	justify-content: space-evenly;
}

.tags {
	grid-area: tags;
	display: flex;
	flex-wrap: wrap;
	gap: 0.25em;
	padding: 0.5em;
}

.tag {
	padding: 2.5px 10px 2.5px 10px;
	border-radius: 10px;
	background-color: rgba(255, 255, 255, 0.1);
}
</style>
