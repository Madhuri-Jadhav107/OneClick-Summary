console.log("AI Meeting: Dashboard sync script loaded");

window.addEventListener("message", (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;

    if (event.data.type === "AI_MEETING_SYNC_USER") {
        console.log("🔄 AI Meeting: Syncing user data...", event.data.payload);
        const { userId, orgId } = event.data.payload;

        if (userId) {
            chrome.storage.local.set({
                user_id: userId,
                org_id: orgId || null
            }, () => {
                console.log("✅ AI Meeting: User data saved to extension storage.");
            });
        }
    }
});
