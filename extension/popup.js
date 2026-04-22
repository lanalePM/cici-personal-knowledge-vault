/** Set in config.js (loaded before this script). */
const API_BASE = CICI_API_BASE;

// DOM elements
const loginState = document.getElementById("login-state");
const mainState = document.getElementById("main-state");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const tabPage = document.getElementById("tab-page");
const tabSelection = document.getElementById("tab-selection");
const contentPage = document.getElementById("content-page");
const contentSelection = document.getElementById("content-selection");
const pageTitle = document.getElementById("page-title");
const pageDomain = document.getElementById("page-domain");
const selectionText = document.getElementById("selection-text");
const selectionDomain = document.getElementById("selection-domain");
const noteField = document.getElementById("note-field");
const saveBtn = document.getElementById("save-btn");
const errorMsg = document.getElementById("error-msg");
const duplicateBanner = document.getElementById("duplicate-banner");
const saveAnywayBtn = document.getElementById("save-anyway-btn");
const viewItemLink = document.getElementById("view-item-link");
const vaultCount = document.getElementById("vault-count");
const vaultLink = document.getElementById("vault-link");

const loadingState = document.getElementById("loading-state");

let currentMode = "page"; // "page" or "selection"
let tabInfo = { url: "", title: "", domain: "" };
let selectedText = "";
let pageText = "";
let duplicateId = null;

// Initialize
async function init() {
  loginBtn.href = `${API_BASE}/extension/connect`;
  vaultLink.href = `${API_BASE}/vault`;
  viewItemLink.href = `${API_BASE}/vault`;

  // Start tab info fetch in parallel with token check
  const tabPromise = chrome.tabs.query({ active: true, currentWindow: true });

  const { token } = await chrome.storage.local.get("token");

  if (!token) {
    showLogin();
    return;
  }

  // Run token verification and tab info gathering in parallel
  const [statusResult, tabs] = await Promise.allSettled([
    fetch(`${API_BASE}/api/extension/status`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (!res.ok) throw new Error("Invalid token");
      return res.json();
    }),
    tabPromise,
  ]);

  // Handle token verification
  if (statusResult.status === "rejected") {
    await chrome.storage.local.remove("token");
    showLogin();
    return;
  }

  vaultCount.textContent = statusResult.value.vault_count;

  // Handle tab info
  const tab = tabs.status === "fulfilled" ? tabs.value[0] : null;
  if (tab) {
    tabInfo.url = tab.url || "";
    tabInfo.title = tab.title || "";
    try {
      tabInfo.domain = new URL(tab.url || "").hostname.replace("www.", "");
    } catch {
      tabInfo.domain = tab.url || "";
    }

    pageTitle.textContent = tabInfo.title;
    pageDomain.textContent = tabInfo.domain;
    selectionDomain.textContent = tabInfo.domain;

    // Get selected text and page text in parallel
    try {
      const [selResult, textResult] = await Promise.allSettled([
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString() || "",
        }),
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.body?.innerText?.slice(0, 50000) || "",
        }),
      ]);

      selectedText = selResult.status === "fulfilled" ? (selResult.value?.[0]?.result || "") : "";
      pageText = textResult.status === "fulfilled" ? (textResult.value?.[0]?.result || "") : "";
    } catch {
      selectedText = "";
      pageText = "";
    }
  }

  // Enable selection tab if text is selected
  if (selectedText) {
    tabSelection.disabled = false;
    selectionText.textContent = `"${selectedText}"`;
    switchTab("selection");
  }

  showMain();
}

function showLogin() {
  loadingState.classList.add("hidden");
  loginState.classList.remove("hidden");
  mainState.classList.add("hidden");
}

function showMain() {
  loadingState.classList.add("hidden");
  loginState.classList.add("hidden");
  mainState.classList.remove("hidden");
}

function switchTab(mode) {
  currentMode = mode;
  duplicateBanner.classList.remove("visible");
  duplicateId = null;
  errorMsg.classList.remove("visible");
  saveBtn.textContent = "Save to vault";
  saveBtn.classList.remove("success");
  saveBtn.disabled = false;

  if (mode === "page") {
    tabPage.classList.add("active");
    tabSelection.classList.remove("active");
    contentPage.classList.remove("hidden");
    contentSelection.classList.add("hidden");
  } else {
    tabSelection.classList.add("active");
    tabPage.classList.remove("active");
    contentSelection.classList.remove("hidden");
    contentPage.classList.add("hidden");
  }
}

async function handleSave(force = false) {
  const { token } = await chrome.storage.local.get("token");
  if (!token) {
    showLogin();
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  errorMsg.classList.remove("visible");
  duplicateBanner.classList.remove("visible");

  const body = {
    source_url: tabInfo.url,
    title: tabInfo.title,
    note: noteField.value.trim(),
  };

  if (currentMode === "selection") {
    body.content_type = "selected_text";
    body.content_ref = selectedText;
  } else {
    body.content_type = "link";
    body.page_text = pageText;
  }

  if (force) {
    body.force = true;
  }

  try {
    const res = await fetch(`${API_BASE}/api/extension/save`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.duplicate) {
      duplicateId = data.existing_id;
      duplicateBanner.classList.add("visible");
      viewItemLink.href = `${API_BASE}/vault/${data.existing_id}`;
      saveBtn.textContent = "Save to vault";
      saveBtn.disabled = false;
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || "Save failed");
    }

    // Success
    if (data.vault_count !== undefined) {
      vaultCount.textContent = data.vault_count;
      await chrome.storage.local.set({ vaultCount: data.vault_count });
    }

    saveBtn.textContent = "Saved ✓";
    saveBtn.classList.add("success");

    // Auto-close after 1.5s
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    errorMsg.textContent = err.message || "Something went wrong. Try again.";
    errorMsg.classList.add("visible");
    saveBtn.textContent = "Save to vault";
    saveBtn.disabled = false;
  }
}

// Event listeners
tabPage.addEventListener("click", () => switchTab("page"));
tabSelection.addEventListener("click", () => {
  if (!tabSelection.disabled) switchTab("selection");
});

saveBtn.addEventListener("click", () => handleSave(false));
saveAnywayBtn.addEventListener("click", () => handleSave(true));

logoutBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove("token");
  showLogin();
});

loginBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  // Open the extension connect page (user logs in first if needed, then gets token)
  await chrome.tabs.create({ url: `${API_BASE}/extension/connect` });
  window.close();
});

// Load vault count from cache on startup (fast display)
chrome.storage.local.get("vaultCount").then(({ vaultCount: cached }) => {
  if (cached !== undefined) vaultCount.textContent = cached;
});

init();
