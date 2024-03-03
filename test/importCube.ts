import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import { expect } from "chai";
import { makeClients, enableLogs, disableLogs, waitForClientDisconnects, ackNoError } from "./src/common.js";
import { CardsByName } from "../src/Cards.js";

describe("Import Cubes", function () {
	let clients: ReturnType<typeof makeClients> = [];
	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest!.state == "failed");
		done();
	});

	before(function (done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: "importCube",
					userName: "Client1",
				},
			],
			done
		);
	});

	after(function (done) {
		disableLogs();
		for (const c of clients) c.disconnect();
		waitForClientDisconnects(done);
	});

	it(`should error when importing from an invalid service`, function (done) {
		clients[0].emit(
			"importCube",
			{
				service: "Invalid Service",
				matchVersions: false,
				cubeID: "Non-Existing CubeID ljnsdghqskghkhzs",
			},
			(res) => {
				expect(res.code).to.equal(-1);
				done();
			}
		);
	});

	for (const service of ["Cube Cobra", "CubeArtisan"]) {
		describe(service, function () {
			it(`should error when importing a non-existing cube from ${service}`, function (done) {
				clients[0].emit(
					"importCube",
					{
						service,
						matchVersions: false,
						cubeID: "Non-Existing CubeID ljnsdghqskghkhzs",
					},
					(res) => {
						expect(res.code).to.equal(-1);
						done();
					}
				);
			});

			it(`should error when importing an empty cube from ${service}`, function (done) {
				clients[0].emit(
					"importCube",
					{
						service,
						matchVersions: false,
						cubeID: service === "Cube Cobra" ? "0b659738-1f31-474a-a563-5801c7d6b6b7" : "83",
					},
					(res) => {
						expect(res.code).to.equal(-1);
						done();
					}
				);
			});

			for (const matchVersions of [false, true]) {
				it(`should successfully import from ${service} with matchVersions:${matchVersions}`, function (done) {
					clients[0].once("sessionOptions", (options) => {
						expect(options.customCardList).to.exist;
						expect(options.customCardList.slots["default"]).to.exist;
						if (matchVersions)
							expect(
								options.customCardList.slots["default"]["81706879-ec5d-4b17-b4bc-5f7cb37557a5"],
								"The cube should contain this exact card: Watery Grave (UNF) 278"
							).to.equal(1);
						else {
							expect(
								options.customCardList.slots["default"][CardsByName["Watery Grave"]],
								"The cube should contain the default version of Watery Grave"
							).to.equal(1);
						}
						done();
					});
					clients[0].emit(
						"importCube",
						{
							service,
							matchVersions,
							cubeID: service === "Cube Cobra" ? "1rtmv" : "8s",
						},
						ackNoError
					);
				});
			}
		});
	}
});
