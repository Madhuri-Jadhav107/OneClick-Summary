chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background received action:", request.action);
    if (request.action === "OPEN_DASHBOARD") {
        console.log("Opening dashboard tab:", request.url);
        chrome.tabs.create({ url: request.url });
        sendResponse({ success: true });
    }
    return true;
});
