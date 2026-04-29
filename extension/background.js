importScripts("config.js");

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "cici-save-selection",
      title: "Cici me: Save selection",
      contexts: ["selection"],
    });
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenu);
setupContextMenu();

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "cici-save-selection" || !info.selectionText) return;

  await chrome.storage.local.set({
    pendingSelection: {
      text: info.selectionText,
      url: tab?.url || "",
      title: tab?.title || "",
    },
  });

  const { token } = await chrome.storage.local.get("token");
  if (!token) {
    notify(
      "Cici me — not connected",
      "Click the Cici me toolbar icon, choose Log in, then open Extension connect."
    );
    return;
  }

  try {
    const domain = new URL(tab?.url || "about:blank").hostname.replace(
      "www.",
      ""
    );
    const res = await fetch(`${CICI_API_BASE}/api/extension/save`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_url: tab?.url || "",
        content_type: "selected_text",
        content_ref: info.selectionText,
        title: domain ? `Selection from ${domain}` : "Saved selection",
      }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      const msg =
        typeof data.error === "string"
          ? data.error
          : `Could not save (HTTP ${res.status}). Try reconnecting from the extension menu.`;
      notify("Cici me — save failed", msg);
      return;
    }

    if (data.duplicate) {
      notify(
        "Cici me",
        "This page URL was already saved. Open the vault or use Save anyway from the popup."
      );
      return;
    }

    if (typeof data.vault_count === "number") {
      await chrome.storage.local.set({ vaultCount: data.vault_count });
    }
    notify("Cici me", "Selection saved to your vault.");
  } catch {
    notify(
      "Cici me — network error",
      `Check that Cici is running at ${CICI_API_BASE} and reload the extension.`
    );
  }
});
