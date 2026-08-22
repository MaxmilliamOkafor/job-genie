const linkedInRegexp = new RegExp(/^https:\/\/www.linkedin.com\//);

chrome.runtime.onInstalled.addListener(function () {
    chrome.storage.sync
        .set({
            authorization_status: null,
            leadrocks_url: "https://leadrocks.io",
            //leadrocks_url: "http://127.0.0.1:8080",
            widgetX: 0,
            widgetY: 0,
            widget_mode: "on",
        })
        .then();

    storeElement("laptop", "/components/laptop.html");
    storeElement("loadingSpinner", "/components/loading-spinner.html");
    storeElement("exportButton", "/components/export-button.html");
    storeElement("modal", "/components/modal.html");

    storeElement("unauthPage", "/pages/unauthtorized.html");
    storeElement("instructions", "/pages/instructions.html");
});

// listen tab info change
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    getCurrentTab().then(function (tab) {
        if (tab && tabId === tab.id && linkedInRegexp.test(tab.url)) {
            if (changeInfo.status === "loading") {
                chrome.storage.sync.set({ current_tab_url: tab.url }).then();
            }
        }
    });
});

// reset authorization status if no linkedIn tab opened
chrome.tabs.onRemoved.addListener(function () {
    chrome.storage.sync.get(["authorization_status"], function ({ authorization_status }) {
        if (authorization_status !== null) {
            chrome.tabs.query({}).then(function (tabs) {
                if (!tabs.some(({ url }) => linkedInRegexp.test(url))) {
                    chrome.storage.sync.set({ authorization_status: null }).then();
                }
            });
        }
    });
});

// helpers
function storeElement(key, file) {
    fetch(chrome.runtime.getURL(file))
        .then(r => r.text())
        .then(html => {
            chrome.storage.sync
                .set({
                    [key]: html,
                })
                .then();
        });
}

async function getCurrentTab() {
    let queryOptions = { active: true, currentWindow: true };
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}
