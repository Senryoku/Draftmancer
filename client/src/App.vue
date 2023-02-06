<template>
	<div v-if="!ready">
		<div class="loading"></div>
		<span>Loading cards data...</span>
	</div>
	<div id="main-container" v-else>
		<!-- Personal Options -->
		<div id="view-controls" class="main-controls">
			<span>
				<label for="user-name">User Name</label>
				<delayed-input
					id="user-name"
					v-model="userName"
					type="text"
					maxlength="50"
					:delay="2"
					style="margin-right: 0.25em"
				/>
				<div class="inline" v-tooltip="'Controls the display language of cards.'">
					<label for="language">Card Language</label>
					<select v-model="language" name="language" id="select-language">
						<option
							v-for="lang in languages"
							v-bind:value="lang.code"
							:selected="lang.code === language"
							:key="lang.code"
						>
							{{ lang.name }}
						</option>
					</select>
				</div>
			</span>
			<span>
				<label :for="hasCollection ? 'collection-stats' : 'mtga-logs-file-input'">MTGA Collection</label>
				<i
					class="fas fa-question-circle clickable"
					@click="displayedModal = 'collectionHelp'"
					v-tooltip="'Collection Import Help'"
				></i>
				<input
					type="file"
					id="mtga-logs-file-input"
					@change="parseMTGALog"
					style="display: none"
					accept=".log"
				/>
				<input
					type="file"
					id="collection-file-input"
					@change="uploadCardListAsCollection"
					style="display: none"
					accept=".txt,.csv,.log"
				/>
				<span v-tooltip="'Import your collection by uploading your Player.log file.'">
					<button @click="uploadMTGALogs">
						Upload
						<i
							v-if="hasCollection"
							class="fas fa-check green"
							v-tooltip="'Collection uploaded.'"
						></i></button
				></span>
				<button
					v-if="hasCollection"
					v-tooltip="'Display some statistics about your collection.'"
					@click="displayedModal = 'collection'"
					class="flat"
					id="collection-stats"
				>
					<i class="fas fa-chart-bar"></i> Stats
				</button>
				<div
					v-show="hasCollection"
					class="inline"
					v-tooltip="
						'Only a limited pool of cards you own is used, uncheck to utilize all set(s). (Ignored when using a Custom Card List)'
					"
				>
					<input type="checkbox" v-model="useCollection" id="useCollection" />
					<label for="useCollection">Restrict to Collection</label>
				</div>
			</span>
			<div>
				<button
					@click="displayedModal = 'draftLogs'"
					class="flat"
					v-tooltip="'Displays logs of your previous drafts and sealed'"
				>
					<i class="fas fa-list"></i> Game Logs
				</button>
			</div>
			<span style="display: flex; gap: 0.75em; align-items: center; margin-right: 0.25em">
				<div style="min-width: 20px; text-align: center">
					<i
						class="fas clickable fa-mouse-pointer"
						style="font-size: 1.2em; vertical-align: -20%"
						:class="{ faded: !pickOnDblclick, crossed: !pickOnDblclick }"
						@click="pickOnDblclick = !pickOnDblclick"
						v-tooltip="{
							content: `Pick cards by double clicking: <strong>${
								pickOnDblclick ? 'Enabled' : 'Disabled'
							}</strong>`,
							html: true,
						}"
					/>
				</div>
				<div style="min-width: 20px">
					<div
						class="fas clickable"
						style="width: 20px; margin-top: 5px"
						:class="{ faded: !displayBotScores, crossed: !displayBotScores }"
						@click="displayBotScores = !displayBotScores"
						v-tooltip="{
							content: `Display Bot Recommendations: <strong>${
								displayBotScores ? 'Enabled' : 'Disabled'
							}</strong><br /><small>Note: Bot recommendations can be disabled by the session owner.</small>`,
							html: true,
						}"
					>
						<img src="./assets/img/bot-score.svg" />
					</div>
				</div>
				<div style="min-width: 20px">
					<i
						class="fas clickable"
						:class="{ 'fa-volume-mute': !enableSound, 'fa-volume-up': enableSound, faded: !enableSound }"
						@click="enableSound = !enableSound"
						v-tooltip="{
							content: `Sound: <strong>${enableSound ? 'Enabled' : 'Disabled'}</strong>`,
							html: true,
						}"
					/>
				</div>
				<div style="min-width: 20px; text-align: center">
					<i
						v-tooltip="{
							content:
								notificationPermission === 'denied'
									? 'Notifications for this domain are blocked in your browser'
									: `Desktop Notifications: <strong>${
											enableNotifications ? 'Enabled' : 'Disabled'
									  }</strong>`,
							html: true,
						}"
						class="fas clickable"
						:class="{
							'greyed-out': notificationPermission === 'denied',
							'fa-bell': enableNotifications,
							faded: !enableNotifications,
							'fa-bell-slash': !enableNotifications,
						}"
						@click="toggleNotifications"
					/>
				</div>
			</span>
		</div>

		<!-- Session Options -->
		<div class="generic-container">
			<div id="limited-controls" class="main-controls" v-bind:class="{ disabled: drafting }">
				<span id="session-controls">
					<div class="inline" v-tooltip="'Unique ID of your game session.'" style="margin-right: 0.25em">
						<label for="session-id">Session ID</label>
						<delayed-input
							v-model="sessionID"
							autocomplete="off"
							id="session-id"
							:type="hideSessionID ? 'password' : 'text'"
							maxlength="50"
							:delay="2"
						/>
					</div>
					<i
						class="far fa-fw clickable"
						:class="hideSessionID ? 'fa-eye' : 'fa-eye-slash'"
						@click="hideSessionID = !hideSessionID"
						v-tooltip="'Show/Hide your session ID.'"
					></i>
					<i
						class="fas fa-fw fa-share-square clickable"
						v-tooltip="'Copy session link for sharing.'"
						@click="sessionURLToClipboard"
					></i>
					<i
						class="fas fa-sitemap clickable"
						v-if="sessionOwner === userID && !bracket"
						@click="generateBracket"
						v-tooltip="'Generate Bracket.'"
					></i>
					<i
						class="fas fa-sitemap clickable"
						v-if="bracket"
						@click="displayedModal = 'bracket'"
						v-tooltip="'Display Bracket.'"
					></i>
					<i
						class="fas fa-user-check clickable"
						v-if="sessionOwner === userID"
						@click="readyCheck"
						v-tooltip="'Ready Check: Ask everyone in your session if they\'re ready to play.'"
					></i>
				</span>
				<span class="generic-container card-pool-controls">
					<input
						type="file"
						id="card-list-input-main"
						@change="uploadFile($event, parseCustomCardList)"
						style="display: none"
						accept=".txt"
					/>

					<strong>Card Pool:</strong>
					<span v-if="useCustomCardList">
						{{ customCardList.name ? customCardList.name : "Custom Card List" }}
						(
						<template v-if="customCardList.slots && Object.keys(customCardList.slots).length > 0">
							<a @click="displayedModal = 'cardList'" v-tooltip="'Review the card list'">
								<i class="fas fa-file-alt"></i>
							</a>
						</template>
						<template v-else>No list loaded</template>
						<i
							class="fas fa-file-upload clickable"
							onclick="document.querySelector('#card-list-input-main').click()"
							v-tooltip="'Upload a Custom Card List'"
							v-if="sessionOwner === userID"
						></i>
						<i
							class="fas fa-times clickable brightred"
							@click="useCustomCardList = false"
							v-tooltip="'Return to official sets.'"
							v-if="sessionOwner === userID"
						></i>
						)
					</span>
					<span v-else :class="{ disabled: sessionOwner != userID }">
						<div class="inline">
							<multiselect
								v-if="setsInfos"
								v-model="setRestriction"
								placeholder="All Cards"
								:options="sets.slice().reverse()"
								:searchable="false"
								:allow-empty="true"
								:close-on-select="false"
								:multiple="true"
								select-label
								selected-label=""
								deselect-label=""
							>
								<template slot="selection" slot-scope="{ values }">
									<span class="multiselect__single" v-if="values.length == 1">
										<img class="set-icon" :src="setsInfos[values[0]].icon" />
										{{ setsInfos[values[0]].fullName }}
									</span>
									<span class="multiselect__single" v-if="values.length > 1">
										({{ values.length }})
										<img v-for="v in values" class="set-icon" :src="setsInfos[v].icon" :key="v" />
									</span>
								</template>
								<template slot="option" slot-scope="{ option }">
									<span class="multiselect__option set-option">
										<img class="set-icon padded-icon" :src="setsInfos[option].icon" />
										<span
											style="
												display: inline-block;
												max-width: 12em;
												overflow: hidden;
												text-overflow: ellipsis;
											"
											>{{ setsInfos[option].fullName }}</span
										>
									</span>
								</template>
								<div
									class="clickable"
									style="text-align: center; padding: 0.5em; font-size: 0.75em"
									slot="beforeList"
									onclick="document.querySelector('#card-list-input-main').click()"
								>
									Upload a Custom Card List...
								</div>
								<div
									class="clickable"
									style="text-align: center; padding: 0.5em; font-size: 0.75em"
									slot="afterList"
									@click="displayedModal = 'setRestriction'"
								>
									More sets...
								</div>
							</multiselect>
							<i
								class="fas fa-ellipsis-h clickable"
								@click="displayedModal = 'setRestriction'"
								v-tooltip="'More sets'"
							></i>
							<div
								class="inline"
								v-tooltip="
									'Draft with all cards within set restriction disregarding players collections.'
								"
							>
								<input type="checkbox" v-model="ignoreCollections" id="ignore-collections" />
								<label for="ignore-collections">Ignore Collections</label>
							</div>
						</div>
					</span>
				</span>
				<span class="generic-container" :class="{ disabled: sessionOwner != userID }">
					<strong>Draft:</strong>
					<div
						class="inline"
						:class="{ disabled: teamDraft }"
						v-tooltip="'Bots. Use them to draft alone or fill your pod.'"
					>
						<label for="bots"><i class="fas fa-robot"></i></label>
						<input
							type="number"
							id="bots"
							class="small-number-input"
							min="0"
							:max="Math.max(7, maxPlayers - 1)"
							step="1"
							v-model.number="bots"
						/>
					</div>
					<div class="inline" v-tooltip="'Pick Timer (sec.). Zero means no timer.'">
						<label for="timer">
							<i class="fas fa-clock"></i>
						</label>
						<input
							type="number"
							id="timer"
							class="small-number-input"
							min="0"
							max="180"
							step="15"
							v-model.number="maxTimer"
						/>
					</div>
					<span v-tooltip="'Starts a Draft Session.'">
						<button @click="startDraft" v-show="userID === sessionOwner" class="blue">Start</button>
					</span>
				</span>
				<span v-show="userID === sessionOwner">
					<dropdown :class="{ disabled: sessionOwner != userID }">
						<template v-slot:handle> Other Game Modes </template>
						<template v-slot:dropdown>
							<div class="game-modes-cat">
								<span class="game-modes-cat-title">Draft</span>
								<div
									v-tooltip.left="
										'Starts a Winston Draft. This is a draft variant for only two players.'
									"
								>
									<button @click="startWinstonDraft()">Winston (2p.)</button>
								</div>
								<div
									v-tooltip.left="
										'Starts a Grid Draft. This is a draft variant for only two players.'
									"
								>
									<button @click="startGridDraft()">Grid (2p.)</button>
								</div>
								<div
									v-tooltip.left="
										'Starts a Glimpse Draft. Players also remove cards from the draft each pick.'
									"
								>
									<button @click="startGlimpseDraft()">Glimpse/Burn</button>
								</div>
								<div
									v-tooltip.left="
										'Starts a Rochester Draft. Every players picks from a single booster.'
									"
								>
									<button @click="startRochesterDraft()">Rochester</button>
								</div>
								<div v-tooltip.left="'Starts a Minesweeper Draft.'">
									<button @click="startMinesweeperDraft()">Minesweeper</button>
								</div>
							</div>
							<div class="game-modes-cat">
								<span class="game-modes-cat-title">Sealed</span>
								<div v-tooltip.left="'Distributes boosters to everyone for a sealed session.'">
									<button @click="sealedDialog">Sealed</button>
								</div>
								<div v-tooltip.left="'Distributes two Jumpstart boosters to everyone.'">
									<button @click="deckWarning(distributeJumpstart)">Jumpstart</button>
								</div>
								<div
									v-tooltip.left="
										'Distributes two Jumpstart: Historic Horizons boosters to everyone.'
									"
								>
									<button
										@click="deckWarning(distributeJumpstartHH)"
										style="
											white-space: normal;
											line-height: normal;
											height: auto;
											padding: 0.5em 0.5em;
										"
									>
										Jumpstart: Historic Horizons
									</button>
								</div>
								<div v-tooltip.left="'Distributes two Super Jump! boosters to everyone.'">
									<button
										@click="deckWarning(distributeSuperJump)"
										style="
											white-space: normal;
											line-height: normal;
											height: auto;
											padding: 0.5em 0.5em;
										"
									>
										Super Jump!
									</button>
								</div>
							</div>
						</template>
					</dropdown>
				</span>
				<button
					v-tooltip="'More session settings'"
					@click="displayedModal = 'sessionOptions'"
					class="setting-button flat"
				>
					<i class="fas fa-cog"></i>
					Settings
				</button>
			</div>
			<template v-if="drafting">
				<div id="url-remainder">MTGADraft.tk</div>
				<div id="draft-in-progress">
					{{ gameModeName }}
				</div>
				<div
					v-if="sessionOwner === userID"
					style="position: absolute; right: 1em; top: 50%; transform: translateY(-50%)"
				>
					<button class="stop" @click="stopDraft"><i class="fas fa-stop"></i> Stop Draft</button>
					<button
						v-if="maxTimer > 0 && !draftPaused"
						class="stop"
						:class="{ 'opaque-disabled': waitingForDisconnectedUsers }"
						@click="pauseDraft"
					>
						<i class="fas fa-pause"></i> Pause Draft
					</button>
					<button
						v-else-if="maxTimer > 0 && draftPaused"
						class="confirm"
						:class="{ 'opaque-disabled': waitingForDisconnectedUsers }"
						@click="resumeDraft"
					>
						<i class="fas fa-play"></i> Resume Draft
					</button>
				</div>
			</template>
		</div>

		<!-- Session Players -->
		<div class="main-controls session-players">
			<div
				v-if="!ownerIsPlayer"
				class="generic-container"
				v-tooltip="'Non-playing session owner.'"
				style="flex: 0 3 auto; text-align: center"
			>
				<i
					class="fas fa-crown subtle-gold"
					v-tooltip="
						sessionOwnerUsername
							? `${sessionOwnerUsername} is the session owner.`
							: 'Session owner is disconnected.'
					"
				></i>
				<br />
				{{ sessionOwnerUsername ? sessionOwnerUsername : "(Disconnected)" }}
				<div class="chat-bubble" :id="'chat-bubble-' + sessionOwner"></div>
			</div>
			<div
				v-tooltip="'Maximum players can be adjusted in session settings.'"
				style="flex: 0 3 auto; text-align: center; font-size: 0.8em; margin-right: 0.5em"
			>
				Players
				<br />
				({{ sessionUsers.length }}/{{ maxPlayers }})
			</div>
			<i
				v-if="!drafting"
				class="fas fa-random"
				:class="{
					crossed: !randomizeSeatingOrder,
					faded: !randomizeSeatingOrder,
					clickable: userID === sessionOwner,
				}"
				@click="if (userID === sessionOwner) randomizeSeatingOrder = !randomizeSeatingOrder;"
				v-tooltip="{
					content: `Randomize Seating Order on draft start: <strong>${
						randomizeSeatingOrder ? 'Enabled' : 'Disabled'
					}</strong>`,
					html: true,
				}"
			></i>
			<template v-if="!drafting">
				<draggable
					v-model="userOrder"
					@change="changePlayerOrder"
					:disabled="userID != sessionOwner || drafting"
					:animation="200"
					style="flex-grow: 2"
				>
					<transition-group type="transition" tag="ul" class="player-list">
						<li
							v-for="(id, idx) in userOrder"
							:key="id"
							:class="{
								teama: teamDraft && idx % 2 === 0,
								teamb: teamDraft && idx % 2 === 1,
								draggable: userID === sessionOwner && !drafting,
								self: userID === id,
								bot: userByID[id].isBot,
							}"
							:data-userid="id"
						>
							<div class="player-name">{{ userByID[id].userName }}</div>
							<template v-if="userID == sessionOwner">
								<i
									class="fas fa-chevron-left clickable move-player move-player-left"
									v-tooltip="`Move ${userByID[id].userName} to the left`"
									@click="movePlayer(idx, -1)"
								></i>
								<i
									class="fas fa-chevron-right clickable move-player move-player-right"
									v-tooltip="`Move ${userByID[id].userName} to the right`"
									@click="movePlayer(idx, 1)"
								></i>
							</template>
							<div class="status-icons">
								<i
									v-if="id === sessionOwner"
									class="fas fa-crown subtle-gold"
									v-tooltip="`${userByID[id].userName} is the session owner.`"
								></i>
								<template v-if="userID === sessionOwner && id != sessionOwner">
									<img
										src="./assets/img/pass_ownership.svg"
										class="clickable"
										style="height: 18px; margin-top: -4px"
										v-tooltip="`Give session ownership to ${userByID[id].userName}`"
										@click="setSessionOwner(id)"
									/>
									<i
										class="fas fa-user-slash clickable red"
										v-tooltip="`Remove ${userByID[id].userName} from the session`"
										@click="removePlayer(id)"
									></i>
								</template>
								<template v-if="!useCustomCardList && !ignoreCollections">
									<template v-if="!userByID[id].collection">
										<i
											class="fas fa-book red"
											v-tooltip="
												userByID[id].userName + ' has not uploaded their collection yet.'
											"
										></i>
									</template>
									<template v-else-if="userByID[id].collection && !userByID[id].useCollection">
										<i
											class="fas fa-book yellow"
											v-tooltip="
												userByID[id].userName +
												' has uploaded their collection, but is not using it.'
											"
										></i>
									</template>
									<template v-else>
										<i
											class="fas fa-book green"
											v-tooltip="userByID[id].userName + ' has uploaded their collection.'"
										></i>
									</template>
								</template>
								<template v-if="pendingReadyCheck">
									<template v-if="userByID[id].readyState == ReadyState.Ready">
										<i
											class="fas fa-check green"
											v-tooltip="`${userByID[id].userName} is ready!`"
										></i>
									</template>
									<template v-else-if="userByID[id].readyState == ReadyState.NotReady">
										<i
											class="fas fa-times red"
											v-tooltip="`${userByID[id].userName} is NOT ready!`"
										></i>
									</template>
									<template v-else-if="userByID[id].readyState == ReadyState.Unknown">
										<i
											class="fas fa-spinner fa-spin"
											v-tooltip="`Waiting for ${userByID[id].userName} to respond...`"
										></i>
									</template>
								</template>
							</div>
							<div class="chat-bubble" :id="'chat-bubble-' + id"></div>
						</li>
					</transition-group>
				</draggable>
			</template>
			<template v-else>
				<ul class="player-list">
					<li
						v-for="(user, idx) in virtualPlayers"
						:class="{
							teama: teamDraft && idx % 2 === 0,
							teamb: teamDraft && idx % 2 === 1,
							self: userID === user.userID,
							bot: user.isBot,
							currentPlayer:
								(winstonDraftState && winstonDraftState.currentPlayer === user.userID) ||
								(gridDraftState && gridDraftState.currentPlayer === user.userID) ||
								(rochesterDraftState && rochesterDraftState.currentPlayer === user.userID) ||
								(minesweeperDraftState && minesweeperDraftState.currentPlayer === user.userID),
						}"
						:data-userid="user.userID"
						:key="user.userID"
					>
						<template v-if="!rochesterDraftState">
							<template v-if="minesweeperDraftState">
								<i
									class="fas fa-circle fa-xs passing-order-repeat"
									v-if="
										minesweeperDraftState.pickNumber !== 0 &&
										minesweeperDraftState.pickNumber % sessionUsers.length ==
											sessionUsers.length - 1
									"
									v-tooltip="'Passing order'"
								></i>
								<i
									class="fas fa-angle-double-left passing-order-left"
									v-else-if="
										Math.floor(minesweeperDraftState.pickNumber / sessionUsers.length) % 2 == 1
									"
									v-tooltip="'Passing order'"
								></i>
								<i
									class="fas fa-angle-double-right passing-order-right"
									v-else
									v-tooltip="'Passing order'"
								></i>
							</template>
							<template v-else>
								<i
									class="fas fa-angle-double-left passing-order-left"
									v-show="boosterNumber % 2 == 1"
									v-tooltip="'Passing order'"
								></i>
								<i
									class="fas fa-angle-double-right passing-order-right"
									v-show="boosterNumber % 2 == 0"
									v-tooltip="'Passing order'"
								></i>
							</template>
						</template>
						<div class="player-name">{{ user.userName }}</div>
						<div class="status-icons">
							<template v-if="!user.isBot && !user.isDisconnected">
								<i
									v-if="user.userID === sessionOwner"
									class="fas fa-crown subtle-gold"
									v-tooltip="`${user.userName} is the session's owner.`"
								></i>
								<template v-if="userID === sessionOwner && user.userID !== sessionOwner">
									<img
										src="./assets/img/pass_ownership.svg"
										class="clickable"
										:class="{ 'opaque-disabled': user.userID in disconnectedUsers }"
										style="height: 18px; margin-top: -4px"
										v-tooltip="`Give session ownership to ${user.userName}`"
										@click="setSessionOwner(user.userID)"
									/>
									<i
										class="fas fa-user-slash clickable red"
										:class="{ 'opaque-disabled': user.userID in disconnectedUsers }"
										v-tooltip="`Remove ${user.userName} from the session`"
										@click="removePlayer(user.userID)"
									></i>
								</template>
								<template
									v-if="
										winstonDraftState ||
										gridDraftState ||
										rochesterDraftState ||
										minesweeperDraftState
									"
								>
									<i
										v-if="user.userID in disconnectedUsers"
										class="fas fa-times red"
										v-tooltip="user.userName + ' is disconnected.'"
									></i>
									<i
										v-else
										v-show="
											(winstonDraftState && user.userID === winstonDraftState.currentPlayer) ||
											(gridDraftState && user.userID === gridDraftState.currentPlayer) ||
											(rochesterDraftState &&
												user.userID === rochesterDraftState.currentPlayer) ||
											(minesweeperDraftState &&
												user.userID === minesweeperDraftState.currentPlayer)
										"
										class="fas fa-spinner fa-spin"
										v-tooltip="user.userName + ' is thinking...'"
									></i>
								</template>
								<template v-else>
									<i
										v-if="user.isDisconnected"
										class="fas fa-times red"
										v-tooltip="user.userName + ' is disconnected.'"
									></i>
								</template>
							</template>
							<template v-if="user.boosterCount !== undefined">
								<div
									v-tooltip="`${user.userName} has ${user.boosterCount} boosters.`"
									v-if="user.boosterCount > 0"
									class="booster-count"
								>
									<template v-if="user.boosterCount === 1">
										<img src="./assets/img/booster.svg" />
									</template>
									<template v-else-if="user.boosterCount === 2">
										<img
											src="./assets/img/booster.svg"
											style="transform: translate(-50%, -50%) rotate(10deg); z-index: 0"
										/>
										<img
											src="./assets/img/booster.svg"
											style="transform: translate(-50%, -50%) rotate(-10deg); z-index: 1"
										/>
									</template>
									<template v-else-if="user.boosterCount > 2">
										<img
											src="./assets/img/booster.svg"
											style="transform: translate(-50%, -50%) rotate(10deg); z-index: 0"
										/>
										<img
											src="./assets/img/booster.svg"
											style="transform: translate(-50%, -50%) rotate(-10deg); z-index: 1"
										/>
										<img src="./assets/img/booster.svg" style="z-index: 2" />
										<div>
											{{ user.boosterCount }}
										</div>
									</template>
								</div>

								<i
									class="fas fa-spinner fa-spin"
									v-tooltip="user.userName + ' is waiting...'"
									v-else
								></i>
							</template>
						</div>
						<div class="chat-bubble" :id="'chat-bubble-' + user.userID"></div>
					</li>
				</ul>
			</template>
			<div class="chat">
				<form @submit.prevent="sendChatMessage">
					<input
						type="text"
						v-model="currentChatMessage"
						placeholder="Chat with players in your session."
						maxlength="255"
					/>
				</form>
				<i
					class="far fa-comments clickable"
					@click="displayChatHistory = !displayChatHistory"
					v-tooltip="'Display chat history.'"
				></i>
				<div
					class="chat-history"
					v-show="displayChatHistory"
					@focusout="displayChatHistory = false"
					tabindex="0"
				>
					<template v-if="messagesHistory && messagesHistory.length > 0">
						<ol>
							<li
								v-for="msg in messagesHistory.slice().reverse()"
								:title="new Date(msg.timestamp)"
								:key="msg.timestamp"
							>
								<span class="chat-author">
									{{
										msg.author in userByID
											? userByID[msg.author].userName
											: msg.author === sessionOwner && sessionOwnerUsername
											? sessionOwnerUsername
											: "(Left)"
									}}
								</span>
								<span class="chat-message">{{ msg.text }}</span>
							</li>
						</ol>
					</template>
					<template v-else>No messages in chat history.</template>
				</div>
			</div>
		</div>

		<!-- Draft Controls -->
		<div v-if="drafting || draftingState === DraftState.Watching" id="draft-container" class="generic-container">
			<transition :name="'slide-fade-' + (boosterNumber % 2 ? 'left' : 'right')" mode="out-in">
				<div v-if="draftingState === DraftState.Watching" key="draft-watching" class="draft-watching">
					<div class="draft-watching-state">
						<h1 v-if="!drafting">Draft Completed</h1>
						<h1 v-else-if="!draftPaused">Players are drafting...</h1>
						<h1 v-else>Draft Paused</h1>
						<div v-if="drafting">Pack #{{ boosterNumber + 1 }}</div>
						<div v-else>Players are now brewing their decks</div>
					</div>
					<div v-if="draftLogLive && draftLogLive.sessionID === sessionID" class="draft-watching-live-log">
						<draft-log-live
							:draftlog="draftLogLive"
							:show="['owner', 'delayed', 'everyone'].includes(draftLogRecipients)"
							:language="language"
							:key="draftLogLive.time"
							ref="draftloglive"
						></draft-log-live>
					</div>
				</div>
				<div
					v-if="(draftingState === DraftState.Waiting || draftingState === DraftState.Picking) && booster"
					:key="`draft-picking-${boosterNumber}-${pickNumber}`"
					class="container"
					:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
				>
					<div id="booster-controls" class="section-title">
						<h2 style="white-space: nowrap">Your Booster ({{ booster.length }})</h2>
						<div class="controls" style="flex-grow: 2">
							<span>Pack #{{ boosterNumber + 1 }}, Pick #{{ pickNumber + 1 }}</span>
							<span v-show="pickTimer >= 0" :class="{ redbg: pickTimer <= 10 }" id="chrono">
								<i class="fas fa-clock"></i><span>{{ pickTimer }}</span>
							</span>
							<template v-if="draftingState == DraftState.Picking">
								<input
									type="button"
									@click="pickCard"
									value="Confirm Pick"
									v-if="
										selectedCards.length === cardsToPick &&
										burningCards.length === cardsToBurnThisRound
									"
								/>
								<span v-else>
									<span v-if="cardsToPick === 1">Pick a card</span>
									<span v-else>
										Pick {{ cardsToPick }} cards ({{ selectedCards.length }}/{{ cardsToPick }})
									</span>
									<span v-if="cardsToBurnThisRound === 1"> and remove a card from the pool.</span>
									<span v-else-if="cardsToBurnThisRound > 1">
										and remove {{ cardsToBurnThisRound }} cards from the pool ({{
											burningCards.length
										}}/{{ cardsToBurnThisRound }}).
									</span>
								</span>
							</template>
							<template v-else>
								<i class="fas fa-spinner fa-spin"></i>
								Waiting for other players to pick...
							</template>
						</div>
						<scale-slider v-model.number="boosterCardScale" style="float: right" />
					</div>
					<transition-group
						tag="div"
						name="booster-cards"
						class="booster card-container"
						:class="{ 'booster-waiting': draftingState === DraftState.Waiting }"
					>
						<div class="wait" key="wait" v-if="draftingState === DraftState.Waiting">
							<i
								class="fas passing-order"
								:class="{
									'fa-angle-double-left': boosterNumber % 2 == 1,
									'fa-angle-double-right': boosterNumber % 2 == 0,
								}"
								v-show="booster.length > 0"
							></i>
							<span>
								<div><div class="spinner"></div></div>
							</span>
							<i
								class="fas passing-order"
								:class="{
									'fa-angle-double-left': boosterNumber % 2 == 1,
									'fa-angle-double-right': boosterNumber % 2 == 0,
								}"
								v-show="booster.length > 0"
							></i>
						</div>
						<booster-card
							v-for="(card, idx) in booster"
							:key="`card-booster-${card.uniqueID}`"
							:card="card"
							:language="language"
							:canbeburned="burnedCardsPerRound > 0"
							:burned="burningCards.includes(card)"
							:class="{ selected: selectedCards.includes(card) }"
							@click.native="selectCard($event, card)"
							@dblclick.native="doubleClickCard($event, card)"
							@burn="burnCard($event, card)"
							@restore="restoreCard($event, card)"
							draggable
							@dragstart.native="dragBoosterCard($event, card)"
							:hasenoughwildcards="hasEnoughWildcards(card)"
							:wildcardneeded="displayCollectionStatus && wildcardCost(card)"
							:botscore="
								draftingState !== DraftState.Waiting &&
								botScores &&
								botScores.scores &&
								displayBotScores
									? botScores.scores[idx]
									: null
							"
							:botpicked="
								draftingState !== DraftState.Waiting &&
								botScores &&
								displayBotScores &&
								idx === botScores.chosenOption
							"
							:scale="boosterCardScale"
						></booster-card>
					</transition-group>
				</div>
			</transition>
			<!-- Winston Draft -->
			<div
				class="container"
				:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
				v-if="draftingState === DraftState.WinstonPicking || draftingState === DraftState.WinstonWaiting"
			>
				<div class="section-title">
					<h2>Winston Draft</h2>
					<div class="controls">
						<span>
							<template v-if="userID === winstonDraftState.currentPlayer"
								>Your turn to pick a pile of cards!</template
							>
							<template v-else>
								Waiting for
								{{
									winstonDraftState.currentPlayer in userByID
										? userByID[winstonDraftState.currentPlayer].userName
										: "(Disconnected)"
								}}...
							</template>
							There are {{ winstonDraftState.remainingCards }} cards left in the main stack.
						</span>
					</div>
				</div>
				<div class="winston-piles">
					<div
						v-for="(pile, index) in winstonDraftState.piles"
						:key="`winston-pile-${index}`"
						class="winston-pile"
						:class="{ 'winston-current-pile': index === winstonDraftState.currentPile }"
					>
						<template
							v-if="userID === winstonDraftState.currentPlayer && index === winstonDraftState.currentPile"
						>
							<div class="card-column winstom-card-column">
								<card
									v-for="card in pile"
									:key="card.uniqueID"
									:card="card"
									:language="language"
								></card>
							</div>
							<div class="winston-current-pile-options">
								<button class="confirm" @click="winstonDraftTakePile">Take Pile</button>
								<button class="stop" @click="winstonDraftSkipPile" v-if="winstonCanSkipPile">
									Skip Pile
									<span v-show="index === 2">and Draw</span>
								</button>
							</div>
						</template>
						<template v-else>
							<div class="card-column winstom-card-column">
								<div v-for="card in pile" :key="card.uniqueID" class="card">
									<card-placeholder></card-placeholder>
								</div>
							</div>
							<div class="winston-pile-status" v-show="index === winstonDraftState.currentPile">
								{{ userByID[winstonDraftState.currentPlayer].userName }} is looking at this pile...
							</div>
						</template>
					</div>
				</div>
			</div>
			<!-- Grid Draft -->
			<div
				:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
				v-if="draftingState === DraftState.GridPicking || draftingState === DraftState.GridWaiting"
			>
				<div class="section-title">
					<h2>Grid Draft</h2>
					<div class="controls">
						<span>
							Pack #{{
								Math.min(Math.floor(gridDraftState.round / 2) + 1, gridDraftState.boosterCount)
							}}/{{ gridDraftState.boosterCount }}
						</span>
						<span>
							<template v-if="userID === gridDraftState.currentPlayer">
								<i class="fas fa-exclamation-circle"></i> It's your turn! Pick a column or a row.
							</template>
							<template v-else-if="gridDraftState.currentPlayer === null">
								<template v-if="Math.floor(gridDraftState.round / 2) + 1 > gridDraftState.boosterCount">
									This was the last booster! Let me push these booster wrappers off the table...
								</template>
								<template v-else>Advancing to the next booster...</template>
							</template>
							<template v-else>
								<i class="fas fa-spinner fa-spin"></i>
								Waiting for
								{{
									gridDraftState.currentPlayer in userByID
										? userByID[gridDraftState.currentPlayer].userName
										: "(Disconnected)"
								}}...
							</template>
						</span>
					</div>
				</div>
				<grid-draft
					:state="gridDraftState"
					:picking="userID === gridDraftState.currentPlayer"
					@pick="gridDraftPick"
				></grid-draft>
			</div>
			<!-- Rochester Draft -->
			<div
				class="rochester-container"
				:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
				v-if="draftingState === DraftState.RochesterPicking || draftingState === DraftState.RochesterWaiting"
			>
				<div style="flex-grow: 1">
					<div class="section-title controls">
						<h2>Rochester Draft</h2>
						<div class="controls">
							<span>
								Pack #{{ rochesterDraftState.boosterNumber + 1 }}/{{
									rochesterDraftState.boosterCount
								}}, Pick #{{ rochesterDraftState.pickNumber + 1 }}
							</span>
							<template v-if="userID === rochesterDraftState.currentPlayer">
								<span><i class="fas fa-exclamation-circle"></i> It's your turn! Pick a card. </span>
								<span>
									<input
										type="button"
										@click="pickCard"
										value="Confirm Pick"
										v-if="selectedCards.length === cardsToPick"
									/>
								</span>
							</template>
							<template v-else>
								<span>
									<i class="fas fa-spinner fa-spin"></i>
									Waiting for
									{{
										rochesterDraftState.currentPlayer in userByID
											? userByID[rochesterDraftState.currentPlayer].userName
											: "(Disconnected)"
									}}...
								</span>
							</template>
						</div>
					</div>
					<transition-group name="booster-cards" tag="div" class="booster card-container">
						<template v-if="userID === rochesterDraftState.currentPlayer">
							<booster-card
								v-for="card in rochesterDraftState.booster"
								:key="`card-booster-${card.uniqueID}`"
								:card="card"
								:language="language"
								:canbeburned="false"
								:class="{ selected: selectedCards.includes(card) }"
								@click.native="selectCard($event, card)"
								@dblclick.native="doubleClickCard($event, card)"
								draggable
								@dragstart.native="dragBoosterCard($event, card)"
								:hasenoughwildcards="hasEnoughWildcards(card)"
								:wildcardneeded="displayCollectionStatus && wildcardCost(card)"
							></booster-card>
						</template>
						<template v-else>
							<booster-card
								v-for="card in rochesterDraftState.booster"
								:key="`card-booster-${card.uniqueID}`"
								:card="card"
								:language="language"
								:hasenoughwildcards="hasEnoughWildcards(card)"
								:wildcardneeded="displayCollectionStatus && wildcardCost(card)"
							></booster-card>
						</template>
					</transition-group>
				</div>
				<pick-summary :picks="rochesterDraftState.lastPicks"></pick-summary>
			</div>
			<transition name="fade">
				<div
					v-if="draftPaused && !waitingForDisconnectedUsers && !(userID === sessionOwner && !ownerIsPlayer)"
					class="disconnected-user-popup-container"
				>
					<div class="disconnected-user-popup">
						<div class="swal2-icon swal2-warning swal2-icon-show" style="display: flex">
							<div class="swal2-icon-content">!</div>
						</div>
						<h1>Draft Paused</h1>
						<template v-if="userID === sessionOwner">
							<div style="margin-top: 1em">
								<button class="confirm" @click="resumeDraft"><i class="fas fa-play"></i> Resume</button>
							</div>
						</template>
						<template v-else> Wait for the session owner to resume. </template>
					</div>
				</div>
			</transition>
			<!-- Minesweeper Draft -->
			<minesweeper-draft
				:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
				v-if="
					draftingState === DraftState.MinesweeperPicking || draftingState === DraftState.MinesweeperWaiting
				"
				:state="minesweeperDraftState"
				:currentPlayerUsername="
					minesweeperDraftState.currentPlayer in userByID
						? userByID[minesweeperDraftState.currentPlayer].userName
						: minesweeperDraftState.currentPlayer == ''
						? ''
						: '(Disconnected)'
				"
				:picking="userID === minesweeperDraftState.currentPlayer"
				@pick="minesweeperDraftPick"
			></minesweeper-draft>
			<!-- Disconnected User(s) Modal -->
			<transition name="fade">
				<div v-if="waitingForDisconnectedUsers" class="disconnected-user-popup-container">
					<div class="disconnected-user-popup">
						<div class="swal2-icon swal2-warning swal2-icon-show" style="display: flex">
							<div class="swal2-icon-content">!</div>
						</div>
						<h1>Player(s) disconnected</h1>

						<div
							v-if="
								this.winstonDraftState ||
								this.gridDraftState ||
								this.rochesterDraftState ||
								this.minesweeperDraftState
							"
						>
							{{ `Wait for ${disconnectedUserNames} to come back...` }}
						</div>
						<div v-else>
							<template v-if="userID === sessionOwner">
								{{ `Wait for ${disconnectedUserNames} to come back, or...` }}
								<div style="margin-top: 1em">
									<button @click="socket.emit('replaceDisconnectedPlayers')" class="stop">
										Replace them by bot(s)
									</button>
								</div>
							</template>
							<template v-else>
								{{
									`Wait for ${disconnectedUserNames} to come back or for the owner to replace them by bot(s).`
								}}
							</template>
						</div>
					</div>
				</div>
			</transition>
		</div>

		<!-- Brewing controls (Deck & Sideboard) -->
		<div
			class="container deck-container"
			v-show="
				(deck !== undefined && deck.length > 0) ||
				(drafting && draftingState !== DraftState.Watching) ||
				draftingState == DraftState.Brewing
			"
		>
			<div class="deck">
				<card-pool
					:cards="deck"
					:language="language"
					:click="deckToSideboard"
					:readOnly="false"
					@cardPoolChange="onDeckChange"
					ref="deckDisplay"
					group="deck"
					@dragover.native="allowBoosterCardDrop($event)"
					@drop.native="dropBoosterCard($event)"
					:filter="deckFilter"
				>
					<template v-slot:title>
						Deck ({{ deck.length
						}}<span
							v-show="draftingState == DraftState.Brewing && totalLands > 0"
							v-tooltip="'Added basics on export (Not shown in decklist below).'"
						>
							+ {{ totalLands }}</span
						>)
					</template>
					<template v-slot:controls>
						<ExportDropdown
							v-if="deck.length > 0"
							:language="language"
							:deck="deck"
							:sideboard="sideboard"
							:options="{
								lands: lands,
								preferedBasics: preferedBasics,
								sideboardBasics: sideboardBasics,
							}"
						/>
						<div class="deck-stat-container clickable" @click="displayedModal = 'deckStats'">
							<i class="fas fa-chart-pie fa-lg" v-tooltip.top="'Deck Statistics'"></i>
							<div class="deck-stat" v-tooltip="'Creatures in deck'">
								{{ deckCreatureCount }}
								<img src="./assets/img/Creature.svg" />
							</div>
							<div class="deck-stat" v-tooltip="'Lands in deck'">
								{{ deckLandCount }}
								<img src="./assets/img/Land_symbol_white.svg" />
							</div>
						</div>
						<land-control
							v-if="draftingState === DraftState.Brewing"
							:lands="lands"
							:autoland.sync="autoLand"
							:targetDeckSize.sync="targetDeckSize"
							:sideboardBasics.sync="sideboardBasics"
							:preferedBasics.sync="preferedBasics"
							:otherbasics="basicsInDeck"
							@removebasics="removeBasicsFromDeck"
							@update:lands="(c, n) => (lands[c] = n)"
						>
						</land-control>
						<dropdown
							v-if="displayWildcardInfo && neededWildcards"
							v-tooltip.top="{
								content: `Wildcards needed to craft this deck.<br>Main Deck (Sideboard) / Available`,
								html: true,
							}"
							minwidth="8em"
						>
							<template v-slot:handle>
								<span style="display: flex; justify-content: space-around">
									<span
										:class="{
											yellow:
												collectionInfos.wildcards &&
												collectionInfos.wildcards['rare'] < neededWildcards.main.rare,
										}"
									>
										<img class="wildcard-icon" :src="`img/wc_rare.webp`" />
										{{ neededWildcards.main.rare }}
									</span>
									<span
										:class="{
											yellow:
												collectionInfos.wildcards &&
												collectionInfos.wildcards['mythic'] < neededWildcards.main.mythic,
										}"
									>
										<img class="wildcard-icon" :src="`img/wc_mythic.webp`" />
										{{ neededWildcards.main.mythic }}
									</span>
								</span>
							</template>
							<template v-slot:dropdown>
								<table style="margin: auto">
									<tr
										v-for="(value, rarity) in neededWildcards.main"
										:key="rarity"
										:class="{
											yellow:
												collectionInfos.wildcards && collectionInfos.wildcards[rarity] < value,
										}"
									>
										<td><img class="wildcard-icon" :src="`img/wc_${rarity}.webp`" /></td>
										<td>{{ value }}</td>
										<td>({{ neededWildcards.side[rarity] }})</td>
										<template v-if="collectionInfos && collectionInfos.wildcards">
											<td style="font-size: 0.75em; color: #bbb">/</td>
											<td style="font-size: 0.75em; color: #bbb">
												{{ collectionInfos.wildcards[rarity] }}
											</td>
										</template>
									</tr>
								</table>

								<div
									v-if="collectionInfos.vaultProgress"
									v-tooltip.right="
										'Vault Progress. For every 100% you\'ll receive 1 mythic, 2 rare and 3 uncommon wildcards when opened.'
									"
									style="
										display: flex;
										align-items: center;
										justify-content: space-evenly;
										margin: 0.25em 0 0 0;
									"
								>
									<img src="./assets/img/vault.png" style="height: 1.5rem" /><span
										style="font-size: 0.8em"
										>{{ collectionInfos.vaultProgress }}%</span
									>
								</div>
							</template>
						</dropdown>
						<div
							class="input-delete-icon"
							v-tooltip.top="'Quick search for English card names and types in your deck/sideboard.'"
						>
							<input type="text" placeholder="Search..." v-model="deckFilter" /><span
								@click="deckFilter = ''"
								><i class="fas fa-times-circle"></i
							></span>
						</div>
					</template>
					<template v-slot:empty>
						<h3>Your deck is currently empty!</h3>
						<p>Click on cards in your sideboard to move them here.</p>
					</template>
				</card-pool>
			</div>
			<!-- Collapsed Sideboard -->
			<div
				v-if="
					collapseSideboard &&
					((sideboard != undefined && sideboard.length > 0) ||
						(drafting && draftingState !== DraftState.Watching) ||
						draftingState == DraftState.Brewing)
				"
				class="collapsed-sideboard"
			>
				<div class="section-title">
					<h2>Sideboard ({{ sideboard.length }})</h2>
					<div class="controls">
						<i
							class="far fa-window-maximize clickable"
							@click="collapseSideboard = false"
							v-tooltip="'Maximize sideboard'"
						></i>
					</div>
				</div>
				<div
					class="card-container"
					@dragover="allowBoosterCardDrop($event)"
					@drop="dropBoosterCard($event, { toSideboard: true })"
				>
					<draggable
						:key="`${_uid}_col`"
						class="card-column drag-column"
						:list="sideboard"
						group="deck"
						@change="onCollapsedSideChange"
						:animation="200"
					>
						<card
							v-for="card in sideboard"
							:key="`${_uid}_card_${card.uniqueID}`"
							:card="card"
							:language="language"
							@click="sideboardToDeck($event, card)"
							:filter="deckFilter"
						></card>
					</draggable>
				</div>
			</div>
		</div>
		<!-- Full size Sideboard -->
		<div
			v-show="
				!collapseSideboard &&
				((sideboard != undefined && sideboard.length > 0) ||
					(drafting && draftingState !== DraftState.Watching) ||
					draftingState == DraftState.Brewing)
			"
			class="container"
		>
			<card-pool
				:cards="sideboard"
				:language="language"
				:click="sideboardToDeck"
				:readOnly="false"
				@cardPoolChange="onSideChange"
				ref="sideboardDisplay"
				group="deck"
				@dragover.native="allowBoosterCardDrop($event)"
				@drop.native="dropBoosterCard($event, { toSideboard: true })"
				:filter="deckFilter"
			>
				<template v-slot:title> Sideboard ({{ sideboard.length }}) </template>
				<template v-slot:controls>
					<i
						class="fas fa-columns clickable"
						@click="collapseSideboard = true"
						v-tooltip="'Minimize sideboard'"
					></i>
				</template>
				<template v-slot:empty>
					<h3>Your sideboard is currently empty!</h3>
					<p>Click on cards in your deck to move them here.</p>
				</template>
			</card-pool>
		</div>

		<div class="welcome" v-if="draftingState === undefined">
			<h1>Welcome to MTGADraft.tk!</h1>
			<p class="important">
				Draft with other players and export your resulting deck to Magic: The Gathering Arena to play with them,
				in pod!
			</p>
			<div class="welcome-sections">
				<div class="container" style="grid-area: News">
					<div class="section-title">
						<h2>News</h2>
					</div>
					<div class="welcome-section">
						<div class="news">
							<em>January 27, 2023</em>
							<p>
								<img src="img/sets/one.svg" class="set-icon" style="--invertedness: 100%; width: 2em" />
								Phyrexia: All Will Be One is now available!
							</p>
						</div>
						<div class="news">
							<em>December 13, 2022</em>
							<p>
								<img src="img/sets/dmr.svg" class="set-icon" style="--invertedness: 100%; width: 2em" />
								Dominaria Remastered is now available in the 'More sets
								<i class="fas fa-ellipsis-h"></i>' menu!
							</p>
						</div>
						<div class="news">
							<em>November 5, 2022</em>
							<p>
								<img src="img/sets/bro.svg" class="set-icon" style="--invertedness: 100%; width: 2em" />
								The Brothers' War is now available!
							</p>
						</div>
						<div class="news">
							<em>October 20, 2022</em>
							<p>
								Players can now specify the set of their basic lands when exporting to Arena. This
								setting can be found in the Basic Lands dropdown, just above the deck.
							</p>
						</div>
					</div>
				</div>
				<div class="container" style="grid-area: Help">
					<div class="section-title">
						<h2>Help</h2>
					</div>
					<div class="welcome-section welcome-alt">
						<div style="display: flex; justify-content: space-between">
							<div>
								<a @click="displayedModal = 'gettingStarted'"
									><i class="fas fa-rocket"></i> Get Started</a
								>
								guide
							</div>
							<div>
								<a @click="displayedModal = 'help'"
									><i class="fas fa-info-circle"></i> FAQ / Settings Description</a
								>
							</div>
						</div>
						<br />
						For any question/bug report/feature request you can email to
						<a href="mailto:mtgadraft@gmail.com">mtgadraft@gmail.com</a>
						or join the
						<a href="https://discord.gg/XscXXNw"><i class="fab fa-discord"></i> MTGADraft Discord</a>.
					</div>
				</div>
				<div class="container" style="grid-area: Support">
					<div class="section-title">
						<h2>Sponsor</h2>
					</div>
					<div class="welcome-section welcome-alt" style="display: flex; gap: 0.5em">
						<iframe
							src="https://github.com/sponsors/Senryoku/button"
							title="Sponsor Senryoku"
							height="35"
							width="116"
							style="border: 0; margin: 0.25em"
						></iframe>
						<div>
							Support MTGADraft on
							<a href="https://github.com/sponsors/Senryoku" target="_blank">
								<i class="fa fa-github"></i> GitHub Sponsor
							</a>
							to make sure it stays online and updated.
						</div>
					</div>
				</div>
				<div class="container" style="grid-area: Tools">
					<div class="section-title">
						<h2>Tools</h2>
					</div>
					<div class="welcome-section welcome-alt">
						<ul style="display: flex; flex-wrap: wrap; justify-content: space-around">
							<li>
								<a @click="displayedModal = 'importdeck'"
									><i class="fas fa-file-export"></i> Card List Importer</a
								>
							</li>
							<li
								v-tooltip="
									'Download the intersection of the collections of players in the session in text format.'
								"
							>
								<a :href="encodeURI(`/getCollectionPlainText/${sessionID}`)" target="_blank"
									><i class="fas fa-file-download"></i> Download Session Collection</a
								>
							</li>
						</ul>
					</div>
				</div>
				<div class="container" style="grid-area: PublicSessions">
					<div class="section-title">
						<h2>Public Sessions</h2>
					</div>
					<div class="welcome-section">
						<div v-if="userID === sessionOwner" style="display: flex">
							<button @click="isPublic = !isPublic">
								Set session as {{ isPublic ? "Private" : "Public" }}
							</button>
							<delayed-input
								style="flex-grow: 1"
								v-model="description"
								type="text"
								placeholder="Enter a description for your session"
								maxlength="70"
							/>
						</div>

						<p v-if="publicSessions.length === 0" style="text-align: center">No public sessions</p>
						<table v-else class="public-sessions">
							<thead>
								<tr>
									<th>ID</th>
									<th>Set(s)</th>
									<th>Players</th>
									<th>Description</th>
									<th>Join</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="s in publicSessions" :key="s.id">
									<td :title="s.id" class="id">{{ s.id }}</td>
									<td
										v-tooltip="
											s.cube ? 'Cube' : s.sets.map((code) => setsInfos[code].fullName).join(', ')
										"
									>
										<template v-if="s.cube">
											<img src="./assets/img/cube.png" class="set-icon" />
										</template>
										<template v-else-if="s.sets.length === 1">
											<img :src="setsInfos[s.sets[0]].icon" class="set-icon" />
										</template>
										<template v-else-if="s.sets.length === 0">All</template>
										<template v-else>[{{ s.sets.length }}]</template>
									</td>
									<td>{{ s.players }} / {{ s.maxPlayers }}</td>
									<td class="desc">{{ s.description }}</td>
									<td>
										<button v-if="s.id !== sessionID" @click="sessionID = s.id">Join</button>
										<i class="fas fa-check green" v-tooltip="`You are in this session!`" v-else></i>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>

		<modal v-if="displayedModal === 'help'" @close="displayedModal = ''">
			<h2 slot="header">Help</h2>
			<div slot="body">
				<h2>FAQ</h2>
				<div class="faq">
					<strong>Can we play cube?</strong>
					<p>
						Yes! You can import custom list of cards in text format in the settings.
						<a href="cubeformat.html" target="_blank" rel="noopener nofollow">More information</a>.
					</p>
					<strong>Are custom cards supported?</strong>
					<p>
						There is an experimental support for custom cards in cube, see the
						<a href="cubeformat.html" target="_blank" rel="noopener nofollow">Cube Format</a> for more
						information.
					</p>
					Your question isn't answered here? Head to the
					<a href="https://discord.gg/ZkMyKpPYSz" target="_blank" rel="noopener nofollow"
						>Help section of the MTGADraft Discord</a
					>!
				</div>
				<br />
				<h2>Settings Description</h2>
				<div class="help-options">
					<div style="width: 50%">
						<strong>Session settings</strong>
						(Only accessible to the session owner, shared by everyone in your session)
						<ul>
							<li>
								<span class="option-name">Ignore Collections</span>
								: Draft with all cards of the selected set(s), ignoring player collections and
								preferences.
							</li>
							<li>
								<span class="option-name">Set(s)</span>
								: Select one or multiple sets to draft with. All chosen sets will form the card pool out
								of which mixed boosters will be generated for all players. If you want every player to
								receive certain pure set boosters in a particular order (e.g. for original block drafts)
								you have to use the "Individual Booster Set" option in settings instead!
							</li>
							<li>
								<span class="option-name">Bots</span>
								: Adds virtual players to your draft. They are
								<strong>pretty dumb</strong>, but they are doing their best. :(
							</li>
							<li>
								<span class="option-name">Pick Timer</span>
								: Maximum time in seconds allowed to pick a card in each booster. "0" means the timer is
								disabled.
							</li>
						</ul>
						Click on
						<span @click="displayedModal = 'sessionOptions'" class="clickable">
							<i class="fas fa-cog"></i>
							Settings
						</span>
						for some additional settings:
						<ul>
							<li>
								<span class="option-name">Public</span>
								: Flags your session as public. It will appear in the "Public Sessions" menu so anyone
								can join directly.
							</li>
							<li>
								<span class="option-name">Color Balance</span>
								: If set, the system will attempt to smooth out the color distribution in each pack, as
								opposed to being completely random. This also affects sealed and cube!
							</li>
							<li>
								<span class="option-name">Custom Card List</span>
								: Submit a custom card list (one English card name per line) to draft your own cube.
								Collections are ignored in this mode.
								<a href="cubeformat.html" target="_blank" rel="noopener nofollow">More information</a>
							</li>
							<li>
								<span class="option-name">Foil</span>
								: If enabled, each pack will have a chance to contain a shiny foil card of any rarity
								and replaces a common - like in paper.
							</li>
						</ul>
					</div>
					<div style="width: 50%">
						<strong>Personal settings</strong>
						<ul>
							<li>
								<span class="option-name">Language</span>
								: Adjusts the display language of cards (not the page UI!). Some cards are not available
								in all languages.
							</li>
							<li>
								<span class="option-name">Restrict to Collection</span>
								: If unchecked, your collection will not limit the cards available in the selected sets.
								If every players unchecks this, you will draft using all cards. This setting is ignored
								if "Ignore Collections" is enabled by the session owner, when using a Custom Card List
								or Pre-Determined Boosters.
							</li>
							<li>
								<span class="option-name">Pick on Double Click</span>
								: Allows you to double click on cards during draft to pick without having to confirm.
							</li>
							<li>
								<span class="option-name">Notifications</span>
								: Enable this to receive desktop notifications when a draft is starting or you receive a
								new pack to make a pick.
							</li>
							<li>
								<span class="option-name">Session ID</span>
								: A unique identifier for your session, you can use any name, just make sure to use the
								same as your friends to play with them!
							</li>
						</ul>
					</div>
				</div>
			</div>
		</modal>
		<modal v-if="displayedModal === 'gettingStarted'" @close="displayedModal = ''">
			<h2 slot="header">Getting Started</h2>
			<div slot="body">
				<div>
					<div class="section-title">
						<h2>
							As Player <i class="fas fa-user"></i>
							<span v-if="userID != sessionOwner">(That's you!)</span>
						</h2>
					</div>
					<div style="margin-top: 0.5em; margin-bottom: 1em">
						Customize your personal settings, like your User Name or Card Language on top of the page.<br />
						There are also toggles to enable e.g. sound alerts and notifications in the upper right.
						<br />
						<span v-if="userID !== sessionOwner">
							<ul>
								<li>
									Wait for the session owner (<em
										>{{ userByID[sessionOwner].userName }}
										<i class="fas fa-crown subtle-gold"></i></em
									>) to select the settings and launch the game!
								</li>
								<li>Or, to create a new session that you own, change "Session ID" in the top left.</li>
							</ul>
						</span>
					</div>
				</div>
				<div>
					<div class="section-title">
						<h2>
							As Session owner <i class="fas fa-crown subtle-gold"></i>
							<span v-if="userID === sessionOwner">(That's you!)</span
							><span v-else
								>(currently <em>{{ userByID[sessionOwner].userName }}</em
								>)</span
							>
						</h2>
					</div>
					<div style="margin-top: 0.5em; margin-bottom: 1em">
						One player takes the role of owner of the session (designated with
						<i class="fas fa-crown subtle-gold"></i>), by default the first connected player.
						<ol>
							<li>Session owner chooses an arbitrary Session ID.</li>
							<li>
								Other players join the session by entering its ID or by following the
								<a @click="sessionURLToClipboard">
									Session Link
									<i class="fas fa-share-square"></i>
								</a>
								.
							</li>
							<li>
								Owner configures the game. (Take a look at all
								<a @click="displayedModal = 'sessionOptions'"><i class="fas fa-cog"></i> Settings</a>)
							</li>
							<li>
								Ready check is performed to make sure everybody is set (<i class="fas fa-user-check"></i
								>).
							</li>
							<li>Once all confirmed, the session owner launches the desired game mode.</li>
						</ol>
					</div>
				</div>
			</div>
		</modal>
		<modal v-if="displayedModal === 'collectionHelp'" @close="displayedModal = ''">
			<h2 slot="header">Collection Import Help</h2>
			<CollectionImportHelp slot="body" @uploadlogs="uploadMTGALogs" @clipboard="toClipboard" />
		</modal>
		<modal v-if="displayedModal === 'importdeck'" @close="displayedModal = ''">
			<h2 slot="header">Card List Importer</h2>
			<div slot="body">
				<form @submit.prevent="importDeck">
					<div>
						<textarea
							placeholder="Paste cards here... any list MTGA accepts should work"
							rows="15"
							cols="40"
							id="decklist-text"
						></textarea>
					</div>
					<div><button type="submit">Import</button></div>
				</form>
			</div>
		</modal>
		<modal v-show="displayedModal === 'uploadBoosters'" @close="displayedModal = 'sessionOptions'">
			<h2 slot="header">Upload Boosters</h2>
			<div slot="body">
				<form @submit.prevent="uploadBoosters">
					<div>
						<div>
							Paste your boosters card list here. One card per line, each booster separated by a blank
							line.<br />
							Make sure each booster has the same number of cards and the total booster count is suitable
							for your settings.
						</div>
						<textarea
							placeholder="Paste cards here..."
							rows="15"
							cols="40"
							id="upload-booster-text"
						></textarea>
					</div>
					<div><button type="submit">Upload</button></div>
				</form>
			</div>
		</modal>
		<modal v-if="displayedModal === 'setRestriction'" @close="displayedModal = ''">
			<h2 slot="header">Card Pool</h2>
			<set-restriction slot="body" v-model="setRestriction"></set-restriction>
		</modal>
		<modal v-if="displayedModal === 'draftLogs' && draftLogs" @close="displayedModal = ''">
			<h2 slot="header">Game Logs</h2>
			<draft-log-history
				slot="body"
				:draftLogs="draftLogs"
				:language="language"
				:userID="userID"
				:userName="userName"
				@sharelog="shareSavedDraftLog"
				@storelogs="storeDraftLogs"
			></draft-log-history>
		</modal>
		<modal v-if="displayedModal === 'collection'" @close="displayedModal = ''">
			<h2 slot="header">Collection Statistics</h2>
			<collection
				slot="body"
				:collection="collection"
				:collectionInfos="collectionInfos"
				:language="language"
				:displaycollectionstatus="displayCollectionStatus"
				@display-collection-status="displayCollectionStatus = $event"
			></collection>
		</modal>
		<modal v-if="displayedModal === 'sessionOptions'" @close="displayedModal = ''">
			<h2 slot="header">Additional Session Settings</h2>
			<div slot="controls">
				<i
					class="fas fa-undo clickable"
					:class="{ disabled: userID !== sessionOwner }"
					@click="resetSessionSettings"
					v-tooltip="'Reset all session settings to their default value'"
				></i>
			</div>
			<div slot="body" class="session-options-container" :class="{ disabled: userID != sessionOwner }">
				<div class="option-column option-column-left">
					<div
						class="line"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content: '<p>Share this session ID with everyone.</p>',
							html: true,
						}"
					>
						<label for="is-public">Public</label>
						<div class="right">
							<input type="checkbox" v-model="isPublic" id="is-public" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content:
								'<p>Public description for your session. Ex: Peasant Cube, will launch at 8pm. Matches played on Arena.</p>',
							html: true,
						}"
					>
						<label for="session-desc">Description</label>
						<div class="right">
							<delayed-input
								id="session-desc"
								v-model="description"
								type="text"
								placeholder="Session public description"
								maxlength="70"
								style="width: 90%"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content: `<p>Spectate the game as the Session Owner, without participating.<br>
								If checked, the owner will still be able to observe the picks of each player (as long as the logs are available).<br>
								Mostly useful to tournament organizers.</p>`,
							html: true,
						}"
					>
						<label for="is-owner-player">Spectate as Session Owner</label>
						<div class="right">
							<input
								type="checkbox"
								v-model="ownerIsPlayer"
								:true-value="false"
								:false-value="true"
								id="is-owner-player"
							/>
						</div>
					</div>
					<div class="line" v-bind:class="{ disabled: teamDraft }">
						<label for="max-players">Maximum Players</label>
						<div class="right">
							<input
								class="small-number-input"
								type="number"
								id="max-players"
								min="1"
								step="1"
								v-model.number="maxPlayers"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content:
								'<p>If set, the system will attempt to smooth out the color distribution in each pack, as opposed to being completely random.</p>',
							html: true,
						}"
						:class="{ disabled: usePredeterminedBoosters }"
					>
						<label for="color-balance">Color Balance</label>
						<div class="right">
							<input type="checkbox" v-model="colorBalance" id="color-balance" />
						</div>
					</div>
					<div
						class="line"
						:class="{ disabled: usePredeterminedBoosters || useCustomCardList }"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content:
								'<p>If enabled (default) Rares can be promoted to a Mythic at a 1/8 rate.</p><p>Disabled for Custom Card Lists.</p>',
							html: true,
						}"
					>
						<label for="mythic-promotion">Rare promotion to Mythic</label>
						<div class="right">
							<input type="checkbox" v-model="mythicPromotion" id="mythic-promotion" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content: '<p>Upload your own boosters.</p>',
							html: true,
						}"
					>
						<label for="use-predetermined-boosters">Use Pre-Determined Boosters</label>
						<div class="right">
							<input type="checkbox" v-model="usePredeterminedBoosters" id="use-predetermined-boosters" />
							<button @click="displayedModal = 'uploadBoosters'">
								<i class="fas fa-upload"></i> Upload
							</button>
							<button
								@click="shuffleUploadedBoosters"
								v-tooltip="'Shuffle the boosters before distributing them.'"
							>
								Shuffle
							</button>
						</div>
					</div>
					<div
						class="option-section"
						v-bind:class="{ disabled: usePredeterminedBoosters || useCustomCardList }"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content:
								'<p>Lets you customize the exact content of your boosters.</p><p>Notes:<ul><li>Zero is a valid value (useful for Pauper or Artisan for example).</li><li>A land slot will be automatically added for some sets.</li><li>Unused when drawing from a custom card list: See the advanced card list syntax to mimic it.</li></ul></p>',
							html: true,
						}"
					>
						<div class="option-column-title">
							<input type="checkbox" v-model="useBoosterContent" id="edit-booster-content" />
							<label for="edit-booster-content">Edit Booster Content</label>
						</div>
						<template v-if="useBoosterContent">
							<div class="line" v-for="r in ['common', 'uncommon', 'rare']" :key="r">
								<label :for="'booster-content-' + r" class="capitalized">{{ r }}s</label>
								<div class="right">
									<input
										class="small-number-input"
										type="number"
										:id="'booster-content-' + r"
										min="0"
										max="30"
										step="1"
										v-model.number="boosterContent[r]"
										@change="if (boosterContent[r] < 0) boosterContent[r] = 0;"
									/>
								</div>
							</div>
						</template>
					</div>
					<div
						class="option-section"
						v-bind:class="{ disabled: usePredeterminedBoosters || useCustomCardList }"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content:
								'<p>Sets a duplicate limit for each rarity across the entire draft. Only used if no player collection is used to limit the card pool. Default: Off.</p>',
							html: true,
						}"
					>
						<div class="option-column-title">
							<input
								type="checkbox"
								:checked="maxDuplicates !== null"
								@click="toggleLimitDuplicates"
								id="max-duplicate-title"
							/><label for="max-duplicate-title">Limit duplicates</label>
						</div>
						<template v-if="maxDuplicates !== null">
							<div class="line" v-for="r in Object.keys(maxDuplicates)" :key="r">
								<label :for="'max-duplicates-' + r" class="capitalized">{{ r }}s</label>
								<div class="right">
									<input
										class="small-number-input"
										type="number"
										:id="'max-duplicates-' + r"
										min="1"
										max="16"
										step="1"
										v-model.number="maxDuplicates[r]"
										@change="if (maxDuplicates[r] < 1) maxDuplicates[r] = 1;"
									/>
								</div>
							</div>
						</template>
					</div>
					<div
						class="line"
						v-bind:class="{ disabled: usePredeterminedBoosters || useCustomCardList }"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content:
								'<p>If enabled, each pack will have a chance to contain a \'foil\' card of any rarity in place of one common.</p>',
							html: true,
						}"
					>
						<label for="option-foil">Foil</label>
						<div class="right">
							<input type="checkbox" v-model="foil" id="option-foil" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content:
								'<p>If enabled, players will receive a log of their own draft, regardless of the full game log settings.</p>',
							html: true,
						}"
					>
						<label for="option-personal-logs">Personal Logs</label>
						<div class="right">
							<input type="checkbox" v-model="personalLogs" id="option-personal-logs" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content:
								'<p>Controls who is going to receive the full game logs. Note that this setting doesn\'t affect personal logs.</p><p>\'Everyone, on owner approval\': The session owner will choose when to reveal the full game logs. Useful for tournaments.</p>',
							html: true,
						}"
					>
						<label for="draft-log-recipients">Send full game logs to</label>
						<div class="right">
							<select v-model="draftLogRecipients" id="draft-log-recipients">
								<option value="everyone">Everyone</option>
								<option value="delayed">Everyone, on owner approval</option>
								<option value="owner">Owner only</option>
								<option value="none">No-one</option>
							</select>
						</div>
					</div>
				</div>
				<div class="option-column option-column-right">
					<h4>Draft Specific Settings</h4>
					<div
						class="line"
						v-tooltip.right="{
							popperClass: 'option-tooltip',
							content:
								'<p>Team Draft, which is a 6-player, 3v3 mode where teams alternate seats.</p><p>This creates a bracket where you face each player on the other team.</p>',
							html: true,
						}"
					>
						<label for="team-draft">Team Draft</label>
						<div class="right">
							<input type="checkbox" id="team-draft" v-model="teamDraft" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							popperClass: 'option-tooltip',
							content: '<p>Draft: Boosters per Player; default is 3.</p>',
							html: true,
						}"
					>
						<label for="boosters-per-player">Boosters per Player</label>
						<div class="right">
							<delayed-input
								type="number"
								id="boosters-per-player"
								class="small-number-input"
								min="1"
								max="25"
								step="1"
								:delay="0.1"
								v-model.number="boostersPerPlayer"
								:validate="(v) => Math.max(1, Math.min(v, 25))"
							/>
						</div>
					</div>
					<div
						class="option-section"
						v-bind:class="{ disabled: usePredeterminedBoosters || useCustomCardList }"
					>
						<div class="option-column-title">Individual Booster Set</div>
						<div
							class="line"
							v-tooltip.right="{
								popperClass: 'option-tooltip',
								content:
									'<p>Controls how the boosters will be distributed. This setting will have no effect if no individual booster rules are specified below.</p><ul><li>Regular: Every player will receive boosters from the same sets and will open them in the specified order.</li><li>Shuffle Player Boosters: Each player will receive boosters from the same sets but will open them in a random order.</li><li>Shuffle Booster Pool: Boosters will be shuffled all together and randomly handed to each player.</li></ul>',
								html: true,
							}"
						>
							<label for="distribution-mode">Distribution Mode</label>
							<select
								class="right"
								v-model="distributionMode"
								name="distributionMode"
								id="distribution-mode"
							>
								<option value="regular">Regular</option>
								<option value="shufflePlayerBoosters">Shuffle Player Boosters</option>
								<option value="shuffleBoosterPool">Shuffle Booster Pool</option>
							</select>
						</div>
						<div
							v-tooltip.right="{
								popperClass: 'option-tooltip',
								content:
									'<p>Specify the set of indiviual boosters handed to each player. Useful for classic Chaos Draft or Ixalan/Rivals of Ixalan draft for example.</p><p>Note: Collections are ignored for each booster with any other value than (Default).</p>',
								html: true,
							}"
						>
							<div v-for="(value, index) in customBoosters" class="line" :key="index">
								<label for="customized-booster">Booster #{{ index + 1 }}</label>
								<select class="right" v-model="customBoosters[index]">
									<option value>(Default)</option>
									<option value="random">Random Set from Card Pool</option>
									<option style="color: #888" disabled>————————————————</option>
									<option v-for="code in sets.slice().reverse()" :value="code" :key="code">
										{{ setsInfos[code].fullName }}
									</option>
									<option style="color: #888" disabled>————————————————</option>
									<option
										v-for="code in primarySets.filter((s) => !sets.includes(s))"
										:value="code"
										:key="code"
									>
										{{ setsInfos[code].fullName }}
									</option>
								</select>
							</div>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							popperClass: 'option-tooltip',
							content:
								'<p>Number of cards to pick from each booster. Useful for Commander Legends for example (2 cards per booster).</p><p>Default is 1.</p><p>First Pick Only: The custom value will only be used for the first pick of each booster, then revert to 1. For example, you should check this with a value of 2 for Double Masters sets.</p>',
							html: true,
						}"
					>
						<label for="picked-cards-per-round">Picked cards per booster</label>
						<div class="right">
							<input
								type="number"
								id="picked-cards-per-round"
								class="small-number-input"
								min="1"
								step="1"
								v-model.number="pickedCardsPerRound"
								@change="if (pickedCardsPerRound < 1) pickedCardsPerRound = 1;"
							/>
							<label for="doubleMastersMode">First Pick Only</label
							><input type="checkbox" id="doubleMastersMode" v-model="doubleMastersMode" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							popperClass: 'option-tooltip',
							content:
								'<p>In addition to picking a card, you will also remove this number of cards from the same booster.</p><p>This is typically used in conjunction with a higher count of boosters per player for drafting with 2 to 4 players. Burn or Glimpse Draft is generally 9 boosters per player with 2 cards being burned in addition to a pick.</p><p>Default is 0.</p>',
							html: true,
						}"
					>
						<label for="burned-cards-per-round">Burned cards per booster</label>
						<div class="right">
							<input
								type="number"
								id="burned-cards-per-round"
								class="small-number-input"
								min="0"
								max="24"
								step="1"
								v-model.number="burnedCardsPerRound"
								@change="if (burnedCardsPerRound < 0) burnedCardsPerRound = 0;"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							popperClass: 'option-tooltip',
							content: '<p>Discard (burn) the remaining N cards of each packs automatically.</p>',
							html: true,
						}"
					>
						<label for="discard-remaining-cards">Discard the remaining</label>
						<div class="right">
							<input
								type="number"
								id="discard-remaining-cards"
								class="small-number-input"
								min="0"
								:max="
									Math.max(
										Object.values(this.boosterContent).reduce((v, a) => (a += v)),
										this.cardsPerBooster
									) - this.pickedCardsPerRound
								"
								step="1"
								v-model.number="discardRemainingCardsAt"
								@change="if (discardRemainingCardsAt < 0) discardRemainingCardsAt = 0;"
							/>
							cards of each pack
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							popperClass: 'option-tooltip',
							content:
								'<p>Disable the bot suggestions mechanism for every player in the session. Useful for tournaments for example.</p>',
							html: true,
						}"
					>
						<label for="disable-bot-suggestions">Disable Bot Suggestions</label>
						<div class="right">
							<input type="checkbox" id="disable-bot-suggestions" v-model="disableBotSuggestions" />
						</div>
					</div>
				</div>
				<div class="option-section option-custom-card-list" :class="{ disabled: usePredeterminedBoosters }">
					<div class="option-column-title">
						<input type="checkbox" v-model="useCustomCardList" id="use-custom-card-list" /> Custom Card List
					</div>
					<div style="display: flex; justify-content: space-between; align-items: center">
						<div
							style="display: flex; align-items: center; gap: 1.5em"
							:class="{
								'disabled-simple': !useCustomCardList,
							}"
						>
							<div
								v-tooltip.left="{
									popperClass: 'option-tooltip',
									content:
										'<p>Cards per Booster when using a Custom Card List, ignored when using custom sheets; Default is 15.</p>',
									html: true,
								}"
								:class="{
									'disabled-simple': useCustomCardList && customCardList && customCardList.layouts,
								}"
							>
								<label for="cards-per-booster">Cards per Booster</label>
								<input
									type="number"
									id="cards-per-booster"
									class="small-number-input"
									min="1"
									max="100"
									step="1"
									v-model.number="cardsPerBooster"
								/>
							</div>
							<div
								v-tooltip.left="{
									popperClass: 'option-tooltip',
									content:
										'<p>If checked, picked cards will be replaced in the card pool, meaning there\'s an unlimited supply of each card in the list.</p>',
									html: true,
								}"
							>
								<input
									type="checkbox"
									v-model="customCardListWithReplacement"
									id="custom-card-list-with-replacement"
								/>
								<label for="custom-card-list-with-replacement">With Replacement</label>
							</div>
						</div>
						<div v-if="customCardList.slots && Object.keys(customCardList.slots).length > 0">
							<i
								class="fas fa-check green"
								v-if="useCustomCardList"
								v-tooltip="'Card list successfuly loaded!'"
							></i>
							<i
								class="fas fa-exclamation-triangle yellow"
								v-else
								v-tooltip="'Card list successfuly loaded, but not used.'"
							></i>
							<span v-if="customCardList.name">Loaded '{{ customCardList.name }}'.</span>
							<span v-else>Unamed list loaded.</span>
							<button @click="displayedModal = 'cardList'">
								<i class="fas fa-file-alt"></i>
								Review.
							</button>
						</div>
						<div v-else>(No Custom Card List loaded)</div>
					</div>
					<div style="display: flex; gap: 0.5em">
						<input
							type="file"
							id="card-list-input"
							@change="uploadFile($event, parseCustomCardList)"
							style="display: none"
							accept=".txt"
						/>
						<div
							class="file-drop clickable"
							v-tooltip.left="{
								popperClass: 'option-tooltip',
								content:
									'<p>Upload any card list from your computer.</p><p>You can use services like Cube Cobra to find cubes or craft your own list and export it to .txt.</p>',
								html: true,
							}"
							@drop="dropCustomList"
							onclick="document.querySelector('#card-list-input').click()"
							@dragover="
								$event.preventDefault();
								$event.target.classList.add('dropzone-highlight');
							"
							style="flex-grow: 1; height: 100%"
						>
							Upload a Custom Card List file by dropping it here or by clicking to browse your computer.
						</div>
						<div
							style="
								display: flex;
								align-items: center;
								justify-content: space-around;
								flex-direction: column;
								min-width: 17em;
							"
						>
							<button @click="importCube('Cube Cobra')" style="position: relative; width: 100%">
								<img
									style="position: absolute; left: 0.2em; top: 10%; height: 80%"
									src="./assets/img/cubecobra-small-logo.png"
								/>
								Import From Cube Cobra
							</button>
							<button @click="importCube('CubeArtisan')" style="position: relative; width: 100%">
								<img
									style="position: absolute; left: 0.2em; top: 10%; height: 80%"
									src="./assets/img/cubeartisan-logo.png"
								/>
								Import From CubeArtisan
							</button>
						</div>
					</div>
					<div
						class="option-cube-select"
						v-tooltip.left="{
							popperClass: 'option-tooltip',
							content: '<p>Load a pre-built cube from a curated list.</p>',
							html: true,
						}"
					>
						<label for="curated-cubes">Load a Pre-Build Cube:</label>
						<select name="featured-cubes" id="curated-cubes" v-model="selectedCube">
							<option v-for="cube in cubeLists" :key="cube.filename" :value="cube">
								{{ cube.name }}
								<span v-if="cube.cubeCobraID" style="font-size: 0.75em">(Cube Cobra)</span>
							</option>
						</select>
						<button @click="selectCube(selectedCube)" style="min-width: auto">
							<img
								v-if="selectedCube.cubeCobraID"
								class="set-icon"
								src="./assets/img/cubecobra-small-logo.png"
							/>
							Load Cube
						</button>
					</div>
					<div class="option-cube-infos" v-if="selectedCube">
						<strong>{{ selectedCube.name }}</strong>
						<div v-if="selectedCube.cubeCobraID">
							<a
								:href="`https://cubecobra.com/cube/overview/${selectedCube.cubeCobraID}`"
								target="_blank"
								rel="noopener nofollow"
							>
								<img class="set-icon" src="./assets/img/cubecobra-small-logo.png" />
								Cube Cobra page
							</a>
						</div>
						<div v-if="selectedCube.description" v-html="selectedCube.description"></div>
					</div>
					<div class="option-info">
						You can find more cubes or craft your own on
						<a href="https://cubecobra.com/" target="_blank" rel="noopener nofollow"
							><i class="fas fa-external-link-alt"></i> Cube Cobra</a
						>
						or
						<a href="https://cubeartisan.net/" target="_blank" rel="noopener nofollow"
							><i class="fas fa-external-link-alt"></i> Cube Artisan</a
						>
						<br />Customize your list even further by using all features of the
						<a href="cubeformat.html" target="_blank" rel="noopener nofollow">
							<i class="fas fa-external-link-alt"></i>
							format
						</a>
					</div>
				</div>
			</div>
		</modal>
		<modal v-if="displayedModal === 'bracket'" @close="displayedModal = ''">
			<h2 slot="header">Bracket</h2>
			<bracket
				slot="body"
				:bracket="bracket"
				:teamDraft="teamDraft"
				:editable="userID === sessionOwner || !bracketLocked"
				:locked="bracketLocked"
				:fullcontrol="userID === sessionOwner"
				:sessionID="sessionID"
				:language="language"
				:draftlog="currentDraftLog"
				@updated="updateBracket"
				@generate="generateBracket"
				@generate-swiss="generateSwissBracket"
				@generate-double="generateDoubleBracket"
				@lock="lockBracket"
			></bracket>
		</modal>
		<modal v-if="displayedModal === 'deckStats'" @close="displayedModal = ''">
			<h2 slot="header">Deck Statistics</h2>
			<card-stats slot="body" :cards="deck" :addedbasics="totalLands"></card-stats>
		</modal>
		<modal v-if="displayedModal === 'cardList'" @close="displayedModal = ''">
			<h2 slot="header">Custom Card List Review</h2>
			<card-list slot="body" :cardlist="customCardList" :language="language" :collection="collection"></card-list>
		</modal>
		<modal v-if="displayedModal === 'About'" @close="displayedModal = ''">
			<h2 slot="header">About</h2>
			<div slot="body">
				<p>
					Developped by
					<a href="https://senryoku.github.io/" target="_blank" rel="noopener nofollow">Senryoku</a>
					(contact in French or English:
					<a href="mailto:mtgadraft@gmail.com">mtgadraft@gmail.com</a>
					) using
					<a href="https://scryfall.com/">Scryfall</a>
					card data and images and loads of open source software.
				</p>
				<p>
					MTGADraft Discord:
					<a href="https://discord.gg/XscXXNw">https://discord.gg/XscXXNw</a>
				</p>
				<h3>Patch Notes</h3>
				<patch-notes></patch-notes>
				<span style="font-size: 0.8em"
					>(detailed changes can be found on
					<a
						href="https://github.com/Senryoku/MTGADraft"
						title="GitHub"
						target="_blank"
						rel="noopener nofollow"
						><i class="fab fa-github" style="vertical-align: baseline; padding: 0px 0.25em"></i>GitHub</a
					>)</span
				>
				<h3>Notice</h3>
				<p>
					MTGADraft is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by
					Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast
					LLC.
				</p>
			</div>
		</modal>
		<modal v-if="displayedModal === 'donation'" @close="displayedModal = ''">
			<h2 slot="header">Support MTGADraft</h2>
			<div slot="body">
				<div style="max-width: 50vw">
					<p>Hello there!</p>
					<p>
						If you're here I guess you've been enjoing the site! I plan on continuously maintaining it by
						adding support for new cards appearing on MTGA and improving it, both with your and my ideas. If
						that sounds like a good use of my time and you want to help me cover potential hosting cost and
						keep me motivated and caffeinated, you can donate here via
						<a href="https://github.com/sponsors/Senryoku" target="_blank"
							><i class="fa fa-github"></i> <em>GitHub Sponsor</em></a
						>
						or
						<em><i class="fab fa-paypal"></i> PayPal</em>
						:
					</p>
					<div style="display: flex; justify-content: center">
						<iframe
							src="https://github.com/sponsors/Senryoku/button"
							title="Sponsor Senryoku"
							height="35"
							width="116"
							style="border: 0"
						></iframe>
						<form
							action="https://www.paypal.com/cgi-bin/webscr"
							method="post"
							target="_blank"
							rel="noopener nofollow"
							style="margin-left: 1em"
						>
							<input type="hidden" name="cmd" value="_s-xclick" />
							<input type="hidden" name="hosted_button_id" value="6L2CUS6DH82DL" />
							<input type="hidden" name="lc" value="en_US" />
							<input
								type="image"
								src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif"
								name="submit"
								title="PayPal - The safer, easier way to pay online!"
								alt="Donate with PayPal button"
							/>
						</form>
					</div>
					<p>
						ruler101, developper of mtgdraftbots (which MTGADraft uses when possible) and
						<a href="https://cubeartisan.net" target="_blank" rel="noopener nofollow">cubeartisan</a>, also
						has a
						<a href="https://www.patreon.com/cubeartisan" target="_blank" rel="noopener nofollow"
							>Patreon</a
						>
						were you can support her and help cover the cost of bot training:
					</p>
					<p style="margin-left: 1em">
						<a href="https://www.patreon.com/cubeartisan" target="_blank" rel="noopener nofollow"
							><i class="fab fa-patreon"></i> ruler101's Patreon</a
						>
					</p>
					<p>Thank you very much!</p>
					<p>Sen</p>
				</div>
			</div>
		</modal>
		<CardPopup :language="language" />
		<footer>
			<span @click="displayedModal = 'About'" class="clickable">
				<a>About</a>
			</span>
			<span>
				Made by
				<a href="http://senryoku.github.io/" target="_blank" rel="noopener nofollow">Senryoku</a>
			</span>
			<span>
				<a @click="displayedModal = 'donation'">
					Buy me a Coffee
					<i class="fa fa-mug-hot" aria-hidden="true"></i>
				</a>
			</span>
			<span>
				<a href="mailto:mtgadraft@gmail.com" title="Email"
					><i class="fas fa-envelope fa-lg" style="vertical-align: baseline; padding: 0 0.25em"></i
				></a>
				<a href="https://discord.gg/XscXXNw" title="Discord" target="_blank" rel="noopener nofollow"
					><i class="fab fa-discord fa-lg" style="vertical-align: baseline; padding: 0 0.25em"></i
				></a>
				<a href="https://github.com/Senryoku/MTGADraft" title="GitHub" target="_blank" rel="noopener nofollow"
					><i class="fab fa-github fa-lg" style="vertical-align: baseline; padding: 0 0.25em"></i
				></a>
			</span>
		</footer>
		<div
			class="disconnected-icon"
			v-if="socket && socket.disconnected"
			v-tooltip="
				'You are disconnected from the server, some functionnalities won\'t be available until the connection is re-established.'
			"
		>
			<i class="fas fa-exclamation-triangle"></i>
			Disconnected
		</div>
	</div>
</template>

<script src="./App.js"></script>

<style src="./css/style.css"></style>
<style src="./css/tooltip.css"></style>
<style src="./css/vue-multiselect.min.css"></style>
<style src="./css/app.css"></style>
<style src="./css/chat.css"></style>

<style scoped>
.collection-import-help ol li,
.collection-import-help ul li {
	margin: 0.2em 0;
}
</style>
