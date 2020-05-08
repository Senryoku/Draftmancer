function getCookie(cname, def = "") {
	const name = cname + "=";
	const decodedCookie = decodeURIComponent(document.cookie);
	const ca = decodedCookie.split(";");
	for (let i = 0; i < ca.length; i++) {
		let c = ca[i];
		while (c.charAt(0) == " ") {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return def;
}

function setCookie(name, value) {
	document.cookie = name + "=" + (value || "") + ";max-age=31536000;path=/;samesite=strict";
}

function eraseCookie(name) {
	document.cookie = name + "=;max-age=-99999999;path=/;samesite=strict";
}
