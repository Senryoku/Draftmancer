<template>
	<div>
		<div class="section-title">
			<h2>
				Featured Communities
				<font-awesome-icon
					class="clickable"
					@click="explain"
					:icon="['fas', 'question-circle']"
					size="sm"
				></font-awesome-icon>
			</h2>
		</div>
		<div style="position: relative">
			<div class="community-carousel">
				<div class="scroller" ref="communitiesEl">
					<div
						v-for="c in communities"
						:key="c.name"
						class="community"
						:style="`--icon: url(${require(`../assets/img/communities/${c.icon}`)})`"
					>
						<div class="icon"></div>
						<h2 class="name">{{ c.name }}</h2>
						<div class="description" v-html="c.brief"></div>
						<div class="links">
							<a v-if="c.links.discord" :href="c.links.discord" target="_blank">
								<font-awesome-icon :icon="['brands', 'discord']" /><span class="link-label">
									Discord server</span
								>
							</a>
							<a v-if="c.links.youtube" :href="c.links.twitter" target="_blank">
								<font-awesome-icon :icon="['brands', 'twitter']" /><span class="link-label">
									Twitter</span
								>
							</a>
							<a v-if="c.links.youtube" :href="c.links.youtube" target="_blank">
								<font-awesome-icon :icon="['brands', 'youtube']" /><span class="link-label">
									Youtube</span
								>
							</a>
							<a v-if="c.links.website" :href="c.links.website" target="_blank">
								<font-awesome-icon :icon="['fas', 'globe']" /><span class="link-label"> Website</span>
							</a>
						</div>
						<div class="tags">
							<div v-for="t in c.tags" :key="t" class="tag">{{ t }}</div>
						</div>
					</div>
				</div>
			</div>
			<div class="carousel-controls">
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
						<div class="circle">
							<div v-if="selected === idx" class="circle fill"></div>
						</div>
					</div>
				</div>
				<div @click="next" class="clickable">
					<font-awesome-icon icon="fa-solid fa-chevron-right"></font-awesome-icon>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { Alert } from "../alerts";
import { ref } from "vue";
import { fitFontSize } from "../helper";

function shuffleArray<T>(array: Array<T>, start = 0, end = array.length) {
	for (let i = end - 1; i > start; i--) {
		const j = start + Math.floor(Math.random() * (i - start + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

const communitiesEl = ref();
onMounted(() => {
	communitiesEl.value.querySelectorAll(".community").forEach((c: HTMLElement) => {
		fitFontSize(c.querySelector(".description")!, c);
	});
});

const communities = [
	{
		name: "MTG Cube Talk",
		brief: "A friendly server to discuss Cube design, organize online limited events, and talk with over 2,500 other Cube and Magic enthusiasts about the best game in the world!",
		icon: "mtg_cube_talk.webp",
		tags: ["Cube", "Cockatrice", "Design", "Discussion"],
		links: { discord: "https://discord.gg/mtg-cube-talk-263828508126609420" },
	},
	{
		name: "Arena Pod Draft",
		brief: "Community for frequent and new limited players. Great place to ask for assistance and start a new pod with active members.",
		icon: "arena_pod_draft.webp",
		tags: ["Pod Draft", "Cube", "Chaos", "MTGA", "Duelist", "EU", "NA"],
		links: { discord: "https://discord.gg/wg8dcfD4j3" },
	},
	{
		name: "Arena Gauntlet League",
		brief: "We are a Limited Magic Community on Discord that runs a unique 6-week sealed-deck-type tournament called Gauntlet, with games played out on Arena for fun and prizes.",
		description:
			"We are a Limited Magic Community on Discord running regular tournaments played out on Arena. Each tournament uses the Gauntlet format (of our own creation) as a base: a six-week tournament where you make a 60-card sealed deck from 6 packs, play 5 matches a week against different players, and add a “punishment pack” to your pool after each loss. The Top 8 then compete in a 3-round 6-pack Megadraft for the coveted title of League Champion. We also run weekly Side-Quests which are one-time events usually run via Draftmancer trying out all kinds of different draft types.",
		icon: "gauntlet_league_logo.webp",
		tags: ["Sealed", "Draft", "Tournament", "Event", "MTGA"],
		links: { discord: "https://discord.gg/Ssd6JB4GCY", website: "https://f2fleague.wordpress.com/" },
	},
	{
		name: "XMage Draft Historical Society",
		brief: 'Come experience the history of Limited Magic with the XDHS!<br />We host seven drafts each week, open to all, with a chronological progression plus bonus formats. Sundays (1:50pm EDT / 7:50pm CEST) are custom "remastered" sets designed by members of our community which we draft on Draftmancer. Matches are played on XMage with a full rules engine, all for free!',
		description:
			'Come experience the history of Limited Magic with the XDHS! Draftmancer makes it possible for us to run events where we draft custom "remastered" sets designed by members of our community. These are basically cubes with rarities, either refining an existing format or mixing together ideas from across different sets. We also offer a chronological progression where we draft almost every historical format in order. Remastered sets are Sundays at 1:50pm EDT / 7:50pm CEST, with other events offered each day to accommodate most timezones. After the draft, we play out the matches as a 3-round Swiss tourney on XMage with a full rules engine, all for free. No matter your experience level, we\'d love to have you play with us!',
		icon: "xdhs.webp",
		tags: ["XMage", "Remastered", "Historical", "Swiss"],
		links: { discord: "https://discord.gg/7xWaCvWyq8" },
	},
	{
		name: "Custom Magic",
		brief: "A Custom Magic community primarily focused on custom set design and development.",
		icon: "custom_magic.webp",
		tags: ["Custom ", "Cockatrice"],
		links: { discord: "https://discord.gg/custommagic" },
	},
	{
		name: "Jank Diver Gaming",
		brief: "A community dedicated to the Cube format, specifically for Magic: Arena play.",
		icon: "jank_diver_gaming.webp",
		tags: ["Cube", "MTGA", "Social"],
		links: {
			youtube: "https://www.youtube.com/@JankDiverGaming",
			discord: "https://discord.gg/G7ucDuK3v9",
			twitter: "https://twitter.com/JankDiverGaming",
		},
	},
	{
		name: "Limited Perspective",
		brief: "Join for Limited Magic using Draftmancer and Tabletop Simulator, stay for the friendly banter and unforgettable moments. Hosting drafts every Saturday night at 6:30 EST.",
		icon: "limited_perspective.webp",
		tags: ["Draft", "Cube", "Progression Series", "TTS"],
		links: {
			discord: "https://discord.gg/f5UYPauRQz",
		},
	},
	{
		name: "The Cube Draft Gathering Place",
		brief: "Community-focused server running Cubes Monday to Friday on Tabletop Simulator. We are open to cubes of any kind or type.",
		icon: "cube_gathering.webp",
		tags: ["Draft", "Cube", "Social", "TTS"],
		links: {
			discord: "https://discord.gg/wRXzJFeRtz",
		},
	},
];
shuffleArray(communities);

const selected = ref(0);

const next = () => {
	selected.value = (selected.value + 1) % communities.length;
	resetTimeout();
};
const prev = () => {
	selected.value = (communities.length + selected.value - 1) % communities.length;
	resetTimeout();
};

const timer = 1000 * 15;
let timeout = setTimeout(next, timer);
const timeoutStart = ref(0);

const resetTimeout = () => {
	clearInterval(timeout);
	timeout = setInterval(next, timer);
	timeoutStart.value = Date.now();
};

const select = (idx: number) => {
	selected.value = idx;
	resetTimeout();
};

const explain = () => {
	Alert.fire({
		icon: "info",
		title: "Featured Communities",
		html: `<p>These communities are focused around diverse aspects of Limited Magic and are known to organize tournaments and events using Draftmancer.</p>
		<p>Do you want your own community to be featured here?<br />
		You can submit it by contacting me (Senryoku) via <a href="mailto:dev@draftmancer.com">email</a> or the <a href="https://discord.gg/XscXXNw">Draftmancer Discord</a></p>`,
	});
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

.carousel-controls {
	position: relative;
	display: flex;
	gap: 1em;
	margin: 0.2em auto;
	width: fit-content;
	--timer: calc(1ms * v-bind(timer));
}

.bubbles {
	display: flex;
	gap: 1em;
}

.bubble {
	width: 17.6px;
	height: 17.6px;
	position: relative;
	color: #888;
}

.bubble:hover .circle {
	background-color: #888;
}

.bubble.active .circle {
	border: 2px solid #fff;
}

.circle {
	position: absolute;
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	border-radius: 100%;
	background-color: #ffffff80;
}

.fill {
	background-color: #fff;
	animation: fill var(--timer) linear both;
}

@keyframes fill {
	0% {
		clip-path: polygon(0 100%, 0 100%, 100% 100%, 100% 100%);
	}
	100% {
		clip-path: polygon(0 0, 0 100%, 100% 100%, 100% 0);
	}
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
	column-gap: 0.5em;
	row-gap: 0.25em;
	width: var(--card-width);
	height: var(--card-height);
	overflow: hidden;
	border-radius: 20px;
	background-color: #333;
}

h1 {
	margin: 0;
}

h2 {
	margin: 0.25em;
}

.icon {
	grid-area: icon;
	background-size: cover;
	background-position: center;
	background-image: var(--icon);
	width: var(--card-height);
}

.name {
	grid-area: name;
}

.description {
	grid-area: description;

	display: flex;
	justify-content: center;
	align-items: center;
	padding-left: 0.5em;
	padding-right: 0.5em;
}

.links {
	grid-area: links;
	display: flex;
	justify-content: space-evenly;
	align-content: center;
	align-items: center;
}

.tags {
	grid-area: tags;
	display: flex;
	flex-wrap: wrap;
	align-content: center;
	gap: 0.25em;
	padding: 0.5em;
}

.tag {
	padding: 2.5px 10px 2.5px 10px;
	border-radius: 10px;
	background-color: rgba(255, 255, 255, 0.1);
}

@media (max-width: 799px) {
	.community-carousel {
		--card-width: 95vw;
		--card-height: 300px;
	}
	.community {
		grid-template-rows: auto 1fr auto auto;
		grid-template-columns: 100px 1fr;
		grid-template-areas:
			"name name"
			"description description"
			"icon links"
			"icon tags";
	}

	.icon {
		width: auto;
		height: auto;
		aspect-ratio: 1;
	}

	.name {
		text-align: center;
	}
}

@media (max-width: 500px) {
	.link-label {
		display: none;
	}
}
</style>
