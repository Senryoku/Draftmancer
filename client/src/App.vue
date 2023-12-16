<template>
	<div
		id="main-container"
		:style="`height: ${displayFixedDeck ? fixedDeckState.mainHeight : '100vh'}`"
		:class="{ 'using-fixed-deck': displayFixedDeck }"
	>
		<!-- Personal Options -->
		<div id="view-controls" class="main-controls">
			<span>
				<label for="user-name">User Name</label>
				<delayed-input
					id="user-name"
					v-model="userName"
					type="text"
					:maxlength="50"
					:delay="2"
					style="margin-right: 0.25em"
				/>
			</span>
			<div class="inline" v-tooltip="'Controls the display language of cards.'">
				<label for="select-language" id="select-language-label">Card Language</label>
				<select v-model="language" id="select-language">
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
			<span v-if="sessionID && !managed">
				<label class="clickable" @click="displayedModal = hasCollection ? 'collection' : 'collectionHelp'">
					<font-awesome-layers
						v-tooltip="
							hasCollection
								? useCollection
									? 'Collection uploaded.'
									: 'Collection uploaded, but not used.'
								: 'No collection uploaded.'
						"
					>
						<font-awesome-icon
							icon="fa-solid fa-book"
							:class="{
								faded: !hasCollection,
								green: hasCollection && useCollection,
								yellow: hasCollection && !useCollection,
							}"
						></font-awesome-icon>
					</font-awesome-layers>
					MTGA Collection
				</label>
				<span
					style="
						display: inline-flex;
						gap: 0.75em;
						align-items: center;
						margin-right: 0.25em;
						vertical-align: middle;
					"
				>
					<font-awesome-icon
						icon="fa-solid fa-question-circle"
						class="clickable"
						@click="displayedModal = 'collectionHelp'"
						v-tooltip="'Collection Import Help'"
					></font-awesome-icon>
					<input
						type="file"
						id="collection-file-input"
						@change="uploadCardListAsCollection"
						style="display: none"
						accept=".txt,.csv,.log"
					/>
					<span v-tooltip="'Import your collection by uploading your Player.log file.'">
						<font-awesome-icon
							@click="uploadMTGALogs"
							icon="fa-solid fa-file-upload"
							class="clickable"
						></font-awesome-icon>
					</span>
					<font-awesome-icon
						icon="fa-solid fa-chart-bar"
						class="clickable"
						v-if="hasCollection"
						v-tooltip="'Collection Statistics'"
						@click="displayedModal = 'collection'"
					></font-awesome-icon>
					<div
						v-show="hasCollection"
						class="inline"
						v-tooltip="{
							html: true,
							content: `Restrict to Collection: <strong>${
								useCollection ? 'Enabled' : 'Disabled'
							}</strong><br />
							If enabled, your collection will be used to restrict the card pool, making sure you'll only draft with cards you already own. (Ignored when using a Custom Card List)${
								ignoreCollections
									? '<p><strong>Warning:</strong> The session setting \'Restrict card pool to Player Collections\' is disabled, your collection is currently ignored.</p>'
									: ''
							}`,
						}"
					>
						<input type="checkbox" v-model="useCollection" id="useCollection" />
						<label for="useCollection">Restrict to Collection</label>
					</div>
				</span>
			</span>
			<div>
				<button
					@click="displayedModal = 'draftLogs'"
					class="flat"
					v-tooltip="'Displays logs of your previous drafts and sealed'"
				>
					<font-awesome-icon icon="fa-solid fa-list"></font-awesome-icon> Game Logs
				</button>
			</div>
			<span class="personal-settings">
				<div
					class="clickable personal-settings-icon"
					:class="{ faded: !fixedDeck, crossed: !fixedDeck }"
					@click="fixedDeck = !fixedDeck"
					v-tooltip="{
						content: `Deck always visible: <strong>${fixedDeck ? 'Enabled' : 'Disabled'}</strong>`,
						html: true,
					}"
					tabindex="0"
				>
					<font-awesome-icon
						icon="fa-solid fa-thumbtack"
						style="font-size: 1.2em; vertical-align: -20%"
					></font-awesome-icon>
				</div>
				<div
					class="clickable personal-settings-icon"
					:class="{ faded: !pickOnDblclick, crossed: !pickOnDblclick }"
					@click="pickOnDblclick = !pickOnDblclick"
					v-tooltip="{
						content: `Pick cards by double clicking: <strong>${
							pickOnDblclick ? 'Enabled' : 'Disabled'
						}</strong>`,
						html: true,
					}"
					tabindex="0"
				>
					<font-awesome-icon
						icon="fa-solid fa-mouse-pointer"
						style="font-size: 1.2em; vertical-align: -20%"
					></font-awesome-icon>
				</div>
				<div
					class="clickable personal-settings-icon"
					:class="{ faded: !displayBotScores, crossed: !displayBotScores }"
					@click="displayBotScores = !displayBotScores"
					v-tooltip="{
						content: `Display Bot Recommendations: <strong>${
							displayBotScores ? 'Enabled' : 'Disabled'
						}</strong><br /><small>Note: Bot recommendations can be disabled by the session owner.</small>`,
						html: true,
					}"
					tabindex="0"
				>
					<div style="width: 20px; margin-top: 5px" alt="Bot Recommendations Button">
						<img src="./assets/img/bot-score.svg" width="20" height="20" alt="Bot Recommendations Button" />
					</div>
				</div>
				<div
					class="clickable personal-settings-icon"
					:class="{ faded: !enableSound }"
					@click="enableSound = !enableSound"
					v-tooltip="{
						content: `Sound: <strong>${enableSound ? 'Enabled' : 'Disabled'}</strong>`,
						html: true,
					}"
					tabindex="0"
				>
					<font-awesome-icon
						:icon="`fa-solid ${enableSound ? 'fa-volume-up' : 'fa-volume-mute'}`"
					></font-awesome-icon>
				</div>
				<div
					class="clickable personal-settings-icon"
					:class="{
						faded: !enableNotifications,
						'greyed-out': notificationPermission === 'denied',
					}"
					v-tooltip="{
						content:
							notificationPermission === 'denied'
								? 'Notifications for this domain are blocked in your browser'
								: `Desktop Notifications: <strong>${
										enableNotifications ? 'Enabled' : 'Disabled'
								  }</strong>`,
						html: true,
					}"
					@click="toggleNotifications"
					tabindex="0"
				>
					<font-awesome-icon
						:icon="`fa-solid ${enableNotifications ? 'fa-bell' : 'fa-bell-slash'}`"
					></font-awesome-icon>
				</div>
			</span>
		</div>

		<!-- Session Options -->
		<div class="generic-container" v-if="sessionID !== undefined && !managed">
			<div id="limited-controls" class="main-controls" v-bind:class="{ disabled: drafting }">
				<span id="session-controls">
					<div class="inline" v-tooltip="'Unique ID of your game session.'" style="margin-right: 0.25em">
						<label for="session-id">Session ID</label>
						<delayed-input
							v-model="sessionID"
							autocomplete="off"
							id="session-id"
							:type="hideSessionID ? 'password' : 'text'"
							:maxlength="50"
							:delay="2"
						/>
					</div>
					<div
						style="
							display: inline-flex;
							gap: 0.3em;
							align-items: center;
							margin-left: 0.25em;
							vertical-align: middle;
						"
					>
						<font-awesome-icon
							class="fa-regular clickable"
							:icon="'fa-regular ' + (hideSessionID ? 'fa-eye' : 'fa-eye-slash')"
							@click="hideSessionID = !hideSessionID"
							v-tooltip="'Show/Hide your session ID.'"
							fixed-width
						></font-awesome-icon>

						<font-awesome-icon
							class="clickable"
							icon="fa-solid fa-share-from-square"
							v-tooltip="'Copy session link for sharing.'"
							@click="sessionURLToClipboard"
							fixed-width
						></font-awesome-icon>

						<font-awesome-icon
							class="clickable"
							icon="fa-solid fa-sitemap"
							v-if="sessionOwner === userID && !bracket"
							@click="generateBracket"
							v-tooltip="'Generate Bracket.'"
						></font-awesome-icon>

						<font-awesome-icon
							class="clickable"
							icon="fa-solid fa-sitemap clickable"
							v-if="bracket"
							@click="displayedModal = 'bracket'"
							v-tooltip="'Display Bracket.'"
						></font-awesome-icon>

						<font-awesome-icon
							class="clickable"
							icon="fa-solid fa-user-check"
							v-if="sessionOwner === userID"
							@click="readyCheck"
							v-tooltip="'Ready Check: Ask everyone in your session if they\'re ready to play.'"
						></font-awesome-icon>
					</div>
				</span>
				<span class="generic-container card-pool-controls">
					<input
						type="file"
						id="card-list-input-main"
						@change="uploadFile($event, parseCustomCardList)"
						style="display: none"
						accept=".txt"
					/>

					<strong id="card-pool-label">Card Pool: </strong>
					<span v-if="useCustomCardList && customCardList">
						{{ customCardList!.name ? customCardList!.name : "Custom Card List" }}
						<span style="display: inline-flex; gap: 0.25em; align-items: center; vertical-align: middle">
							<div v-if="customCardList!.slots && Object.keys(customCardList!.slots).length > 0">
								<font-awesome-icon
									style="padding: 0.25em"
									icon="fa-solid fa-file-alt"
									class="clickable blue"
									@click="displayedModal = 'cardList'"
									v-tooltip="'Review the card list'"
								></font-awesome-icon>
							</div>
							<div v-else>No list loaded</div>
							<div class="clickable" onclick="document.querySelector('#card-list-input-main').click()">
								<font-awesome-icon
									style="padding: 0.25em"
									icon="fa-solid fa-file-upload"
									v-tooltip="'Upload a Custom Card List'"
									v-if="sessionOwner === userID"
								></font-awesome-icon>
							</div>
							<div @click="useCustomCardList = false" class="clickable brightred">
								<font-awesome-icon
									style="padding: 0.25em"
									icon="fa-solid fa-times"
									v-tooltip="'Return to official sets.'"
									v-if="sessionOwner === userID"
								></font-awesome-icon>
							</div>
						</span>
					</span>
					<span v-else :class="{ disabled: sessionOwner != userID }">
						<div class="inline">
							<set-select v-model="setRestriction" :options="sets.slice().reverse()">
								<template v-slot:beforeList>
									<div
										class="clickable"
										style="
											text-align: center;
											padding: 0.5em;
											font-size: 0.75em;
											background-color: #444;
										"
										onclick="document.querySelector('#card-list-input-main').click()"
									>
										Upload a Custom Card List...
									</div>
								</template>
								<template v-slot:afterList>
									<div
										class="clickable"
										style="
											text-align: center;
											padding: 0.5em;
											font-size: 0.75em;
											background-color: #444;
										"
										@click="displayedModal = 'setRestriction'"
									>
										More sets...
									</div>
								</template>
							</set-select>
							<div
								class="inline clickable"
								style="padding: 0.4em 0.6em"
								@click="displayedModal = 'setRestriction'"
								v-tooltip="'More sets'"
							>
								<font-awesome-icon icon="fa-solid fa-ellipsis-v"></font-awesome-icon>
							</div>
							<div
								class="inline clickable"
								v-tooltip="{
									html: true,
									content: `Restrict card pool to Player Collections: <strong>${
										ignoreCollections ? 'Disabled' : 'Enabled'
									}</strong>
									<br/>If enabled, card pool will be limited to cards present in all player collections.`,
								}"
								@click="ignoreCollections = !ignoreCollections"
								:class="{ faded: ignoreCollections, crossed: ignoreCollections }"
							>
								<font-awesome-icon icon="fa-solid fa-book"></font-awesome-icon>
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
						<label for="bots"><font-awesome-icon icon="fa-solid fa-robot"></font-awesome-icon></label>
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
					<div
						class="inline"
						v-tooltip="'Pick Timer (sec.). Zero means no timer.'"
						:class="{ disabled: tournamentTimer }"
					>
						<label for="timer">
							<font-awesome-icon icon="fa-solid fa-stopwatch" size="lg"></font-awesome-icon>
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
										'Starts a Winston Draft. This is a draft variant intended for two players, but playable at any number.'
									"
								>
									<button @click="startWinstonDraft()">Winston</button>
								</div>
								<div
									v-tooltip.left="
										'Starts a Winchester Draft. This is a draft variant similar to Winston and Rochester draft.'
									"
								>
									<button @click="startWinchesterDraft()">Winchester</button>
								</div>
								<div v-tooltip.left="'Starts a Housman Draft.'">
									<button @click="startHousmanDraft()">Housman</button>
								</div>
								<div v-tooltip.left="'Starts a Solomon Draft.'">
									<button @click="startSolomonDraft()">Solomon (2p.)</button>
								</div>
								<div
									v-tooltip.left="
										'Starts a Grid Draft. This is a draft variant for two to four players.'
									"
								>
									<button @click="startGridDraft()">Grid (2-4p.)</button>
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
										'Starts a Rochester Draft. Every players pick from a single booster.'
									"
								>
									<button @click="startRochesterDraft()">Rochester</button>
								</div>
								<div
									v-tooltip.left="
										'Starts a Rotisserie Draft. Each player picks from a single card pool one after the other.'
									"
								>
									<button @click="startRotisserieDraft()">Rotisserie</button>
								</div>
								<div v-tooltip.left="'Starts a Minesweeper Draft.'">
									<button @click="startMinesweeperDraft()">Minesweeper</button>
								</div>
							</div>
							<div class="game-modes-cat">
								<span class="game-modes-cat-title">Sealed</span>
								<div v-tooltip.left="'Distributes boosters to everyone for a sealed session.'">
									<button @click="sealedDialog(false)">Sealed</button>
								</div>
								<div v-tooltip.left="'Starts a Team Sealed.'">
									<button @click="sealedDialog(true)">Team Sealed</button>
								</div>
								<div v-tooltip.left="'Distributes two Jumpstart boosters to everyone.'">
									<button @click="deckWarning(() => distributeJumpstart('jmp'))">Jumpstart</button>
								</div>
								<div v-tooltip.left="'Distributes two Jumpstart 2022 boosters to everyone.'">
									<button @click="deckWarning(() => distributeJumpstart('j22'))">
										Jumpstart 2022
									</button>
								</div>
								<div
									v-tooltip.left="
										'Distributes two Jumpstart: Historic Horizons boosters to everyone.'
									"
								>
									<button
										@click="deckWarning(() => distributeJumpstart('j21'))"
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
										@click="deckWarning(() => distributeJumpstart('super'))"
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
					<font-awesome-icon icon="fa-solid fa-cog"></font-awesome-icon>
					Settings
				</button>
			</div>
			<div v-if="drafting" class="controls-drafting-mask">
				<div id="url-remainder">Draftmancer.com</div>
				<div id="draft-in-progress">
					{{ gameModeName }}
				</div>
				<div id="draft-controls">
					<template v-if="sessionOwner === userID">
						<button class="stop" @click="stopDraft">
							<font-awesome-icon icon="fa-solid fa-stop"></font-awesome-icon> Stop
						</button>
						<button
							v-if="maxTimer > 0 && !draftPaused"
							class="stop"
							:class="{ 'opaque-disabled': waitingForDisconnectedUsers }"
							@click="pauseDraft"
						>
							<font-awesome-icon icon="fa-solid fa-pause"></font-awesome-icon> Pause
						</button>
						<button
							v-else-if="maxTimer > 0 && draftPaused"
							class="confirm"
							:class="{ 'opaque-disabled': waitingForDisconnectedUsers }"
							@click="resumeDraft"
						>
							<font-awesome-icon icon="fa-solid fa-play"></font-awesome-icon> Resume
						</button>
					</template>
				</div>
			</div>
		</div>

		<!-- Session Players -->
		<div class="main-controls session-players" v-if="sessionID !== undefined">
			<div class="session-players-header">
				<div
					v-if="!ownerIsPlayer"
					class="generic-container"
					v-tooltip="
						sessionOwnerUsername
							? `${sessionOwnerUsername} is the session owner.`
							: 'Session owner is disconnected.'
					"
					style="flex: 0 3 auto; text-align: center"
				>
					<font-awesome-icon icon="fa-solid fa-crown" class="subtle-gold"></font-awesome-icon>
					<div class="non-playing-session-owner-name">
						{{ sessionOwnerUsername ? sessionOwnerUsername : "(Disconnected)" }}
					</div>
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
				<div
					v-if="!drafting"
					:class="{
						crossed: !randomizeSeatingOrder,
						faded: !randomizeSeatingOrder,
						clickable: userID === sessionOwner,
					}"
					style="margin-right: 0.5em"
					@click="if (userID === sessionOwner) randomizeSeatingOrder = !randomizeSeatingOrder;"
					v-tooltip="{
						content: `Randomize Seating Order on draft start: <strong>${
							randomizeSeatingOrder ? 'Enabled' : 'Disabled'
						}</strong>`,
						html: true,
					}"
				>
					<font-awesome-icon icon="fa-solid fa-random"></font-awesome-icon>
				</div>
			</div>
			<template v-if="!drafting">
				<transition-group type="transition">
					<Sortable
						:key="`draggable-${userOrder.length}`"
						:list="userOrder"
						:item-key="(uid: string) => uid"
						:options="{ animation: 200, disabled: userID !== sessionOwner }"
						@update="changePlayerOrder"
						class="player-list-container player-list"
						tag="ul"
					>
						<template #item="{ element, index }">
							<li
								:key="element"
								:class="{
									teama: teamDraft && index % 2 === 0,
									teamb: teamDraft && index % 2 === 1,
									draggable: userID === sessionOwner && !drafting,
									self: userID === element,
								}"
								:data-userid="element"
							>
								<div class="player-name" v-tooltip="userByID[element].userName">
									{{ userByID[element].userName }}
								</div>
								<template v-if="userID == sessionOwner">
									<font-awesome-icon
										icon="fa-solid fa-chevron-left"
										class="clickable move-player move-player-left"
										v-tooltip="`Move ${userByID[element].userName} to the left`"
										@click="movePlayer(index, -1)"
									></font-awesome-icon>
									<font-awesome-icon
										icon="fa-solid fa-chevron-right"
										class="clickable move-player move-player-right"
										v-tooltip="`Move ${userByID[element].userName} to the right`"
										@click="movePlayer(index, 1)"
									></font-awesome-icon>
								</template>
								<div class="status-icons">
									<font-awesome-icon
										v-if="element === sessionOwner"
										icon="fa-solid fa-crown"
										class="subtle-gold"
										v-tooltip="`${userByID[element].userName} is the session owner.`"
									></font-awesome-icon>
									<font-awesome-icon
										v-if="
											element === sessionOwner && element !== userID && sessionUsers.length >= 5
										"
										icon="fa-solid fa-user-slash"
										class="clickable red takeover"
										v-tooltip="
											`Vote to remove ${userByID[element].userName} from the session and take ownership.`
										"
										@click="requestTakeover"
									></font-awesome-icon>
									<template v-if="userID === sessionOwner && element != sessionOwner">
										<img
											src="./assets/img/pass_ownership.svg"
											class="clickable"
											style="height: 18px; margin-top: -4px"
											v-tooltip="`Give session ownership to ${userByID[element].userName}`"
											@click="setSessionOwner(element)"
										/>
										<font-awesome-icon
											icon="fa-solid fa-user-slash"
											class="clickable red"
											v-tooltip="`Remove ${userByID[element].userName} from the session`"
											@click="removePlayer(element)"
										></font-awesome-icon>
									</template>
									<template v-if="!useCustomCardList && !ignoreCollections">
										<template v-if="!userByID[element].collection">
											<font-awesome-icon
												icon="fa-solid fa-book"
												class="red"
												v-tooltip="
													userByID[element].userName +
													' has not uploaded their collection yet.'
												"
											></font-awesome-icon>
										</template>
										<template
											v-else-if="userByID[element].collection && !userByID[element].useCollection"
										>
											<font-awesome-icon
												icon="fa-solid fa-book"
												class="yellow"
												v-tooltip="
													userByID[element].userName +
													' has uploaded their collection, but is not using it.'
												"
											></font-awesome-icon>
										</template>
										<template v-else>
											<font-awesome-icon
												icon="fa-solid fa-book"
												class="green"
												v-tooltip="
													userByID[element].userName + ' has uploaded their collection.'
												"
											></font-awesome-icon>
										</template>
									</template>
									<template v-if="pendingReadyCheck">
										<template v-if="userByID[element].readyState == ReadyState.Ready">
											<font-awesome-icon
												icon="fa-solid fa-check"
												class="green"
												v-tooltip="`${userByID[element].userName} is ready!`"
											></font-awesome-icon>
										</template>
										<template v-else-if="userByID[element].readyState == ReadyState.NotReady">
											<font-awesome-icon
												icon="fa-solid fa-times"
												class="red"
												v-tooltip="`${userByID[element].userName} is NOT ready!`"
											></font-awesome-icon>
										</template>
										<template v-else-if="userByID[element].readyState == ReadyState.Unknown">
											<font-awesome-icon
												icon="fa-solid fa-spinner"
												spin
												v-tooltip="`Waiting for ${userByID[element].userName} to respond...`"
											></font-awesome-icon>
										</template>
									</template>
								</div>
								<div class="chat-bubble" :id="'chat-bubble-' + element"></div>
							</li>
						</template>
					</Sortable>
				</transition-group>
			</template>
			<template v-else>
				<div class="player-list-container">
					<ul class="player-list">
						<li
							v-for="(user, idx) in virtualPlayers"
							:class="{
								teama: teamDraft && idx % 2 === 0,
								teamb: teamDraft && idx % 2 === 1,
								self: userID === user.userID,
								bot: user.isBot,
								'current-player': currentPlayer === user.userID,
							}"
							:data-userid="user.userID"
							:key="user.userID"
						>
							<font-awesome-icon
								icon="fa-solid fa-circle"
								size="xs"
								class="passing-order-repeat"
								v-if="passingOrder === PassingOrder.Repeat"
								v-tooltip="'Passing order'"
							></font-awesome-icon>
							<font-awesome-icon
								icon="fa-solid fa-angle-double-left"
								class="passing-order-left"
								v-else-if="passingOrder === PassingOrder.Left"
								v-tooltip="'Passing order'"
							></font-awesome-icon>
							<font-awesome-icon
								icon="fa-solid fa-angle-double-right"
								class="passing-order-right"
								v-else-if="passingOrder === PassingOrder.Right"
								v-tooltip="'Passing order'"
							></font-awesome-icon>
							<div class="player-name" v-tooltip="user.userName">{{ user.userName }}</div>
							<div class="status-icons">
								<template v-if="!user.isBot && !user.isDisconnected">
									<font-awesome-icon
										v-if="user.userID === sessionOwner"
										icon="fa-solid fa-crown"
										class="subtle-gold"
										v-tooltip="`${user.userName} is the session's owner.`"
									></font-awesome-icon>
									<template v-if="userID === sessionOwner && user.userID !== sessionOwner">
										<img
											src="./assets/img/pass_ownership.svg"
											class="clickable"
											:class="{ 'opaque-disabled': user.userID in disconnectedUsers }"
											style="height: 18px; margin-top: -4px"
											v-tooltip="`Give session ownership to ${user.userName}`"
											@click="setSessionOwner(user.userID)"
										/>
										<font-awesome-icon
											icon="fa-solid fa-user-slash"
											class="clickable red"
											:class="{ 'opaque-disabled': user.userID in disconnectedUsers }"
											v-tooltip="`Remove ${user.userName} from the session`"
											@click="removePlayer(user.userID)"
										></font-awesome-icon>
									</template>
									<font-awesome-icon
										v-if="user.isDisconnected"
										icon="fa-solid fa-times"
										class="red"
										v-tooltip="user.userName + ' is disconnected.'"
									></font-awesome-icon>
									<template v-if="!user.isDisconnected && currentPlayer !== null">
										<font-awesome-icon
											v-show="user.userID === currentPlayer"
											icon="fa-solid fa-spinner"
											spin
											v-tooltip="user.userName + ' is thinking...'"
										></font-awesome-icon>
									</template>
								</template>
								<font-awesome-icon
									v-if="user.isBot || user.isReplaced"
									icon="fa-solid fa-robot"
								></font-awesome-icon>
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
												style="transform: translate(-50%, -50%) rotate(10deg)"
											/>
											<img
												src="./assets/img/booster.svg"
												style="transform: translate(-50%, -50%) rotate(-10deg)"
											/>
										</template>
										<template v-else-if="user.boosterCount > 2">
											<img
												src="./assets/img/booster.svg"
												style="transform: translate(-50%, -50%) rotate(10deg)"
											/>
											<img
												src="./assets/img/booster.svg"
												style="transform: translate(-50%, -50%) rotate(-10deg)"
											/>
											<img src="./assets/img/booster.svg" />
											<div>
												{{ user.boosterCount }}
											</div>
										</template>
									</div>

									<font-awesome-icon
										icon="fa-solid fa-spinner"
										spin
										v-tooltip="user.userName + ' is waiting...'"
										v-else
									></font-awesome-icon>
								</template>
							</div>
							<div class="chat-bubble" :id="'chat-bubble-' + user.userID"></div>
						</li>
					</ul>
				</div>
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
				<font-awesome-icon
					class="clickable"
					icon="fa-regular fa-comments"
					@click="displayChatHistory = !displayChatHistory"
					v-tooltip="'Display chat history.'"
				></font-awesome-icon>
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
								:title="new Date(msg.timestamp).toLocaleTimeString()"
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
		<div class="main-content">
			<!-- Draft Controls -->
			<div v-show="drafting || gameState === GameState.Watching" class="generic-container">
				<template v-if="draftState">
					<transition
						:name="
							draftState.pickNumber > 0
								? `slide-fade-${passingOrder === PassingOrder.Left ? 'left' : 'right'}`
								: 'booster-fade-in'
						"
						mode="out-in"
					>
						<div v-if="gameState === GameState.Watching" key="draft-watching" class="draft-watching">
							<div class="draft-watching-state">
								<h1 v-if="!drafting">Draft Completed</h1>
								<h1 v-else-if="!draftPaused">Players are drafting...</h1>
								<h1 v-else>Draft Paused</h1>
								<div v-if="drafting">Pack #{{ draftState.boosterNumber + 1 }}</div>
								<div v-else>Players are now brewing their decks</div>
							</div>
							<div
								v-if="draftLogLive && draftLogLive.sessionID === sessionID"
								class="draft-watching-live-log"
							>
								<DraftLogLiveComponent
									:draftlog="draftLogLive"
									:show="['owner', 'delayed', 'everyone'].includes(draftLogRecipients)"
									:language="language"
									:key="draftLogLive.time"
									ref="draftloglive"
								></DraftLogLiveComponent>
							</div>
						</div>
						<div
							v-else-if="
								(gameState === GameState.Waiting || gameState === GameState.Picking) &&
								draftState.booster
							"
							:key="`draft-picking-${draftState.boosterNumber}-${draftState.pickNumber}`"
							class="container"
							:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
						>
							<div id="booster-controls" class="section-title">
								<h2>Your Booster ({{ draftState.booster.length }})</h2>
								<div class="controls" style="flex-grow: 2">
									<span
										>Pack #{{ draftState.boosterNumber + 1 }}, Pick #{{
											draftState.pickNumber + 1
										}}</span
									>
									<span v-show="pickTimer >= 0" :class="{ redbg: pickTimer <= 10 }" id="chrono">
										<div
											class="timer-icon"
											:key="`${maxTimer}_${draftState.boosterNumber}_${draftState.pickNumber}`"
											:style="`--timer-max: ${maxTimer}; --timer-current: ${pickTimer - 1}`"
										>
											<font-awesome-icon
												icon="fa-solid fa-stopwatch"
												size="lg"
											></font-awesome-icon>
											<div class="timer-icon-moving"></div>
										</div>
										<span>{{ pickTimer }}</span>
									</span>
									<template v-if="gameState == GameState.Picking">
										<template v-if="draftState.skipPick">
											<button @click="passBooster">Pass Booster</button>
										</template>
										<template v-else>
											<input
												type="button"
												@click="pickCard()"
												value="Confirm Pick"
												v-if="
													selectedCards.length === cardsToPick &&
													burningCards.length === cardsToBurnThisRound
												"
											/>
											<span v-else>
												<span v-if="cardsToPick === 1">Pick a card</span>
												<span v-else>
													Pick {{ cardsToPick }} cards ({{ selectedCards.length }}/{{
														cardsToPick
													}})
												</span>
												<span v-if="cardsToBurnThisRound === 1">
													and remove a card from the pool.</span
												>
												<span v-else-if="cardsToBurnThisRound > 1">
													and remove {{ cardsToBurnThisRound }} cards from the pool ({{
														burningCards.length
													}}/{{ cardsToBurnThisRound }}).
												</span>
											</span>
											<span v-if="availableOptionalDraftEffects.length > 0">
												<label for="optional-pick-effect">Pick Effect:</label>
												<select
													id="optional-pick-effect"
													v-model="selectedOptionalDraftPickEffect"
												>
													<option
														v-for="v in availableOptionalDraftEffects"
														:value="v"
														:key="v.effect"
													>
														{{ v.name }} ({{ v.effect }})
													</option>
													<option :value="undefined">Do not use</option>
												</select>
											</span>
											<span v-if="availableDraftEffects.length > 0">
												<label for="pick-effect">Pick Effect:</label>
												<select id="pick-effect" v-model="selectedUsableDraftEffect">
													<option
														v-for="v in availableDraftEffects"
														:value="v"
														:key="v.effect"
													>
														{{ v.name }} ({{ v.effect }})
													</option>
													<option :value="undefined">None</option>
												</select>
											</span>
										</template>
									</template>
									<template v-else>
										<font-awesome-icon icon="fa-solid fa-spinner" spin></font-awesome-icon>
										Waiting for other players to pick...
									</template>
								</div>
								<scale-slider v-model.number="boosterCardScale" />
							</div>
							<!-- Note: Duration for booster-open can't be determined by Vue since it's composite. Be sure to keep that in sync :) -->
							<transition-group
								tag="div"
								:name="draftState.pickNumber === 0 ? 'booster-open' : 'booster-cards'"
								class="booster card-container"
								:class="{
									'booster-waiting': gameState === GameState.Waiting,
									skipped: draftState.skipPick,
								}"
								:style="`--booster-card-scale: ${boosterCardScale};`"
								:duration="
									draftState.pickNumber === 0
										? 500 + 500 + 400 + Math.min(20, draftState.booster.length) * 40
										: 0
								"
								@enter="onEnterBoosterCards"
								appear
							>
								<div class="wait" key="wait" v-if="gameState === GameState.Waiting">
									<font-awesome-icon
										class="passing-order"
										:class="{
											'booster-wait-passing-order-left': passingOrder === PassingOrder.Left,
											'booster-wait-passing-order-right': passingOrder === PassingOrder.Right,
										}"
										:icon="
											'fa-solid ' +
											(passingOrder === PassingOrder.Left
												? 'fa-angle-double-left'
												: 'fa-angle-double-right')
										"
										size="sm"
										v-show="draftState.booster.length > 0"
									></font-awesome-icon>
									<font-awesome-icon icon="fa-solid fa-spinner" size="lg" spin></font-awesome-icon>
									<font-awesome-icon
										class="passing-order"
										:class="{
											'booster-wait-passing-order-left': passingOrder === PassingOrder.Left,
											'booster-wait-passing-order-right': passingOrder === PassingOrder.Right,
										}"
										:icon="
											'fa-solid ' +
											(passingOrder === PassingOrder.Left
												? 'fa-angle-double-left'
												: 'fa-angle-double-right')
										"
										size="sm"
										v-show="draftState.booster.length > 0"
									></font-awesome-icon>
								</div>
								<booster-card
									v-for="(card, idx) in draftState.booster"
									:key="`card-booster-${card.uniqueID}`"
									:card="card"
									:language="language"
									:canbeburned="draftState.burnsThisRound > 0"
									:burned="burningCards.includes(card.uniqueID)"
									:class="{ selected: selectedCards.includes(card.uniqueID) }"
									@click="draftState.skipPick ? () => {} : selectCard($event, card)"
									@dblclick="draftState.skipPick ? () => {} : doubleClickCard($event, card)"
									@burn="draftState.skipPick ? () => {} : burnCard($event, card)"
									@restore="draftState.skipPick ? () => {} : restoreCard($event, card)"
									:draggable="!draftState.skipPick"
									@dragstart="draftState.skipPick ? () => {} : dragBoosterCard($event, card)"
									:hasenoughwildcards="hasEnoughWildcards(card)"
									:wildcardneeded="displayCollectionStatus && wildcardCost(card)"
									:botscore="
										gameState !== GameState.Waiting &&
										botScores &&
										botScores.scores &&
										displayBotScores
											? botScores.scores[idx]
											: null
									"
									:botpicked="
										gameState !== GameState.Waiting &&
										botScores &&
										displayBotScores &&
										idx === botScores.chosenOption
									"
									:scale="boosterCardScale"
									:renderCommonBackside="draftState.pickNumber === 0"
								></booster-card>
							</transition-group>
						</div>
					</transition>

					<div v-if="gameState === GameState.Reviewing" style="text-align: center">
						<h1>Review Phase</h1>
						<span class="chrono">
							<div
								class="timer-icon"
								:key="`${reviewTimer}_${draftState.boosterNumber}_${draftState.pickNumber}`"
								:style="`--timer-max: ${reviewTimer}; --timer-current: ${pickTimer - 1}`"
							>
								<font-awesome-icon icon="fa-solid fa-stopwatch" size="lg"></font-awesome-icon>
								<div class="timer-icon-moving"></div>
							</div>
							<span>{{ pickTimer }}</span>
						</span>
					</div>
				</template>
				<winston-draft
					v-if="
						(gameState === GameState.WinstonPicking || gameState === GameState.WinstonWaiting) &&
						winstonDraftState
					"
					class="container"
					:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
					:language="language"
					:userID="userID"
					:sessionUsers="userByID"
					:winstonDraftState="winstonDraftState"
					@take="winstonDraftTakePile"
					@skip="winstonDraftSkipPile"
				/>
				<winchester-draft
					v-if="
						(gameState === GameState.WinchesterPicking || gameState === GameState.WinchesterWaiting) &&
						winchesterDraftState
					"
					class="container"
					:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
					:language="language"
					:userID="userID"
					:sessionUsers="userByID"
					:winchesterDraftState="winchesterDraftState"
					@pick="winchesterDraftPick"
				/>
				<housman-draft
					v-if="gameState === GameState.HousmanDraft && housmanDraftState"
					class="container"
					:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
					:socket="socket"
					:language="language"
					:userID="userID"
					:sessionUsers="userByID"
					v-model:state="housmanDraftState"
					@notifyTurn="notifyTurn"
					@addToDeck="addToDeck"
					@end="housmanDraftEnd"
				/>
				<solomon-draft
					v-if="gameState === GameState.SolomonDraft && solomonDraftState"
					class="container"
					:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
					:socket="socket"
					:language="language"
					:userID="userID"
					:sessionUsers="userByID"
					v-model:state="solomonDraftState"
					@notifyTurn="notifyTurn"
					@addToDeck="addToDeck"
					@end="solomonDraftEnd"
				/>
				<!-- Grid Draft -->
				<div
					:class="{ disabled: waitingForDisconnectedUsers || draftPaused }"
					v-if="
						(gameState === GameState.GridPicking || gameState === GameState.GridWaiting) && gridDraftState
					"
				>
					<div class="section-title">
						<h2>Grid Draft</h2>
						<div class="controls">
							<span>
								Pack #{{
									Math.min(
										Math.floor(gridDraftState.round / sessionUsers.length) + 1,
										gridDraftState.boosterCount
									)
								}}/{{ gridDraftState.boosterCount }}
							</span>
							<span>
								<template v-if="userID === gridDraftState.currentPlayer">
									<font-awesome-icon icon="fa-solid fa-exclamation-circle"></font-awesome-icon> It's
									your turn! Pick a column or a row.
								</template>
								<template v-else-if="gridDraftState.currentPlayer === null">
									<template
										v-if="
											Math.floor(gridDraftState.round / sessionUsers.length) + 1 >
											gridDraftState.boosterCount
										"
									>
										This was the last booster! Let me push these booster wrappers off the table...
									</template>
									<template v-else>Advancing to the next booster...</template>
								</template>
								<template v-else>
									<font-awesome-icon icon="fa-solid fa-spinner" spin></font-awesome-icon>
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
					v-if="
						(gameState === GameState.RochesterPicking || gameState === GameState.RochesterWaiting) &&
						rochesterDraftState
					"
				>
					<div style="flex-grow: 1">
						<div class="section-title controls">
							<h2>Rochester Draft</h2>
							<div class="controls" style="flex-grow: 2">
								<span>
									Pack #{{ rochesterDraftState.boosterNumber + 1 }}/{{
										rochesterDraftState.boosterCount
									}}, Pick #{{ rochesterDraftState.pickNumber + 1 }}
								</span>
								<template v-if="userID === rochesterDraftState.currentPlayer">
									<span
										><font-awesome-icon icon="fa-solid fa-exclamation-circle"></font-awesome-icon>
										It's your turn! Pick a card.
									</span>
									<span>
										<input
											type="button"
											@click="pickCard()"
											value="Confirm Pick"
											v-if="selectedCards.length === cardsToPick"
										/>
									</span>
								</template>
								<template v-else>
									<span>
										<font-awesome-icon icon="fa-solid fa-spinner" spin></font-awesome-icon>
										Waiting for
										{{
											rochesterDraftState.currentPlayer in userByID
												? userByID[rochesterDraftState.currentPlayer].userName
												: "(Disconnected)"
										}}...
									</span>
								</template>
							</div>
							<scale-slider v-model.number="boosterCardScale" />
						</div>
						<transition name="fade" mode="out-in" appear>
							<transition-group
								name="booster-cards"
								tag="div"
								class="booster card-container"
								:style="`--booster-card-scale: ${boosterCardScale};`"
								:key="rochesterDraftState.boosterNumber"
							>
								<booster-card
									v-for="card in rochesterDraftState.booster"
									:key="`card-booster-${card.uniqueID}`"
									:card="card"
									:language="language"
									:canbeburned="false"
									:class="{
										selected:
											userID === rochesterDraftState.currentPlayer &&
											selectedCards.includes(card.uniqueID),
									}"
									@click="if (userID === rochesterDraftState.currentPlayer) selectCard($event, card);"
									@dblclick="
										if (userID === rochesterDraftState.currentPlayer) doubleClickCard($event, card);
									"
									:draggable="userID === rochesterDraftState.currentPlayer"
									@dragstart="
										if (userID === rochesterDraftState.currentPlayer) dragBoosterCard($event, card);
									"
									:hasenoughwildcards="hasEnoughWildcards(card)"
									:wildcardneeded="displayCollectionStatus && wildcardCost(card)"
									:scale="boosterCardScale"
								></booster-card>
							</transition-group>
						</transition>
					</div>
					<pick-summary :picks="rochesterDraftState.lastPicks"></pick-summary>
				</div>
				<transition name="fade">
					<div
						v-if="
							draftPaused && !waitingForDisconnectedUsers && !(userID === sessionOwner && !ownerIsPlayer)
						"
						class="disconnected-user-popup-container"
					>
						<div class="disconnected-user-popup">
							<div class="swal2-icon swal2-warning swal2-icon-show" style="display: flex">
								<div class="swal2-icon-content">!</div>
							</div>
							<h1>Draft Paused</h1>
							<template v-if="userID === sessionOwner">
								<div style="margin-top: 1em">
									<button class="confirm" @click="resumeDraft">
										<font-awesome-icon icon="fa-solid fa-play"></font-awesome-icon> Resume
									</button>
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
						(gameState === GameState.MinesweeperPicking || gameState === GameState.MinesweeperWaiting) &&
						minesweeperDraftState
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
				<team-sealed
					v-if="gameState === GameState.TeamSealed"
					:language="language"
					:state="teamSealedState"
					:users="sessionUsers"
					@pick="teamSealedPick"
				></team-sealed>
				<rotisserie-draft
					v-if="gameState === GameState.RotisserieDraft"
					:language="language"
					:state="rotisserieDraftState"
					:users="sessionUsers"
					:userID="userID"
					@pick="rotisserieDraftPick"
				></rotisserie-draft>
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
									winstonDraftState ||
									winchesterDraftState ||
									housmanDraftState ||
									gridDraftState ||
									rochesterDraftState ||
									rotisserieDraftState ||
									minesweeperDraftState
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

			<div v-if="gameState === GameState.Brewing" style="padding: 0.5em 1em 0 1em">
				<template v-if="managed">
					<a href="/draftqueue">
						<font-awesome-icon icon="fa-solid fa-arrow-left"></font-awesome-icon>
						Back to Draft Queue
					</a>
				</template>
				<template v-else>
					<a @click="gameState = GameState.None">
						<font-awesome-icon icon="fa-solid fa-arrow-left"></font-awesome-icon>
						Back to Home
					</a>
				</template>
			</div>

			<!-- Brewing controls (Deck & Sideboard) -->
			<div
				class="deck-and-sideboard-container"
				:class="{ 'fixed-deck-and-sideboard-container': displayFixedDeck }"
				v-show="displayDeckAndSideboard"
				ref="fixedDeckContainer"
			>
				<div
					class="deck-and-sideboard-container-resize-bar"
					@mousedown="fixedDeckMouseDown"
					v-if="displayFixedDeck"
				></div>
				<div class="deck-and-sideboard">
					<font-awesome-icon
						@click="fixedDeck = false"
						class="fixed-deck-and-sideboard-close clickable"
						icon="fa-solid fa-times"
						size="lg"
						aria-hidden="true"
						v-if="displayFixedDeck"
					></font-awesome-icon>
					<div
						class="container deck-container"
						v-show="
							(deck !== undefined && deck.length > 0) ||
							(drafting && gameState !== GameState.Watching) ||
							gameState === GameState.Brewing
						"
					>
						<div class="deck">
							<card-pool
								:cards="deck"
								:language="language"
								@cardClick="deckToSideboard"
								:readOnly="false"
								@cardDragAdd="onDeckDragAdd"
								@cardDragRemove="onDeckDragRemove"
								ref="deckDisplay"
								group="deck"
								@dragover="allowBoosterCardDrop($event)"
								@dragleave="onDragLeave($event)"
								@drop="dropBoosterCard($event)"
								:cardConditionalClasses="cardConditionalClasses"
							>
								<template v-slot:title>
									Deck ({{ deck.length
									}}<span
										v-show="gameState == GameState.Brewing && totalLands > 0"
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
											preferredBasics: preferredBasics,
											sideboardBasics: sideboardBasics,
										}"
									/>
									<div class="deck-stat-container clickable" @click="displayedModal = 'deckStats'">
										<font-awesome-icon
											icon="fa-solid fa-chart-pie"
											size="lg"
											v-tooltip.top="'Deck Statistics'"
										></font-awesome-icon>
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
										v-if="gameState === GameState.Brewing"
										:lands="lands"
										v-model:autoland="autoLand"
										v-model:targetDeckSize="targetDeckSize"
										v-model:sideboardBasics="sideboardBasics"
										v-model:preferredBasics="preferredBasics"
										:otherbasics="basicsInDeck"
										@removebasics="removeBasicsFromDeck"
										@update:lands="(c: keyof typeof lands, n: number) => (lands[c] = n)"
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
															collectionInfos.wildcards['rare'] <
																(neededWildcards!.main?.rare ?? 0),
													}"
												>
													<img class="wildcard-icon" :src="`img/wc_rare.webp`" />
													{{ neededWildcards!.main?.rare ?? 0 }}
												</span>
												<span
													:class="{
														yellow:
															collectionInfos.wildcards &&
															collectionInfos.wildcards['mythic'] <
																(neededWildcards!.main?.mythic ?? 0),
													}"
												>
													<img class="wildcard-icon" :src="`img/wc_mythic.webp`" />
													{{ neededWildcards!.main?.mythic ?? 0 }}
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
															collectionInfos.wildcards &&
															collectionInfos.wildcards[rarity] < value,
													}"
												>
													<td>
														<img class="wildcard-icon" :src="`img/wc_${rarity}.webp`" />
													</td>
													<td>{{ value }}</td>
													<td>({{ neededWildcards!.side?.[rarity] ?? 0 }})</td>
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
										v-tooltip.top="
											'Quick search for English card names and types in your deck/sideboard.'
										"
									>
										<input type="text" placeholder="Search..." v-model="deckFilter" /><span
											@click="deckFilter = ''"
										>
											<font-awesome-icon icon="fa-solid fa-times-circle"></font-awesome-icon>
										</span>
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
									(drafting && gameState !== GameState.Watching) ||
									gameState == GameState.Brewing)
							"
							class="collapsed-sideboard"
						>
							<div class="section-title">
								<h2>Sideboard ({{ sideboard.length }})</h2>
								<div class="controls">
									<font-awesome-icon
										class="clickable"
										icon="fa-regular fa-window-maximize"
										@click="collapseSideboard = false"
										v-tooltip="'Maximize sideboard'"
									></font-awesome-icon>
								</div>
							</div>
							<div
								class="card-container"
								@dragover="allowBoosterCardDrop($event)"
								@dragleave="onDragLeave($event)"
								@drop="dropBoosterCard($event, { toSideboard: true })"
							>
								<Sortable
									:key="`collapsed-sideboard-col-${sideboard.map((c) => c.uniqueID).join('-')}`"
									class="card-column drag-column"
									:list="sideboard"
									item-key="uniqueID"
									:options="{
										group: 'deck',
										animation: '200',
										ghostClass: 'ghost',
										multiDrag: true,
										selectedClass: 'multi-drag-selected',
										multiDragKey: 'ctrl',
									}"
									@add="onCollapsedSideDragAdd"
									@remove="onCollapsedSideDragRemove"
									@update="sortableUpdate($event, sideboard)"
								>
									<template #item="{ element }">
										<card
											:card="element"
											:language="language"
											@click.exact="sideboardToDeck($event, element)"
											:cardConditionalClasses="cardConditionalClasses"
										></card>
									</template>
								</Sortable>
							</div>
						</div>
					</div>
					<!-- Full size Sideboard -->
					<div
						v-show="
							!collapseSideboard &&
							((sideboard != undefined && sideboard.length > 0) ||
								(drafting && gameState !== GameState.Watching) ||
								gameState == GameState.Brewing)
						"
						class="container sideboard"
					>
						<card-pool
							:cards="sideboard"
							:language="language"
							@cardClick="sideboardToDeck"
							:readOnly="false"
							@cardDragAdd="onSideDragAdd"
							@cardDragRemove="onSideDragRemove"
							ref="sideboardDisplay"
							group="deck"
							@dragover="allowBoosterCardDrop($event)"
							@dragleave="onDragLeave($event)"
							@drop="dropBoosterCard($event, { toSideboard: true })"
							:cardConditionalClasses="cardConditionalClasses"
						>
							<template v-slot:title> Sideboard ({{ sideboard.length }}) </template>
							<template v-slot:controls>
								<font-awesome-icon
									icon="fa-solid fa-columns"
									class="clickable"
									@click="collapseSideboard = true"
									v-tooltip="'Minimize sideboard'"
								></font-awesome-icon>
							</template>
							<template v-slot:empty>
								<h3>Your sideboard is currently empty!</h3>
								<p>Click on cards in your deck to move them here.</p>
							</template>
						</card-pool>
					</div>
				</div>
			</div>

			<div class="welcome" v-if="gameState === GameState.None">
				<template v-if="page === 'draftqueue'">
					<DraftQueue :socket="socket"></DraftQueue>
				</template>
				<template v-else>
					<button
						v-if="previousDeck"
						@click="loadPreviousDeck"
						class="reload-deck-button"
						v-tooltip="`Reload deck of the last played session from your game logs.`"
					>
						<font-awesome-icon :icon="['fas', 'rotate-left']" /> Reload last deck
					</button>
					<h1>Welcome to Draftmancer.com!</h1>
					<p class="important">
						Draft with other players and export your resulting deck to Magic: The Gathering Arena to play
						with them, in pod!
					</p>
					<div class="welcome-top">
						<div>
							<a href="/draftqueue">
								<div class="draft-queue-banner">
									<img
										src="./assets/img/ktk.webp"
										alt="Practice Khans of Tarkir draft with human players right now in the Draft Queue!"
										width="500"
										height="260"
									/>
								</div>
							</a>
							<!--
							<div class="section-title">
								<h2>Quick Start</h2>
							</div>
							<div class="welcome-section welcome-alt">
								There are multiple ways to get started with Draftmancer:
								<ul class="quick-start-list">
									<li>
										Pratice the latest sets with other players in the
										<a href="/draftqueue">Draft Queue</a>!
									</li>
									<li>
										Draft with bots by selecting a set and clicking "<span
											@click="startDraft"
											:class="{ link: userID === sessionOwner }"
											style="font-variant: small-caps"
											>Start</span
										>" on top of the page.
									</li>
									<li>Join one of the featured communities and participate in events.</li>
									<li>Tinker with the settings and organize your own events!</li>
								</ul>
							</div>
						-->
						</div>
						<Communities />
					</div>
					<div class="welcome-sections">
						<div class="container" style="grid-area: News">
							<div class="section-title">
								<h2>News</h2>
							</div>
							<news class="welcome-section" @more-sets="displayedModal = 'setRestriction'" />
						</div>
						<div class="container" style="grid-area: Help">
							<div class="section-title">
								<h2>Help</h2>
							</div>
							<div class="welcome-section welcome-alt">
								<div style="display: flex; justify-content: space-between">
									<div>
										<span class="link" @click="displayedModal = 'gettingStarted'">
											<font-awesome-icon icon="fa-solid fa-rocket"></font-awesome-icon> Get
											Started
										</span>
										guide
									</div>
									<div>
										<span class="link" @click="displayedModal = 'help'">
											<font-awesome-icon icon="fa-solid fa-info-circle"></font-awesome-icon> FAQ /
											Settings Description
										</span>
									</div>
								</div>
								<br />
								For any question/bug report/feature request you can email to
								<a href="mailto:dev@draftmancer.com">dev@draftmancer.com</a>
								or join the
								<a href="https://discord.gg/XscXXNw">
									<font-awesome-icon icon="fa-brands fa-discord"></font-awesome-icon> Draftmancer
									Discord </a
								>.
							</div>
						</div>
						<div class="container" style="grid-area: Support">
							<div class="section-title">
								<h2>
									<font-awesome-icon
										icon="fa-solid fa-mug-hot"
										aria-hidden="true"
									></font-awesome-icon>
									Buy me a Coffee
								</h2>
							</div>
							<div class="welcome-section welcome-alt">
								<div>
									Hello there!<br />
									I hope you're enjoying using Draftmancer!<br />
									If you find it useful, please consider supporting it with a small donation using one
									of these platforms:
									<div
										style="
											display: flex;
											gap: 1em;
											justify-content: center;
											align-items: center;
											text-align: center;
											margin: 0.25em;
											margin-bottom: 0.8em;
										"
									>
										<div style="position: relative">
											<a href="https://github.com/sponsors/Senryoku" target="_blank">
												<font-awesome-icon
													icon="fa-brands fa-github"
													size="2x"
												></font-awesome-icon>
												<div>GitHub Sponsor</div>
											</a>
											<div
												style="
													font-size: 0.7em;
													color: #aaa;
													position: absolute;
													bottom: -0.8rem;
													left: 50%;
													transform: translateX(-50%);
												"
											>
												(No fees!)
											</div>
										</div>
										<div>or</div>
										<div>
											<a
												href="https://www.paypal.com/donate/?hosted_button_id=6L2CUS6DH82DL"
												target="_blank"
											>
												<font-awesome-icon
													icon="fa-brands fa-paypal"
													size="2x"
												></font-awesome-icon>
												<div>PayPal</div>
											</a>
										</div>
									</div>
									Your support will help keep the project online, updated, and will motivate me to add
									new features.<br />
									<div style="text-align: right">Thank you! — Sen</div>
								</div>
							</div>
						</div>
						<div class="container" style="grid-area: Tools">
							<div class="section-title">
								<h2>Tools</h2>
							</div>
							<div class="welcome-section welcome-alt">
								<div style="display: flex; flex-wrap: wrap; justify-content: space-between">
									<div @click="displayedModal = 'importdeck'" class="link">
										<font-awesome-icon icon="fa-solid fa-file-export"></font-awesome-icon>
										Card List Importer
									</div>
									<div
										v-tooltip="
											'Download the intersection of the collections of players in the session in text format.'
										"
									>
										<a :href="encodeURI(`/getCollectionPlainText/${sessionID}`)" target="_blank">
											<font-awesome-icon icon="fa-solid fa-file-download"></font-awesome-icon>
											Download Session Collection
										</a>
									</div>
								</div>
							</div>
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
									:maxlength="70"
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
												s.cube
													? 'Cube'
													: s.sets.map((code) => setsInfos[code].fullName).join(', ')
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
											<font-awesome-icon
												icon="fa-solid fa-check green"
												v-tooltip="`You are in this session!`"
												v-else
											></font-awesome-icon>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</template>
			</div>
		</div>

		<modal :displayed="displayedModal === 'help'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Help</h2>
			</template>
			<template v-slot:body>
				<help-modal @openSettings="displayedModal = 'sessionOptions'" />
			</template>
		</modal>
		<modal :displayed="displayedModal === 'gettingStarted'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Getting Started</h2>
			</template>
			<template v-slot:body>
				<getting-started
					:isSessionOwner="userID === sessionOwner"
					:sessionOwnerName="sessionOwner ? userByID[sessionOwner].userName : 'Unknown'"
					@openSettings="displayedModal = 'sessionOptions'"
					@sessionURLToClipboard="sessionURLToClipboard"
				/>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'collectionHelp'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Collection Import Help</h2>
			</template>
			<template v-slot:body>
				<CollectionImportHelp @uploadlogs="uploadMTGALogs" @clipboard="toClipboard" />
			</template>
		</modal>
		<modal :displayed="displayedModal === 'importdeck'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Card List Importer</h2>
			</template>
			<template v-slot:body>
				<div>
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
			</template>
		</modal>
		<modal :displayed="displayedModal === 'uploadBoosters'" @close="displayedModal = 'sessionOptions'">
			<template v-slot:header>
				<h2>Upload Boosters</h2>
			</template>
			<template v-slot:body>
				<div>
					<form @submit.prevent="uploadBoosters">
						<div>
							<div>
								Paste your boosters card list here. One card per line, each booster separated by a blank
								line.<br />
								Make sure each booster has the same number of cards and the total booster count is
								suitable for your settings.
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
			</template>
		</modal>
		<modal :displayed="displayedModal === 'setRestriction'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Card Pool</h2>
			</template>
			<template v-slot:body>
				<set-restriction-component v-model="setRestriction"></set-restriction-component>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'draftLogs'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Game Logs</h2>
			</template>
			<template v-slot:body>
				<draft-log-history
					:draftLogs="draftLogs"
					:language="language"
					:userID="userID"
					:userName="userName"
					@sharelog="shareSavedDraftLog"
					@storelogs="storeDraftLogs"
					@loadDeck="loadDeckFromLogs"
					@importMTGOLog="importMTGOLog"
				></draft-log-history>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'collection'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Collection Statistics</h2>
			</template>
			<template v-slot:body>
				<collection-component
					:collection="collection"
					:collectionInfos="collectionInfos"
					:language="language"
					:displaycollectionstatus="displayCollectionStatus"
					@display-collection-status="displayCollectionStatus = $event"
				></collection-component>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'sessionOptions'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Additional Session Settings</h2>
			</template>
			<template v-slot:contols>
				<div>
					<font-awesome-icon
						icon="fa-solid fa-undo"
						class="clickable"
						:class="{ disabled: userID !== sessionOwner }"
						@click="resetSessionSettings"
						v-tooltip="'Reset all session settings to their default value'"
					></font-awesome-icon>
				</div>
			</template>
			<template v-slot:body>
				<div class="session-options-container" :class="{ disabled: userID != sessionOwner }">
					<div class="option-column option-column-left">
						<h4>Session</h4>
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
									:maxlength="70"
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
						<h4>Booster Generation</h4>
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
							v-bind:class="{ disabled: usePredeterminedBoosters }"
							v-tooltip.left="{
								popperClass: 'option-tooltip',
								content: `Restrict card pool to Player Collections: <strong>${
									ignoreCollections ? 'Disabled' : 'Enabled'
								}</strong>
									<p>If enabled, card pool will be limited to cards present in all player collections.</p>`,
								html: true,
							}"
						>
							<label for="restrict-to-collections">Restrict card pool to Collections</label>
							<div class="right">
								<input
									type="checkbox"
									:checked="!ignoreCollections"
									id="restrict-to-collections"
									@change="ignoreCollections = !($event.target! as HTMLInputElement).checked"
								/>
							</div>
						</div>
						<div
							class="option-section"
							v-bind:class="{ disabled: usePredeterminedBoosters || useCustomCardList }"
							v-tooltip.left="{
								popperClass: 'option-tooltip',
								content: `<p>Lets you customize the exact content of your boosters.</p>
									<p><strong>Bonus</strong>: Controls the number of cards from a set-specific bonus sheet, they generally replace commons (and thus do not increase booster size). This setting only affect the following sets: 
										<ul>
											<li>March of the Machine (Multiverse Legends)</li> 
											<li>Shadows over Innistrad Remastered (Shadow of the Past)</li> 
											<li>The Brothers' War (Retro Artifact - These do NOT replace commons)</li> 
											<li>Strixhaven (Mystical Archives)</li> 
											<li>Timespiral Remastered (Timeshifted - These do NOT replace commons)</li> 
											<li>Modern Horizons 2 (New-to-Modern - These do NOT replace commons)</li> 
										</ul>
									</p>
									<p>Notes:<ul><li>Zero is a valid value (useful for Pauper or Artisan for example).</li><li>A land slot will be automatically added for some sets.</li><li>Unused when drawing from a custom card list: See the advanced card list syntax to mimic it.</li></ul></p>`,
								html: true,
							}"
						>
							<div class="option-column-title">
								<input type="checkbox" v-model="useBoosterContent" id="edit-booster-content" />
								<label for="edit-booster-content">Edit Booster Content</label>
							</div>
							<template v-if="useBoosterContent">
								<div class="line" v-for="r in ['common', 'uncommon', 'rare', 'bonus']" :key="r">
									<label :for="'booster-content-' + r" class="capitalized">{{ r }}</label>
									<div class="right">
										<input
											class="small-number-input"
											type="number"
											:id="'booster-content-' + r"
											min="0"
											max="30"
											step="1"
											v-model.number="boosterContent[r as keyof typeof boosterContent]"
											@change="
												if (boosterContent[r as keyof typeof boosterContent] < 0)
													boosterContent[r as keyof typeof boosterContent] = 0;
											"
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
											v-model.number="maxDuplicates[r as keyof typeof maxDuplicates]"
											@change="
												if (maxDuplicates![r as keyof typeof maxDuplicates] < 1)
													maxDuplicates![r as keyof typeof maxDuplicates] = 1;
											"
										/>
									</div>
								</div>
							</template>
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
								<input
									type="checkbox"
									v-model="usePredeterminedBoosters"
									id="use-predetermined-boosters"
								/>
								<button @click="displayedModal = 'uploadBoosters'">
									<font-awesome-icon icon="fa-solid fa-upload"></font-awesome-icon> Upload
								</button>
								<button
									@click="shuffleUploadedBoosters"
									v-tooltip="'Shuffle the boosters before distributing them.'"
								>
									Shuffle
								</button>
							</div>
						</div>
						<h4>Game Logs</h4>
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
						<div
							class="line"
							:class="{ disabled: draftLogRecipients !== 'delayed' }"
							v-tooltip.left="{
								popperClass: 'option-tooltip',
								content:
									'<p>Automatically unlocks the draft logs for the entire session once the specified delay has elapsed. This feature is particularly useful for owners who may occasionally forget to unlock the logs :)</p><p>Note: Please remain connected to the session to ensure that you receive the logs. If the session remains inactive for an extended period, the server might drop the logs. At that point, only the owner will be able to share the logs.</p>',
								html: true,
							}"
						>
							<label for="draft-log-unlock-timer">Automatic Logs Unlock Timer</label>
							<div class="right">
								<select v-model="draftLogUnlockTimer" id="draft-log-unlock-timer">
									<option :value="0">Never</option>
									<option :value="60">1h</option>
									<option :value="120">2h</option>
									<option :value="180">3h</option>
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
									:min="1"
									:max="99"
									:step="1"
									:delay="0.1"
									v-model.number="boostersPerPlayer"
									:validate="(v: number) => Math.max(1, Math.min(v, 99))"
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
							<hr style="margin: 0.4em 1em; color: #555" />
							<div
								v-tooltip.right="{
									popperClass: 'option-tooltip',
									content:
										'<p>Specify the set of indiviual boosters handed to each player. Useful for classic Chaos Draft or Ixalan/Rivals of Ixalan draft for example.</p><p>Note: Collections are ignored for each booster with any other value than (Default).</p><p>\'Random Set from Card Pool\' will pick a different extension for each player, \'Random Set from Card Pool (Shared)\' means the randomly picked set will be the same for all players.</p>',
									html: true,
								}"
								style="max-height: 10em; overflow-y: auto; margin: 0.2em; padding-bottom: 0.4em"
							>
								<div v-for="(value, index) in customBoosters" class="line" :key="index">
									<label for="customized-booster">Booster #{{ index + 1 }}</label>
									<select class="right" v-model="customBoosters[index]">
										<option value>(Default)</option>
										<option value="random">Random Set from Card Pool</option>
										<option value="randomShared">Random Set from Card Pool (Shared)</option>
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
							v-bind:class="{
								disabled: useCustomCardList && customCardList?.settings?.boosterSettings,
							}"
						>
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
											Object.values(boosterContent).reduce((v, a) => (a += v)),
											cardsPerBooster
										) - pickedCardsPerRound
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
						<h4>Tournament Settings</h4>
						<div
							class="line"
							v-tooltip.right="{
								popperClass: 'option-tooltip',
								content: '<p>Stricter timer starting at 40sec. used in official tournaments.</p>',
								html: true,
							}"
						>
							<label for="tournament-timer">Tournament Timer</label>
							<div class="right">
								<input type="checkbox" id="tournament-timer" v-model="tournamentTimer" />
							</div>
						</div>
						<div
							class="line"
							v-tooltip.right="{
								popperClass: 'option-tooltip',
								content:
									'<p>Controls the initial duration of the review phase between booster, it will increase by 50% after each pack, up to 2 times the initial duration. This is generally used in conjonction with the \'Hide Picks\' settings. A value of 0 disables the review phase.</p>',
								html: true,
							}"
						>
							<label for="review-timer">Review Timer</label>
							<div class="right">
								<input
									type="number"
									id="review-timer"
									class="small-number-input"
									min="0"
									step="15"
									v-model.number="reviewTimer"
								/>
							</div>
						</div>
						<div
							class="line"
							v-tooltip.right="{
								popperClass: 'option-tooltip',
								content: '<p>Hide picks during the draft, outside of the review phase.</p>',
								html: true,
							}"
						>
							<label for="hide-picks">Hide Picks</label>
							<div class="right">
								<input type="checkbox" id="hide-picks" v-model="hidePicks" />
							</div>
						</div>
					</div>
					<div class="option-section option-custom-card-list" :class="{ disabled: usePredeterminedBoosters }">
						<div class="option-column-title">
							<input type="checkbox" v-model="useCustomCardList" id="use-custom-card-list" /> Custom Card
							List
						</div>
						<div class="option-cube-settings">
							<div
								class="option-cube-settings-1"
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
										'disabled-simple':
											useCustomCardList && customCardList && customCardList.layouts,
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
							<div v-if="customCardList?.slots && Object.keys(customCardList?.slots).length > 0">
								<font-awesome-icon
									icon="fa-solid fa-check"
									class="green"
									v-if="useCustomCardList"
									v-tooltip="'Card list successfully loaded!'"
								></font-awesome-icon>
								<font-awesome-icon
									icon="fa-solid fa-exclamation-triangle"
									class="yellow"
									v-else
									v-tooltip="'Card list successfully loaded, but not used.'"
								></font-awesome-icon>
								<span v-if="customCardList.name">Loaded '{{ customCardList.name }}'.</span>
								<span v-else>Unamed list loaded.</span>
								<button @click="displayedModal = 'cardList'">
									<font-awesome-icon icon="fa-solid fa-file-lines"></font-awesome-icon>
									Review.
								</button>
							</div>
							<div v-else>(No Custom Card List loaded)</div>
						</div>
						<div class="option-cube-import">
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
									($event.target as HTMLElement)?.classList.add('dropzone-highlight');
								"
								style="flex-grow: 1; height: 100%"
							>
								Upload a Custom Card List file by dropping it here or by clicking to browse your
								computer.
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
								><font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon> Cube
								Cobra</a
							>
							or
							<a href="https://cubeartisan.net/" target="_blank" rel="noopener nofollow"
								><font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon> Cube
								Artisan</a
							>
							<br />Customize your list even further by using all features of the
							<a href="cubeformat.html" target="_blank" rel="noopener nofollow">
								<font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon>
								format
							</a>
						</div>
					</div>
				</div>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'bracket'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Bracket</h2>
			</template>
			<template v-slot:body>
				<bracket-component
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
				></bracket-component>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'deckStats'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Deck Statistics</h2>
			</template>
			<template v-slot:body>
				<card-stats :cards="deck" :addedbasics="totalLands"></card-stats>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'cardList'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Custom Card List Review</h2>
			</template>
			<template v-slot:body>
				<card-list :cardlist="customCardList" :language="language" :collection="collection"></card-list>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'About'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>About</h2>
			</template>
			<template v-slot:body>
				<div>
					<p>
						Developped by
						<a href="https://senryoku.github.io/" target="_blank" rel="noopener nofollow">Senryoku</a>
						(contact in French or English:
						<a href="mailto:dev@draftmancer.com">dev@draftmancer.com</a>
						) using
						<a href="https://scryfall.com/">Scryfall</a>
						card data and images and loads of open source software.
					</p>
					<p>
						Draftmancer Discord:
						<a href="https://discord.gg/XscXXNw">https://discord.gg/XscXXNw</a>
					</p>
					<h3>Patch Notes</h3>
					<patch-notes></patch-notes>
					<span style="font-size: 0.8em">
						(detailed changes can be found on
						<a
							href="https://github.com/Senryoku/Draftmancer"
							title="GitHub"
							target="_blank"
							rel="noopener nofollow"
						>
							<font-awesome-icon
								icon="fa-brands fa-github"
								style="vertical-align: baseline; padding: 0px 0.25em"
							></font-awesome-icon>
							GitHub
						</a>
						)
					</span>
					<h3>Notice</h3>
					<p>
						Draftmancer is unofficial Fan Content permitted under the Fan Content Policy. Not
						approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the
						Coast. ©Wizards of the Coast LLC.
					</p>
				</div>
			</template>
		</modal>
		<modal :displayed="displayedModal === 'donation'" @close="displayedModal = ''">
			<template v-slot:header>
				<h2>Support Draftmancer</h2>
			</template>
			<template v-slot:body>
				<sponsor-modal />
			</template>
		</modal>
		<CardPopup :language="language" :customCards="customCardList?.customCards" ref="cardPopup" />
		<footer>
			<span @click="displayedModal = 'About'" class="clickable">
				<span class="link">About</span>
			</span>
			<span>
				Made by
				<a href="http://senryoku.github.io/" target="_blank" rel="noopener nofollow">Senryoku</a>
			</span>
			<span>
				<span class="link" @click="displayedModal = 'donation'">
					Buy me a Coffee
					<font-awesome-icon icon="fa-solid fa-mug-hot" aria-hidden="true"></font-awesome-icon>
				</span>
			</span>
			<span>
				<a href="mailto:dev@draftmancer.com" title="Email">
					<font-awesome-icon
						icon="fa-solid fa-envelope"
						size="lg"
						style="vertical-align: baseline; padding: 0 0.25em"
					></font-awesome-icon>
				</a>
				<a href="https://discord.gg/XscXXNw" title="Discord" target="_blank" rel="noopener nofollow">
					<font-awesome-icon
						icon="fa-brands fa-discord"
						size="lg"
						style="vertical-align: baseline; padding: 0 0.25em"
					></font-awesome-icon>
				</a>
				<a
					href="https://github.com/Senryoku/Draftmancer"
					title="GitHub"
					target="_blank"
					rel="noopener nofollow"
				>
					<font-awesome-icon
						icon="fa-brands fa-github"
						size="lg"
						style="vertical-align: baseline; padding: 0 0.25em"
					></font-awesome-icon>
				</a>
			</span>
		</footer>
		<div
			class="disconnected-icon"
			v-if="!socketConnected"
			v-tooltip="
				'You are disconnected from the server, some functionnalities won\'t be available until the connection is re-established.'
			"
		>
			<font-awesome-icon icon="fa-solid fa-exclamation-triangle"></font-awesome-icon>
			Disconnected
		</div>
	</div>
</template>

<script src="./App.ts" lang="ts" />

<style src="./css/style.css"></style>
<style src="./css/tooltip.css"></style>
<style src="./css/app.css"></style>
<style src="./css/booster-open.css"></style>
<style src="./css/chat.css"></style>

<style scoped>
.collection-import-help ol li,
.collection-import-help ul li {
	margin: 0.2em 0;
}
</style>
