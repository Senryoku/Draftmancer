const Heroku = require("heroku-client");

const heroku = new Heroku({ token: process.env.HEROKU_API_TOKEN });
const request = require("request");
const secretKey = process.env.SECRET_KEY || "1234";
const appName = process.env.APP_NAME || "mtgadraftbeta";
const host = `http://${appName}.herokuapp.com/`;

// Add a job to the Heroku Scheduler to attempt to restart when no one's drafting
// to avoid automatic dyno cycling at the wrong time.

console.log("Checking for a possible restart...");
request(`${host}getStatus/${secretKey}`, function (err, _, body) {
	if (err) {
		console.error(err);
		return;
	}
	
	const result = JSON.parse(body);
	console.log(result);
	// If the app is not ready to restart or the uptime is under 20h 
	if (!result.canRestart || result.uptime <= 60 * 60 * 20) {
		return;
	}

	console.log("Restarting dynos...");
	heroku.delete(`/apps/${appName}/dynos`).then((res) => {
		console.log(res);
	});
});
