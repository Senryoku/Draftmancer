var darkThemeSelected = false;
if (typeof Storage !== "undefined") {
    var theme = localStorage.getItem("darkSwitch") !== null && localStorage.getItem("darkSwitch");
    if (theme && theme === 'dark') {
        darkThemeSelected = true;
    } else if (theme && theme === 'light') {
        darkThemeSelected = false;
    } else if (!theme) {
        if (matchMedia('(prefers-color-scheme: dark)').matches) {
            darkThemeSelected = true;
        }
    }
}
darkThemeSelected ? document.body.setAttribute("data-theme", "dark") : document.body.removeAttribute("data-theme");