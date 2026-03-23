const btnSelect = document.getElementById("btn-select");
const btnExport = document.getElementById("btn-export");
const btnClear = document.getElementById("btn-clear");
const btnPin = document.getElementById("btn-pin");
const selectionList = document.getElementById("selection-list");
const emptyState = document.getElementById("empty-state");
const statusEl = document.getElementById("status");

const btnSettings = document.getElementById("btn-settings");
const popupMain = document.getElementById("popup-main");
const popupSettings = document.getElementById("popup-settings");
const settingsApiKey = document.getElementById("settings-api-key");
const btnToggleKey = document.getElementById("btn-toggle-key");
const btnTestKey = document.getElementById("btn-test-key");
const btnSaveKey = document.getElementById("btn-save-key");
const btnClearKey = document.getElementById("btn-clear-key");
const settingsKeyStatus = document.getElementById("settings-key-status");
const settingsKeySavedIndicator = document.getElementById("settings-key-saved-indicator");

let currentTabId = null;
let isSelecting = false;
let keyVisible = false;

// --- Init ---

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  // Ensure content script is injected (handles already-open tabs)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ["content/content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: currentTabId },
      files: ["content/content.css"],
    });
  } catch (e) {
    // Content script may already be injected, that's fine
  }

  try {
    const state = await sendMessage({ type: "getState" });
    if (state) {
      isSelecting = state.isSelecting;
      updateSelectButton();
      renderSelections(state.selections || []);
    }
  } catch (e) {
    showStatus("Cannot connect to page");
  }
}

// --- Messaging ---

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(currentTabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// --- UI Updates ---

function updateSelectButton() {
  btnSelect.classList.toggle("active", isSelecting);
  btnSelect.textContent = isSelecting ? "Selecting..." : "Select Element";
}

function updateFooterButtons(count) {
  btnExport.disabled = count === 0;
  btnClear.disabled = count === 0;
}

function renderSelections(selections) {
  // Remove existing cards
  selectionList.querySelectorAll(".selection-card").forEach((c) => c.remove());

  if (selections.length === 0) {
    emptyState.style.display = "block";
    updateFooterButtons(0);
    return;
  }

  emptyState.style.display = "none";
  updateFooterButtons(selections.length);

  selections.forEach((sel) => {
    const card = document.createElement("div");
    card.className = "selection-card";

    let descriptor = sel.tagName;
    if (sel.id) descriptor += "#" + sel.id;
    else if (sel.classes) descriptor += "." + sel.classes.split(",")[0].trim();

    const text = sel.textContent
      ? sel.textContent.substring(0, 50) + (sel.textContent.length > 50 ? "..." : "")
      : "";

    card.innerHTML = `
      <div class="selection-badge">${sel.index}</div>
      <div class="selection-info">
        <div class="selection-descriptor">${escapeHtml(descriptor)}${text ? ' "' + escapeHtml(text) + '"' : ""}</div>
        ${sel.comment ? '<div class="selection-comment">' + escapeHtml(sel.comment) + "</div>" : ""}
      </div>
      <button class="selection-edit" data-index="${sel.index}" title="Edit">&#9998;</button>
      <button class="selection-delete" data-index="${sel.index}" title="Remove">&times;</button>
    `;

    card.querySelector(".selection-badge").addEventListener("click", async () => {
      await sendMessage({ type: "editSelection", index: sel.index });
    });

    card.querySelector(".selection-edit").addEventListener("click", async () => {
      await sendMessage({ type: "editSelection", index: sel.index });
    });

    card.querySelector(".selection-delete").addEventListener("click", async () => {
      await sendMessage({ type: "removeSelection", index: sel.index });
    });

    selectionList.appendChild(card);
  });
}

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  setTimeout(() => statusEl.classList.remove("visible"), 2000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Clipboard Helper ---

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (_) {
    // clipboard API blocked by Permissions-Policy or security context
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("Both clipboard methods failed");
}

// --- Event Listeners ---

btnSelect.addEventListener("click", async () => {
  try {
    const res = await sendMessage({ type: "toggleSelectionMode" });
    isSelecting = res.isSelecting;
    updateSelectButton();
  } catch (e) {
    showStatus("Cannot connect to page");
  }
});

btnExport.addEventListener("click", async () => {
  try {
    const res = await sendMessage({ type: "exportPrompt" });
    if (res && res.prompt) {
      await copyToClipboard(res.prompt);
      await sendMessage({ type: "clearAll" });
      renderSelections([]);
      isSelecting = false;
      updateSelectButton();
      showStatus("Prompt copied to clipboard!");
    }
  } catch (e) {
    showStatus("Failed to export");
  }
});

btnClear.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "clearAll" });
    renderSelections([]);
    isSelecting = false;
    updateSelectButton();
    showStatus("All cleared");
  } catch (e) {
    showStatus("Cannot connect to page");
  }
});

btnPin.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "pinPanel" });
    window.close();
  } catch (e) {
    showStatus("Cannot connect to page");
  }
});

// Listen for updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "selectionUpdated") {
    renderSelections(msg.selections || []);
    isSelecting = msg.isSelecting;
    updateSelectButton();
  }
});

// --- Settings Toggle ---

btnSettings.addEventListener("click", () => {
  const showingSettings = popupSettings.style.display === "flex";
  if (showingSettings) {
    popupSettings.style.display = "none";
    popupMain.style.display = "flex";
    btnSettings.classList.remove("active");
  } else {
    popupMain.style.display = "none";
    popupSettings.style.display = "flex";
    btnSettings.classList.add("active");
    // Reset eye toggle state
    keyVisible = false;
    settingsApiKey.type = "password";
    updateEyeIcon();
    // Refresh from storage
    chrome.storage.local.get("pluckup-openai-api-key", (result) => {
      if (chrome.runtime.lastError) return;
      settingsApiKey.value = "";
      if (result["pluckup-openai-api-key"]) {
        settingsApiKey.placeholder = "••••••••••••";
        updateKeySavedIndicator(true);
      } else {
        settingsApiKey.placeholder = "sk-...";
        updateKeySavedIndicator(false);
      }
    });
  }
});

// --- Settings: Eye Toggle ---

btnToggleKey.addEventListener("click", async () => {
  keyVisible = !keyVisible;
  updateEyeIcon();
  if (keyVisible) {
    settingsApiKey.type = "text";
    // If input is empty, show stored key
    if (!settingsApiKey.value) {
      const result = await chrome.storage.local.get("pluckup-openai-api-key");
      const key = result["pluckup-openai-api-key"];
      if (key) settingsApiKey.value = key;
    }
  } else {
    settingsApiKey.type = "password";
  }
});

function updateEyeIcon() {
  const iconOpen = btnToggleKey.querySelector(".icon-eye-open");
  const iconClosed = btnToggleKey.querySelector(".icon-eye-closed");
  if (iconOpen && iconClosed) {
    iconOpen.style.display = keyVisible ? "none" : "block";
    iconClosed.style.display = keyVisible ? "block" : "none";
  }
}

// --- Settings: Test ---

btnTestKey.addEventListener("click", () => {
  const inputVal = settingsApiKey.value.trim();
  if (inputVal) {
    doTestKey(inputVal);
  } else {
    chrome.storage.local.get("pluckup-openai-api-key", (result) => {
      if (chrome.runtime.lastError) return;
      const storedKey = result["pluckup-openai-api-key"];
      if (storedKey) {
        doTestKey(storedKey);
      } else {
        showKeyStatus("No key to test", "error");
      }
    });
  }
});

function doTestKey(apiKey) {
  showKeyStatus("Testing...", "");
  chrome.runtime.sendMessage({ type: "testApiKey", apiKey }, (response) => {
    if (chrome.runtime.lastError) {
      showKeyStatus("Test failed: " + chrome.runtime.lastError.message, "error");
      return;
    }
    if (response && response.ok) {
      showKeyStatus("API key is valid", "success");
    } else {
      showKeyStatus(response?.error || "Test failed", "error");
    }
  });
}

// --- Settings: Save ---

btnSaveKey.addEventListener("click", async () => {
  const key = settingsApiKey.value.trim();
  if (!key.startsWith("sk-")) {
    showKeyStatus("Key must start with sk-", "error");
    return;
  }
  await chrome.storage.local.set({ "pluckup-openai-api-key": key });
  settingsApiKey.value = "";
  settingsApiKey.type = "password";
  settingsApiKey.placeholder = "••••••••••••";
  keyVisible = false;
  updateEyeIcon();
  updateKeySavedIndicator(true);
  showKeyStatus("API key saved", "success");
});

// --- Settings: Clear ---

btnClearKey.addEventListener("click", async () => {
  await chrome.storage.local.remove("pluckup-openai-api-key");
  settingsApiKey.value = "";
  settingsApiKey.placeholder = "sk-...";
  keyVisible = false;
  settingsApiKey.type = "password";
  updateEyeIcon();
  updateKeySavedIndicator(false);
  showKeyStatus("API key cleared", "success");
});

// --- Settings: Status ---

function showKeyStatus(text, type) {
  settingsKeyStatus.textContent = text;
  settingsKeyStatus.className = "settings-key-status" + (type ? " " + type : "");
  if (type) {
    setTimeout(() => {
      settingsKeyStatus.textContent = "";
      settingsKeyStatus.className = "settings-key-status";
    }, 3000);
  }
}

function updateKeySavedIndicator(hasKey) {
  if (hasKey) {
    settingsKeySavedIndicator.textContent = "API key is stored";
    settingsKeySavedIndicator.className = "settings-key-saved-indicator has-key";
  } else {
    settingsKeySavedIndicator.textContent = "No API key saved";
    settingsKeySavedIndicator.className = "settings-key-saved-indicator";
  }
}

// --- Settings: Init ---

async function initSettings() {
  const result = await chrome.storage.local.get("pluckup-openai-api-key");
  if (result["pluckup-openai-api-key"]) {
    settingsApiKey.placeholder = "••••••••••••";
  }
}

initSettings();
init();
