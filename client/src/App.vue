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
				<input type="text" id="user-name" name="user-name" v-model="userName" maxlength="50" />
				<div class="inline" v-tooltip="'Controls the display language of cards.'">
					<label for="language">Language</label>
					<select @change="fetchTranslation($event.target.value)" name="language" id="select-language">
						<option
							v-for="lang in languages"
							v-bind:value="lang.code"
							:selected="lang.code === language"
							:key="lang.code"
						>{{ lang.name }}</option>
					</select>
					<i
						class="fas fa-spinner fa-spin"
						style="position: absolute; margin-top: 0.6em; margin-left: 0.5em;"
						v-tooltip="'Loading language data...'"
						v-if="loadingLanguages.length > 0"
					></i>
				</div>
			</span>
			<span>
				<label for="file-input">MTGA Collection</label>
				<input type="file" id="file-input" @change="parseMTGALog" style="display: none;" accept=".log" />
				<button
					onclick="document.querySelector('#file-input').click()"
					v-tooltip="'Import your collection by uploading your Player.log file.'"
				>
					Upload
					<i v-if="hasCollection" class="fas fa-check green" v-tooltip="'Collection uploaded.'"></i>
				</button>
				<button
					v-if="hasCollection"
					v-tooltip="'Display some statistics about your collection.'"
					@click="displayedModal = 'collection'"
				>Stats</button>
				<div
					v-show="hasCollection"
					class="inline"
					v-tooltip="'Uncheck this to draft using every cards. Ignored when using a Custom Card List.'"
				>
					<input type="checkbox" v-model="useCollection" id="useCollection" />
					<label for="useCollection">Restrict to Collection</label>
				</div>
			</span>
			<span>
				<i
					class="fas clickable"
					:class="{'fa-volume-mute': !enableSound, 'fa-volume-up': enableSound}"
					@click="enableSound = !enableSound"
					v-tooltip="'Toggle sound.'"
				></i>
				<div class="inline" v-tooltip="'Allows you to pick cards by double clicking.'">
					<input type="checkbox" v-model="pickOnDblclick" id="pickOnDblclick" />
					<label for="pickOnDblclick">Pick on Double Click</label>
				</div>
				<span
					:class="{ disabled: notificationPermission == 'denied' }"
					v-tooltip="'Enable to get desktop notifications when your draft starts.'"
				>
					<input
						type="checkbox"
						v-model="enableNotifications"
						@change="checkNotificationPermission"
						id="notification-input"
					/>
					<label for="notification-input">Notifications</label>
				</span>
			</span>

			<span class="generic-container">
				<div v-show="publicSessions.length == 0" class="disable-warning">(No public sessions)</div>
				<span
					v-bind:class="{ disabled: drafting || publicSessions.length == 0 }"
					id="public-session-controls"
				>
					<label for="public-sessions">Public sessions</label>
					<select id="public-sessions" v-model="selectedPublicSession">
						<option v-for="s in publicSessions" :value="s" :key="s">{{ s }}</option>
					</select>
					<input type="button" value="Join" @click="joinPublicSession" />
				</span>
			</span>
		</div>

		<!-- Session Options -->
		<div class="generic-container">
			<div id="limited-controls" class="main-controls" v-bind:class="{ disabled: drafting }">
				<span id="session-controls">
					<div class="inline" v-tooltip="'Share it with your friends!'">
						<label for="session-id">Session ID</label>
						<input :type="hideSessionID ? 'password' : 'text'" id="session-id" v-model="sessionID" />
					</div>
					<i
						class="far fa-fw clickable"
						:class="hideSessionID ? 'fa-eye' : 'fa-eye-slash'"
						@click="hideSessionID = !hideSessionID"
						v-tooltip="'Show/Hide your session ID.'"
					></i>
					<i
						class="fas fa-share-square clickable"
						v-tooltip="'Share your Session ID'"
						@click="sessionURLToClipboard"
					></i>
					<i
						class="fas fa-project-diagram clickable"
						v-if="sessionOwner === userID && !bracket"
						@click="generateBracket"
						v-tooltip="'Generate Bracket.'"
					></i>
					<i
						class="fas fa-project-diagram clickable"
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
				<span class="generic-container">
					<strong>Card Pool:</strong>
					<span v-if="useCustomCardList">
						{{customCardList.name ? customCardList.name : "Custom Card List"}}
						<template
							v-if="customCardList.length > 0"
						>
							({{customCardList.length}} cards
							<a
								@click="displayedModal = 'cardList'"
								v-tooltip="'Review the card list'"
							>
								<i class="fas fa-file-alt"></i>
							</a>
							)
						</template>
						<template v-else>(No list loaded)</template>
					</span>
					<span v-else :class="{ disabled: sessionOwner != userID }">
						<div class="inline">
							<label
								for="set-restriction"
								v-tooltip="'Restricts to the selected sets. No selection means all cards present in Arena.'"
							>Set(s)</label>
							<multiselect
								v-if="setsInfos"
								v-model="setRestriction"
								placeholder="All"
								:options="sets.slice().reverse()"
								:searchable="false"
								:allow-empty="true"
								:close-on-select="false"
								:multiple="true"
								select-label
								selected-label=""
								deselect-label=""
							>
								<template slot="selection" slot-scope="{ values, search, isOpen }">
									<span class="multiselect__single" v-if="values.length == 1">
										<img class="set-icon" :src="setsInfos[values[0]].icon" />
										{{ setsInfos[values[0]].fullName }}
									</span>
									<span class="multiselect__single multiselect__single_nooverflow" v-if="values.length > 1">
										({{ values.length }})
										<img
											v-for="v in values"
											class="set-icon"
											:src="setsInfos[v].icon"
											:key="v"
										/>
									</span>
								</template>
								<template slot="option" slot-scope="{ option , search  }">
									<span class="multiselect__option">
										<img class="set-icon padded-icon" :src="setsInfos[option].icon" />
										{{ setsInfos[option].fullName }}
									</span>
								</template>
							</multiselect>
							<div
								class="inline"
								v-tooltip="'Draft with all cards within set restriction disregarding players collections.'"
							>
								<input type="checkbox" v-model="ignoreCollections" id="ignore-collections" />
								<label for="ignore-collections">Ignore Collections</label>
							</div>
						</div>
					</span>
				</span>
				<span class="generic-container" :class="{ disabled: sessionOwner != userID }">
					<strong>Draft:</strong>
					<div class="inline" v-tooltip="'Add some dumb bots to your draft.'">
						<label for="bots">Bots</label>
						<input
							type="number"
							id="bots"
							class="small-number-input"
							min="0"
							max="7"
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
					<button @click="startDraft" v-tooltip="'Starts a Draft Session.'">Draft</button>
				</span>
				<span class="generic-container" :class="{ disabled: sessionOwner != userID }">
					<button
						@click="startWinstonDraft()"
						v-tooltip="'Starts a Winston Draft. This is a draft variant for only two players.'"
					>Winston</button>
				</span>
				<span class="generic-container" :class="{ disabled: sessionOwner != userID }">
					<button
						@click="sealedDialog"
						v-tooltip="'Distributes boosters to everyone for a sealed session.'"
					>Sealed</button>
				</span>
				<span class="generic-container" :class="{ disabled: sessionOwner != userID }">
					<button
						@click="deckWarning(distributeJumpstart)"
						v-tooltip="'Distributes two Jumpstart boosters to everyone.'"
					>Jumpstart</button>
				</span>
				<span
					v-tooltip="'More session options'"
					@click="displayedModal = 'sessionOptions'"
					class="more-option clickable"
				>
					More
					<i class="fas fa-bars"></i>
				</span>
			</div>
			<div v-show="drafting" id="draft-in-progress">
				Draft in progress!
				<button
					v-if="sessionOwner == userID"
					class="stop"
					@click="stopDraft"
				>Stop Draft</button>
			</div>
		</div>

		<!-- Session Players -->
		<div class="main-controls session-players">
			<div
				v-if="!ownerIsPlayer"
				class="generic-container"
				v-tooltip="'Non-playing session owner.'"
				style="margin-right: 0.5em;"
			>
				{{sessionOwnerUsername ? sessionOwnerUsername : '(Disconnected)'}}
				<i
					class="fas fa-crown subtle-gold"
					v-tooltip="sessionOwnerUsername ? `${sessionOwnerUsername} is the session's owner.` : 'Session owner is disconnected.'"
				></i>
				<div class="chat-bubble" :id="'chat-bubble-'+sessionOwner"></div>
			</div>
			<div>
				<span
					v-tooltip="'Maximum players can be adjusted in session options.'"
				>Players ({{sessionUsers.length}}/{{maxPlayers}})</span>
				<i
					v-if="userID == sessionOwner && !drafting"
					class="fas fa-random clickable"
					@click="randomizeSeating"
					v-tooltip="'Randomize Seating Order'"
				></i>
			</div>
			<template v-if="!drafting">
				<draggable
					tag="ul"
					class="player-list"
					v-model="userOrder"
					@change="changePlayerOrder"
					:disabled="userID != sessionOwner || drafting"
				>
					<li
						v-for="(id, idx) in userOrder"
						:key="id"
						:class="{draggable: userID === sessionOwner && !drafting, bot: userByID[id].isBot}"
						:data-userid="id"
					>
						<span class="player-name">{{ userByID[id].userName }}</span>
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
								v-tooltip="`${userByID[id].userName} is the session's owner.`"
							></i>
							<template v-if="userID === sessionOwner && id != sessionOwner">
								<i
									class="fas fa-user-plus clickable subtle-gold"
									v-tooltip="`Give session ownership to ${userByID[id].userName}`"
									@click="setSessionOwner(id)"
								></i>
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
										v-tooltip="userByID[id].userName + ' have not uploaded their collection yet.'"
									></i>
								</template>
								<template v-else-if="userByID[id].collection && !userByID[id].useCollection">
									<i
										class="fas fa-book yellow"
										v-tooltip="userByID[id].userName + ' have uploaded their collection, but are not using it.'"
									></i>
								</template>
								<template v-else>
									<i
										class="fas fa-book green"
										v-tooltip="userByID[id].userName + ' have uploaded their collection.'"
									></i>
								</template>
							</template>
							<template v-if="pendingReadyCheck">
								<template v-if="userByID[id].readyState == ReadyState.Ready">
									<i class="fas fa-check green" v-tooltip="`${userByID[id].userName} is ready!`"></i>
								</template>
								<template v-else-if="userByID[id].readyState == ReadyState.NotReady">
									<i class="fas fa-times red" v-tooltip="`${userByID[id].userName} is NOT ready!`"></i>
								</template>
								<template v-else-if="userByID[id].readyState == ReadyState.Unknown">
									<i
										class="fas fa-spinner fa-spin"
										v-tooltip="`Waiting on ${userByID[id].userName} to respond...`"
									></i>
								</template>
							</template>
						</div>
						<div class="chat-bubble" :id="'chat-bubble-'+id"></div>
					</li>
				</draggable>
			</template>
			<template v-else>
				<ul class="player-list">
					<li
						v-for="user in virtualPlayers"
						:class="{bot: user.isBot}"
						:data-userid="user.userID"
						:key="user.userID"
					>
						<i
							class="fas fa-angle-double-left passing-order-left"
							v-show="(boosterNumber % 2) == 1"
							v-tooltip="'Passing order'"
						></i>
						<i
							class="fas fa-angle-double-right passing-order-right"
							v-show="(boosterNumber % 2) == 0"
							v-tooltip="'Passing order'"
						></i>
						<span class="player-name">{{ user.userName }}</span>
						<template v-if="!user.isBot && !user.disconnected">
							<div class="status-icons">
								<i
									v-if="user.userID === sessionOwner"
									class="fas fa-crown subtle-gold"
									v-tooltip="`${user.userName} is the session's owner.`"
								></i>
								<template v-if="userID === sessionOwner && user.userID != sessionOwner">
									<i
										class="fas fa-user-plus clickable subtle-gold"
										v-if="ownerIsPlayer"
										v-tooltip="`Give session ownership to ${user.userName}`"
										@click="setSessionOwner(user.userID)"
									></i>
									<i
										class="fas fa-user-slash clickable red"
										v-tooltip="`Remove ${user.userName} from the session`"
										@click="removePlayer(user.userID)"
									></i>
								</template>
								<template v-if="winstonDraftState">
									<i
										v-show="user.userID === winstonDraftState.currentPlayer"
										class="fas fa-spinner fa-spin"
										v-tooltip="user.userName + ' is thinking...'"
									></i>
								</template>
								<template v-else>
									<template v-if="user.pickedThisRound">
										<i class="fas fa-check green" v-tooltip="user.userName + ' has picked a card.'"></i>
									</template>
									<template v-else>
										<i class="fas fa-spinner fa-spin" v-tooltip="user.userName + ' is thinking...'"></i>
									</template>
								</template>
							</div>
							<div class="chat-bubble" :id="'chat-bubble-'+user.userID"></div>
						</template>
					</li>
				</ul>
			</template>
			<div>
				<button
					@click="shareSavedDraftLog"
					v-show="savedDraftLog"
					v-tooltip="'Reveal and share previous draft log with players in your session.'"
				>Share saved Draft Log</button>
				<button
					@click="displayedModal = 'draftLog'"
					v-show="draftLog"
					v-tooltip="'Displays logs of your previous draft'"
				>Draft Log</button>
			</div>
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
								<span
									class="chat-author"
								>{{ msg.author in userByID ? userByID[msg.author].userName : "(Left)"}}</span>
								<span class="chat-message">{{msg.text}}</span>
							</li>
						</ol>
					</template>
					<template v-else>No messages in chat history.</template>
				</div>
			</div>
		</div>

		<!-- Draft Controls -->
		<template v-if="drafting">
			<transition :name="'slide-fade-'+((boosterNumber % 2)?'left':'right')" mode="out-in">
				<div v-if="draftingState == DraftState.Watching" key="draft-watching" class="draft-watching">
					<div class="draft-watching-state">
						<h1>Players are drafting...</h1>
						<div v-show="pickTimer >= 0">
							<i class="fas fa-clock"></i>
							{{ pickTimer }}
						</div>
						<div>Booster #{{boosterNumber}}, Pick #{{pickNumber}}</div>
					</div>
					<div v-if="draftLog && draftLog.sessionID === sessionID" class="draft-watching-live-log">
						<draft-log-live
							:draftlog="draftLog"
							:show="['owner', 'everyone'].includes(draftLogRecipients)"
							:language="language"
						></draft-log-live>
					</div>
				</div>
				<div v-if="draftingState == DraftState.Waiting" key="draft-waiting" class="pick-waiting">
					<span class="spinner"></span>
					<span v-show="pickTimer >= 0">
						(
						<i class="fas fa-clock"></i>
						{{ pickTimer }})
					</span>
					Waiting for other players to pick...
				</div>
				<div
					v-if="draftingState == DraftState.Picking"
					key="draft-picking"
					id="booster-container"
					class="container"
				>
					<div id="booster-controls" class="controls">
						<h2>Your Booster</h2>
						<span>Booster #{{ boosterNumber }}, Pick {{pickNumber}}</span>
						<span v-show="pickTimer >= 0" :class="{redbg: pickTimer <= 10}" id="chrono">
							<i class="fas fa-clock"></i>
							{{ pickTimer }}
						</span>
						<input
							type="button"
							@click="pickCard"
							value="Confirm Pick"
							v-if="selectedCard != undefined && (burningCards.length === burnedCardsPerRound || booster.length === 1 + burningCards.length)"
						/>
						<span v-else>
							Pick a card
							<span
								v-if="cardsToBurnThisRound > 0"
							>and remove {{cardsToBurnThisRound}} cards from the pool ({{burningCards.length}}/{{cardsToBurnThisRound}})</span>
						</span>
					</div>
					<div class="booster card-container">
						<booster-card
							v-for="card in booster"
							:key="`card-booster-${card.uniqueID}`"
							:card="card"
							:language="language"
							:canbeburned="burnedCardsPerRound > 0"
							:burned="burningCards.includes(card)"
							:class="{selected: selectedCard === card}"
							@click.native="selectCard($event, card)"
							@dblclick.native="doubleClickCard($event, card)"
							@burn="burnCard($event, card)"
							@restore="restoreCard($event, card)"
							draggable
							@dragstart.native="dragBoosterCard($event, card)"
						></booster-card>
					</div>
				</div>
			</transition>
			<!-- Winston Draft -->
			<div
				v-if="draftingState === DraftState.WinstonPicking || draftingState === DraftState.WinstonWaiting"
				id="booster-container"
				class="container"
			>
				<div class="winston-status">
					<h2>Winston Draft</h2>
					<span>
						<template v-if="userID === winstonDraftState.currentPlayer">Your turn to pick a pile of cards!</template>
						<template v-else>Waiting on {{userByID[winstonDraftState.currentPlayer].userName}}...</template>
						There are {{winstonDraftState.remainingCards}} cards left in the main stack.
					</span>
				</div>
				<div class="winston-piles">
					<div
						v-for="(pile, index) in winstonDraftState.piles"
						:key="`winston-pile-${index}`"
						class="winston-pile"
						:class="{'winston-current-pile': index === winstonDraftState.currentPile}"
					>
						<template
							v-if="userID === winstonDraftState.currentPlayer && index === winstonDraftState.currentPile"
						>
							<div class="card-column winstom-card-column">
								<card v-for="card in pile" :key="card.uniqueID" :card="card" :language="language"></card>
							</div>
							<div class="winston-current-pile-options">
								<button class="confirm" @click="winstonDraftTakePile">Take Pile</button>
								<button class="cancel" @click="winstonDraftSkipPile" v-if="winstonCanSkipPile">
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
							<div
								class="winston-pile-status"
								v-show="index === winstonDraftState.currentPile"
							>{{userByID[winstonDraftState.currentPlayer].userName}} is looking at this pile...</div>
						</template>
					</div>
				</div>
			</div>
		</template>

		<!-- Brewing controls (Deck & Sideboard) -->
		<div
			class="container"
			v-show="(deck !== undefined && deck.length > 0) || (drafting && draftingState !== DraftState.Watching) || draftingState == DraftState.Brewing"
		>
			<div class="controls">
				<h2>Deck ({{deck.length}})</h2>
				<button v-if="deck.length > 0" type="button" @click="exportDeck">Export Deck to MTGA</button>
				<button v-if="deck.length > 0" type="button" @click="exportDeck(false)">Export (Simple)</button>
				<span v-show="draftingState == DraftState.Brewing">
					<input type="checkbox" id="autoLand" v-model="autoLand" />
					<label
						for="autoLand"
						v-tooltip="'If set, will complete your deck to 40 cards with basic lands.'"
					>Auto. Land</label>
					<template v-for="c in ['W', 'U', 'B', 'R', 'G']">
						<label class="land-input" :key="c">
							<img :src="`img/mana/${c}.svg`" class="mana-icon" />
							<input
								class="small-number-input"
								type="number"
								:id="`${c}-mana`"
								v-model.number="lands[c]"
								min="0"
							/>
						</label>
					</template>
					{{totalLands}} basic lands for a total of {{deck.length + totalLands}} cards
				</span>
			</div>
			<card-pool
				:cards="deck"
				:language="language"
				:click="deckToSideboard"
				ref="deckDisplay"
				group="deck"
				@dragover.native="allowBoosterCardDrop($event)"
				@drop.native="dropBoosterCard($event)"
			>
				<template v-slot:empty>
					<h3>Your deck is currently empty!</h3>
					<p>Click on your cards to add them to your deck.</p>
				</template>
			</card-pool>
		</div>
		<div
			v-show="(sideboard != undefined && sideboard.length > 0) || (drafting && draftingState !== DraftState.Watching) || draftingState == DraftState.Brewing"
			class="container"
		>
			<div class="controls">
				<h2>Sideboard ({{sideboard.length}})</h2>
			</div>
			<card-pool
				:cards="sideboard"
				:language="language"
				:click="sideboardToDeck"
				ref="sideboardDisplay"
				group="deck"
				@dragover.native="allowBoosterCardDrop($event)"
				@drop.native="dropBoosterCard($event, {toSideboard: true})"
			>
				<template v-slot:empty>
					<h3>Your sideboard is currently empty!</h3>
					<p>Click on cards in your deck to sideboard them.</p>
				</template>
			</card-pool>
		</div>

		<div class="welcome" v-if="draftingState === undefined">
			<h1>Welcome to MTGADraft!</h1>
			<p
				class="important"
			>Draft with other players and export your resulting deck to Magic: The Gathering Arena to play with them, in pod!</p>
			<div class="welcome-cols">
				<div class="welcome-col">
					<div class="container" v-if="userID !== sessionOwner && sessionOwner in userByID">
						<div class="controls">
							<h2>Wait for {{ userByID[sessionOwner].userName }}</h2>
						</div>
						<div class="welcome-section">
							{{ userByID[sessionOwner].userName }} is the session owner
							<i
								class="fas fa-crown subtle-gold"
							></i>
							. Wait for them to select the options and launch a game!
							<br />You can still customize your personal options on top of the page.
						</div>
					</div>
					<div class="container" v-else>
						<div class="controls">
							<h2>Basic setup</h2>
						</div>
						<div class="welcome-section">
							One player takes the role of owner of the session (designated with
							<i
								class="fas fa-crown subtle-gold"
							></i>
							).
							<ol>
								<li>Session owner chooses an arbitrary Session ID.</li>
								<li>
									Other players join the session by entering its ID or by following the
									<a
										@click="sessionURLToClipboard"
									>
										Session Link
										<i class="fas fa-share-square"></i>
									</a>
									.
								</li>
								<li>
									Owner sets the desired options. (Take a look at
									<a
										@click="displayedModal = 'sessionOptions'"
									>all of them</a>
									.)
								</li>
								<li>
									Once everyone is ready (use the ready check
									<i class="fas fa-user-check"></i>
									to make sure!), session owner launches the desired game mode.
								</li>
							</ol>
						</div>
					</div>
					<div class="container">
						<div class="controls">
							<h2>Collection Import</h2>
						</div>
						<div class="welcome-section">
							Each player can import their MTGA collection to restrict the card pool to cards already owned by everyone. (Session owner can bypass this
							feature by enabling "Ignore Collections"):
							<ol>
								<li>
									Enable Detailed logs in game, the toggle can be found in Options > View Account > Detailed Logs (Plugin Support), importing your
									collection won't work without this activated.
								</li>
								<li>
									<a onclick="document.querySelector('#file-input').click()">Upload your MTGA logs</a>
									located at
									<tt
										class="clickable"
										@click="logPathToClipboard"
										v-tooltip="'Copy path to clipboard'"
									>C:\Users\%username%\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log</tt>
									(note that
									<a
										href="https://support.microsoft.com/en-us/help/14201/windows-show-hidden-files"
										target="_blank"
									>
										AppData is hidden by default
										<i class="fas fa-external-link-alt"></i>
									</a>
									).
								</li>
							</ol>
						</div>
					</div>
				</div>
				<div class="welcome-col">
					<div class="container">
						<div class="controls">
							<h2>News</h2>
						</div>
						<div class="welcome-section">
							<em>16/07/2020</em>
							<p>Jumpstart is now available!</p>
						</div>
					</div>
					<div class="container">
						<div class="controls">
							<h2>Help</h2>
						</div>
						<div class="welcome-section">
							Visit the
							<a @click="displayedModal = 'help'">FAQ / Help</a>
							section.
							<br />For any question/bug report/feature you can e-mail at
							<a
								href="mailto:mtgadraft@gmail.com"
							>mtgadraft@gmail.com</a>
							, or join the
							<a href="https://discord.gg/KYKzx9m">MTGADraft Discord</a>
							.
						</div>
					</div>
				</div>
			</div>
		</div>

		<modal v-if="displayedModal === 'help'" @close="displayedModal = ''">
			<h2 slot="header">Help</h2>
			<div slot="body">
				<h2>FAQ</h2>
				<div>
					<strong>Can we play cube?</strong>
					<p>
						Yes! You can import custom list of cards in text format in the options.
						<a
							href="cubeformat.html"
							target="_blank"
						>More informations here</a>
						.
					</p>
					<strong>Will MTGADraft support cards from outside Arena?</strong>
					<p>Probably not. MTGADraft was designed from the start with Arena in mind and supporting decades of card brings a lot of complexity.</p>
				</div>
				<h2>Options Description</h2>
				<div class="help-options">
					<div style="width: 50%;">
						<strong>Session options</strong>
						(Only accessible to the session owner, shared by everyone in your session)
						<ul>
							<li>
								<span class="option-name">Ignore Collections</span>
								: Draft with all cards of the selected set(s), ignoring player collections and preferences.
							</li>
							<li>
								<span class="option-name">Set(s)</span>
								: Select one or multiple sets to draft using only with cards from these sets.
							</li>
							<li>
								<span class="option-name">Bots</span>
								: Adds virtual players to your draft. They are
								<strong>pretty dumb</strong>
								, but they are doing their best :(
							</li>
							<li>
								<span class="option-name">Pick Timer</span>
								: Maximum time in seconds allowed to pick a card in each booster. 0 means the timer is disabled.
							</li>
						</ul>Click on
						<span @click="displayedModal = 'sessionOptions'" class="clickable">
							More
							<i class="fa-bars fa"></i>
						</span>
						for some additional options:
						<ul>
							<li>
								<span class="option-name">Public</span>
								: Flags your session as public. It will appear in the "Public Sessions" menu so anyone can directly join.
							</li>
							<li>
								<span class="option-name">Color Balance</span>
								: If set, the system will attempt to smooth out the color distribution in each pack, as opposed to being completely random. (Also affects
								sealed and cube)
							</li>
							<li>
								<span class="option-name">Custom card list</span>
								: Submit a custom card list (one English card name by line) to draft your own cube. (Collections are ignored in this mode)
								<a
									href="cubeformat.html"
									target="_blank"
								>More information here</a>
							</li>
							<li>
								<span class="option-name">Foil</span>
								: If enabled, each pack will have a chance to contain a 'foil' card of any rarity in place of one common.
							</li>
						</ul>
					</div>
					<div style="width: 50%;">
						<strong>Personal options</strong>
						<ul>
							<li>
								<span class="option-name">Language</span>
								: Adjusts the display language of cards. (Only affects cards)
							</li>
							<li>
								<span class="option-name">Restrict to Collection</span>
								: If unchecked, your collection will not limit the cards available in the selected sets. If every players unchecks this, you will draft
								using every cards. (Ignored if "Ignore Collections" is enabled in the session, or when using a Custom Card List)
							</li>
							<li>
								<span class="option-name">Pick on Double Click</span>
								: Allows you to double click on booster cards during draft to pick without having to confirm.
							</li>
							<li>
								<span class="option-name">Notifications</span>
								: If enabled, you will be notified when a draft is launched.
							</li>
							<li>
								<span class="option-name">Session ID</span>
								: A unique identifier for your session, you can use any name, just make sure to use the same as your friends to play with them!
							</li>
						</ul>
					</div>
				</div>
			</div>
		</modal>
		<modal v-if="displayedModal === 'draftLog' && draftLog" @close="displayedModal = ''">
			<h2 slot="header">Draft Log</h2>
			<draft-log slot="body" :draftlog="draftLog" :language="language"></draft-log>
		</modal>
		<modal v-if="displayedModal === 'collection'" @close="displayedModal = ''">
			<h2 slot="header">Collection Statistics</h2>
			<collection slot="body" :collection="collection" :language="language"></collection>
		</modal>
		<modal v-if="displayedModal === 'sessionOptions'" @close="displayedModal = ''">
			<h2 slot="header">Additional Session Options</h2>
			<div slot="body" class="session-options-container" :class="{disabled: userID != sessionOwner}">
				<div class="option-column">
					<div
						class="line"
						v-tooltip.left="{classes: 'option-tooltip', content: '<p>Share this session ID with everyone.</p>'}"
					>
						<label for="is-public">Public</label>
						<div class="right">
							<input type="checkbox" v-model="isPublic" id="is-public" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{classes: 'option-tooltip', content: '<p>Is the session owner participating in?</p>'}"
					>
						<label for="is-owner-player">Session owner is playing</label>
						<div class="right">
							<input type="checkbox" v-model="ownerIsPlayer" id="is-owner-player" />
						</div>
					</div>
					<div class="line">
						<label for="max-players">Maximum Players</label>
						<div class="right">
							<input
								class="small-number-input"
								type="number"
								id="max-players"
								min="1"
								max="16"
								step="1"
								v-model.number="maxPlayers"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{classes: 'option-tooltip', content: '<p>If set, the system will attempt to smooth out the color distribution in each pack, as opposed to being completely random.</p>'}"
					>
						<label for="color-balance">Color Balance</label>
						<div class="right">
							<input type="checkbox" v-model="colorBalance" id="color-balance" />
						</div>
					</div>
					<div
						class="line"
						v-bind:class="{ disabled: useCustomCardList }"
						v-tooltip.left="{classes: 'option-tooltip', content: '<p>If enabled (default) Rares can be promoted to a Mythic at a 1/8 rate.</p><p>Disabled for Custom Card Lists.</p>'}"
					>
						<label for="mythic-promotion">Rare promotion to Mythic</label>
						<div class="right">
							<input type="checkbox" v-model="mythicPromotion" id="mythic-promotion" />
						</div>
					</div>
					<div
						class="option-section"
						v-bind:class="{ disabled: useCustomCardList }"
						v-tooltip.left="{classes: 'option-tooltip', content: '<p>Lets you customize the exact content of your boosters.</p><p>Notes:<ul><li>Zero is a valid value (useful for Pauper or Artisan for example).</li><li>A land slot will be automatically added for some sets.</li><li>Unused when drawing from a custom card list: See the advanced card list syntax to mimic it.</li></ul></p>'}"
					>
						<div class="option-column-title">Booster Content</div>
						<div class="line" v-for="r in ['common', 'uncommon', 'rare']" :key="r">
							<label :for="'booster-content-'+r" class="capitalized">{{r}}s</label>
							<div class="right">
								<input
									class="small-number-input"
									type="number"
									:id="'booster-content-'+r"
									min="0"
									max="16"
									step="1"
									v-model.number="boosterContent[r]"
								/>
							</div>
						</div>
					</div>
					<div
						class="option-section"
						v-bind:class="{ disabled: useCustomCardList }"
						v-tooltip.left="{classes: 'option-tooltip', content: '<p>Sets a duplicate limit for each rarity across the entire draft. Only used if no player collection is used to limit the card pool. Default values attempt to mimic a real booster box.</p>'}"
					>
						<div class="option-column-title">Max. duplicate copies</div>
						<div class="line" v-for="r in ['common', 'uncommon', 'rare', 'mythic']" :key="r">
							<label :for="'max-duplicates-'+r" class="capitalized">{{r}}s</label>
							<div class="right">
								<input
									class="small-number-input"
									type="number"
									:id="'max-duplicates-'+r"
									min="1"
									max="16"
									step="1"
									v-model.number="maxDuplicates[r]"
								/>
							</div>
						</div>
					</div>
					<div
						class="line"
						v-bind:class="{ disabled: useCustomCardList }"
						v-tooltip.left="{classes: 'option-tooltip', content: '<p>If enabled, each pack will have a chance to contain a \'foil\' card of any rarity in place of one common.</p>'}"
					>
						<label for="option-foil">Foil</label>
						<div class="right">
							<input type="checkbox" v-model="foil" id="option-foil" />
						</div>
					</div>
					<div class="option-section">
						<div class="option-column-title">Custom Card List</div>
						<div
							class="line"
							v-tooltip.left="{classes: 'option-tooltip', content: '<p>Use a custom card list (aka Cube).</p>'}"
						>
							<label for="use-custom-card-list">Use a Custom Card List</label>
							<div class="right">
								<input type="checkbox" v-model="useCustomCardList" id="use-custom-card-list" />
							</div>
						</div>
						<div v-bind:class="{ disabled: !useCustomCardList }">
							<div
								class="line"
								v-tooltip.left="{classes: 'option-tooltip', content: '<p>Upload any card list from your computer.</p><p>You can use services like Cube Cobra to find cubes or craft your own list and export it to .txt.</p>'}"
							>
								<label for="card-list-input">Custom Card List</label>
								<div class="right">
									<input
										type="file"
										id="card-list-input"
										@change="uploadFile($event, parseCustomCardList)"
										style="display: none;"
										accept=".txt"
									/>
									<button onclick="document.querySelector('#card-list-input').click()">Upload</button>
									<a href="cubeformat.html" target="_blank">
										<i class="fas fa-external-link-alt"></i>
										Format
									</a>
								</div>
							</div>
							<!-- Loading cubes this way is wasteful, but easier to manage. -->
							<div
								class="line"
								v-tooltip.left="{classes: 'option-tooltip', content: '<p>Load a pre-built cube.</p>'}"
							>
								<label for="featured-cubes">
									<select name="featured-cubes" v-model="selectedCube">
										<option v-for="cube in cubeLists" :key="cube.filename" :value="cube">{{cube.name}}</option>
									</select>
								</label>
								<div class="right">
									<button
										@click="fetchFile(selectedCube.filename, parseCustomCardList, {name: selectedCube.name})"
									>Load Cube</button>
								</div>
							</div>
							<div v-if="customCardList.length > 0" style="text-align: center;">
								<i class="fas fa-check green" v-tooltip="'Card list successfuly loaded!'"></i>
								<span
									v-if="customCardList.name"
								>Loaded '{{customCardList.name}}' ({{customCardList.length}} cards).</span>
								<span v-else>Loaded list with {{customCardList.length}} cards.</span>
								<button @click="displayedModal = 'cardList'">
									<i class="fas fa-file-alt"></i>
									Review.
								</button>
							</div>
							<div class="option-info">
								You can find more cubes or craft your own on
								<a
									href="https://www.cubetutor.com/"
									target="_blank"
								>Cube Tutor</a>
								or
								<a href="https://cubecobra.com/" target="_blank">Cube Cobra</a>
								<br />Customize your list even further by using
								<a
									href="cubeformat.html"
									target="_blank"
								>card slots</a>
							</div>
						</div>
					</div>
				</div>
				<div class="option-column">
					<h4>Draft Specific Options</h4>
					<div
						class="line"
						v-tooltip.right="{classes: 'option-tooltip', content: '<p>Draft: Boosters per Player; default is 3.</p>'}"
					>
						<label for="boosters-per-player">Boosters per Player</label>
						<div class="right">
							<input
								type="number"
								id="boosters-per-player"
								class="small-number-input"
								min="1"
								max="25"
								step="1"
								v-model.number="boostersPerPlayer"
							/>
						</div>
					</div>
					<div class="option-section" v-bind:class="{ disabled: useCustomCardList }">
						<div class="option-column-title">Individual Booster Set</div>
						<div
							class="line"
							v-tooltip.right="{classes: 'option-tooltip', content: '<p>Controls how the boosters will be distributed.</p><ul><li>Regular: Each player will receive boosters from the same sets and will open them in the same order.</li><li>Shuffle Player Boosters: Each players will receive boosters from the same sets but will open them in a random order.</li><li>Shuffle Booster Pool: Boosters will be randomly handed to each player.</li></ul>'}"
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
							v-tooltip.right="{classes: 'option-tooltip', content: '<p>Specify the set of each booster individually. Useful for classic Chaos Draft for example.</p><p>Note: Collections are ignored for each booster with any other value than (Default).</p>'}"
						>
							<div v-for="(value, index) in customBoosters" class="line" :key="index">
								<label for="customized-booster">Booster #{{index+1}}</label>
								<select class="right" v-model="customBoosters[index]">
									<option value>(Default)</option>
									<option v-for="code in sets" :value="code" :key="code">{{setsInfos[code].fullName}}</option>
								</select>
							</div>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{classes: 'option-tooltip', content: '<p>In addition to picking a card each round, you will also remove this number of cards from the draft.</p><p>This is typically used in conjunction with a higher count of boosters per player for drafting with 2 to 4 players. Burn or Glimpse Draft is generally 9 boosters per players and 2 burned cards per round.</p><p>Default is 0.</p>'}"
					>
						<label for="burned-cards-per-round">Burned cards per round</label>
						<div class="right">
							<input
								type="number"
								id="burned-cards-per-round"
								class="small-number-input"
								min="0"
								max="24"
								step="1"
								v-model.number="burnedCardsPerRound"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{classes: 'option-tooltip', content: '<p>Controls who is going to receive the draft logs.</p><p>\'Owner only, delayed\': Owner will choose when to reveal the draft log. Useful for tournaments.</p>'}"
					>
						<label for="draft-log-recipients">Send draft logs to</label>
						<div class="right">
							<select v-model="draftLogRecipients" id="draft-log-recipients">
								<option value="everyone">Everyone</option>
								<option value="owner">Owner only</option>
								<option value="delayed">Owner only, delayed</option>
								<option value="none">No-one</option>
							</select>
						</div>
					</div>
				</div>
			</div>
		</modal>
		<modal v-if="displayedModal === 'bracket'" @close="displayedModal = ''">
			<h2 slot="header">Bracket</h2>
			<bracket
				slot="body"
				:bracket="bracket"
				:editable="userID === sessionOwner || !bracketLocked"
				:locked="bracketLocked"
				:fullcontrol="userID === sessionOwner"
				@updated="updateBracket"
				@generate="generateBracket"
				@generate-swiss="generateSwissBracket"
				@lock="lockBracket"
			></bracket>
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
					<a href="http://senryoku.github.io/" target="_blank">Senryoku</a>
					(contact in French or English:
					<a href="mailto:mtgadraft@gmail.com">mtgadraft@gmail.com</a>
					) using
					<a href="https://scryfall.com/">Scryfall</a>
					card data and images and loads of open source software.
				</p>
				<p>
					MTGADraft Discord:
					<a href="https://discord.gg/KYKzx9m">https://discord.gg/KYKzx9m</a>
				</p>
				<h3>Patch Notes</h3>
				<patch-notes></patch-notes>
			</div>
		</modal>
		<modal v-if="displayedModal === 'donation'" @close="displayedModal = ''">
			<h2 slot="header">Support me</h2>
			<div slot="body">
				<div style="max-width: 50vw;">
					<p>Hello there!</p>
					<p>
						If you're here I guess you've been enjoing the site! I plan on continuously maintaining it by adding support for new cards appearing on MTGA and
						improving it, both with your and my ideas. If that sounds like a good use of my time and you want to help me stay motivated and high on cafeine, you
						can donate here
						<em>via</em>
						PayPal:
					</p>
					<form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank">
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
					<p>Thank you very much!</p>
					<p>Sen</p>
				</div>
			</div>
		</modal>
		<footer>
			<span>
				<input type="file" id="log-input" @change="openLog" style="display: none;" accept=".txt" />
				<a
					onclick="document.querySelector('#log-input').click()"
					v-tooltip="'Open a saved draft log.'"
				>Open Draft Log</a>
			</span>
			<span>-</span>
			<span @click="displayedModal = 'About'" class="clickable">
				<a>About</a>
			</span>
			<span>
				Made by
				<a href="http://senryoku.github.io/" target="_blank">Senryoku</a>
			</span>
			<span>
				<a @click="displayedModal = 'donation'">
					Buy me a Coffee
					<i class="fa fa-mug-hot" aria-hidden="true"></i>
				</a>
			</span>
			<span>
				<a href="mailto:mtgadraft@gmail.com">Contact</a>
			</span>
			<span>
				Get
				<a href="https://magic.wizards.com/fr/mtgarena" target="_blank">Magic: The Gathering Arena</a>
			</span>
		</footer>
		<div
			class="disconnected-icon"
			v-if="socket && socket.disconnected"
			v-tooltip="'You are disconnected from the server, some functionnalities won\'t be available until the connection is re-established.'"
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
<style>
@media only screen and (min-width: 800px) {
	body {
		overflow-x: hidden;
	}
}

footer {
	position: absolute;
	bottom: 0;
	right: 0;
	left: 0;
	padding: 1em;
	background: linear-gradient(to top, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0));
	display: flex;
	justify-content: flex-end;
}

footer span {
	margin-left: 2em;
}

.disconnected-icon {
	position: fixed;
	right: 2em;
	bottom: 3em;
	padding: 1em;
	background-color: darkred;
	border-radius: 0.5em;
	z-index: 999;
	box-shadow: 0 0 10px black;
	font-weight: bold;
}

.custom-swal-popup,
.custom-swal-title,
.custom-swal-content {
	color: #ddd !important;
	background: #282828 !important;
}

#main-container {
	padding: 1em;
	padding-top: 0.5em;
}

/* Inputs */

#main-container select,
#main-container option,
#main-container input[type="text"],
#main-container input[type="password"],
#main-container input[type="button"],
#main-container input[type="number"],
#main-container button,
.check-button + label {
	color: #ddd;
	background-color: #555;
	border-radius: 4px;
	border: 1px solid #888;
	padding: 5px 5px;
	margin: 0.25em;
}

#main-container input[type="button"],
#main-container button {
	box-shadow: inset 2px 2px 8px -3px #888, inset -2px -2px 8px -3px #000;
}

#main-container input[type="button"]:active,
#main-container button:active {
	box-shadow: inset 2px 2px 8px -3px #000, inset -2px -2px 8px -3px #888;
	transform: translateY(2px);
}

#main-container .button,
#main-container button,
#main-container input[type="button"],
#main-container input[type="submit"],
#main-container input[type="reset"],
#main-container input[type="button"],
#main-container .check-button + label {
	display: inline-block;
	height: 28px;
	padding: 0 15px;
	text-align: center;
	font-size: 11px;
	font-weight: 600;
	line-height: 28px;
	letter-spacing: 0.1rem;
	text-transform: uppercase;
	text-decoration: none;
	white-space: nowrap;
	background-color: transparent;
	cursor: pointer;
	box-sizing: border-box;
}

#main-container button:disabled {
	color: #555;
	cursor: auto;
}

#main-container .button:hover:enabled,
#main-container button:hover:enabled,
#main-container input[type="submit"]:hover:enabled,
#main-container input[type="reset"]:hover:enabled,
#main-container input[type="button"]:hover:enabled,
.check-button:hover:enabled + label,
#main-container .button:focus,
#main-container button:focus,
#main-container input[type="submit"]:focus,
#main-container input[type="reset"]:focus,
#main-container input[type="button"]:focus,
.check-button + label:focus {
	color: #fff;
	border-color: #bbb;
	outline: 0;
}

#main-container button.confirm {
	background-color: #3085d6;
	text-shadow: 0 0 2px black;
}

#main-container button.confirm:hover {
	background-color: #2972b6;
}

#main-container button.cancel {
	background-color: #d33;
	text-shadow: 0 0 2px black;
}

#main-container button.cancel:hover {
	background-color: #c22;
}

.check-button-container {
	display: inline-block;
	position: relative;
	margin: 0;
	padding: 0;
}

.check-button {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	-webkit-appearance: none;
	-moz-appearance: none;
	-ms-appearance: none;
	appearance: none;
	border: none;
	padding: 0;
	border-radius: 0;
	vertical-align: middle;
	background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg version='1.1' id='Layer_1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' x='0px' y='0px' width='512px' height='512px' viewBox='0 0 32 32' style='enable-background:new 0 0 512 512;' xml:space='preserve'%3e%3cpath d='M448,71.9c-17.3-13.4-41.5-9.3-54.1,9.1L214,344.2l-99.1-107.3c-14.6-16.6-39.1-17.4-54.7-1.8 c-15.6,15.5-16.4,41.6-1.7,58.1c0,0,120.4,133.6,137.7,147c17.3,13.4,41.5,9.3,54.1-9.1l206.3-301.7 C469.2,110.9,465.3,85.2,448,71.9z'/%3e%3c/svg%3e");
	background-repeat: no-repeat;
	background-size: cover;
	background-color: transparent;
	background-position: -10em -10em;
	transition: 0.3s ease;
	outline: 0;
}

.check-button:active + label {
	background-color: #888;
}

.check-button:checked + label {
	box-shadow: 0 0 2px 1px green;
}

.check-button:checked:after {
	font-family: "Font Awesome 5 Free";
	content: "\f00c";
	z-index: 3;
	font-weight: 900;
	position: absolute;
	top: 0;
	right: 0;
	font-size: 2em;
	color: green;
}

.multiselect {
	display: inline-block;
	vertical-align: baseline;
	width: 16.5em;
	min-height: auto;
	--invertedness: 100%;
}

.multiselect__tags,
.multiselect__single,
.multiselect__element,
.multiselect__content-wrapper {
	color: #ddd;
	background: #555;
}

.multiselect__tags {
	border-radius: 4px;
	border: 1px solid #888;
	height: 28px;
	min-height: auto;
	padding: 5px 5px;
}

.multiselect__option {
	font-size: 14px;
	min-height: auto;
	line-height: inherit;
	padding: 5px;
}

.multiselect__option--selected {
	--invertedness: 0%;
}

.multiselect__option::after {
	line-height: 36px;
	font-size: 10px;
	padding-left: inherit;
	font-family: "Font Awesome 5 Free";
}

.multiselect__tag {
	background: #333;
}

.multiselect__placeholder {
	padding-top: 0;
	padding-bottom: 0;
	margin-bottom: 0;
}

.multiselect--active .multiselect__placeholder {
	display: inline-block;
}

.multiselect__single {
	margin-bottom: 0;
	line-height: inherit;
	min-height: auto;
	width: auto;
	font-size: inherit;
}

.multiselect__single_nooverflow {
	overflow: hidden;
	max-height: 1em;
	max-width: 12em;
}

.multiselect__single_nooverflow .set-icon {
	margin-right: 0.2em;
}

.multiselect__select {
	top: 40%;
	bottom: 60%;
	right: 0;
	height: auto;
}

.multiselect__select::before {
	top: 2.5px;
}

.set-icon {
	display: inline-block;
	height: 1em;
	vertical-align: baseline;
	filter: invert(var(--invertedness));
}

.padded-icon {
	min-width: 3em;
}

.mana-icon {
	display: inline-block;
	height: 1em;
	vertical-align: middle;
}

.land-input {
	white-space: nowrap;
}

.multiselect__tag-icon {
	color: #bf5d5d;
}

#session-more-options {
	position: absolute;
	top: 100%;
	right: 0;
	background-color: #333;
	border-radius: 4px;
	border: 1px solid #888;
	width: 20em;
	padding: 1em;
}

.session-options-container {
	display: flex;
}

.session-options-container h4 {
	margin: 0.25em;
}

/**** checkbox-button ****/

.checkbox-button {
	position: relative;
	display: inline-block;
	margin: 0.5em;
	padding: 0.25em;
	border-radius: 0.25em;
	background-color: #666;
	cursor: pointer;

	height: 25px;
	box-shadow: inset 1px 1px 4px 0 #bbb, inset -1px -1px 4px 0 #222;
}

.checkbox-button:hover {
	background-color: #888;
}

.checkbox-button[data-checked="true"] {
	box-shadow: 0px 0px 3px 2px #ccc, inset 1px 1px 4px 0 #222, inset -1px -1px 4px 0 #bbb;
}

.checkbox-button label {
	line-height: 25px;
}

/* Hide default checkbox */
.checkbox-button input {
	position: absolute;
	opacity: 0;
	cursor: pointer;
	height: 0;
	width: 0;
}

/* ** Session Options ** */

.option-column {
	width: 22.5vw;
	margin: 0.5em;
}

.option-tooltip > .tooltip-inner {
	max-width: 20vw;
}
.option-tooltip > .tooltip-inner > p {
	margin-top: 0.5em;
	margin-bottom: 0.5em;
}

.option-column .line {
	display: flex;
	align-items: center;
}

.option-column-title {
	margin: auto;
	padding: 0.25em;
	text-align: center;
	font-variant: all-small-caps;
}

.option-column .line > label {
	display: inline-block;
	width: 15rem;
	text-align: right;
}

.option-column .line .right {
	display: inline-block;
	width: 15rem;
}

.option-section {
	background-color: rgba(255, 255, 255, 0.05);
	border-radius: 0.25em;
	margin-bottom: 0.25em;
}

.option-info {
	text-align: center;
	font-size: 0.8em;
	padding: 0.5em;
}

/* ** Welcome ** */

.welcome {
	font-size: 1.1rem;
	padding: 1.5em;
	padding-top: 0;
}

.welcome .important {
	font-size: 1.4rem;
}

.welcome-cols {
	width: 100%;
	display: flex;
	justify-content: space-between;
}

@media (orientation: portrait) {
	.welcome-cols {
		flex-direction: column;
	}

	.welcome-col {
		width: 100%;
	}
}

@media (orientation: landscape) {
	.welcome-cols {
		flex-direction: row;
	}

	.welcome-col {
		width: 48%;
	}
}

.welcome-section {
	padding: 0.5em;
	background-color: #282828d0;
	border-radius: 10px;
	box-shadow: inset 0 0 8px #383838;
}

/* ** Help Modal ** */

.help-options {
	display: flex;
}

.help-options ul {
	list-style-type: none;
	padding-left: 1em;
	margin-right: 1em;
}

.help-options ul li {
	padding: 0.2em;
	padding-left: 0.5em;
}

.help-options ul li:nth-child(even) {
	background: rgba(0, 0, 0, 0.12);
}

.help-options ul li:nth-child(odd) {
	background: rgba(255, 255, 255, 0.03);
}

.option-name {
	font-variant: small-caps;
}

.generic-container {
	position: relative;
}

.container {
	margin-top: 1em;
}

.disable-warning {
	position: absolute;
	top: 50%;
	left: 50%;
	z-index: 10;
	transform: translate(-50%, -50%);
	font-variant: small-caps;
	white-space: nowrap;
	font-size: 1em;
	text-shadow: 0px 0px 10px black;
}

#draft-in-progress {
	position: absolute;
	top: 50%;
	left: 50%;
	z-index: 10;
	white-space: nowrap;
	transform: translate(-50%, -50%);
	font-variant: small-caps;
	font-size: 1.5em;
	text-shadow: 0px 0px 10px black;
}

.draft-watching-state {
	text-align: center;
}

.draft-log-live-title h2 {
	display: inline-block;
	margin: 0;
	margin-left: 1em;
	margin-right: 1em;
}

.draft-log-live-instructions {
	text-align: center;
}

button.stop {
	background-color: darkred;
}

.main-controls {
	background-color: #333;
	padding: 0.25em;
	margin: 0.25em;
	border-radius: 0.25em;
}

.main-controls input[type="checkbox"] {
	margin-right: 0;
}

#session-controls .far,
#session-controls .fas {
	margin-left: 1px;
	margin-right: 1px;
}

#limited-controls,
#view-controls {
	display: flex;
	justify-content: space-between;
	flex-wrap: wrap;
	align-items: baseline;
}

#limited-controls > * {
	margin-right: 4px;
}

#limited-controls > *:last-child {
	margin-right: inherit;
}

#session-id {
	width: 12em;
}

.small-number-input {
	width: 3em;
}

.session-players {
	background: #181818;
	padding: 0.5em;
	display: flex;
	justify-content: space-between;
	align-items: baseline;
}

ul.player-list {
	display: inline-block;
	list-style: none;
	margin: 0;
	flex-grow: 2;
	padding-left: 1.5em;
}

.player-list li {
	position: relative;
	display: inline-flex;
	justify-content: space-between;
	align-items: baseline;
	padding: 0.5em;
	min-width: 6em;
	margin-right: 1em;
	background: #282828;
	border-radius: 5px;
	transition: all 0.2s;
}

.player-list > li.draggable:hover {
	translate: 0 -3px;
	box-shadow: 3px 3px 5px 0 rgba(0, 0, 0, 0.75);
}

.player-name {
	max-width: 7.5em;
	overflow: hidden;
	white-space: nowrap;
	mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 6em, transparent);
}

.move-player {
	color: #555;
	/*font-size: 0.8em;*/
}

.move-player-left {
	position: absolute;
	left: -0.3em;
}

.move-player-right {
	position: absolute;
	right: -0.3em;
}

.draggable {
	cursor: grab;
}

.passing-order-left {
	position: absolute;
	left: -0.9em;
	top: 0.6em;
}

.passing-order-right {
	position: absolute;
	right: -0.97em;
	top: 0.6em;
}

.chat {
	display: inline-block;
	position: relative;
	white-space: nowrap;
}

.chat > * {
	display: inline-block;
}

.chat input {
	width: 14.5em;
}

.chat-bubble {
	pointer-events: none;
	position: absolute;
	left: calc(1em);
	top: calc(100% + 0.5em);
	background: #fff;
	color: black;
	border: solid 2px #000;
	padding: 0.25em;
	padding-left: 0.5em;
	padding-right: 0.5em;
	border-radius: 0.2em;
	opacity: 0;
	min-width: 100%;
	max-width: 50vw;
	max-height: 60vh;
	z-index: 2;

	transition: opacity 0.2s;
}

.chat-bubble:after {
	content: "";
	position: absolute;
	top: 0;
	left: 1em;
	width: 0;
	height: 0;
	border: 14px solid transparent;
	border-bottom-color: #fff;
	border-top: 0;
	border-left: 0;
	margin-left: -7px;
	margin-top: -14px;
}

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
	list-style: none;
	margin: 0;
	padding: 0;
	width: 100%;
	max-height: 60vh;
	overflow-y: scroll;
	white-space: initial;
}

.chat-history li {
	display: inline-flex;
	align-items: stretch;
	background: white;
	border-radius: 0.25em;
	width: calc(100% - 2 * 0.2em);
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
	word-wrap: anywhere;
}

.chat-history li .chat-message {
	border-radius: 0 0.25em 0.25em 0;
	background: white;
	flex-grow: 2;
	word-wrap: anywhere;
}

.status-icons {
	display: inline-flex;
}

.status-icons i {
	margin-left: 0.5em;
	font-size: 14px;
}

.slide-fade-right-enter-active,
.slide-fade-right-leave-active,
.slide-fade-left-enter-active,
.slide-fade-left-leave-active {
	pointer-events: none; /* Avoid picking cards during transition */
	transition: all 0.3s ease-in;
}
.slide-fade-left-enter,
.slide-fade-right-leave-to {
	transform: translateX(50px);
	opacity: 0;
}

.slide-fade-right-enter,
.slide-fade-left-leave-to {
	transform: translateX(-50px);
	opacity: 0;
}

.slide-fade-right-leave-active .selected,
.slide-fade-left-leave-active .selected {
	transition: all 0.3s ease-in, opacity 0.2s ease-in !important;
}
.slide-fade-right-leave-to .selected,
.slide-fade-left-leave-to .selected {
	transform: translateY(250px);
	z-index: 2;
	opacity: 0;
}

.pick-waiting {
	padding: 2em;
}

#chrono {
	padding: 0.2em;
	padding-left: 0.5em;
	padding-right: 0.5em;
}

.controls {
	display: flex;
	align-items: center;
}

.controls > * {
	margin: 0 !important;
	margin-right: 1.5em !important;
}

.controls h2 {
	display: inline-block;
	margin: 0;
	font-variant: small-caps;
	font-size: 28px;
}

.more-option {
	margin: 0.5em;
}

.more-option .fas {
	margin-left: 0.5em;
}

.card-container {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	background-color: #282828;
	border-radius: 10px;
	box-shadow: inset 0 0 8px #383838;
}

.selected {
	-webkit-box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
	-moz-box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
	box-shadow: 0px 0px 20px 1px rgba(0, 115, 2, 1);
}

.selected-high {
	-webkit-box-shadow: 0px 0px 20px 4px rgba(0, 200, 2, 1);
	-moz-box-shadow: 0px 0px 20px 4px rgba(0, 200, 2, 1);
	box-shadow: 0px 0px 20px 4px rgba(0, 200, 2, 1);
}

.burned {
	-webkit-box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
	-moz-box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
	box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
}

.card-columns {
	justify-content: flex-start;
	position: relative;
	padding: 0.75em;
	min-height: 283.33px;
}

.card-column {
	display: flex;
	flex-direction: column;
	padding-bottom: 275px;
	margin-right: 0.75em;
	margin-bottom: 0.5em;
}

.card-column > div,
.card-column > div {
	height: 25px;
	margin: 0;
	/*overflow: hidden*/
}

.card-column > div:hover,
.card-column > div:hover {
	z-index: 999;
	overflow: visible;
}

.card-column > div:last-child,
.card-column > div:last-child {
	overflow: visible;
}

/* Only use this hover rule on desktop (hover capabilities and a mouse or equivalent device) */
@media (hover: hover) and (pointer: fine) {
	/* No :hover outside of the div bounds, will let the card disappear when the mouse moves outside of it */
	.card-column > div > div {
		pointer-events: none;
	}
	/* Except if its fully visible */
	.card-column > div:last-child > div {
		pointer-events: auto;
	}
}

.drag-column {
	min-width: 200px;
	background-color: rgba(0, 0, 0, 0.1);
}

/* ------------------------------------------------ */
/*             Absolute Center Spinner              */

.spinner {
	display: inline-block;
	width: 2em;
	height: 2em;
	margin-left: 1.5em;
}

.spinner:not(:required):after {
	--spinner-color: rgba(255, 255, 255, 0.75);
	content: "";
	display: inline-block;
	font-size: 8px;
	width: 1em;
	height: 1em;
	-webkit-animation: spinner 1500ms infinite linear;
	-moz-animation: spinner 1500ms infinite linear;
	-ms-animation: spinner 1500ms infinite linear;
	-o-animation: spinner 1500ms infinite linear;
	animation: spinner 1500ms infinite linear;
	border-radius: 0.5em;
	-webkit-box-shadow: var(--spinner-color) 1.5em 0 0 0, var(--spinner-color) 1.1em 1.1em 0 0,
		var(--spinner-color) 0 1.5em 0 0, var(--spinner-color) -1.1em 1.1em 0 0, rgba(0, 0, 0, 0.5) -1.5em 0 0 0,
		rgba(0, 0, 0, 0.5) -1.1em -1.1em 0 0, var(--spinner-color) 0 -1.5em 0 0, var(--spinner-color) 1.1em -1.1em 0 0;
	box-shadow: var(--spinner-color) 1.5em 0 0 0, var(--spinner-color) 1.1em 1.1em 0 0, var(--spinner-color) 0 1.5em 0 0,
		var(--spinner-color) -1.1em 1.1em 0 0, var(--spinner-color) -1.5em 0 0 0, var(--spinner-color) -1.1em -1.1em 0 0,
		var(--spinner-color) 0 -1.5em 0 0, var(--spinner-color) 1.1em -1.1em 0 0;
}

.loading {
	position: fixed;
	z-index: 999;
	height: 2em;
	width: 2em;
	overflow: visible;
	margin: auto;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
}

/* Transparent Overlay */
.loading:before {
	content: "";
	display: block;
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0, 0, 0, 0.8);
}

.loading + span {
	position: fixed;
	top: calc(50vh + 2em);
	right: 0;
	left: 0;
	z-index: 1000;
	text-align: center;
}

/* :not(:required) hides these rules from IE9 and below */
.loading:not(:required) {
	/* hide "loading..." text */
	font: 0/0 a;
	color: transparent;
	text-shadow: none;
	background-color: transparent;
	border: 0;
}

.loading:not(:required):after {
	--spinner-color: rgba(255, 255, 255, 0.75);
	content: "";
	display: block;
	font-size: 10px;
	width: 1em;
	height: 1em;
	margin-top: -0.5em;
	-webkit-animation: spinner 1500ms infinite linear;
	-moz-animation: spinner 1500ms infinite linear;
	-ms-animation: spinner 1500ms infinite linear;
	-o-animation: spinner 1500ms infinite linear;
	animation: spinner 1500ms infinite linear;
	border-radius: 0.5em;
	-webkit-box-shadow: var(--spinner-color) 1.5em 0 0 0, var(--spinner-color) 1.1em 1.1em 0 0,
		var(--spinner-color) 0 1.5em 0 0, var(--spinner-color) -1.1em 1.1em 0 0, rgba(0, 0, 0, 0.5) -1.5em 0 0 0,
		rgba(0, 0, 0, 0.5) -1.1em -1.1em 0 0, var(--spinner-color) 0 -1.5em 0 0, var(--spinner-color) 1.1em -1.1em 0 0;
	box-shadow: var(--spinner-color) 1.5em 0 0 0, var(--spinner-color) 1.1em 1.1em 0 0, var(--spinner-color) 0 1.5em 0 0,
		var(--spinner-color) -1.1em 1.1em 0 0, var(--spinner-color) -1.5em 0 0 0, var(--spinner-color) -1.1em -1.1em 0 0,
		var(--spinner-color) 0 -1.5em 0 0, var(--spinner-color) 1.1em -1.1em 0 0;
}

/* Animation */

@-webkit-keyframes spinner {
	0% {
		-webkit-transform: rotate(0deg);
		-moz-transform: rotate(0deg);
		-ms-transform: rotate(0deg);
		-o-transform: rotate(0deg);
		transform: rotate(0deg);
	}
	100% {
		-webkit-transform: rotate(360deg);
		-moz-transform: rotate(360deg);
		-ms-transform: rotate(360deg);
		-o-transform: rotate(360deg);
		transform: rotate(360deg);
	}
}
@-moz-keyframes spinner {
	0% {
		-webkit-transform: rotate(0deg);
		-moz-transform: rotate(0deg);
		-ms-transform: rotate(0deg);
		-o-transform: rotate(0deg);
		transform: rotate(0deg);
	}
	100% {
		-webkit-transform: rotate(360deg);
		-moz-transform: rotate(360deg);
		-ms-transform: rotate(360deg);
		-o-transform: rotate(360deg);
		transform: rotate(360deg);
	}
}
@-o-keyframes spinner {
	0% {
		-webkit-transform: rotate(0deg);
		-moz-transform: rotate(0deg);
		-ms-transform: rotate(0deg);
		-o-transform: rotate(0deg);
		transform: rotate(0deg);
	}
	100% {
		-webkit-transform: rotate(360deg);
		-moz-transform: rotate(360deg);
		-ms-transform: rotate(360deg);
		-o-transform: rotate(360deg);
		transform: rotate(360deg);
	}
}
@keyframes spinner {
	0% {
		-webkit-transform: rotate(0deg);
		-moz-transform: rotate(0deg);
		-ms-transform: rotate(0deg);
		-o-transform: rotate(0deg);
		transform: rotate(0deg);
	}
	100% {
		-webkit-transform: rotate(360deg);
		-moz-transform: rotate(360deg);
		-ms-transform: rotate(360deg);
		-o-transform: rotate(360deg);
		transform: rotate(360deg);
	}
}

/* Collection stats */
.set-stats {
	margin: 0.5em;
}

.set-stats table {
	margin: auto;
}

.set-stats caption {
	font-size: 1.25em;
}

.set-stats tr:nth-child(odd) {
	background-color: rgba(0, 0, 0, 0.2);
}

.set-stats th,
.set-stats td {
	padding: 0.25em;
}

.set-stats td:not(:first-child) {
	text-align: center;
}

/* Animations */

.shaking {
	animation: shake 0.82s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	transform: translate3d(0, 0, 0);
	backface-visibility: hidden;
	perspective: 1000px;
}

@keyframes shake {
	10%,
	90% {
		transform: translate3d(-1px, 0, 0);
	}

	20%,
	80% {
		transform: translate3d(2px, 0, 0);
	}

	30%,
	50%,
	70% {
		transform: translate3d(-4px, 0, 0);
	}

	40%,
	60% {
		transform: translate3d(4px, 0, 0);
	}
}

.pulsing {
	animation: pulse 0.4s;
	box-shadow: 0 0 0 0 rgba(200, 0, 0, 1);
	transform: scale(1);
}

@keyframes pulse {
	0% {
		transform: scale(1.1);
		box-shadow: 0 0 0 0 rgba(200, 0, 0, 0.7);
	}

	70% {
		transform: scale(1);
		box-shadow: 0 0 0 10px rgba(200, 0, 0, 0);
	}

	100% {
		transform: scale(1);
		box-shadow: 0 0 0 0 rgba(200, 0, 0, 0);
	}
}

/************** Draft Log *******************/

.draft-log-boosters-list {
	column-count: 3;
	column-gap: 1em;
}

ul.player-table {
	display: flex;
	flex-wrap: wrap;
	list-style: none;
	--margin: 1.5em;
}

ul.player-table li {
	width: calc(24% - 2 * var(--margin) - 1em);
	max-width: calc(24% - 2 * var(--margin) - 1em);
	border: 1px solid black;
	margin: var(--margin);
	position: relative;
	padding: 0.5em;
	border-radius: 0.2em;
}

.bot {
	min-width: auto !important;
}

ul.player-table li:nth-child(1) {
	order: 1;
}
ul.player-table li:nth-child(2) {
	order: 2;
}
ul.player-table li:nth-child(3) {
	order: 3;
}
ul.player-table li:nth-child(4) {
	order: 4;
}
ul.player-table li:nth-child(5) {
	order: 8;
}
ul.player-table li:nth-child(6) {
	order: 7;
}
ul.player-table li:nth-child(7) {
	order: 6;
}
ul.player-table li:nth-child(8) {
	order: 5;
}

ul.player-table li:nth-child(1):after,
ul.player-table li:nth-child(2):after,
ul.player-table li:nth-child(3):after {
	content: "";
	height: 1px;
	background: black;
	width: calc(2 * var(--margin));
	position: absolute;
	right: calc(-2 * var(--margin));
	top: 50%;
}

ul.player-table li:nth-child(1):before,
ul.player-table li:nth-child(2):before,
ul.player-table li:nth-child(3):before {
	content: "";
	position: absolute;
	width: 0;
	height: 0;
	top: 50%;
	border-style: solid;
	border-width: 7px 0 7px 20px;
	border-color: transparent transparent transparent black;
	right: -20px;
	transform: translateY(-50%) rotate(180deg);
}

ul.player-table li:nth-child(5):after,
ul.player-table li:nth-child(6):after,
ul.player-table li:nth-child(7):after {
	content: "";
	height: 1px;
	background: black;
	width: calc(2 * var(--margin));
	position: absolute;
	left: calc(-2 * var(--margin));
	top: 50%;
}

ul.player-table li:nth-child(5):before,
ul.player-table li:nth-child(6):before,
ul.player-table li:nth-child(7):before {
	content: "";
	position: absolute;
	width: 0;
	height: 0;
	top: 50%;
	border-style: solid;
	border-width: 7px 0 7px 20px;
	border-color: transparent transparent transparent black;
	left: -20px;
	transform: translateY(-50%);
}

ul.player-table li:nth-child(8):before {
	content: "";
	position: absolute;
	width: 0;
	height: 0;
	left: 50%;
	border-style: solid;
	border-width: 7px 0 7px 20px;
	border-color: transparent transparent transparent black;
	top: -20px;
	transform: translateX(-50%) rotate(90deg);
}

ul.player-table li:nth-child(8):after {
	content: "";
	width: 1px;
	background: black;
	height: calc(2 * var(--margin));
	position: absolute;
	top: calc(-2 * var(--margin));
	left: 50%;
}

ul.player-table li:nth-child(4):before {
	content: "";
	position: absolute;
	width: 0;
	height: 0;
	left: 50%;
	border-style: solid;
	border-width: 7px 0 7px 20px;
	border-color: transparent transparent transparent black;
	bottom: -20px;
	transform: translateX(-50%) rotate(-90deg);
}

ul.player-table li:nth-child(4):after {
	content: "";
	width: 1px;
	background: black;
	height: calc(2 * var(--margin));
	position: absolute;
	bottom: calc(-2 * var(--margin));
	left: 50%;
}

/** Winston Draft **/

.winston-status {
	margin-bottom: 0.5em;
}

.winston-status h2 {
	display: inline-block;
	margin: 0 1em 0 1em;
}

.winston-piles {
	display: flex;
	justify-content: space-around;
	position: relative;
	padding: 0.75em;
	min-height: 354.2px;
}

.winston-pile {
	margin: 0 1em 0 1em;
	padding: 0.5em;
}

.winston-pile .card img {
	width: 250px;
}

.winston-current-pile {
	background-color: #555;
	-webkit-box-shadow: 0px 0px 5px 5px #555;
	-moz-box-shadow: 0px 0px 5px 5px #555;
	box-shadow: 0px 0px 5px 5px #555;
}

.winston-current-pile-options {
	display: flex;
	flex-direction: column;
}

.winstom-card-column {
	display: flex;
	flex-direction: column;
	padding-bottom: 354.2px;
}

.winston-pile-status {
	box-sizing: border-box;
	width: 200px;
	padding: 0.5em;
	text-align: center;
}
</style>