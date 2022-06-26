export class Message {
	icon: string = "info";
	title: string = "Title";
	text: string = "";
	footer: string = "";
}

export class MessageError extends Message {
	icon: string = "error";
	constructor(title: string, text: string = "", footer: string = "") {
		super();
		this.title = title;
		this.text = text;
		this.footer = footer;
	}
}

export class SocketAck {
	code: number = 0;
	error?: MessageError = undefined;

	constructor(error?: MessageError) {
		this.error = error;
	}
}

export class SocketError extends SocketAck {
	constructor(title: string, text: string = "", footer: string = "") {
		super(new MessageError(title, text, footer));
		this.code = -1;
	}
}
