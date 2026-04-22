// Content script that runs on the Cici web app
// Listens for token messages from the connect page and stores them in extension storage

window.addEventListener("message", (event) => {
  if (event.data?.type === "CICI_TOKEN" && event.data.token) {
    chrome.storage.local.set({ token: event.data.token }, () => {
      window.postMessage({ type: "CICI_TOKEN_STORED" }, "*");
    });
  }
});
