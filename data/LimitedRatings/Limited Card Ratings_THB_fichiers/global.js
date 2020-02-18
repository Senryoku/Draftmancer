function darkModeToggle(state) {
    if (state) {
        document.body.setAttribute("data-theme", "dark");
        localStorage.setItem("darkSwitch", "dark");
    } else {
        document.body.removeAttribute("data-theme");
        localStorage.setItem("darkSwitch", "light");
    }
}

//Checks if current window is selected
var visAPI = (function () {
    var stateKey, eventKey, keys = {
        hidden: "visibilitychange",
        webkitHidden: "webkitvisibilitychange",
        mozHidden: "mozvisibilitychange",
        msHidden: "msvisibilitychange"
    };
    for (stateKey in keys) {
        if (stateKey in document) {
            eventKey = keys[stateKey];
            break;
        }
    }
    return function (c) {
        if (c) document.addEventListener(eventKey, c);
        return !document[stateKey];
    };
})();

function showTimeAgo(data) {
    var now = moment.utc();
    var updated = moment.utc(data);
    var daysDifference = now.diff(updated, 'days');
    var hoursDifference = now.diff(updated, 'hours');
    var minutesDifference = now.diff(updated, 'minutes');
    var timePlural = " ";
    if (daysDifference < 1 && hoursDifference < 1) {
        timePlural = minutesDifference === 1 ? ' minute' : ' minutes';
        return minutesDifference + timePlural;
    } else if (daysDifference < 1) {
        timePlural = hoursDifference === 1 ? ' hour' : ' hours';
        return hoursDifference + timePlural;
    }
    else {
        timePlural = daysDifference === 1 ? ' day' : ' days';
        return daysDifference + timePlural;
    }
}

var globalJS =
{
    mtgSymbolConverter: function (str, newline) {
        str = str.replace(/{W}/g, '<i class="ms ms-w ms-cost ms-shadow"></i>').
            replace(/{U}/g, '<i class="ms ms-u ms-cost ms-shadow"></i>').
            replace(/{B}/g, '<i class="ms ms-b ms-cost ms-shadow"></i>').
            replace(/{R}/g, '<i class="ms ms-r ms-cost ms-shadow"></i>').
            replace(/{G}/g, '<i class="ms ms-g ms-cost ms-shadow"></i>').
            replace(/{W\/U}/g, '<i class="ms ms-wu ms-split ms-cost ms-shadow"></i>').
            replace(/{W\/B}/g, '<i class="ms ms-wb ms-split ms-cost ms-shadow"></i>').
            replace(/{U\/B}/g, '<i class="ms ms-ub ms-split ms-cost ms-shadow"></i>').
            replace(/{U\/R}/g, '<i class="ms ms-ur ms-split ms-cost ms-shadow"></i>').
            replace(/{B\/R}/g, '<i class="ms ms-br ms-split ms-cost ms-shadow"></i>').
            replace(/{B\/G}/g, '<i class="ms ms-bg ms-split ms-cost ms-shadow"></i>').
            replace(/{R\/W}/g, '<i class="ms ms-rw ms-split ms-cost ms-shadow"></i>').
            replace(/{R\/G}/g, '<i class="ms ms-rg ms-split ms-cost ms-shadow"></i>').
            replace(/{G\/W}/g, '<i class="ms ms-gw ms-split ms-cost ms-shadow"></i>').
            replace(/{G\/U}/g, '<i class="ms ms-gu ms-split ms-cost ms-shadow"></i>').
            replace(/{2\/W}/g, '<i class="ms ms-2w ms-split ms-cost ms-shadow"></i>').
            replace(/{2\/U}/g, '<i class="ms ms-2u ms-split ms-cost ms-shadow"></i>').
            replace(/{2\/B}/g, '<i class="ms ms-2b ms-split ms-cost ms-shadow"></i>').
            replace(/{2\/R}/g, '<i class="ms ms-2r ms-split ms-cost ms-shadow"></i>').
            replace(/{2\/G}/g, '<i class="ms ms-2g ms-split ms-cost ms-shadow"></i>').
            replace(/{W\/P}/g, '<i class="ms ms-wp ms-cost ms-shadow"></i>').
            replace(/{U\/P}/g, '<i class="ms ms-up ms-cost ms-shadow"></i>').
            replace(/{B\/P}/g, '<i class="ms ms-bp ms-cost ms-shadow"></i>').
            replace(/{R\/P}/g, '<i class="ms ms-rp ms-cost ms-shadow"></i>').
            replace(/{G\/P}/g, '<i class="ms ms-gp ms-cost ms-shadow"></i>').
            replace(/{C}/g, '<i class="ms ms-c ms-cost ms-shadow"></i>').
            replace(/{E}/g, '<i class="ms ms-e ms-cost ms-shadow"></i>').
            replace(/{S}/g, '<i class="ms ms-s ms-cost ms-shadow"></i>').
            replace(/{CHAOS}/g, '<i class="ms ms-chaos ms-cost ms-shadow"></i>').
            replace(/\{X}/g, '<i class="ms ms-x ms-cost ms-shadow"></i>').
            replace(/\{0}/g, '<i class="ms ms-0 ms-cost ms-shadow"></i>').
            replace(/\{1}/g, '<i class="ms ms-1 ms-cost ms-shadow"></i>').
            replace(/\{2}/g, '<i class="ms ms-2 ms-cost ms-shadow"></i>').
            replace(/\{3}/g, '<i class="ms ms-3 ms-cost ms-shadow"></i>').
            replace(/\{4}/g, '<i class="ms ms-4 ms-cost ms-shadow"></i>').
            replace(/\{5}/g, '<i class="ms ms-5 ms-cost ms-shadow"></i>').
            replace(/\{6}/g, '<i class="ms ms-6 ms-cost ms-shadow"></i>').
            replace(/\{7}/g, '<i class="ms ms-7 ms-cost ms-shadow"></i>').
            replace(/\{8}/g, '<i class="ms ms-8 ms-cost ms-shadow"></i>').
            replace(/\{9}/g, '<i class="ms ms-9 ms-cost ms-shadow"></i>').
            replace(/\{10}/g, '<i class="ms ms-10 ms-cost ms-shadow"></i>').
            replace(/\{11}/g, '<i class="ms ms-11 ms-cost ms-shadow"></i>').
            replace(/\{12}/g, '<i class="ms ms-12 ms-cost ms-shadow"></i>').
            replace(/\{13}/g, '<i class="ms ms-13 ms-cost ms-shadow"></i>').
            replace(/\{14}/g, '<i class="ms ms-14 ms-cost ms-shadow"></i>').
            replace(/\{15}/g, '<i class="ms ms-15 ms-cost ms-shadow"></i>').
            replace(/\{16}/g, '<i class="ms ms-16 ms-cost ms-shadow"></i>').
            replace(/\{17}/g, '<i class="ms ms-17 ms-cost ms-shadow"></i>').
            replace(/\{18}/g, '<i class="ms ms-18 ms-cost ms-shadow"></i>').
            replace(/\{19}/g, '<i class="ms ms-19 ms-cost ms-shadow"></i>').
            replace(/\{20}/g, '<i class="ms ms-20 ms-cost ms-shadow"></i>').
            replace(/{T}/g, '<i class="ms ms-tap ms-cost ms-shadow"></i>').
            replace(/{Q}/g, '<i class="ms ms-untap ms-cost"></i>');
        if (newline === true) {
            str = str.replace(/\n/g, '<br />');
        }
        return str;
    }
};

function objectifyForm(formArray) {
    var returnArray = {};
    for (var i = 0; i < formArray.length; i++) {
        returnArray[formArray[i]['name']] = formArray[i]['value'];
    }
    return returnArray;
}

function htmlDecode(input) {
    var doc = new DOMParser().parseFromString(input, "text/html");
    return doc.documentElement.textContent;
}


function showToastMsg(type, counter, date, read, sourceUsername, objectId, description) {
    var output = '<div class="toast w-100 mb-1" role="alert" aria-live="assertive" aria-atomic="true" data-autohide="false">';
    var divClass = '';
    if (read === false) {
        divClass = 'bg-primary text-white';
    }
    switch (type) {
        case 0:
            if (counter === 1) {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Deck Like</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> liked <a href="/Deck/Public/' + objectId + '">' + description + '</a></div></div>';
            }
            else {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Deck Likes</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a>  and ' + (counter - 1) + ' more liked <a href="/Deck/Public/' + objectId + '">' + description + '</a></div></div>';
            }
            break;
        case 1:
            if (counter === 1) {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Deck Comment</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href = "/User/' + sourceUsername + '" > ' + sourceUsername + '</a > commented <a href = "/Deck/Public/' + objectId + '#comments" > ' + description + '</a></div></div>';
            }
            else {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Deck Comments</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> and ' + (counter - 1) + ' more commented <a href="/Deck/Public/' + objectId + '#comments">' + description + '</a></div></div>';
            }
            break;
        case 2:
            if (counter === 1) {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">New Follower</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> followed you</div></div>';
            }
            else {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">New Followers</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> and ' + (counter - 1) + ' more followed you</div></div>';
            }
            break;
        case 3:
            output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">New Deck</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> created the deck <a href="/Deck/Public/' + objectId + '">' + description + '</a></div></div>';
            break;
        case 4:
            output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">New Tourney</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> created the public Tournament <a href="/Tourney/RoundTourney/' + objectId + '">' + description + '</a></div></div>';
            break;
        case 5:
            if (counter === 1) {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Article Like</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> liked <a href="/Article/' + description + '">' + decodeURIComponent(decodeURI(description.replace(/-/g, ' '))) + '</a></div></div>';
            }
            else {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Article Likes</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> and ' + (counter - 1) + ' more liked <a href="/Article/' + description + '">' + decodeURIComponent(description.replace(/-/g, ' ')) + '</a></div></div>';
            }
            break;
        case 6:
            if (counter === 1) {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Article Comment</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> commented <a href="/Article/' + description + '#comments">' + decodeURIComponent(description.replace(/-/g, ' ')) + '</a></div></div>';
            }
            else {
                output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Article Comments</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> and ' + (counter - 1) + ' more commented <a href="/Article/' + description + '#comments">' + decodeURIComponent(description.replace(/-/g, ' ')) + '</a></div></div>';
            }
            break;
        case 7:
            output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">Global message</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1">' + description + '</div></div>';
            break;
        //case 8:
        //    output += showToastMsg('Purchase', data.msg[i].description, data.msg[i].eventTime, data.msg[i].read);
        //    globalmsg = true;
        //    break;
        case 9:
            output += '<div class="toast-header pt-0 pb-0 ' + divClass + '"><strong class="mr-auto">New Article</strong><small>' + date + '</small></div><div class="toast-body pt-1 pb-1"><a href="/User/' + sourceUsername + '">' + sourceUsername + '</a> published <a href="/Article/' + description + '">a new article.</a></div></div>';
            break;
        default:
            break;
    }
    return output;
}

function popupMessage(message, mseconds, error) {
    $('#popupMsg').toggleClass('alert-success', !error).toggleClass('alert-danger', error).html(message).toggleClass('show', true);
    setTimeout(function () {
        $('#popupMsg').toggleClass('show', false);
    }, mseconds);
}

function getUrlParams(prop) {
    var params = {};
    var search = decodeURIComponent(window.location.href.slice(window.location.href.indexOf('?') + 1));
    var definitions = search.split('&');

    definitions.forEach(function (val, key) {
        var parts = val.split('=', 2);
        params[parts[0]] = parts[1];
    });

    return (prop && prop in params) ? params[prop] : params;
}


$(document).ready(function () {
    var Twitchplayer = '';
    var darkSwitch = document.getElementById("darkSwitch");
    if (darkSwitch) {
        if (typeof window.darkThemeSelected !== 'undefined') {
            darkSwitch.checked = window.darkThemeSelected;
        }
    }

    $(".ae-darkmode-toggle").on('click', function () {
        if (darkSwitch.checked) {
            darkSwitch.checked = false;
            darkModeToggle(false);
        }
        else {
            darkSwitch.checked = true;
            darkModeToggle(true);
        }
    });

    $('#ae-logout').click(function () {
        $('#ae-logout-return').val(window.location.pathname);
        document.getElementById('logoutForm').submit();
    });
    $("#sidebar").mCustomScrollbar({
        theme: "minimal"
    });
    window.addEventListener("resize", onresize);

    $('#sidebarCollapse').on('click', function () {
        $('#sidebar').addClass('ae-show-sidebar');
        $('.collapse.in').toggleClass('in');
        var node = document.createElement("div");
        node.className += 'modal-backdrop fade show';
        node.setAttribute("id", "backdrop-overlay");
        document.body.appendChild(node);
    });

    $(document).on('click', '#backdrop-overlay, #dismiss', function () {
        $('#sidebar').removeClass('ae-show-sidebar');
        document.getElementById("backdrop-overlay").remove();
    });

    //Get Notifications
    $('.toast').toast('show');
    var notifications = $('#myNotifications');
    if (notifications.length) {
        if (typeof Storage !== "undefined") {
            var storageNotifications = JSON.parse(localStorage.getItem("Notifications"));
            if (!storageNotifications || Date.now() - storageNotifications.time > 86400000) { //24 hours
                $.ajax
                    ({
                        url: "/Home/MyNotifications",
                        type: "POST",
                        dataType: "json",
                        success: function (data) {
                            if (data.success === true) {
                                var output = '';
                                var count = 0;
                                var toast = [];
                                if (data.msg.length > 0) {
                                    for (i = 0; i < data.msg.length; i++) {
                                        var msg = { type: data.msg[i].type, read: data.msg[i].read, counter: data.msg[i].counter, usr: data.msg[i].sourceUsername, objectId: data.msg[i].objectId, description: data.msg[i].description, eventTime: data.msg[i].eventTime };
                                        if (data.msg[i].type === 7) { //If type is globalmsg
                                            var time = showTimeAgo(data.msg[i].eventTime);
                                            var globalNotification = JSON.parse(localStorage.getItem('globalNotification'));
                                            if (globalNotification) {
                                                if (globalNotification.msg !== data.msg[i].description) {
                                                    localStorage.setItem('globalNotification', JSON.stringify({ time: data.msg[i].eventTime, read: false, msg: data.msg[i].description }));
                                                    count++;
                                                    output += showToastMsg(data.msg[i].type, data.msg[i].counter, time + ' ago', data.msg[i].read, data.msg[i].sourceUsername, data.msg[i].objectId, data.msg[i].description);
                                                }
                                            } else {
                                                localStorage.setItem('globalNotification', JSON.stringify({ time: data.msg[i].eventTime, read: false, msg: data.msg[i].description }));
                                                count++;
                                                output += showToastMsg(data.msg[i].type, data.msg[i].counter, time + ' ago', data.msg[i].read, data.msg[i].sourceUsername, data.msg[i].objectId, data.msg[i].description);
                                            }
                                        } else {
                                            toast.push(msg);
                                            if (data.msg[i].read === false) {
                                                count++;
                                            }
                                            output += showToastMsg(data.msg[i].type, data.msg[i].counter, time + ' ago', data.msg[i].read, data.msg[i].sourceUsername, data.msg[i].objectId, data.msg[i].description);
                                        }
                                    }
                                    notifications.html(output);
                                    $('.toast').toast('show');
                                    notifications.mCustomScrollbar({
                                        theme: "dark"
                                    });
                                    var read = true;
                                    if (count > 0) {
                                        $('#ae-bell-counter-badge').attr('data-count', count);
                                        read = false;
                                    }
                                    var storeNotification = { time: Date.now(), read: read, toasts: toast };
                                    localStorage.setItem('Notifications', JSON.stringify(storeNotification));
                                }
                            }
                        }
                    });
            } else {
                var output = '';
                var count = 0;
                var globalNotification = JSON.parse(localStorage.getItem('globalNotification'));
                if (storageNotifications.toasts.length > 0 || globalNotification) {
                    if (globalNotification) {
                        var timeglobal = showTimeAgo(globalNotification.time);
                        output += showToastMsg(7, null, timeglobal + ' ago', globalNotification.read, null, null, globalNotification.msg);
                        if (globalNotification.read === false) {
                            count++;
                        }
                    }
                    if (storageNotifications.toasts.length > 0) {
                        for (i = 0; i < storageNotifications.toasts.length; i++) {
                            if (storageNotifications.toasts[i].read === false) {
                                count++;
                            }
                            var time = showTimeAgo(storageNotifications.toasts[i].eventTime);
                            output += showToastMsg(storageNotifications.toasts[i].type, storageNotifications.toasts[i].counter, time + ' ago', storageNotifications.toasts[i].read, storageNotifications.toasts[i].usr, storageNotifications.toasts[i].objectId, storageNotifications.toasts[i].description);
                        }
                    }
                    notifications.html(output);
                    $('.toast').toast('show');
                    notifications.mCustomScrollbar({
                        theme: "dark"
                    });
                    if (count > 0) {
                        $('#ae-bell-counter-badge').attr('data-count', count);
                    }
                }
            }
        } else {
            notifications.html('<div class="toast w-100 mb-1" role="alert" aria-live="assertive" aria-atomic="true" data-autohide="false"><div class="toast-header pt-0 pb-0"><strong class="mr-auto">Error</strong></div><div class="toast-body pt-1 pb-1">This browser does not support notifications</div></div>');
        }
    } else {
        if (typeof Storage !== "undefined") {
            localStorage.removeItem('Notifications');
        }
    }

    $('#ae-bell-btn').on('click', function () {
        var self = $(this);
        var notifications = $('#myNotifications');
        if (notifications.length) {
            var unread = self.children().attr('data-count');
            if (unread > 0) {      
                self.children().removeAttr('data-count');
                if (typeof Storage !== "undefined") {
                    var count = 0;
                    var storageNotifications = JSON.parse(localStorage.getItem("Notifications"));
                    var globalNotification = JSON.parse(localStorage.getItem('globalNotification'));
                    if (storageNotifications) {
                        if (storageNotifications.toasts.length > 0) {
                            for (i = 0; i < storageNotifications.toasts.length; i++) {
                                if (storageNotifications.toasts[i].read === false) {
                                    storageNotifications.toasts[i].read = true;
                                    count++;
                                }
                            }
                            localStorage.setItem('Notifications', JSON.stringify(storageNotifications));
                        }
                    }
                    if (globalNotification) {
                        if (globalNotification.read === false) {
                            localStorage.setItem('globalNotification', JSON.stringify({ time: globalNotification.time, read: true, msg: globalNotification.msg }));
                        }
                    }
                    if (count > 0) {
                        $.ajax
                        ({
                            url: "/Home/ReadNotifications",
                            type: "POST",
                            dataType: "json",
                            success: function() {
                            }
                        });
                    }
                }
            }
        }
    });


    if (visAPI() === true && $(window).width() > 767) {
        $.ajax({
            url: '/Home/GetSponsored',
            type: 'POST',
            success: function (data) {
                var sponsored = '';
                if (data.sponsored) {
                    sponsored = data.sponsored;
                } else if (typeof data.teamae !== 'undefined' && data.teamae.length > 0) {
                    var rand = data.teamae[Math.floor(Math.random() * data.teamae.length)];
                    sponsored = rand;
                }
                var frameExist = document.getElementById('SponsoredFrame');
                if (sponsored && frameExist) {
                    setTimeout(function () {
                        var options = {
                            width: 226,
                            height: 170,
                            autoplay: false,
                            channel: sponsored
                        };
                        Twitchplayer = new Twitch.Player("SponsoredFrame", options);
                        //Twitchplayer.setQuality("160p30");
                        Twitchplayer.setMuted(true);
                        if (frameExist.getAttribute('data-play') === 'true') {
                            Twitchplayer.play();
                        }
                    }, 1000);
                }
                else {
                    $('#SponsoredStream').removeClass('d-md-block');
                }
                $(window).on("blur focus", function (e) {
                    var prevType = $(this).data("prevType");
                    if (Twitchplayer && prevType != e.type) { //reduce double fire issues
                        switch (e.type) {
                            case "blur":
                                    setTimeout(function () {
                                        Twitchplayer.pause();
                                        window.PauseSponsorHandle = null;
                                    }, 5000);
                                break;
                            case "focus":
                                Twitchplayer.play();
                        }
                    }
                    $(this).data("prevType", e.type);
                });
            }
        });
    } else {
        $('#SponsoredStream').removeClass('d-md-block');
    }

    //Autocomplete function
    $("#searchM").autocomplete({
        autoFocus: true,
        select: function (event, ui) {
            $("#searchM").val(ui.item.value);
            $(this).closest("form").submit();
        },
        source: function (request, response) {
            $.ajax({
                url: $('body').data('base') + "/Market/Autocomplete",
                type: "POST",
                dataType: "json",
                data: { cardName: request.term },
                autoFocus: true,
                success: function (data) {
                    response($.map(data, function (item) {
                        return { label: item.combinedName, value: item.cardName, text: item.text };
                    }));
                }
            });
        }
    }).autocomplete("instance")._renderItem = function (ul, item) {
        return $("<li>")
            .append("<div><b>" + item.label + (item.text !== undefined && item.text !== null ? "</b><br><small class='autocomplete-desc'><i>" + globalJS.mtgSymbolConverter(item.text, false) + "</i></small>" : "") + "</div>")
            .appendTo(ul);
        };

    $('#login-dp .social-buttons a').on('click', function (e) {
        var provider = $(this).data('value');
        $('#' + provider).click();
        e.preventDefault();
    });
    $(".modal").on('shown.bs.modal', function () {
        $(this).find("[autofocus]:first").focus();
    });
    $('#sidebarCollapse').on('click', function () {
        $('#sidebar').toggleClass('active');
    });
    $(function () {
        $('img.lazy,div.lazy').lazy({ visibleOnly: true });
        $('div.lazytab').lazy({
            tabLoad: function (element) {
                console.log(element);
                element.find('img.lazytab').lazy();
            }
        });
        $('body').on("mouseover", ".hover-imglink", function () {
            $(this).children().children().children().unveil();
        });
    });
});