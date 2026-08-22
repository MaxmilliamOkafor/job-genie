// settings
const cly = {
  storage: {
    currentPage: null,
    maxPages: null,
  },
  csvTitles: ["linkedin_url", "first_name", "last_name", "location", "job_title", "company"],
  exportButtonChecker: null,
  resultsContainerChecker: null,
  maxesSetFromPage: null,
  collectPeopleFailTimer: null,
  eventDuplicationsTimer: null,
};
cly.peopleList = [cly.csvTitles];

/*function _lrl() {
  let args = arguments;
  args.unsift('[LR]');
  console.log(...args);
}*/

// listen extension events
function clyEventsCallback(event) {
  clearTimeout(cly.eventDuplicationsTimer);
  cly.eventDuplicationsTimer = setTimeout(function () {
    if (event.detail.name === "pagination-found") {
      getPagesCount();
    }
    if (event.detail.name === "collect-people") {
      let muThrottle;
      const muobserver = new MutationObserver(function () {
        clearTimeout(muThrottle);
        muThrottle = setTimeout(function () {
          const has_results = getEl(".app-aware-link");
          const no_results = getEl('[data-test="no-results-cta"]');
          const clear_filters = getEl(".artdeco-empty-state__headline");
          console.log('[LR]', '[collect people / results]', has_results);

          if (clear_filters) {
            chrome.storage.sync.set({ export_status: "interrupted" }).then(function () {
              getEl(".lrck--interrupted_on").innerText = getPageFromUrl();
              getEl(".lrck--people_found").innerText = cly.peopleList.length - 1;
            });
            softEjectExportButton();
          }

          if (no_results) {
            setTimeout(function () {
              no_results.click();
            }, 500);
          }

          if (has_results) {
            getPagesCount();
            muobserver.disconnect();
          }
        }, 500);
      });
      muobserver.observe(document.body, { childList: true, subtree: true });
    }
    if (event.detail.name === "show-export-button") {
      setTimeout(function () {
        injectExportButton();
      }, 100);
    }
    if (event.detail.name === "hide-export-button") ejectExportButton();
  }, 10);
}
const clyEvents = document.createElement("a");
clyEvents.addEventListener("clyEvent", clyEventsCallback);

// reset settings and show widget
chrome.storage.sync
  .set({
    authorization_status: null,
    export_status: "waiting",
    lang: detectLanguage(),
    //isSN: /^https:\/\/www.linkedin.com\/sales\/search\/people/.test(document.location.href),
    isSN: false,
    credits_list: null,
    profile_info: null,
    contact_fetching: false,
    toast: null,
  })
  .then(function () {
    chrome.storage.sync.get(null, function ({ leadrocks_url, authorization_status, widget_size, widgetX, widgetY, s }) {
      // get stored settigs and init extension
      showWidget(leadrocks_url, authorization_status, widget_size, widgetX, widgetY, s);
    });
  });

// listen storage changes
chrome.storage.onChanged.addListener(function (changes) {
  for (let [key, { newValue }] of Object.entries(changes)) {
    if (key === "authorization_status") {
      if (newValue === "not_authorized") {
        getEl(".lrck--widget", null, true).then(function (widget) {
          if (!widget.classList.contains("lrck--unsigned")) widget.classList.add("lrck--unsigned");
        });
        showPage("unauthorized");
      }
      if (newValue === "is_authorized") {
        getEl(".lrck--widget", null, true).then(function (widget) {
          widget.classList.remove("lrck--unsigned");
        });
        chrome.storage.sync.get(["current_tab_url", "credits_list"], function ({ current_tab_url }) {
          checkUrl(current_tab_url);
        });
      }
    }

    if (key === "current_tab_url") {
      checkUrl(newValue);
    }

    if (key === "export_status") {
      if (newValue === "working") {
        try {
          getEl(".lrck--export-inprogress").style.display = "block";
          getEl(".lrck--export-prepare").style.display = "none";
          getEl(".lrck--export-settings").style.display = "none";
          getEl(".lrck--export-error").style.display = "none";
          getEl(".lrck--export-success").style.display = "none";
          getEl(".lrck--export-interrupted").style.display = "none";
        } catch (e) {}
      }
      if (newValue === "finished") {
        try {
          getEl(".lrck--export-success").style.display = "block";
          getEl(".lrck--export-settings").style.display = "none";
          getEl(".lrck--export-error").style.display = "none";
          getEl(".lrck--export-inprogress").style.display = "none";
          getEl(".lrck--export-interrupted").style.display = "none";
          getEl(".lrck--export-prepare").style.display = "none";
        } catch (e) {}
      }
      if (newValue === "waiting") {
        try {
          getEl(".lrck--export-settings").style.display = "block";
          getEl(".lrck--export-error").style.display = "none";
          getEl(".lrck--export-success").style.display = "none";
          getEl(".lrck--export-inprogress").style.display = "none";
          getEl(".lrck--export-interrupted").style.display = "none";
          getEl(".lrck--export-prepare").style.display = "none";
        } catch (e) {}
      }
      if (newValue === "error") {
        try {
          getEl(".lrck--export-error").style.display = "block";
          getEl(".lrck--export-settings").style.display = "none";
          getEl(".lrck--export-success").style.display = "none";
          getEl(".lrck--export-inprogress").style.display = "none";
          getEl(".lrck--export-interrupted").style.display = "none";
          getEl(".lrck--export-prepare").style.display = "none";
        } catch (e) {}
      }
      if (newValue === "interrupted") {
        try {
          getEl(".lrck--export-interrupted").style.display = "block";
          getEl(".lrck--export-error").style.display = "none";
          getEl(".lrck--export-settings").style.display = "none";
          getEl(".lrck--export-success").style.display = "none";
          getEl(".lrck--export-inprogress").style.display = "none";
          getEl(".lrck--export-prepare").style.display = "none";
        } catch (e) {}
      }
    }

    if (key === "profile_info") {
      renderProfile();
    }

    if (key === "credits_list") {
      renderCredist(newValue);
    }

    if (key === "contact_fetching") {
      if (newValue) {
        getEl(".lrck--contacts-fetching").classList.add("lrck--shown");
      } else {
        getEl(".lrck--contacts-fetching").classList.remove("lrck--shown");
      }
    }

    if (key === "toast") {
      if (newValue) {
        getEl(".lrck--toast").classList.add("lrck--toast-shown");
        getEl(".lrck--toast-message").innerText = newValue;
        chrome.storage.sync.get(["toastType"], function ({ toastType }) {
          if (toastType === "error") {
            getEl(".lrck--valid-icon").classList.add("lrck--hidden");
            getEl(".lrck--invalid-icon").classList.remove("lrck--hidden");
          } else {
            getEl(".lrck--invalid-icon").classList.add("lrck--hidden");
            getEl(".lrck--valid-icon").classList.remove("lrck--hidden");
          }
        });
        setTimeout(function () {
          getEl(".lrck--toast").classList.remove("lrck--toast-shown");
          chrome.storage.sync.set({ toast: null, toastType: "success" }).then();
        }, 2000);
      }
    }

    if (key === "payment_success") {
      if (newValue) {
        chrome.storage.sync.set({ payment_success: false }).then();
      }
    }
  }

  if (changes.widgetX && changes.widgetY) {
    document.querySelector(".lrck--widget").style.transform = `translate(${changes.widgetX.newValue}px, ${changes.widgetY.newValue}px)`;
  }
});

function showWidget(url, status, size, x, y) {
  if (getEl(".lrck--widget")) return;

  const widget = document.createElement("div");
  widget.className = `lrck--widget lrck--flex lrck--flex-col lrck--flex-str ${size === "min" ? "lrck--min" : ""} lrck--unsigned`;
  widget.style.transform = `translate(${x}px, ${y}px)`;

  const header = document.createElement("div");
  header.className = "lrck--header-widget";
  header.innerHTML = `
<div class="lrck--header-minimized lrck--expand-event"></div>
<div class="lrck--header-expanded lrck--flex lrck--flex-sb">
  <a href="https://leadrocks.io/my" target="_blank" class="lrck--logo lrck--beta"></a>
  <div class="lrck--toggle lrck--minimize-event"></div>
</div>
`;

  const contents = document.createElement("div");
  contents.className = "lrck--content-wrapper-widget";
  contents.innerHTML = '<div class="lrck--content-widget lrck--flex lrck--flex-col"></div>';
  const content = contents.querySelector(".lrck--content-widget");

  if (status) {
    console.log(status);
    if (status === "not_authorized") {
      showPage("unauthorized", content);
    } else {
      checkUrl(document.location.href, content);
    }
  } else {
    chrome.storage.sync.get(["laptop"], function ({ laptop }) {
      content.innerHTML = laptop;
      renderLaptop(content, "loading");
    });
  }

  const tabs = document.createElement("div");
  tabs.className = "lrck--tabs-widget";
  renderHTML("components/tabs.html", tabs).then(function () {
    getEls(".lrck--tab").forEach(function (tab) {
      tab.onclick = function () {
        if (!tab.classList.contains("lrck--tab-active")) setActiveTab(tab.dataset.clyTab);
      };
    });
  });

  const credits = document.createElement("div");
  credits.className = "lrck--credits-widget";
  renderHTML("components/credits.html", credits).then(function () {
    getEl(".lrck--dashboard-icon").src = chrome.runtime.getURL("/icons/logout.svg");
    getEl(".lrck--logout").onclick = logout;

    chrome.storage.sync.get(["leadrocks_url", "s"], function ({ leadrocks_url }) {
      getEl(".lrck--ifr").src = leadrocks_url + "/extension-login";
    });
  });

  const toaster = document.createElement("div");
  toaster.className = "lrck--toaster-widget";
  renderHTML("components/toast.html", toaster).then(function () {
    getEl(".lrck--valid-icon").src = chrome.runtime.getURL("/icons/valid.svg");
    getEl(".lrck--invalid-icon").src = chrome.runtime.getURL("/icons/invalid.svg");
  });

  const fader = document.createElement("div");
  fader.className = "lrck--loading-fader lrck--hidden";
  renderHTML("components/loading-spinner.html", fader).then();

  widget.appendChild(fader);
  widget.appendChild(toaster);
  widget.appendChild(header);
  widget.appendChild(credits);
  widget.appendChild(contents);
  widget.appendChild(tabs);

  // show widget
  document.body.appendChild(widget);
  makeDragable(".lrck--widget", ".lrck--header-widget");

  renderHTML("components/modal.html", document.body).then(() =>
    renderHTML("pages/export-modal.html", getEl(".lrck--modal"), true).then(() => {
      document.querySelectorAll(".lrck--button-save-export").forEach(function (i) {
        i.onclick = saveCSV;
      });

      getEl(".lrck--button-continue").onclick = function () {
        collectPeople();
      };

      const input = getEl(".lrck--innput-people-export");

      document.querySelectorAll(".lrck--button-cancel").forEach(function (i) {
        i.onclick = e => {
          e.preventDefault();
          resetExportSettings();
          getEl(".lrck--modal-wrapper").classList.remove("lrck--modal-shown");
        };
      });

      input.onkeyup = function () {
        chrome.storage.sync.set({ peopleToExport: this.value }).then();
      };
      input.onchange = function () {
        chrome.storage.sync.set({ peopleToExport: this.value }).then();
      };

      getEl(".lrck--export-form").onsubmit = e => {
        //console.log('hi');
        e.preventDefault();
        collectPeople();
      };

      chrome.storage.local.get(["export_status"], function ({ export_status }) {
        if (export_status === "interrupted") {
          showExportModal(true);
        }
      });
    })
  );

  // widget window minimize
  const minimize = document.querySelector(".lrck--minimize-event");
  minimize.addEventListener("click", function () {
    const widget = document.querySelector(".lrck--widget");
    if (!widget.classList.contains("lrck--min")) {
      widget.classList.add("lrck--min");
      chrome.storage.sync.set({ widget_size: "min" }).then();
    }
  });
  // widget window restore
  const restore = document.querySelector(".lrck--expand-event");
  restore.addEventListener("click", function () {
    if (cly.dragging) return;
    const widget = document.querySelector(".lrck--widget");
    if (widget.classList.contains("lrck--min")) {
      chrome.storage.sync.set({ widget_size: "" }).then();
      widget.classList.remove("lrck--min");
    }
  });

  getCredits();

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      getCredits();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange, false);
}

function checkUrl(url, content) {
  chrome.storage.sync.get(["authorization_status"], function ({ authorization_status }) {
    if (authorization_status === "is_authorized") {
      if (!/^https:\/\/www.linkedin.com\/search\/results\/people/.test(url) /*&& !/^https:\/\/www.linkedin.com\/sales\/search\/people/.test(url)*/) {
        cly.storage.currentPage = null;
        cly.storage.maxPages = null;

        clyEvents.dispatchEvent(new CustomEvent("clyEvent", { detail: { name: "hide-export-button" } }));

        const lid = url.split("/in/")[1]?.split("/")[0];
        if (lid) {
          chrome.storage.sync.set({ profile_info: null }).then();
          getProfile(lid);
          showPage("profile", content);
          toggleprofileTab(true);
        } else {
          showPage("pageIsNotSupported", content);
          toggleprofileTab(false);
        }
      } else {
        showPage("authorized", content);
        toggleprofileTab(false);
      }
    } else if (authorization_status === "not_authorized") {
      showPage("unauthorized", content);
      toggleprofileTab(false);
    }
  });
}

function toggleprofileTab(enable) {
  if (enable) {
    getEl('[data-cly-tab="profile"]')?.classList.remove("lrck--tab-disabled");
  } else {
    getEl('[data-cly-tab="profile"]')?.classList.add("lrck--tab-disabled");
  }
}

function showPage(page, elem, callback) {
  const content = elem || document.querySelector(".lrck--content-widget");

  if (!content || !page) return;

  clyEvents.dispatchEvent(new CustomEvent("clyEvent", { detail: { name: "hide-export-button" } }));

  switch (page) {
    case "unauthorized": {
      chrome.storage.sync.get(["laptop", "unauthPage", "leadrocks_url"], function ({ laptop, unauthPage, leadrocks_url }) {
        content.innerHTML = unauthPage;
        const fragment = document.createRange().createContextualFragment(laptop);
        content.querySelector(".lrck--content-unauth").prepend(fragment);
        renderLaptop(content, "login");
        let s = null;

        const emailBlock = content.querySelector(".lrck--enter-email");
        const pinBlock = content.querySelector(".lrck--enter-pin");

        const emailSubmitForm = content.querySelector(".lrck--login-email");
        const pinSubmitForm = content.querySelector(".lrck--login-pin");

        emailSubmitForm.querySelector("input").focus();

        getEl(".lrck--go-back").onclick = function () {
          s = null;
          chrome.storage.sync.set({ s });
          pinBlock.classList.add("lrck--hidden");
          emailBlock.classList.remove("lrck--hidden");
          emailSubmitForm.querySelector("input").focus();
        };

        emailSubmitForm.onsubmit = function (e) {
          e.preventDefault();
          const email = emailSubmitForm.querySelector("input").value;
          showSpinner(true);
          request(leadrocks_url, { email })
            .then(r => r.json())
            .then(r => {
              if (r.s) {
                emailBlock.classList.add("lrck--hidden");
                pinBlock.classList.remove("lrck--hidden");
                s = r.s;
                chrome.storage.sync.set({ s });

                pinBlock.querySelector(".lrck--content-description-bigger").textContent = email;
              }
            })
            .catch(e => {
              chrome.storage.sync.set({ toast: "An error occured", toastType: "error" }).then();
            })
            .finally(() => showSpinner(false));
        };

        pinSubmitForm.onsubmit = function (e) {
          e.preventDefault();
          const pin = pinSubmitForm.querySelector("input").value;
          showSpinner(true);
          request(leadrocks_url, { pin, s })
            .then(r => r.json())
            .then(({ accepted }) => {
              if (accepted) {
                chrome.storage.sync.set({ authorization_status: "is_authorized" }).then();
                getCredits();
              } else {
                chrome.storage.sync.set({ toast: "Pin is not valid", toastType: "error" }).then();
              }
            })
            .catch(e => {
              chrome.storage.sync.set({ toast: "An error occured", toastType: "error" }).then();
            })
            .finally(() => showSpinner(false));
        };
      });

      break;
    }
    case "authorized": {
      chrome.storage.sync.get(["instructions"], function ({ instructions }) {
        content.innerHTML = instructions;
      });
      getCredits();
      clyEvents.dispatchEvent(new CustomEvent("clyEvent", { detail: { name: "show-export-button" } }));
      break;
    }
    case "pageIsNotSupported": {
      chrome.storage.sync.get(["instructions"], function ({ instructions }) {
        content.innerHTML = instructions;
      });
      break;
    }
    case "profile": {
      renderHTML("/pages/profile.html", content, true).then(function () {
        if (callback) callback();
      });
    }
  }
  switch (page) {
    case "profile":
      setActiveTab("profile", false);
      break;
    default:
      setActiveTab("info", false);
  }
}

function setActiveTab(tabName, activatePage = true) {
  getEl('[data-cly-tab="' + tabName + '"]', null, true).then(function (targetTab) {
    if (!targetTab.classList.contains("lrck--tab-disabled")) {
      getEl(".lrck--tab-active", null, true).then(function (activeTab) {
        if (activeTab.dataset.clyTab !== tabName) activeTab.classList.remove("lrck--tab-active");

        targetTab.classList.add("lrck--tab-active");

        if (activatePage) {
          switch (tabName) {
            case "profile": {
              showPage("profile", false, renderProfile);
              break;
            }
            default:
              showPage("authorized");
          }
        }
      });
    }
  });
}

function injectExportButton() {
  try {
    cly.exportButtonChecker.disconnect();
    cly.resultsContainerChecker.disconnect();
  } catch (e) {}

  function renderExportButton(resultsContainer, exportButton, isSN) {
    const button = document.createRange().createContextualFragment(exportButton);

    if (isSN) {
      resultsContainer.prepend(button);
      getEl(".lrck--search-export-holder").classList.add("lrck--isSN");
      getEl(".lrck--search-export-button").onclick = showExportModal;
    } else {
      //const totalResults = resultsContainer.querySelector("h2");
      // if (!totalResults || totalResults.classList.contains("artdeco-empty-state__headline")) return;
      console.log(button);

      resultsContainer.prepend(button);
      getEl(".lrck--search-export-button").onclick = showExportModal;
    }
  }

  chrome.storage.sync.get(["exportButton", "isSN"], function ({ exportButton, isSN }) {
    let resultsContainer = getEl(".search-results-container");
    if ( !resultsContainer ) {
      resultsContainer = getEl("#workspace > div[role=main]");
    }
    const resultsContainerSN = getEl("#search-results-container");
    const exportButtonEl = getEl(".lrck--search-export-button");
    
    console.log('[LR]', resultsContainer, resultsContainerSN, exportButtonEl);

    if (exportButtonEl) return;

    chrome.storage.local.get(["export_status"], ({ export_status }) => {
      if (export_status === "interrupted") {
        if (getEl(".artdeco-empty-state__headline")) document.location.reload();
      }
    });

    if (!resultsContainer) {
      let throttle;
      cly.resultsContainerChecker = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.target.classList.contains("search-results-container")) {
            clearTimeout(throttle);
            throttle = setTimeout(() => {
              injectExportButton();
            }, 100);
          }
        });
      });
      cly.resultsContainerChecker.observe(document, { childList: true, subtree: true });
    }


    if (!isSN && resultsContainer) {
      renderExportButton(resultsContainer, exportButton);

      let throttle;
      cly.exportButtonChecker = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.target.tagName === "H2" && !document.querySelector(".lrck--search-export-holder")) {
            clearTimeout(throttle);
            throttle = setTimeout(() => {
              renderExportButton(resultsContainer, exportButton);
            }, 100);
          }
        });
      });

      cly.exportButtonChecker.observe(resultsContainer, { childList: true, subtree: true });
    }

    if (isSN) {
      if (!resultsContainerSN) {
        setTimeout(function () {
          injectExportButton();
        }, 1000);
      } else {
        renderExportButton(resultsContainerSN, exportButton, true);
      }
    }
  });
}

function softEjectExportButton() {
  try {
    document.querySelector(".lrck--search-export-holder").remove();
  } catch (e) {}
}

function ejectExportButton() {
  try {
    document.querySelector(".lrck--search-export-holder").remove();
    cly.peopleList = [cly.csvTitles];
  } catch (e) {}
}

function saveCSV() {
  chrome.storage.sync.set({ export_status: "finished" }).then();
  const csvContent = "data:text/csv;charset=utf-8," + cly.peopleList.map(e => e.join(",").replace(/#/g, "")).join("\r\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `linkedin_export_${cly.peopleList.length - 1}_${new Date().toISOString().slice(0, -5).replace(/[T:]/g, "-")}.csv`);
  link.click();
}

function flipPage() {
  const { maxPages, currentPage } = cly.storage;
  let nextPage = document.querySelector(".artdeco-pagination__button--next");
  if ( !nextPage ) nextPage = document.querySelector('button[data-testid="pagination-controls-next-button-visible"]');
  console.log('[LR]', '[max/current page]', maxPages, currentPage);
  console.log('[LR]', '[next page]', nextPage);

  if (!nextPage) return;
  const nextPageIsDisabled = nextPage.classList.contains("artdeco-button--disabled");

  if (nextPageIsDisabled) {
    chrome.storage.sync.set({ export_status: "finished" }).then();
  }

  if (nextPage && !nextPageIsDisabled && +currentPage < +maxPages) {
    nextPage.click();
    setTimeout(collectPeople, 3000);
  }
}

function resetExportSettings() {
  const input = getEl(".lrck--innput-people-export");
  input.max = 0;
  input.value = 0;
  chrome.storage.sync.set({ peopleToExport: 0 }).then();
  getEl(".lrck--max-people").innerText = 0;
  cly.peopleList = [cly.csvTitles];
  chrome.storage.sync.set({ export_status: "waiting" }).then();
  cly.maxesSetFromPage = false;
  chrome.storage.local.remove(["peopleToExport"]).then();
}

function showExportModal(saveExportSettings) {
  const modal = getEl(".lrck--modal-wrapper");
  modal.classList.add("lrck--modal-shown");
  if (saveExportSettings === true) {
    getEl(".lrck--export-prepare").style.display = "block";
    getEl(".lrck--export-settings").style.display = "none";
  } else {
    resetExportSettings();
  }
  getPagesCount();
}

let resultsContainerTimer;
function getPagesCount() {
  chrome.storage.local.get(["peopleToExport", "export_status", "peopleList"], function ({ peopleToExport, export_status, peopleList }) {
    let resultsContainer = document.querySelector('div[data-view-name="people-search-result"]');
    if ( !resultsContainer ) { 
      resultsContainer = document.querySelector(".search-results-container");
    }
    else { 
      resultsContainer = resultsContainer.parentNode;
    }

    let paginationPage = document.querySelector(".artdeco-pagination__pages");
    if ( !paginationPage ) paginationPage = document.querySelector('ul[data-testid="pagination-controls-list"]');

    console.log('[LR]', '[list pager]', paginationPage, resultsContainer);

    function handleExportInfo(isSN) {
      const peoplePerPage = isSN ? 25 : 10;
      //const paginationPage = document.querySelector(".artdeco-pagination__pages");
      let paginationPage = document.querySelector(".artdeco-pagination__pages");
      if ( !paginationPage ) paginationPage = document.querySelector('ul[data-testid="pagination-controls-list"]');

      const currentPage = paginationPage.querySelector('li button[aria-current="true"]').innerText;
      const maxPages = paginationPage.lastElementChild.innerText;

      console.log('iologpager', currentPage, maxPages, paginationPage);

      cly.storage.currentPage = currentPage;
      cly.storage.maxPages = maxPages;

      const curMax = getEl(".lrck--max-people").textContent;
      console.log(curMax, cly.maxesSetFromPage);

      if (+curMax === 0 || cly.maxesSetFromPage) {
        getEl(".lrck--innput-people-export").max = peopleToExport || peoplePerPage * +maxPages - (+currentPage * peoplePerPage - peoplePerPage);
        getEl(".lrck--innput-people-export").value = peopleToExport || peoplePerPage * +maxPages - (+currentPage * peoplePerPage - peoplePerPage);
        getEl(".lrck--max-people").innerText = peopleToExport || peoplePerPage * +maxPages - (+currentPage * peoplePerPage - peoplePerPage);
        chrome.storage.sync.set({ peopleToExport: peopleToExport || peoplePerPage * +maxPages - (+currentPage * peoplePerPage - peoplePerPage) }).then(() => {
          if (peopleToExport) {
            if (peopleList) {
              cly.peopleList = peopleList;
              chrome.storage.local.remove(["peopleList"]).then();
            }
            if (export_status === "interrupted") {
              collectPeople();
              chrome.storage.local.remove(["export_status"]).then();
            }
          }
        });
        cly.maxesSetFromPage = false;
      }
      chrome.storage.sync.get(["export_status"], function ({ export_status }) {
        if (export_status === "working") {
          collectPeople();
        }
      });
    }

    if (!resultsContainer) {
      clearTimeout(resultsContainerTimer);
      resultsContainerTimer = setTimeout(() => {
        getPagesCount();
      }, 1000);
    } else {
      chrome.storage.sync.get(["isSN"], function ({ isSN }) {
        if (isSN) {
          handleExportInfo(isSN);
        } else {
          if (!resultsContainer) return false;

          const observer = new MutationObserver(function (mutations) {
            const BreakException = {};
            try {
              mutations.forEach(function (mutation) {
                if (mutation.target.classList.contains("artdeco-pagination__pages")) {
                  clyEvents.dispatchEvent(new CustomEvent("clyEvent", { detail: { name: "pagination-found" } }));
                  throw BreakException;
                }
              });
            } catch (e) {
              if (e !== BreakException) throw e;
            }
          });

          if (!paginationPage) {
            observer.observe(resultsContainer, { childList: true, subtree: true });
            document.querySelector("html").scrollTop = document.querySelector("html").scrollHeight;

            cly.storage.currentPage = 1;
            cly.storage.maxPages = 1;

            const resulltsCount = resultsContainer.querySelectorAll(".reusable-search__result-container")?.length;
            const curMax = getEl(".lrck--max-people").textContent;
            if (+curMax === 0) {
              getEl(".lrck--innput-people-export").max = resulltsCount;
              getEl(".lrck--innput-people-export").value = resulltsCount;
              getEl(".lrck--max-people").innerText = resulltsCount;
              chrome.storage.sync.set({ peopleToExport: resulltsCount }).then();
              cly.maxesSetFromPage = true;
            }
          } else {
            observer.disconnect();
            handleExportInfo();
          }
        }
      });
    }
  });
}

function findListWithPeople(isSN) {
  const BreakException = {};
  const targets = isSN ? [".artdeco-list", ".artdeco-list__item"] : [".reusable-search__entity-result-list", ".reusable-search__result-container"]
  let listContainer;
  try {
    getEls(targets[0])?.forEach(i => {
      if (getEl(targets[1], i)) {
        listContainer = i;
        throw BreakException;
      }
    })
  } catch (e) {
    if (e !== BreakException) {
      throw e;
    }
  }

  if ( !listContainer ) {
    listContainer = document.querySelector('.search-results-container ul');
  }

  if ( !listContainer ) {
    listContainer = document.querySelector('div[data-view-name="people-search-result"]').parentNode;
  }

  console.log('[LR]', '[people list]', listContainer);

  return listContainer;

}

function collectPeople() {
  chrome.storage.sync.get(["isSN"], function ({ isSN }) {
    clearTimeout(cly.collectPeopleFailTimer);
    const listContainer = findListWithPeople(isSN)
    if (!listContainer) return false;

    chrome.storage.sync.set({ export_status: "working" }).then();
    clyEvents.dispatchEvent(new CustomEvent("clyEvent", { detail: { name: "collect-people" } }));

    let items = listContainer.querySelectorAll(isSN ? ".artdeco-list__item" : 'div[data-view-name="people-search-result"]');
    if ( items.length == 0 ) items = listContainer.querySelectorAll('li');
    console.log('[LR]', '[people processing array]', items);

    chrome.storage.sync.get(["peopleToExport"], function ({ peopleToExport }) {
      let content, profileLink, lid, name, location, job_place, timer;

      function processName(name = "") {
        const fullName = processString(name).replace(" ", " | ").split(" | ");
        return [fullName[0], (fullName[1] || "").replace(/[.,:;|/()[\]{}*?&@#№%<>\-$"].+/, "")];
      }

      function processSNProfile(item) {
        if (!item) return;
        item.scrollIntoView();
        clearTimeout(timer);
        let profileLink = item.querySelector('[data-control-name="view_profile_via_result_name"]');
        if ( !profileLink ) profileLink = item.querySelector('a[href*="/in/"]');
        console.log(profileLink);
        if (profileLink) {
          const lid = "https://linkedin.com/in/" + profileLink.pathname.replace("/sales/people/", "").split(",")[0];
          const name = profileLink.textContent;
          const location = item.querySelector('[data-test-lead-result-entity="geo"]')?.textContent;
          const job = item.querySelector('[data-test-lead-result-entity="title-at-company"]');
          const job_place = job?.textContent
          .split(/\n/)
          .map(i => processString(i))
          .filter(i => i);

          console.log([lid, ...processName(name), processString(location), ...job_place]);

          if (!item.nextElementSibling) console.log("end");

          processSNProfile(item.nextElementSibling);
        } else {
          if (item.querySelector(".dummy-text")) {
            timer = setTimeout(function () {
              processSNProfile(item);
            }, 250);
          }
        }
      }

      if (isSN) {
        let item = listContainer.querySelector(".artdeco-list__item");

        if (item) {
          processSNProfile(item);
        }
      } else {
        const BreakException = {};
        try {
          items.forEach(function (li, index) {
            if ( li.querySelector(".entity-result__universal-image") ) {
              content = li.querySelector(".entity-result__universal-image").nextElementSibling;
              profileLink = content.querySelector(".app-aware-link");
            }
            else {
              profileLink = li.querySelectorAll('a[href*="/in/"]')[1];
            }

            console.log('[LR]', '[profile link]', profileLink);

            if ( !profileLink ) {
              if (index === items.length - 1) {
                setTimeout(function () {
                  flipPage();
                }, 100);
              }
              return;
            }

            lid = profileLink;
            name = profileLink.querySelector('[aria-hidden="true"]')?.textContent;
            if ( !name ) name = li.querySelector('a[data-view-name="search-result-lockup-title"]').innerText;
            console.log('[LR]', '[profile name]', name);

            if ( location_el = li.querySelector('figure + div > p:last-child') ) {
              location = location_el.innerText;
              job_place = location_el.previousElementSibling.innerText;
              company = li.querySelector('figure').parentNode.parentNode.querySelector('& > p');
              if ( company ) company = company.innerText;
              if ( company && company.indexOf('at') ) {
                console.log('[LR]', '[profile company]', company);
                company = company.substr(company.indexOf('at') + 3);
                job_place += ' @ ' + company;
              }
            }
            else {
              location = li.querySelector(".entity-result__secondary-subtitle")?.textContent;
              job_place = li.querySelector(".entity-result__primary-subtitle")?.textContent;

              if ( !location && !job_place ) {
                job_place = profileLink.parentNode.parentNode.parentNode.parentNode.nextElementSibling;
                location = job_place.nextElementSibling?.textContent;
                job_place = job_place?.textContent;
              }
            }

            console.log('[LR]', '[profile location]', location);
            console.log('[LR]', '[profile job]', job_place);

            if (name) {
              if (lid) lid = lid.origin + lid.pathname;
              if (name) name = processName(name);
              if (location) location = processString(location);
              if (job_place) job_place = processString(job_place).split(/ at | – | - |@ /);

              cly.peopleList.push([lid, name?.[0], name?.[1]?.replace(/[.,:;|/()[\]{}*?&@#№%<>\-$"].+/, ""), location, job_place?.[0], job_place?.[1]]);
            }

            getEl(".lrck--export-progress-current").textContent = cly.peopleList.length - 1;
            getEl(".lrck--export-progress-total").textContent = peopleToExport;

            if (cly.peopleList.length - 1 === +peopleToExport) {
              chrome.storage.sync.set({ export_status: "finished" }).then();
              throw BreakException;
            }

            if (index === items.length - 1) {
              setTimeout(function () {
                flipPage();
              }, 100);
            }
          });
        } catch (e) {
          if (e !== BreakException) {
            console.log("LeadRocks extension error:");
            console.log(e);
          }
        }
      }
    });

    cly.collectPeopleFailTimer = setTimeout(function () {
      chrome.storage.sync.get(["export_status"], function ({ export_status }) {
        if (export_status === "working") {
          const export_status = getEl(".artdeco-empty-state__headline") ? "interrupted" : "error";
          // console.log('EXPORT STATUS', export_status);
          chrome.storage.sync.set({ export_status }).then(function () {
            if (export_status === "error") {
              getEl(".lrck--continue_in", getEl(".lrck--export-error"), true).then(function (button) {
                let count = 5;
                button.innerHTML = `&nbsp;in ${count}`;
                let interval = setInterval(function () {
                  if (count > 1) {
                    count--;
                    button.innerHTML = `&nbsp;in ${count}`;
                  } else {
                    clearInterval(interval);
                    count = 0;
                    button.innerHTML = "";
                    collectPeople();
                  }
                }, 1000);
              });
            } else {
              getEl(".lrck--interrupted_on").innerText = getPageFromUrl();
              getEl(".lrck--people_found").innerText = cly.peopleList.length - 1;
              getEl(".lrck--continue_in", getEl(".lrck--export-interrupted"), true).then(function (button) {
                let count = 5;
                button.innerHTML = `&nbsp;in ${count}`;
                let interval = setInterval(function () {
                  if (count > 1) {
                    count--;
                    button.innerHTML = `&nbsp;in ${count}`;
                  } else {
                    clearInterval(interval);
                    count = 0;
                    button.innerHTML = "";
                    document.location.reload();
                  }
                }, 1000);
              });
              softEjectExportButton();

              chrome.storage.sync.get(["peopleToExport", "export_status"], ({ peopleToExport, export_status }) => {
                chrome.storage.local.set({ peopleList: cly.peopleList, peopleToExport, export_status }).then();
              });
            }
          });
        }
      });
    }, 10000);
  });
}

function renderLaptop(elem, variant) {
  const svgElement = elem.querySelector(".lrck--laptop-image");
  svgElement.src = chrome.runtime.getURL("images/laptop.svg");

  switch (variant) {
    case "loading": {
      const spinnerElement = elem.querySelector(".lrck--component-laptop-loader");
      chrome.storage.sync.get(["loadingSpinner"], function ({ loadingSpinner }) {
        spinnerElement.innerHTML = loadingSpinner;
      });
      break;
    }
    case "login": {
      const loginElement = elem.querySelector(".lrck--component-laptop-login");
      const loginImg = document.createElement("img");
      loginImg.className = "lrck--img-login-form";
      loginImg.src = chrome.runtime.getURL("images/laptop-login-form.svg");
      loginElement.append(loginImg);
      break;
    }
    case "success": {
      const successElement = elem.querySelector(".lrck--component-laptop-success");
      const successImg = document.createElement("img");
      successImg.className = "lrck--img-laptop-success";
      successImg.src = chrome.runtime.getURL("images/laptop-success.svg");
      successElement.append(successImg);

      const svgElement = elem.querySelector(".lrck--component-laptop-svg");
      const svgImg = document.createElement("img");
      svgImg.className = "lrck--img-laptop-svg";
      svgImg.src = chrome.runtime.getURL("images/laptop-svg.svg");
      svgElement.append(svgImg);
      break;
    }
    case "error": {
      const errorElement = elem.querySelector(".lrck--component-laptop-error");
      const errorImg = document.createElement("img");
      errorImg.className = "lrck--img-laptop-error";
      errorImg.src = chrome.runtime.getURL("images/laptop-error.svg");
      errorElement.append(errorImg);
      break;
    }
  }
}

function renderCredist(cout) {
  if (!cout) return;
  getEl(".lrck--credits-type").innerHTML = "My&nbsp;Credits&nbsp;&nbsp;";
  getEl(".lrck--credits-current").innerText = formatNumber(cout);
}

function renderProfile() {
  getEl(".lrck--content-profile", 0, 1).then(function (profile) {
    chrome.storage.sync.get(["profile_info"], function ({ profile_info }) {
      if (profile_info) {
        chrome.storage.sync.set({ contact_fetching: false }).then();

        getEl(".lrck--profile-photo-img", null, true).then(function (img) {
          img.src = getEl(".pv-top-card-profile-picture__image")?.src || getEl(".profile-photo-edit__preview")?.src;
        });
        getEl(".lrck--profile-name", null, true).then(function (name) {
          name.innerText = processString(getEl(".text-heading-xlarge", getEl(".pv-top-card"))?.textContent);
        });
        getEl(".lrck--profile-job", null, true).then(function (job) {
          job.innerText = processString(getEl(".text-body-medium", getEl(".pv-top-card"))?.textContent).split(/ at | в | – | - |@ /)[0];
        });
        getEl(".lrck--contacts-fetching", null, true).then(function (fetching) {
          chrome.storage.sync.get(["loadingSpinner"], function ({ loadingSpinner }) {
            fetching.innerHTML = loadingSpinner;
          });
        });
        profile.classList.remove("lrck--loading");

        getEl(".lrck--profile-contacts-list", null, true).then(function (contacts) {
          contacts.innerHTML = "";
          const emails = document.createElement("div");
          const phones = document.createElement("div");

          if (profile_info[0]?.emails || profile_info[0]?.phone_numbers) {
            if (profile_info[0]?.emails) {
              profile_info[0].emails.forEach(function (email, index) {
                renderHTML("/components/contact-item.html", emails).then(function () {
                  setTimeout(function () {
                    const item = emails.querySelectorAll(".lrck--profile-contacts-list-item")[index];
                    const contactType = item.querySelector(".lrck--contact-type");
                    contactType.classList.add("lrck--contact-type-email");
                    getEl("img", contactType).src = chrome.runtime.getURL("/icons/email.svg");
                    const contactEmail = item.querySelector(".lrck--contact-text");

                    if (email === "NOT_OPENED") {
                      contactEmail.textContent = generateEmail();
                    } else {
                      contactEmail.innerHTML = email;
                      contactEmail.classList.remove("lrck--text-blurred");
                      getEl(".lrck--copy-icon", item).src = chrome.runtime.getURL("/icons/copy.svg");
                      item.onclick = function () {
                        copyContact(email);
                      };
                    }
                  }, 0);
                });
              });
            }

            if (profile_info[0]?.phone_numbers) {
              profile_info[0].phone_numbers.forEach(function (phone, index) {
                renderHTML("/components/contact-item.html", phones).then(function () {
                  setTimeout(function () {
                    const item = phones.querySelectorAll(".lrck--profile-contacts-list-item")[index];
                    const contactType = item.querySelector(".lrck--contact-type");
                    contactType.classList.add("lrck--contact-type-phone");
                    getEl("img", contactType).src = chrome.runtime.getURL("/icons/phone.svg");
                    const contactEmail = item.querySelector(".lrck--contact-text");

                    if (phone === "NOT_OPENED") {
                      contactEmail.textContent = generatePhone();
                    } else {
                      contactEmail.innerHTML = phone;
                      contactEmail.classList.remove("lrck--text-blurred");
                      getEl(".lrck--copy-icon", item).src = chrome.runtime.getURL("/icons/copy.svg");
                      item.onclick = function () {
                        copyContact(phone);
                      };
                    }
                  }, 0);
                });
              });
              }
          } else {
            getEl(".lrck--profile-contacts-list").innerHTML = '<div class="lrck--no-contacts">No contacts available</div>';
          }

          if (
            !profile_info[0] ||
              (!profile_info[0].emails.some(function (i) {
                return i === "NOT_OPENED";
              }) &&
                !profile_info[0].phone_numbers.some(function (i) {
                  return i === "NOT_OPENED";
                }))
          ) {
            getEl(".lrck--profile-contacts-open").style.display = "none";
          } else {
            getEl(".lrck--profile-contacts-open").classList.remove("lrck--dummy-button");
            getEl(".lrck--profile-contacts-open").disabled = false;
            getEl(".lrck--profile-contacts-open").onclick = openContact;
          }

          contacts.append(emails);
          contacts.append(phones);
        });
      }
    });
  });
}

function logout() {
  chrome.storage.sync.set({ authorization_status: "not_authorized", s: null });
}

function showSpinner(toggle) {
  if (toggle) {
    getEl(".lrck--loading-fader").classList.remove("lrck--hidden");
  } else {
    getEl(".lrck--loading-fader").classList.add("lrck--hidden");
  }
}

function getCredits() {
  chrome.storage.sync.get(["s", "leadrocks_url"], function ({ s, leadrocks_url }) {
    if (s) {
      request(leadrocks_url, { s, sub_com: "/my/creditsleft" })
        .then(r => r.json())
        .then(({ count, error }) => {
          if (typeof count !== undefined) {
            chrome.storage.sync.set({ authorization_status: "is_authorized", credits_list: count });
          } else if (error) {
            chrome.storage.sync.set({ authorization_status: "not_authorized" });
          }
        })
        .catch(e => {
          chrome.storage.sync.set({ authorization_status: "not_authorized" });
          //chrome.storage.sync.set({ toast: "An error occured", toastType: "error" }).then();
        });
    } else {
      chrome.storage.sync.set({ authorization_status: "not_authorized" });
    }
  });
}

function getProfile(lid) {
  chrome.storage.sync.get(["s", "leadrocks_url"], function ({ s, leadrocks_url }) {
    if (s) {
      request(leadrocks_url, { s, sub_com: "/my/explorer/contacts/find" }, "?lid[]=" + encodeURIComponent(lid))
        .then(r => r.json())
        .then(({ data, error }) => {
          if (data) {
            chrome.storage.sync.set({ profile_info: data.entries }).then();
          } else if (error) {
            chrome.storage.sync.set({ authorization_status: "not_authorized" });
          }
        })
        .catch(e => {
          chrome.storage.sync.set({ toast: "An error occured", toastType: "error" }).then();
        });
    } else {
      chrome.storage.sync.set({ authorization_status: "not_authorized" });
    }
  });
}

function openContact() {
  chrome.storage.sync.get(["s", "leadrocks_url", "credits_list"], function ({ s, leadrocks_url, credits_list }) {
    const lid = document.location.href.split("/in/")[1]?.split("/")[0];
    if (!lid) return;

    if (!credits_list) {
      chrome.storage.sync.set({ toast: "You have no credits left", toastType: "error" }).then();
    }

    if (s) {
      chrome.storage.sync.set({ contact_fetching: true }).then();
      request(leadrocks_url, { "lid[]": lid, s, sub_com: "/my/explorer/contacts/open" })
        .then(r => r.json())
        .then(({ data, error }) => {
          if (data) {
            getCredits();
            getProfile(lid);
          } else if (error) {
            chrome.storage.sync.set({ authorization_status: "not_authorized" });
          }
        })
        .catch(e => {
          chrome.storage.sync.set({ toast: "An error occured", toastType: "error" }).then();
        })
        .finally(() => {
          chrome.storage.sync.set({ contact_fetching: false }).then();
        });
    } else {
      chrome.storage.sync.set({ authorization_status: "not_authorized" });
    }
  });
}

// api
function request(url, body, search = "") {
  return fetch(`${url}/json${search}`, {
    method: "POST",
    body: new URLSearchParams({ ...body, com: "/json" }),
  });
}

// helpers
function getPageFromUrl() {
  const search = document.location.search;
  if (!search) return 1;
  const paramsEquations = search.split("&");
  const paramsObj = {};
  paramsEquations.forEach(param => {
    const paramsArr = param.split("=");
    const key = paramsArr[0].replace(/^\?/, "");
    paramsObj[key] = paramsArr[1];
  });
  return paramsObj.page;
}
function makeDragable(elementSelector, handler = elementSelector) {
  const dragTarget = document.querySelector(elementSelector);
  const handle = document.querySelector(handler);
  if (!elementSelector) return;

  let inDrag = false;
  let dragStartX, dragStartY;
  let dragEndX;
  let dragEndY;

  handle.addEventListener("mousedown", function (e) {
    inDrag = true;
    chrome.storage.sync.get(["widgetX", "widgetY"], function ({ widgetX, widgetY }) {
      dragStartX = e.clientX - widgetX;
      dragStartY = e.clientY - widgetY;
    });
  });
  document.addEventListener("mousemove", function (e) {
    if (!inDrag) return;
    cly.dragging = true;
    document.body.style.userSelect = "none";
    dragEndX = e.clientX - dragStartX;
    dragEndY = e.clientY - dragStartY;
    dragTarget.style.transform = `translate(${dragEndX}px, ${dragEndY}px)`;
  });
  document.addEventListener("mouseup", function () {
    document.body.style.userSelect = "";
    chrome.storage.sync.set({ widgetX: dragEndX, widgetY: dragEndY }).then();
    inDrag = false;
    setTimeout(function () {
      cly.dragging = false;
    }, 300);
  });
}
function renderHTML(path, container, replace) {
  return fetch(chrome.runtime.getURL(path))
    .then(response => response.text())
    .then(html => {
      if (replace) container.innerHTML = "";
      container.appendChild(document.createRange().createContextualFragment(html));
    });
}
function getEls(selector, container = document) {
  return container.querySelectorAll(selector);
}
function getEl(selector, container, wait) {
  if (!container) container = document;
  if (!wait) return container.querySelector(selector);
  return new Promise(function (resolve) {
    if (container.querySelector(selector)) {
      return resolve(container.querySelector(selector));
    }

    const observer = new MutationObserver(function () {
      if (container.querySelector(selector)) {
        resolve(container.querySelector(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}
function detectLanguage() {
  const navItem = document.querySelector('[data-control-name="nav_messaging"]');
  if (!navItem) return null;
  const navTitle = navItem.querySelector(".global-nav__primary-link-text")?.textContent?.trim();
  if (!navTitle) return null;

  const langs = {
    الرسائل: "ar_AE",
    Zprávy: "cs_CZ",
    Meddelelser: "da_DK",
    Nachrichten: "de_DE",
    Messaging: "en_US",
    Mensajes: "es_ES",
    Messagerie: "fr_FR",
    मैसेजिंग: "hi_IN",
    Pesan: "in_ID",
    Messaggistica: "it_IT",
    メッセージ: "ja_JP",
    메시지: "ko_KR",
    Mesej: "ms_MY",
    Berichten: "nl_NL",
    Meldinger: "no_NO",
    Wiadomości: "pl_PL",
    Mensagens: "pt_BR",
    Mesaje: "ro_RO",
    Сообщения: "ru_RU",
    Meddelanden: "sv_SE",
    ข้อความ: "th_TH",
    Pagmemensahe: "tl_PH",
    Mesajlaşma: "tr_TR",
    消息: "zh_CN",
    訊息: "zh_TW",
  };
  return langs[navTitle];
}
function formatNumber(val, lang = "en") {
  if (!val) return "0";
  let delimeter = lang === "ru" ? " " : ",";
  let decimals;

  // a bit complicated but it's OK
  val = parseFloat(val.toString().trim().replace(new RegExp(delimeter, "g"), "")).toString();

  if (!val) return 0;

  if (val.indexOf(".") !== -1) {
    decimals = parseFloat(parseFloat(val).toFixed(2));
    val = decimals.toString().split(".")[0];
    decimals = decimals.toString().split(".")[1];
  }

  let valReturn = "";
  let place = 0;

  for (let k = 0; k <= val.length; k++) {
    if (k % 3 === 0 && k !== 0) {
      valReturn = val.slice(val.length - k, val.length - k + 3) + delimeter + valReturn;
      place++;
    }
  }

  if (val.length - place * 3 !== 0) valReturn = val.slice(0, val.length - place * 3) + delimeter + valReturn;

  valReturn = valReturn.slice(0, -1);

  if (decimals) valReturn = valReturn + "." + decimals;

  return valReturn;
}
function processString(str = "") {
  return str
    .replace(/\p{Emoji_Presentation}/gu, "")
    .replace(/,/g, ";")
    .trim();
}
function generateEmail(length, domain = "@example.dom") {
  const allchars = "abcdefghijklmnopqrstuvwxyz1234567890";
  const emailLength = length || randomBetween(5, 10);
  let string = "";
  for (let i = 0; i < emailLength; i++) {
    string += allchars[Math.floor(Math.random() * allchars.length)];
  }
  string = string + domain;
  return string;
}
function generatePhone(length = 10) {
  const allchars = "1234567890";
  const emailLength = length || randomBetween(5, 10);
  let string = "";
  for (let i = 0; i < emailLength; i++) {
    string += allchars[Math.floor(Math.random() * allchars.length)];
  }
  string = "+" + string;
  return string;
}
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
function copyContact(value) {
  navigator.clipboard.writeText(value).then(
    function () {
      chrome.storage.sync.set({ toast: "Copied successfully" }).then();
    },
    function () {
      chrome.storage.sync.set({ toast: "Unable to copy. Please copy manually" }).then();
    }
  );
}
