import Swal, { SweetAlertIcon } from "sweetalert2";
import { escapeHTML } from "./helper";

export const SwalCustomClasses = {
	popup: "custom-swal-popup",
	title: "custom-swal-title",
	content: "custom-swal-content",
};

export const Alert = Swal.mixin({
	customClass: SwalCustomClasses,
});

export function fireToast(type: SweetAlertIcon, title: string, text = "") {
	Alert.fire({
		toast: true,
		position: "top-end",
		icon: type,
		title: escapeHTML(title),
		text: escapeHTML(text),
		showConfirmButton: false,
		timer: 3000,
		timerProgressBar: true,
		didOpen: (toast) => {
			toast.addEventListener("click", (e: Event) => {
				e.preventDefault();
				Swal.close();
			});
		},
	});
}

export function loadingToast(title: string, text = "") {
	Alert.fire({
		toast: true,
		position: "top-end",
		icon: "info",
		title: escapeHTML(title),
		text: escapeHTML(text),
		showConfirmButton: false,
		willOpen: () => {
			Alert.showLoading();
		},
	});
}

export const ButtonColor = {
	Safe: "#3085d6",
	Critical: "#d33",
};
