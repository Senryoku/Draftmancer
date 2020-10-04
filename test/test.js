"use strict";

import chai from "chai";
const expect = chai.expect;
import Cards from "./../src/Cards.js";
import server from "../server.js";
import { Connection, Connections } from "../src/Connection.js";
import { Session, Sessions } from "../src/Session.js";
import randomjs from "random-js";
import { BoosterFactory, SetSpecificFactories } from "../src/BoosterFactory.js";

const NODE_PORT = process.env.PORT | 3000;

import io from "socket.io-client";
const ioOptions = {
	transports: ["websocket"],
	forceNew: true,
	reconnection: false,
};

function connectClient(query) {
	let r = io(`http://localhost:${NODE_PORT}`, Object.assign({ query: query }, ioOptions));
	r.on("alreadyConnected", function(newID) {
		this.query.userID = newID;
	});
	return r;
}

let outputbuffer;
const baseConsogleLog = console.log;
const baseConsogleDebug = console.debug;
const baseConsogleWarn = console.warn;
const logReplacer = function() {
	for (var i = 0; i < arguments.length; i++) outputbuffer += arguments[i];
	outputbuffer += "\n";
};
function disableLogs() {
	outputbuffer = "";
	console.log = console.debug = console.warn = logReplacer;
}
function enableLogs(print) {
	console.log = baseConsogleLog;
	console.debug = baseConsogleDebug;
	console.warn = baseConsogleWarn;
	if (print && outputbuffer != "") {
		console.log("--- Delayed Output ---------------------------------------------------------");
		console.log(outputbuffer);
		console.log("----------------------------------------------------- Delayed Output End ---");
	}
}

function makeClients(queries, done) {
	let sockets = [];
	disableLogs();
	expect(Object.keys(Connections).length).to.equal(0);
	for (let query of queries) {
		sockets.push(connectClient(query));
	}

	// Wait for all clients to be connected
	let connectedClientCount = 0;
	for (let s of sockets) {
		s.once("connect", function() {
			connectedClientCount += 1;
			if (connectedClientCount == sockets.length) {
				enableLogs(false);
				expect(Object.keys(Connections).length).to.equal(sockets.length);
				done();
			}
		});
	}
	return sockets;
}

const waitForSocket = (socket, done) => {
	if (socket.io.engine.readyState === "closed") done();
	else
		setTimeout(() => {
			waitForSocket(socket, done);
		}, 1);
};

// Wait for the sockets to be disconnected, I haven't found another way...
const waitForClientDisconnects = done => {
	if (Object.keys(Connections).length === 0) {
		enableLogs(false);
		done();
	} else {
		setTimeout(() => {
			waitForClientDisconnects(done);
		}, 1);
	}
};

const checkColorBalance = function(booster) {
	for (let c of "WUBRG")
		expect(
			booster.filter(cid => Cards[cid].rarity === "common" && Cards[cid].colors.includes(c)).length
		).to.be.at.least(1);
};

const ArenaCube = {
	customSheets: false,
	cards: [
		"65961",
		"70149",
		"70512",
		"69788",
		"70514",
		"70152",
		"69132",
		"66619",
		"70515",
		"67116",
		"67696",
		"70155",
		"68467",
		"67132",
		"68469",
		"70520",
		"68471",
		"70524",
		"70525",
		"70158",
		"71079",
		"69463",
		"70161",
		"69464",
		"69804",
		"69807",
		"70164",
		"70529",
		"67146",
		"70535",
		"65987",
		"65997",
		"67150",
		"69471",
		"66003",
		"69813",
		"71088",
		"67156",
		"70447",
		"67734",
		"69144",
		"25533",
		"70541",
		"69817",
		"69818",
		"66651",
		"69477",
		"69819",
		"30893",
		"70173",
		"67746",
		"67748",
		"70544",
		"70545",
		"67166",
		"69821",
		"66029",
		"67174",
		"70548",
		"70175",
		"46897",
		"66659",
		"71099",
		"69824",
		"67760",
		"70550",
		"67176",
		"47485",
		"70516",
		"70156",
		"69155",
		"70180",
		"69157",
		"67182",
		"70182",
		"68491",
		"66677",
		"70553",
		"69160",
		"67196",
		"50943",
		"69494",
		"71110",
		"70186",
		"69835",
		"69495",
		"66057",
		"68493",
		"69839",
		"69496",
		"66687",
		"70189",
		"68498",
		"66067",
		"68499",
		"69842",
		"70190",
		"66071",
		"69165",
		"67788",
		"67790",
		"70191",
		"66073",
		"69501",
		"69844",
		"70193",
		"70196",
		"67212",
		"69505",
		"67214",
		"70200",
		"67216",
		"70201",
		"66703",
		"68506",
		"71125",
		"70566",
		"66705",
		"71126",
		"68509",
		"71127",
		"66091",
		"67814",
		"69856",
		"67816",
		"69175",
		"69176",
		"71132",
		"69859",
		"71133",
		"66109",
		"71134",
		"42284",
		"68515",
		"66121",
		"69519",
		"69861",
		"66125",
		"69183",
		"71135",
		"66129",
		"49077",
		"67242",
		"67838",
		"70582",
		"70583",
		"70584",
		"70585",
		"70586",
		"71137",
		"66737",
		"70591",
		"69865",
		"70221",
		"70594",
		"70595",
		"66143",
		"70222",
		"71140",
		"69874",
		"69530",
		"55275",
		"67266",
		"70228",
		"69879",
		"17205",
		"63377",
		"68528",
		"70789",
		"67276",
		"67864",
		"69880",
		"69881",
		"69537",
		"66175",
		"66757",
		"70601",
		"70602",
		"69883",
		"70232",
		"70605",
		"69542",
		"70235",
		"70237",
		"69543",
		"66763",
		"70609",
		"70610",
		"69204",
		"71158",
		"71159",
		"33069",
		"67294",
		"66185",
		"67298",
		"69890",
		"70614",
		"69548",
		"67894",
		"69550",
		"66771",
		"71162",
		"68538",
		"70617",
		"70244",
		"71164",
		"70619",
		"70246",
		"69207",
		"70623",
		"19577",
		"68543",
		"69211",
		"70248",
		"67912",
		"68545",
		"69896",
		"66201",
		"69556",
		"69213",
		"67922",
		"66217",
		"70453",
		"67284",
		"70629",
		"70630",
		"42482",
		"66223",
		"67326",
		"70634",
		"67332",
		"67934",
		"70636",
		"67940",
		"71176",
		"70262",
		"66237",
		"66239",
		"71177",
		"69911",
		"69912",
		"66241",
		"70265",
		"67946",
		"69573",
		"67948",
		"42818",
		"66815",
		"35569",
		"69921",
		"70642",
		"68558",
		"70267",
		"70269",
		"68560",
		"66819",
		"67342",
		"71183",
		"70272",
		"69924",
		"71186",
		"70647",
		"67358",
		"69926",
		"68563",
		"67362",
		"69581",
		"69582",
		"69930",
		"67370",
		"36668",
		"68569",
		"68570",
		"69235",
		"66263",
		"66829",
		"70658",
		"70659",
		"70662",
		"66273",
		"70282",
		"66839",
		"66279",
		"70284",
		"68574",
		"70285",
		"66283",
		"68576",
		"69594",
		"67990",
		"69944",
		"70286",
		"67388",
		"67992",
		"67390",
		"69242",
		"69243",
		"70290",
		"67396",
		"70668",
		"70669",
		"70635",
		"69597",
		"70294",
		"70674",
		"68012",
		"71207",
		"70295",
		"69600",
		"69603",
		"70296",
		"68584",
		"69250",
		"66325",
		"69952",
		"70678",
		"68026",
		"70679",
		"68036",
		"70680",
		"69954",
		"68040",
		"18187",
		"37456",
		"69611",
		"71222",
		"70140",
		"69613",
		"70307",
		"67432",
		"70685",
		"28373",
		"69259",
		"66889",
		"70311",
		"71229",
		"18321",
		"68310",
		"70312",
		"70689",
		"71231",
		"70693",
		"70694",
		"69970",
		"70696",
		"70701",
		"70703",
		"70316",
		"69971",
		"69622",
		"68602",
		"69623",
		"68604",
		"70318",
		"71237",
		"68072",
		"70706",
		"70319",
		"16569",
		"67460",
		"66379",
		"69976",
		"70709",
		"67462",
		"68606",
		"71238",
		"66911",
		"70681",
		"70308",
		"67450",
		"66913",
		"67476",
		"69984",
		"71242",
		"69632",
		"69985",
		"70715",
		"66917",
		"70329",
		"69277",
		"71243",
		"70716",
		"69990",
		"69678",
		"69636",
		"67488",
		"69679",
		"70719",
		"70720",
		"68614",
		"14717",
		"71248",
		"68685",
		"69991",
		"68624",
		"69639",
		"69293",
		"69762",
		"69641",
		"69642",
		"69645",
		"69993",
		"70336",
		"69298",
		"69647",
		"71287",
		"69302",
		"70728",
		"69306",
		"69307",
		"68114",
		"69311",
		"68700",
		"68640",
		"68641",
		"67498",
		"69313",
		"71259",
		"69683",
		"70731",
		"68644",
		"47087",
		"70732",
		"68645",
		"32388",
		"68649",
		"69653",
		"17618",
		"69320",
		"69657",
		"68653",
		"70735",
		"69323",
		"69327",
		"29535",
		"71270",
		"69685",
		"69333",
		"66427",
		"71274",
		"70738",
		"71278",
		"70739",
		"68665",
		"67518",
		"63081",
		"68666",
		"68667",
		"69672",
		"68669",
		"70740",
		"68674",
		"71283",
		"71341",
		"49333",
		"70007",
		"67526",
		"68714",
		"70363",
		"68140",
		"71301",
		"70365",
		"70744",
		"69688",
		"67534",
		"70366",
		"70367",
		"70011",
		"69690",
		"67538",
		"67542",
		"67548",
		"67106",
		"70015",
		"9135",
		"67552",
		"70746",
		"33035",
		"70747",
		"68170",
		"67564",
		"67568",
		"70024",
		"70382",
		"66991",
		"67572",
		"66477",
		"69453",
		"61645",
		"67578",
		"70384",
		"47143",
		"67001",
		"18239",
		"69766",
		"69393",
		"70027",
		"70028",
		"71312",
		"69394",
		"70385",
		"70386",
		"70387",
		"70388",
		"70389",
		"67582",
		"70029",
		"70030",
		"66483",
		"66485",
		"67003",
		"70391",
		"66487",
		"70032",
		"18267",
		"66489",
		"69396",
		"69399",
		"67584",
		"71315",
		"67586",
		"71317",
		"70754",
		"18237",
		"70034",
		"68734",
		"71318",
		"66491",
		"70035",
		"68192",
		"68735",
		"71320",
		"18235",
		"68738",
		"69407",
		"67598",
		"66493",
		"68739",
		"70755",
		"70756",
		"70757",
		"70038",
		"70039",
		"70758",
		"70040",
		"70759",
		"70041",
		"70042",
		"70044",
		"18243",
		"68740",
		"67600",
		"71326",
		"68052",
		"69252",
	],
	length: 555,
	name: "Arena Historic Cube #1",
};

describe("Inter client communication", function() {
	let sender, receiver;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		disableLogs();
		expect(Object.keys(Connections).length).to.equal(0);
		sender = connectClient({
			userID: "sender",
			sessionID: "sessionID",
			userName: "sender",
		});
		receiver = connectClient({
			userID: "receiver",
			sessionID: "sessionID",
			userName: "receiver",
		});
		enableLogs(false);
		done();
	});

	after(function(done) {
		disableLogs();
		sender.disconnect();
		receiver.disconnect();

		waitForClientDisconnects(done);
	});

	describe("Chat Events", function() {
		const text = "Text Value";
		it("Clients should receive a message when the `chatMessage` event is emited.", function(done) {
			receiver.on("chatMessage", function(msg) {
				expect(msg.text).to.equal(text);
				done();
			});
			sender.emit("chatMessage", { text: text });
		});
	});

	describe("Personal options updates", function() {
		it("Clients should receive the updated userName when a user changes it.", function(done) {
			receiver.once("updateUser", function(data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.userName).to.equal("senderUpdatedUserName");
				done();
			});
			sender.emit("setUserName", "senderUpdatedUserName");
		});
		it("Clients should receive the updated useCollection status.", function(done) {
			receiver.once("updateUser", function(data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.useCollection).to.equal(false);
				done();
			});
			sender.emit("useCollection", false);
		});
		it("Clients should NOT receive an update if the option is not actually changed.", function(done) {
			let timeout = setTimeout(() => {
				receiver.removeListener("updateUser");
				done();
			}, 200);
			receiver.once("updateUser", () => {
				clearTimeout(timeout);
				done(new Error("Unexpected Call"));
			});
			sender.emit("useCollection", false);
		});
		it("Clients should receive the updated useCollection status.", function(done) {
			receiver.once("updateUser", function(data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.useCollection).to.equal(true);
				done();
			});
			sender.emit("useCollection", true);
		});
		it("Clients should receive the updated userName.", function(done) {
			receiver.once("updateUser", function(data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.userName).to.equal("Sender New UserName");
				done();
			});
			sender.emit("setUserName", "Sender New UserName");
		});
		it("Clients should receive the updated maxDuplicates.", function(done) {
			const newMaxDuplicates = { common: 5, uncommon: 4, rare: 1, mythic: 1 };
			receiver.once("sessionOptions", function(options) {
				expect(options.maxDuplicates).to.eql(newMaxDuplicates);
				done();
			});
			sender.emit("setMaxDuplicates", newMaxDuplicates);
		});
	});
});

describe("Checking sets", function() {
	let clients = [];
	let sessionID = "sessionID";

	let sets = {
		dom: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		grn: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		rna: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		war: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		eld: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		thb: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		iko: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		m21: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		akr: { common: 108, uncommon: 90, rare: 74, mythic: 31 },
		znr: { common: 101, uncommon: 80, rare: 64, mythic: 20 },
	};

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it("2 clients with different userID should be connected.", function(done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	for (let set in sets) {
		it(`Checking ${set}`, function(done) {
			let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			let nonOwnerIdx = 1 - ownerIdx;
			clients[nonOwnerIdx].once("setRestriction", function(sR) {
				const localCollection = Sessions[sessionID].cardPoolByRarity();
				for (let r in sets[set]) {
					expect(
						Object.keys(localCollection[r])
							.map(cid => Cards[cid].set)
							.every(s => s === set)
					).to.be.true;
					expect(Object.keys(localCollection[r]).length).to.equal(sets[set][r]);
				}
				done();
			});
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", [set]);
			// Wait for request to arrive
		});
	}
});

describe("Single Draft with Color Balance", function() {
	let clients = [];
	let sessionID = "sessionID";
	var ownerIdx;
	var nonOwnerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it('A user with userID "id1" should be connected.', function(done) {
		expect(Connections).to.have.property("id1");
		done();
	});

	it("2 clients with different userID should be connected.", function(done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	it("3 clients with different userID should be connected.", function(done) {
		let idx = clients.push(
			connectClient({
				userID: "id3",
				sessionID: sessionID,
				userName: "Client3",
			})
		);

		clients[idx - 1].on("connect", function() {
			expect(Object.keys(Connections).length).to.equal(3);
			done();
		});
	});

	it(`Card Pool should be all of THB set (+ distribution quick test)`, function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		clients[ownerIdx].emit("setColorBalance", true);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[nonOwnerIdx].on("setRestriction", _ => {
			const localCollection = Sessions[sessionID].cardPoolByRarity();
			expect(Object.keys(localCollection["common"]).length).to.equal(101);
			expect(Object.keys(localCollection["uncommon"]).length).to.equal(80);
			expect(Object.keys(localCollection["rare"]).length).to.equal(53);
			expect(Object.keys(localCollection["mythic"]).length).to.equal(15);
			done();
		});
		clients[ownerIdx].emit("setRestriction", ["thb"]);
		/*
       const random = new randomjs.Random(randomjs.nodeCrypto);
       const get_random_key = () => random.integer(0,
       Object.keys(localCollection['rare']).length - 1);
       process.stdout.write('Distribution samples:\n');
       for(let repeat = 0; repeat < 5; ++repeat) {
               let samples = {};
               const sampleCount = 8 * 3;
               for(let i = 0; i < Object.keys(localCollection['rare']).length;
       ++i)
                       samples[i] = 0;
               for(let i = 0; i < sampleCount; ++i) {
                       samples[get_random_key()] += 1;
               }
               for(let i = 0; i < Object.keys(localCollection['rare']).length;
       ++i)
                       process.stdout.write(`${samples[i]} `);
                       //process.stdout.write(`${samples[i]}; ${samples[i] *
       100.0 / sampleCount} %)`);
               process.stdout.write('\n');
       }
       */
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function(done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		let index = 0;
		for (let c in clients) {
			clients[c].once("startDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedBoosters == clients.length) {
					for (let b of Sessions[sessionID].boosters) checkColorBalance(b);
					done();
				}
			});

			(_ => {
				const _idx = c;
				clients[c].once("nextBooster", function(data) {
					expect(boosters).not.include(data);
					checkColorBalance(data.booster);
					boosters[_idx] = data;
					receivedBoosters += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
			++index;
		}
		clients[ownerIdx].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("nextBooster", function(data) {
				receivedBoosters += 1;
				let idx = c;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});

	it("Do it enough times, and all the drafts should end.", function(done) {
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function(data) {
				let idx = c;
				boosters[idx] = data.booster;
				this.emit("pickCard", { selectedCard: boosters[idx][0] }, _ => {});
			});
			clients[c].once("endDraft", function() {
				draftEnded += 1;
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});
});

describe("Single Draft without Color Balance", function() {
	let clients = [];
	let sessionID = "sessionID";
	var ownerIdx;
	var nonOwnerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it("Clients should receive the updated colorBalance status.", function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		clients[nonOwnerIdx].once("sessionOptions", function(options) {
			expect(options.colorBalance).to.equal(false);
			done();
		});
		clients[ownerIdx].emit("setColorBalance", false);
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function(done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		for (let c in clients) {
			clients[c].once("startDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			const _idx = c;
			(_ => {
				clients[c].once("nextBooster", function(data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
		}
		clients[ownerIdx].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("nextBooster", function(data) {
				receivedBoosters += 1;
				let idx = c;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});

	it("Do it enough times, and all the drafts should end.", function(done) {
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function(data) {
				let idx = c;
				boosters[idx] = data.booster;
				this.emit("pickCard", { selectedCard: boosters[idx][0] }, _ => {});
			});
			clients[c].once("endDraft", function() {
				draftEnded += 1;
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});
});

describe("Single Draft With disconnect", function() {
	let clients = [];
	let sessionID = "sessionID";
	var ownerIdx;
	var nonOwnerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		let connectedClients = 0;
		let receivedBoosters = 0;
		for (let c in clients) {
			clients[c].once("startDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			const _idx = c;
			(_ => {
				clients[_idx].once("nextBooster", function(data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
		}
		clients[ownerIdx].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("nextBooster", function(data) {
				receivedBoosters += 1;
				const idx = c;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});

	it("Non-owner disconnects, owner receives a warning.", function(done) {
		clients[ownerIdx].once("userDisconnected", () => {
			waitForSocket(clients[nonOwnerIdx], () => {
				clients.splice(nonOwnerIdx, 1);
				done();
			});
		});
		clients[nonOwnerIdx].disconnect();
		boosters.splice(nonOwnerIdx, 1);
		ownerIdx = 0;
	});

	it("Owner chooses to replace by bots.", function(done) {
		clients[ownerIdx].once("message", function(state) {
			done();
		});
		clients[ownerIdx].emit("replaceDisconnectedPlayers");
	});

	it("Pick enough times, and all the drafts should end.", function(done) {
		this.timeout(4000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			const idx = c;
			clients[c].on("nextBooster", function(data) {
				boosters[idx] = data.booster;
				this.emit("pickCard", { selectedCard: boosters[idx][0] }, _ => {});
			});
			clients[c].once("endDraft", function() {
				draftEnded += 1;
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});
});

describe("Single Draft with Bots", function() {
	let clients = [];
	let sessionID = "sessionID";
	var ownerIdx;
	var nonOwnerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it('A user with userID "id1" should be connected.', function(done) {
		expect(Connections).to.have.property("id1");
		done();
	});

	it("2 clients with different userIDs should be connected.", function(done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	it("Clients should receive the updated bot count.", function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		clients[nonOwnerIdx].once("bots", function(bots) {
			expect(bots).to.equal(6);
			done();
		});
		clients[ownerIdx].emit("bots", 6);
	});

	let boosters = [];
	it("When session owner launches draft, everyone should receive a startDraft event", function(done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		for (let c in clients) {
			clients[c].once("startDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			const _idx = c;
			(_ => {
				clients[c].once("nextBooster", function(data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
		}
		clients[ownerIdx].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			const idx = c;
			clients[c].once("nextBooster", function(data) {
				receivedBoosters += 1;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});

	it("Do it enough times, and all the drafts should end.", function(done) {
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			const idx = c;
			clients[c].on("nextBooster", function(data) {
				boosters[idx] = data.booster;
				this.emit("pickCard", { selectedCard: boosters[idx][0] }, _ => {});
			});
			clients[c].once("endDraft", function() {
				draftEnded += 1;
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});
});

describe("Single Draft With Bots and Disconnect", function() {
	let clients = [];
	let sessionID = "sessionID";
	var ownerIdx;
	var nonOwnerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it("Clients should receive the updated bot count.", function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		clients[nonOwnerIdx].once("bots", function(bots) {
			expect(bots).to.equal(6);
			done();
		});
		clients[ownerIdx].emit("bots", 6);
	});

	let boosters = [];
	it("When session owner launches draft, everyone should receive a startDraft event", function(done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		for (let c in clients) {
			clients[c].once("startDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			const _idx = c;
			clients[c].once("nextBooster", function(data) {
				expect(boosters).not.include(data);
				boosters[_idx] = data;
				receivedBoosters += 1;
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});
		}
		clients[ownerIdx].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			const idx = c;
			clients[c].once("nextBooster", function(data) {
				receivedBoosters += 1;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});

	it("Non-owner disconnects, Owner receives updated user infos.", function(done) {
		clients[ownerIdx].once("userDisconnected", function() {
			waitForSocket(clients[nonOwnerIdx], done);
		});
		clients[nonOwnerIdx].disconnect();
	});

	it("Non-owner reconnects, draft restarts.", function(done) {
		clients[ownerIdx].on("message", function(data) {
			if (data.title == "Player reconnected") {
				this.removeListener("message");
				done();
			}
		});
		clients[nonOwnerIdx].connect();
	});

	it("Pick enough times, and all the drafts should end.", function(done) {
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			const idx = c;
			clients[c].on(
				"nextBooster",
				(_ => {
					const self = clients[c];
					return data => {
						boosters[idx] = data.booster;
						process.nextTick(_ => {
							self.emit("pickCard", { selectedCard: boosters[idx][0] }, _ => {});
						});
					};
				})()
			);
			clients[c].once("endDraft", function() {
				draftEnded += 1;
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
		}
	});
});

describe("Single Draft with custom boosters and bots", function() {
	let clients = [];
	const sessionID = "sessionID";
	const CustomBoosters = ["xln", "rix", ""];
	var ownerIdx;
	var nonOwnerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it("Clients should receive the updated bot count.", function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		clients[nonOwnerIdx].once("bots", function(bots) {
			expect(bots).to.equal(6);
			done();
		});
		clients[ownerIdx].emit("bots", 6);
	});

	it("Clients should receive the updated booster spec.", function(done) {
		clients[nonOwnerIdx].once("sessionOptions", function(data) {
			expect(data.customBoosters).to.eql(CustomBoosters);
			done();
		});
		clients[ownerIdx].emit("setCustomBoosters", CustomBoosters);
	});

	for (let distributionMode of ["regular", "shufflePlayerBoosters", "shuffleBoosterPool"]) {
		it(`Setting distributionMode to ${distributionMode}.`, function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function(data) {
				expect(data.distributionMode).to.eql(distributionMode);
				done();
			});
			clients[ownerIdx].emit("setDistributionMode", distributionMode);
		});

		let boosters = [];
		it("When session owner launch draft, everyone should receive a startDraft event", function(done) {
			let connectedClients = 0;
			let receivedBoosters = 0;
			let index = 0;
			for (let c of clients) {
				c.once("startDraft", function() {
					connectedClients += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});

				(_ => {
					const _idx = index;
					c.once("nextBooster", function(data) {
						expect(boosters).not.include(data);
						if (distributionMode === "regular")
							for (let cid of data.booster) expect(Cards[cid].set).to.equals(CustomBoosters[0]);
						boosters[_idx] = data;
						receivedBoosters += 1;
						if (connectedClients == clients.length && receivedBoosters == clients.length) done();
					});
				})();
				++index;
			}
			clients[ownerIdx].emit("startDraft");
		});

		it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
			let receivedBoosters = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].once("nextBooster", function(data) {
					receivedBoosters += 1;
					let idx = c;
					expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
					boosters[idx] = data;
					if (receivedBoosters == clients.length) done();
				});
				clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
			}
		});

		it("Pick enough times, and all the drafts should end.", function(done) {
			this.timeout(4000);
			let draftEnded = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].on(
					"nextBooster",
					(_ => {
						const idx = c;
						const self = clients[c];
						return data => {
							boosters[idx] = data.booster;
							process.nextTick(_ => {
								self.emit("pickCard", { selectedCard: boosters[idx][0] }, _ => {});
							});
						};
					})()
				);
				clients[c].once("endDraft", function() {
					draftEnded += 1;
					this.removeListener("nextBooster");
					if (draftEnded == clients.length) done();
				});
			}
			for (let c = 0; c < clients.length; ++c) {
				clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0] }, _ => {});
			}
		});
	}
});

describe("Multiple Drafts", function() {
	let clients = [];
	let sessionIDs = [];
	const sessionCount = 4;
	const playersPerSession = 7;
	let boosters = [];

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		disableLogs();
		expect(Object.keys(Connections).length).to.equal(0);
		for (let sess = 0; sess < sessionCount; ++sess) {
			sessionIDs[sess] = `Session ${sess}`;
			clients[sess] = [];
			for (let i = 0; i < playersPerSession; ++i) {
				clients[sess].push(
					connectClient({
						userID: "sameID",
						sessionID: sessionIDs[sess],
						userName: `Client ${sess * playersPerSession + i}`,
					})
				);
			}
		}

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let s of clients) {
			for (let c of s) {
				c.on("connect", function() {
					connectedClients += 1;
					if (connectedClients == playersPerSession * clients.length) {
						enableLogs(false);
						done();
					}
				});
			}
		}
	});

	after(function(done) {
		disableLogs();
		for (let s of clients)
			for (let c of s) {
				c.disconnect();
			}

		waitForClientDisconnects(done);
	});

	it(`${sessionCount} sessions should be live.`, function(done) {
		expect(Object.keys(Sessions).length).to.equal(sessionCount);
		done();
	});

	it(`${playersPerSession * sessionCount} players should be connected.`, function(done) {
		expect(Object.keys(Connections).length).to.equal(playersPerSession * sessionCount);
		done();
	});

	it("When session owner launch draft, everyone in session should receive a startDraft event, and a unique booster", function(done) {
		let sessionsCorrectlyStartedDrafting = 0;
		for (let [sessionIdx, sessionClients] of clients.entries()) {
			boosters.push([]);
			(() => {
				let connectedClients = 0;
				for (let c of sessionClients) {
					c.on("startDraft", function() {
						connectedClients += 1;
						if (connectedClients == sessionClients.length) {
							for (let b of Sessions[sessionIDs[sessionIdx]].boosters) checkColorBalance(b);
							sessionsCorrectlyStartedDrafting += 1;
						}
					});

					c.once("nextBooster", function(data) {
						expect(boosters).not.include(data);
						boosters[playersPerSession * sessionIdx + sessionClients.findIndex(cl => cl == c)] = data;
						if (
							sessionsCorrectlyStartedDrafting == sessionCount &&
							boosters.length == playersPerSession * sessionCount
						)
							done();
					});
				}
				let ownerIdx = sessionClients.findIndex(c => c.query.userID == Sessions[sessionIDs[sessionIdx]].owner);
				sessionClients[ownerIdx].emit("setColorBalance", true);
				sessionClients[ownerIdx].emit("startDraft");
			})();
		}
	});

	it("New players should not be able to join once drafting has started", function(done) {
		let newClient = io(
			`http://localhost:${NODE_PORT}/`,
			Object.assign(
				{
					query: {
						userID: "randomID",
						sessionID: sessionIDs[0],
						userName: `New Client`,
					},
				},
				ioOptions
			)
		);

		newClient.on("setSession", function(newSessionID) {
			expect(newSessionID).to.not.equal(sessionIDs[0]);
			expect(Sessions[sessionIDs[0]].users.size).to.equal(playersPerSession);
			newClient.disconnect();
			waitForSocket(newClient, done);
		});
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
		let receivedBoosters = 0;
		expect(boosters.length).to.equal(playersPerSession * sessionCount);
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].once(
					"nextBooster",
					(function() {
						let idx = playersPerSession * sess + c;
						return function(data) {
							receivedBoosters += 1;
							expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
							boosters[idx] = data;
							if (receivedBoosters == playersPerSession * sessionCount) done();
						};
					})()
				);
				clients[sess][c].emit(
					"pickCard",
					{
						selectedCard: boosters[playersPerSession * sess + c].booster[0],
					},
					() => {}
				);
			}
		}
	});

	it("Do it enough times, and all the drafts should end.", function(done) {
		this.timeout(20000);
		let draftEnded = 0;
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].on("nextBooster", function(data) {
					let idx = playersPerSession * sess + c;
					boosters[idx] = data.booster;
					this.emit("pickCard", { selectedCard: boosters[idx][0] }, _ => {});
				});
				clients[sess][c].once("endDraft", function() {
					draftEnded += 1;
					this.removeListener("nextBooster");
					if (draftEnded == playersPerSession * sessionCount) done();
				});
			}
		}
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].emit(
					"pickCard",
					{ selectedCard: boosters[playersPerSession * sess + c].booster[0] },
					_ => {}
				);
			}
		}
	});
});

describe("Winston Draft", function() {
	let clients = [];
	let sessionID = "sessionID";
	var ownerIdx;
	var nonOwnerIdx;

	const getCurrentPlayer = () => {
		const currentPlayerID = Sessions[sessionID].winstonDraftState.currentPlayer();
		const currentPlayerIdx = clients.findIndex(c => c.query.userID == currentPlayerID);
		return clients[currentPlayerIdx];
	};

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function() {
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it("2 clients with different userID should be connected.", function(done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	let states = [];
	it("When session owner launch Winston draft, everyone should receive a startWinstonDraft event", function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		let connectedClients = 0;
		let receivedState = 0;
		let index = 0;
		for (let c of clients) {
			c.once("startWinstonDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedState == clients.length) done();
			});

			(() => {
				const _idx = index;
				c.once("winstonDraftNextRound", function(state) {
					states[_idx] = state;
					receivedState += 1;
					if (connectedClients == clients.length && receivedState == clients.length) done();
				});
			})();
			++index;
		}
		clients[ownerIdx].emit("startWinstonDraft");
	});

	it("Non-owner disconnects, owner receives updated user infos.", function(done) {
		clients[ownerIdx].once("userDisconnected", function() {
			waitForSocket(clients[nonOwnerIdx], done);
		});
		clients[nonOwnerIdx].disconnect();
	});

	it("Non-owner reconnects, draft restarts.", function(done) {
		clients[nonOwnerIdx].once("rejoinWinstonDraft", function(state) {
			done();
		});
		clients[nonOwnerIdx].connect();
	});

	it("Every player takes the first pile possible and the draft should end.", function(done) {
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				if (userID === clients[c].query.userID) this.emit("winstonDraftTakePile");
			});
			clients[c].once("winstonDraftEnd", function() {
				draftEnded += 1;
				this.removeListener("winstonDraftNextRound");
				if (draftEnded == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftTakePile");
	});

	it("When session owner launch Winston draft, everyone should receive a startWinstonDraft event", function(done) {
		states = [];
		let connectedClients = 0;
		let receivedState = 0;
		let index = 0;
		for (let c of clients) {
			c.once("startWinstonDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedState == clients.length) done();
			});

			(_ => {
				const _idx = index;
				c.once("winstonDraftNextRound", function(state) {
					states[_idx] = state;
					receivedState += 1;
					if (connectedClients == clients.length && receivedState == clients.length) done();
				});
			})();
			++index;
		}
		clients[ownerIdx].emit("startWinstonDraft");
	});

	it("Taking first pile.", function(done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftTakePile");
	});

	it("Skiping, then taking pile.", function(done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftTakePile");
	});

	it("Skiping, skiping, then taking pile.", function(done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftTakePile");
	});

	it("Skiping, skiping and skiping.", function(done) {
		let nextRound = 0;
		let receivedRandomCard = false;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				++nextRound;
				if (receivedRandomCard && nextRound == clients.length) done();
			});
		}
		getCurrentPlayer().on("winstonDraftRandomCard", function(card) {
			if (card) receivedRandomCard = true;
		});
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftSkipPile");
	});

	it("Every player takes the first pile possible and the draft should end.", function(done) {
		this.timeout(2000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				if (userID === clients[c].query.userID) this.emit("winstonDraftTakePile");
			});
			clients[c].once("winstonDraftEnd", function() {
				draftEnded += 1;
				this.removeListener("winstonDraftNextRound");
				if (draftEnded == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftTakePile");
	});
});

describe("Grid Draft", function() {
	let clients = [];
	let sessionID = "sessionID";
	var ownerIdx;
	var nonOwnerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function() {
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it("2 clients with different userID should be connected.", function(done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	const startDraft = () => {
		it("When session owner launch Grid draft, everyone should receive a startGridDraft event", function(done) {
			ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			let connectedClients = 0;
			for (let c of clients) {
				c.once("startGridDraft", function() {
					connectedClients += 1;
					if (connectedClients == clients.length) done();
				});
			}
			clients[ownerIdx].emit("startGridDraft");
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a row or column and the draft should end.", function(done) {
			let draftEnded = 0;

			for (let c = 0; c < clients.length; ++c) {
				// Pick randomly and retry on error (empty col/row)
				const pick = () => {
					const cl = clients[c];
					cl.emit("gridDraftPick", Math.floor(Math.random() * 6), response => {
						if (response.code !== 0) pick();
					});
				};
				clients[c].on("gridDraftSync", function(state) {
					if (state.booster) expect(state.booster.length).to.equal(9);
				});
				clients[c].on("gridDraftNextRound", function(state) {
					if (state.booster) expect(state.booster.length).to.equal(9);
					if (state.currentPlayer === clients[c].query.userID) pick();
				});
				clients[c].once("gridDraftEnd", function() {
					draftEnded += 1;
					this.removeListener("gridDraftSync");
					this.removeListener("gridDraftNextRound");
					if (draftEnded == clients.length) done();
				});
			}
			let currentPlayerID = Sessions[sessionID].gridDraftState.currentPlayer();
			let currentPlayerIdx = clients.findIndex(c => c.query.userID == currentPlayerID);
			clients[currentPlayerIdx].emit("gridDraftPick", Math.floor(Math.random() * 6));
		});
	};

	startDraft();

	it("Non-owner disconnects, owner receives updated user infos.", function(done) {
		clients[ownerIdx].once("userDisconnected", function() {
			waitForSocket(clients[nonOwnerIdx], done);
		});
		clients[nonOwnerIdx].disconnect();
	});

	it("Non-owner reconnects, draft restarts.", function(done) {
		clients[nonOwnerIdx].once("rejoinGridDraft", function(state) {
			done();
		});
		clients[nonOwnerIdx].connect();
	});

	endDraft();

	describe("Using a Cube", function() {
		it("Emit Settings.", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function(options) {
				if (options.useCustomCardList) done();
			});
			clients[ownerIdx].emit("setUseCustomCardList", true);
			clients[ownerIdx].emit("customCardList", ArenaCube);
		});

		startDraft();
		endDraft();
	});
});

describe("Rochester Draft", function() {
	let clients = [];
	let sessionID = "sessionID";
	let ownerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
				{
					userID: "id3",
					sessionID: sessionID,
					userName: "Client3",
				},
				{
					userID: "id4",
					sessionID: sessionID,
					userName: "Client4",
				},
				{
					userID: "id5",
					sessionID: sessionID,
					userName: "Client5",
				},
				{
					userID: "id6",
					sessionID: sessionID,
					userName: "Client6",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function() {
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it(`6 clients with different userID should be connected.`, function(done) {
		expect(Object.keys(Connections).length).to.equal(6);
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let rochesterDraftState = null;

	const startDraft = () => {
		it("When session owner launch Rochester draft, everyone should receive a startRochesterDraft event", function(done) {
			let connectedClients = 0;
			for (let c of clients) {
				c.once("startRochesterDraft", function(state) {
					connectedClients += 1;
					if (connectedClients == clients.length) {
						rochesterDraftState = state;
						done();
					}
				});
			}
			clients[ownerIdx].emit("startRochesterDraft");
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a card and the draft should end.", function(done) {
			let draftEnded = 0;

			for (let c = 0; c < clients.length; ++c) {
				// Pick randomly and retry on error
				const pick = state => {
					const cl = clients[c];
					cl.emit("rochesterDraftPick", Math.floor(Math.random() * state.booster.length), response => {
						if (response.code !== 0) pick(state);
					});
				};
				clients[c].on("rochesterDraftNextRound", function(state) {
					if (state.currentPlayer === clients[c].query.userID) pick(state);
				});
				clients[c].once("rochesterDraftEnd", function() {
					draftEnded += 1;
					this.removeListener("rochesterDraftNextRound");
					if (draftEnded == clients.length) done();
				});
			}
			// Pick the first card
			let currPlayer = clients.findIndex(c => c.query.userID == rochesterDraftState.currentPlayer);
			clients[currPlayer].emit("rochesterDraftPick", 0);
		});
	};

	describe("Default settings with a disconnect", function() {
		startDraft();

		it("Non-owner disconnects, owner receives updated user infos.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", function() {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinRochesterDraft", function(state) {
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("Using a Cube", function() {
		it("Emit Settings.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("sessionOptions", function(options) {
				if (options.useCustomCardList) done();
			});
			clients[ownerIdx].emit("setUseCustomCardList", true);
			clients[ownerIdx].emit("customCardList", ArenaCube);
		});

		startDraft();
		endDraft();
	});
});

describe("Single Draft with Bots and burning", function() {
	let clients = [];
	let sessionID = "sessionID";
	const burnedCardsPerRound = 2;
	var ownerIdx;
	var nonOwnerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "sameID",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "sameID",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it('A user with userID "sameID" should be connected.', function(done) {
		expect(Connections).to.have.property("sameID");
		done();
	});

	it("2 clients with different userID should be connected.", function(done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	it("First client should be the session owner", function(done) {
		expect(Sessions[sessionID].owner).to.equal("sameID");
		done();
	});

	it("Clients should receive the updated bot count.", function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		clients[nonOwnerIdx].once("bots", function(bots) {
			expect(bots).to.equal(6);
			done();
		});
		clients[ownerIdx].emit("bots", 6);
	});

	it("Clients should receive the updated burn count.", function(done) {
		clients[nonOwnerIdx].once("sessionOptions", function(sessionOptions) {
			expect(sessionOptions.burnedCardsPerRound).to.equal(burnedCardsPerRound);
			done();
		});
		clients[ownerIdx].emit("setBurnedCardsPerRound", burnedCardsPerRound);
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function(done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		let index = 0;
		for (let c of clients) {
			c.once("startDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			(_ => {
				const _idx = index;
				c.once("nextBooster", function(data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
			++index;
		}
		clients[ownerIdx].emit("startDraft");
	});

	it("Pick enough times, and the draft should end.", function(done) {
		this.timeout(20000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function(data) {
				let idx = c;
				boosters[idx] = data.booster;
				let burned = [];
				for (let cidx = 1; cidx < 1 + burnedCardsPerRound && cidx < data.booster.length; ++cidx)
					burned.push(data.booster[cidx]);
				this.emit("pickCard", { selectedCard: boosters[idx][0], burnedCards: burned }, _ => {});
			});
			clients[c].once("endDraft", function() {
				draftEnded += 1;
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			let burned = [];
			for (let cidx = 1; cidx < 1 + burnedCardsPerRound && cidx < boosters[c].booster.length; ++cidx)
				burned.push(boosters[c].booster[cidx]);
			clients[c].emit("pickCard", { selectedCard: boosters[c].booster[0], burnedCards: burned }, _ => {});
		}
	});
});

describe("Sealed", function() {
	let clients = [];
	let sessionID = "sessionID";
	const random = new randomjs.Random(randomjs.nodeCrypto);
	const boosterCount = random.integer(1, 10);

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		let queries = [];
		for (let i = 0; i < 8; ++i)
			queries.push({
				userID: "sameID",
				sessionID: sessionID,
				userName: "DontCare",
			});
		clients = makeClients(queries, done);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it(`Owner launch a sealed (${boosterCount} boosters), clients should receive their card selection.`, function(done) {
		const ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		let receivedPools = 0;
		for (let client of clients)
			client.once("setCardSelection", boosters => {
				expect(boosters.length).to.equal(boosterCount);
				++receivedPools;
				if (receivedPools === clients.length) done();
			});
		clients[ownerIdx].emit("distributeSealed", boosterCount);
	});
});

import JumpstartBoosters from "../data/JumpstartBoosters.json";

describe("Jumpstart", function() {
	let clients = [];
	let sessionID = "JumpStartSession";

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		let queries = [];
		for (let i = 0; i < 8; ++i)
			queries.push({
				userID: "sameID",
				sessionID: sessionID,
				userName: "DontCare",
			});
		clients = makeClients(queries, done);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it("Each booster contains 20 valid cards", function(done) {
		for (let b of JumpstartBoosters) {
			expect(b.cards.length).to.equals(20);
			for (let c of b.cards) {
				expect(Cards).to.have.deep.property(c);
			}
		}
		done();
	});

	it(`Owner launches a Jumpstart game, clients should receive their card selection (2*20 cards).`, function(done) {
		const ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		let receivedPools = 0;
		for (let client of clients) {
			client.once("setCardSelection", function(boosters) {
				expect(boosters.length).to.equal(2);
				for (let b of boosters) expect(b.length).to.equal(20);
				++receivedPools;
				if (receivedPools === clients.length) done();
			});
		}
		clients[ownerIdx].emit("distributeJumpstart");
	});
});

describe("Set Specific Booster Rules", function() {
	let clients = [];
	let sessionID = "SessionID";

	const validateDOMBooster = function(booster) {
		const regex = /Legendary.*Creature/;
		expect(booster.map(cid => Cards[cid].set).every(s => s === "dom")).to.be.true;
		let LCCount = booster.reduce((acc, val) => {
			return acc + Cards[val].type.match(regex) ? 1 : 0;
		}, 0);
		expect(LCCount).to.gte(1);
	};

	const validateWARBooster = function(booster) {
		expect(booster.map(cid => Cards[cid].set).every(s => s === "war")).to.be.true;
		let PLCount = booster.reduce((acc, val) => {
			return acc + Cards[val].type.includes("Planeswalker") ? 1 : 0;
		}, 0);
		expect(PLCount).to.equal(1);
	};

	const validateZNRBooster = function(booster) {
		expect(booster.map(cid => Cards[cid].set).every(s => s === "znr")).to.be.true;
		let PLCount = booster.reduce((acc, val) => {
			return acc + Cards[val].name.includes("//") ? 1 : 0;
		}, 0);
		expect(PLCount).to.equal(1);
	};

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		let queries = [];
		for (let i = 0; i < 8; ++i)
			queries.push({
				userID: "sameID",
				sessionID: sessionID,
				userName: "DontCare",
			});
		clients = makeClients(queries, done);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	const testSet = function(set, validationFunc, desc) {
		it(`${set} boosters should have ${desc} (Single set restriction).`, function(done) {
			let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", [set]);
			clients[ownerIdx].emit("setCustomBoosters", ["", "", ""]);
			clients[ownerIdx].once("startDraft", function() {
				for (let b of Sessions[sessionID].boosters) validationFunc(b);
				clients[ownerIdx].once("endDraft", function() {
					done();
				});
				clients[ownerIdx].emit("stopDraft");
			});
			clients[ownerIdx].emit("startDraft");
		});

		it(`${set} boosters should have ${desc} (Custom boosters).`, function(done) {
			let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", []);
			clients[ownerIdx].emit("setCustomBoosters", [set, set, set]);
			clients[ownerIdx].once("startDraft", function() {
				for (let b of Sessions[sessionID].boosters) validationFunc(b);
				clients[ownerIdx].once("endDraft", function() {
					done();
				});
				clients[ownerIdx].emit("stopDraft");
			});
			clients[ownerIdx].emit("startDraft");
		});
	};

	testSet("dom", validateDOMBooster, "at least one legendary creature per pack");
	testSet("war", validateWARBooster, "exactly one planeswalker per pack");
	testSet("znr", validateZNRBooster, "exactly one MDFC per pack");

	it(`Validate mixed Custom boosters.`, function(done) {
		let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", []);
		clients[ownerIdx].emit("setCustomBoosters", ["dom", "war", "dom"]);
		clients[ownerIdx].once("startDraft", function() {
			for (let idx = 0; idx < Sessions[sessionID].boosters.length; ++idx)
				if (Math.floor(idx / 8) == 1) validateWARBooster(Sessions[sessionID].boosters[idx]);
				else validateDOMBooster(Sessions[sessionID].boosters[idx]);
			clients[ownerIdx].once("endDraft", function() {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});
		clients[ownerIdx].emit("startDraft");
	});

	it(`Validate mixed Custom boosters with regular set restriction.`, function(done) {
		let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", ["dom"]);
		clients[ownerIdx].emit("setCustomBoosters", ["", "war", "dom"]);
		clients[ownerIdx].once("startDraft", function() {
			for (let idx = 0; idx < Sessions[sessionID].boosters.length; ++idx)
				if (Math.floor(idx / 8) == 1) validateWARBooster(Sessions[sessionID].boosters[idx]);
				else validateDOMBooster(Sessions[sessionID].boosters[idx]);
			clients[ownerIdx].once("endDraft", function() {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});
		clients[ownerIdx].emit("startDraft");
	});

	it(`1000 boosters have <=20% difference in a common artifact's count vs ca olored common's count while color balancing`, function(done) {
		const trials = 1000;
		const landSlot = null;
		const BoosterFactoryOptions = {
			foil: false,
			colorBalance: true,
		};
		const cardPoolByRarity = {
			common: {},
			uncommon: {},
			rare: {},
			mythic: {},
		};
		for (let cid in Cards) {
			if (Cards[cid].in_booster && Cards[cid].set === "znr") {
				cardPoolByRarity[Cards[cid].rarity][cid] = trials;
			}
		}
		const factory = SetSpecificFactories["znr"](cardPoolByRarity, landSlot, BoosterFactoryOptions)
		let kitesails = 0;
		let brutes = 0;
		for (let i = 0; i < trials; i++) {
			let booster = factory.generateBooster({common:10, uncommon:3, rare:1});
			booster.forEach((id) => {
				if (Cards[id].name === "Cliffhaven Kitesail") {
					kitesails += 1;
				}
				if (Cards[id].name === "Murasa Brute") {
					brutes += 1;
				}
			});
		}
		expect(2*Math.abs((kitesails - brutes)/(kitesails, brutes))).to.be.at.most(0.2);
		done();
	});
});
