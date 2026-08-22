document.addEventListener("DOMContentLoaded", function () {
    const links = document.getElementsByTagName("a");
    for (let i = 0; i < links.length; i++) {
        (function () {
            if (["widget-reset"].includes(links[i].id)) return;

            const ln = links[i];
            const location = ln.href;

            ln.onclick = function () {
                chrome.tabs.create({ active: true, url: location });
            };
        })();
    }
    init_widget();
});

function init_widget() {
    document.querySelector("#widget-reset").addEventListener("click", function (e) {
        chrome.storage.sync.set({ widgetX: 0, widgetY: 0 });
        e.preventDefault();
    });
}
