<template>
	<li
		:key="user.userID"
		:class="{
			teama: teamDraft && index % 2 === 0,
			teamb: teamDraft && index % 2 === 1,
			draggable: self === sessionOwner,
			self: self === user.userID,
		}"
		:data-userid="user.userID"
	>
		<div class="player-name" v-tooltip="user.userName">
			{{ user.userName }}
		</div>
		<template v-if="self === sessionOwner">
			<font-awesome-icon
				icon="fa-solid fa-chevron-left"
				class="clickable move-player move-player-left"
				v-tooltip="`Move ${user.userName} to the left`"
				@click="emit('movePlayer', index, -1)"
			/>
			<font-awesome-icon
				icon="fa-solid fa-chevron-right"
				class="clickable move-player move-player-right"
				v-tooltip="`Move ${user.userName} to the right`"
				@click="emit('movePlayer', index, 1)"
			/>
		</template>
		<div class="status-icons">
			<font-awesome-icon
				v-if="user.userID === sessionOwner"
				icon="fa-solid fa-crown"
				class="subtle-gold"
				v-tooltip="`${user.userName} is the session owner.`"
			/>
			<font-awesome-icon
				v-if="user.userID === sessionOwner && user.userID !== self && canRequestTakeover"
				icon="fa-solid fa-user-slash"
				class="clickable red takeover"
				v-tooltip="`Vote to remove ${user.userName} from the session and take ownership.`"
				@click="emit('requestTakeover')"
			/>
			<template v-if="self === sessionOwner && user.userID !== sessionOwner">
				<img
					src="../assets/img/pass_ownership.svg"
					class="clickable"
					style="height: 18px; margin-top: -4px"
					v-tooltip="`Give session ownership to ${user.userName}`"
					@click="emit('setSessionOwner', user.userID)"
				/>
				<font-awesome-icon
					icon="fa-solid fa-user-slash"
					class="clickable red"
					v-tooltip="`Remove ${user.userName} from the session`"
					@click="emit('removePlayer', user.userID)"
				/>
			</template>
			<template v-if="!useCustomCardList && !ignoreCollections">
				<template v-if="!user.collection">
					<font-awesome-icon
						icon="fa-solid fa-book"
						class="red"
						v-tooltip="user.userName + ' has not uploaded their collection yet.'"
					/>
				</template>
				<template v-else-if="user.collection && !user.useCollection">
					<font-awesome-icon
						icon="fa-solid fa-book"
						class="yellow"
						v-tooltip="user.userName + ' has uploaded their collection, but is not using it.'"
					/>
				</template>
				<template v-else>
					<font-awesome-icon
						icon="fa-solid fa-book"
						class="green"
						v-tooltip="user.userName + ' has uploaded their collection.'"
					/>
				</template>
			</template>
			<template v-if="pendingReadyCheck">
				<template v-if="user.readyState == ReadyState.Ready">
					<font-awesome-icon
						icon="fa-solid fa-check"
						class="green"
						v-tooltip="`${user.userName} is ready!`"
					/>
				</template>
				<template v-else-if="user.readyState == ReadyState.NotReady">
					<font-awesome-icon
						icon="fa-solid fa-times"
						class="red"
						v-tooltip="`${user.userName} is NOT ready!`"
					/>
				</template>
				<template v-else-if="user.readyState == ReadyState.Unknown">
					<font-awesome-icon
						icon="fa-solid fa-spinner"
						spin
						v-tooltip="`Waiting for ${user.userName} to respond...`"
					/>
				</template>
			</template>
		</div>
		<div class="chat-bubble" :id="'chat-bubble-' + user.userID"></div>
	</li>
</template>

<script setup lang="ts">
import { SessionUser } from "@/App.vue";
import { UserID } from "@/IDTypes";
import { ReadyState } from "../../../src/Session/SessionTypes";

defineProps<{
	index: number;
	user: SessionUser;
	self: UserID;
	sessionOwner: UserID;
	pendingReadyCheck: boolean;
	teamDraft: boolean;
	useCustomCardList: boolean;
	ignoreCollections: boolean;
	canRequestTakeover: boolean;
}>();

const emit = defineEmits<{
	(e: "removePlayer", userID: UserID): void;
	(e: "setSessionOwner", userID: UserID): void;
	(e: "requestTakeover"): void;
	(e: "movePlayer", userID: number, direction: number): void;
}>();
</script>
