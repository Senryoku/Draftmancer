var http = require('http');
var url = require('url');
var fs = require('fs');

function serverError(res) {
	res.writeHead(404, {'Content-Type': 'text/html'});
	return res.end("404 Not Found");
}

function serveFile(filename, res) {
	fs.readFile("." + filename, function(err, data) {
		if (err) return serverError(res);
		res.writeHead(200, {'Content-Type': 'text/html'});
		res.write(data);
		return res.end();
	});
}

const files = ["/index.html"];

const routes = {
	"/": function(res) { return serveFile('/index.html', res); },
	"/boosters": function(res) {
		res.writeHead(200, {'Content-Type': 'text/html'});
		for(let f in files)
			res.write(files[f]);
		return res.end();
	}
};

http.createServer(function (req, res) {
	var q = url.parse(req.url, true);
	console.log(q.pathname);
	console.log(files);
	console.log(q.pathname in files);
	if(files.indexOf(q.pathname) != -1) {
		return serveFile(q.pathname, res);
	} else if(q.pathname in routes) {
		return routes[q.pathname](res);
	} else {
		return serverError(res);
	}
}).listen(8080);
