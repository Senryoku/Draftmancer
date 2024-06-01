<template>
	<div class="chat-history" tabindex="0">
		<ol v-if="messagesHistory && messagesHistory.length > 0">
			<li
				v-for="msg in reversedMessages"
				:title="new Date(msg.timestamp).toLocaleTimeString()"
				:key="msg.timestamp"
			>
				<span class="chat-author">
					<template v-if="msg.author !== userID">
						<template v-if="!mutedUsers.has(msg.author)">
							<font-awesome-icon
								class="clickable"
								icon="fa-solid fa-comment-slash"
								@click="mutedUsers.add(msg.author)"
								v-tooltip="`Mute this user.`"
							></font-awesome-icon>
						</template>
						<template v-else>
							<font-awesome-icon
								class="clickable"
								icon="fa-solid fa-comment"
								@click="mutedUsers.delete(msg.author)"
								v-tooltip="`Unmute this user.`"
							></font-awesome-icon>
						</template>
					</template>
					{{
						msg.author in userByID
							? userByID[msg.author].userName
							: msg.author === sessionOwner && sessionOwnerUsername
								? sessionOwnerUsername
								: "(Left)"
					}}
				</span>
				<span class="chat-message">
					<template v-if="!mutedUsers.has(msg.author)">{{ msg.text }}</template>
					<template v-else><em>(Muted)</em></template>
				</span>
			</li>
		</ol>
		<template v-else>No messages in chat history.</template>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { UserData } from "../../../src/Session/SessionTypes";

const props = defineProps<{
	messagesHistory: {
		author: string;
		text: string;
		timestamp: number;
	}[];
	userID: string;
	sessionOwner: string;
	sessionOwnerUsername: string;
	userByID: Record<string, UserData>;
	mutedUsers: Set<string>;
}>();

const reversedMessages = computed(() => props.messagesHistory.slice().reverse());
</script>

<style scoped>
.chat-history {
	position: absolute;
	top: calc(100% + 0.25em);
	right: 0;
	background: rgba(255, 255, 255, 0.5);
	padding: 0.5em;
	border-radius: 0.5em;
	color: black;
	max-width: 50vw;
	width: max-content;
	z-index: 1;
}

.chat-history:before {
	content: "";
	position: absolute;
	top: 0;
	right: calc(14px + 0.5em);
	width: 0;
	height: 0;
	border: 14px solid transparent;
	border-bottom-color: rgba(255, 255, 255, 0.5);
	border-top: 0;
	border-right: 0;
	margin-left: -7px;
	margin-top: -14px;
}

.chat-history ol {
	display: flex;
	flex-direction: column;
	min-width: 20vw;
	max-height: 60vh;
	margin: 0;
	padding: 0;
	list-style: none;
	overflow-y: scroll;
	white-space: initial;
}

@media (orientation: landscape) {
	.chat-history ol {
		max-width: 60vw;
	}
}

@media (orientation: portrait) {
	.chat-history ol {
		max-width: 90vw;
	}
}
.chat-history li {
	display: inline-flex;
	align-items: stretch;
	background: white;
	border-radius: 0.25em;
	margin: 0.2em;
}

.chat-history li span {
	padding: 0.25em;
}

.chat-history li .chat-author {
	border-radius: 0.25em 0 0 0.25em;
	background: #444;
	color: #ddd;
	font-weight: bold;
	white-space: nowrap;
	min-width: 18ch;
	max-width: 18ch;
	overflow: hidden;
	text-overflow: ellipsis;
}

.chat-history li .chat-message {
	border-radius: 0 0.25em 0.25em 0;
	background: white;
	flex-grow: 2;
	word-wrap: anywhere;
}
</style>
