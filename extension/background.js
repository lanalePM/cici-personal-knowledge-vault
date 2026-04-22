importScripts("config.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "cici-save-selection",
    title: "Cici me: Save selection",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "cici-save-selection" && info.selectionText) {
    // Store the selection and signal the popup to open in selection mode
    await chrome.storage.local.set({
      pendingSelection: {
        text: info.selectionText,
        url: tab?.url || "",
        title: tab?.title || "",
      },
    });
    // Open the popup — can't programmatically open popup from context menu,
    // so we'll save directly from background
    const { token } = await chrome.storage.local.get("token");
    if (!token) return;

    try {
      const domain = new URL(tab?.url || "").hostname.replace("www.", "");
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
          title: `Selection from ${domain}`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        await chrome.storage.local.set({ vaultCount: data.vault_count });
      }
    } catch {
      // Silently fail — user can retry from popup
    }
  }
});
