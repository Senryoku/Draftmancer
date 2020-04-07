const Heroku = require('heroku-client')
const heroku = new Heroku({ token: process.env.HEROKU_API_TOKEN })
var request = require('request');

request(`/getStatus/${process.env.SECRET_KEY}`, function(err, res, body) {
	if(!err) {
		let result = JSON.parse(body);
		console.log(result);
		if(result.canRestart) {
			console.log('Restarting dynos...');
			heroku.apps('mtgadraftbeta').dynos().restartAll();
		}
	}
});
if(