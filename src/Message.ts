import { escapeHTML } from "./utils.js";

export class Message {
	icon: string = "info";
	title: string = "Title";
	text: string = "";
	html: string = "";
	footer: string = "";
	constructor(title: string, text: string = "", footer: string = "", html: string = "") {
		this.title = title;
		this.text = text;
		this.html = html;
		this.footer = escapeHTML(footer); // footer is not escaped by swal2
	}
}

export class MessageError extends Message {
	icon: string = "error";
	constructor(title: string, text: string = "", footer: string = "", html: string = "") {
		super(title, text, footer, html);
	}
}

export function isMessageError(obj: any): obj is MessageError {
	return obj instanceof MessageError;
}

export class MessageWarning extends Message {
	icon: string = "warning";
	constructor(title: string, text: string = "", footer: string = "", html: string = "") {
		super(title, text, footer, html);
	}
}

export class SocketAck {
	code: number = 0;
	error?: MessageError = undefined;
	warning?: MessageWarning = undefined;

	constructor(error?: MessageError) {
		this.error = error;
		if (isMessageError(error)) this.code = -1;
	}
}

export class SocketError extends SocketAck {
	constructor(title: string, text: string = "", footer: string = "", html: string = "") {
		super(new MessageError(title, text, footer, html));
		this.code = -1;
	}
}

export function ackError(props: {
	title: string;
	text?: string;
	html?: string;
	footer?: string;
	code?: number;
}): SocketError {
	const s = new SocketError(props.title, props.text, props.footer, props.html);
	if (props.code) s.code = props.code;
	return s;
}
