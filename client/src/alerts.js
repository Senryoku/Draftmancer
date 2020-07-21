import Swal from "sweetalert2";

export const SwalCustomClasses = {
	popup: "custom-swal-popup",
	title: "custom-swal-title",
	content: "custom-swal-content",
};

export function fireToast(type, title) {
	Swal.fire({
		toast: true,
		position: "top-end",
		icon: type,
		title: title,
		customClass: SwalCustomClasses,
		showConfirmButton: false,
		timer: 2000,
	});
}
