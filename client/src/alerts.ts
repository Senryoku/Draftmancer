import Swal, { SweetAlertIcon } from "sweetalert2";
import { escapeHTML } from "./helper";

export const SwalCustomClasses = {
	popup: "custom-swal-popup",
	title: "custom-swal-title",
	content: "custom-swal-content",
};

export function fireToast(type: SweetAlertIcon, title: string, text: string = "") {
	Swal.fire({
		toast: true,
		position: "top-end",
		icon: type,
		title: escapeHTML(title),
		text: escapeHTML(text),
		customClass: SwalCustomClasses,
		showConfirmButton: false,
		timer: 3000,
	});
}

export const ButtonColor = {
	Safe: "#3085d6",
	Critical: "#d33",
};

export const Alert = Swal.mixin({
	customClass: SwalCustomClasses,
});
