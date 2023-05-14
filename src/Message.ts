import { escapeHTML } from "./utils.js";

type MessageIcon = "error" | "success" | "warning" | "info" | "question";

// Maps directly to a client side Swal
export class Message {
	icon: MessageIcon = "info";
	title: string = "Title";
	text?: string = undefined;
	html?: string = undefined;
	footer?: string = undefined;

	toast: boolean = false;
	allowOutsideClick: boolean = true;
	showConfirmButton: boolean = true;
	timer: number = 0;
	imageUrl?: string = undefined;

	constructor(
		title: string,
		text: string | undefined = undefined,
		footer: string | undefined = undefined,
		html: string | undefined = undefined
	) {
		this.title = title;
		this.text = text;
		this.html = html;
		this.footer = footer ? escapeHTML(footer) : undefined; // footer is not escaped by swal2
	}
}

export class MessageError extends Message {
	icon: MessageIcon = "error";
	constructor(title: string, text: string = "", footer: string = "", html: string = "") {
		super(title, text, footer, html);
	}
}

export function isMessageError(obj: unknown): obj is MessageError {
	return obj instanceof MessageError;
}

export class MessageWarning extends Message {
	icon: MessageIcon = "warning";
	constructor(title: string, text: string = "", footer: string = "", html: string = "") {
		super(title, text, footer, html);
	}
}

export class SocketAck {
	code: number = 0;
	error?: MessageError = undefined;
	warning?: MessageWarning = undefined;

	constructor(error?: MessageError) {
		// FIXME: This makes no sense :))
		this.error = error;
		if (isMessageError(error)) this.code = -1;
	}
}

export class SocketError extends SocketAck {
	constructor(
		title: string,
		text: string | undefined = undefined,
		footer: string | undefined = undefined,
		html: string | undefined = undefined
	) {
		super(new MessageError(title, text, footer, html));
		this.code = -1;
	}
}

export function isSocketError(obj: unknown): obj is SocketError {
	return (obj instanceof SocketAck && obj.code !== 0) || obj instanceof SocketError;
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
