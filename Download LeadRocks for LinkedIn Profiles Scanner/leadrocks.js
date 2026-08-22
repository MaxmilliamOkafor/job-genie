// get settigs
chrome.storage.sync.get(["leadrocks_url", "s"], function ({ leadrocks_url, s }) {
    if (document.querySelector(".ex_s")) document.querySelector(".ex_s").value = s;

    // listen authorization status message
    addEventListener(
        "message",
        function (e) {
            if (e.origin.includes(leadrocks_url)) {
                if (["is_authorized", "not_authorized"].includes(e.data)) {
                    chrome.storage.sync.set({ authorization_status: e.data }).then();
                }
                if (e.data === "logout") {
                    chrome.storage.sync.set({ authorization_status: null }).then();
                }
                if (e.data === "payment_success") {
                    chrome.storage.sync.set({ payment_success: true }).then();
                }
                if (e.data === "can_close_tab") {
                    chrome.runtime.sendMessage({ action: "can-close-tab" });
                }
            }
        },
        false
    );
});
