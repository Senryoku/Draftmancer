import Swal from "sweetalert2";

export const SwalCustomClasses = {
	popup: "custom-swal-popup",
	title: "custom-swal-title",
	content: "custom-swal-content",
};

export function fireToast(type, title, text) {
	Swal.fire({
		toast: true,
		position: "top-end",
		icon: type,
		title: title,
		text: text,
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
