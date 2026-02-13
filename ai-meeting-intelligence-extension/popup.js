const $ = id => document.getElementById(id);
const liveTranscript = $("liveTranscript");
const summaryText = $("summaryText");

function updatePopupUI() {
  try {
    if (!chrome.runtime?.id) return;
    chrome.storage.local.get(["meeting", "audioActive", "summary", "selectedLanguage", "transcript_en", "transcript_hi", "transcript_mr", "liveText", "live_hi", "live_mr"], data => {
      if (chrome.runtime.lastError) return;
      const m = data.meeting || {};
      const statusBadge = $("status-badge");
      const volIndicator = $("volume-indicator");

      $("meetingId").textContent = m.meetingId || "-";
      $("startTime").textContent = m.startedAt || "-";

      if (m.status === "Meeting Active") {
        statusBadge.textContent = "Live";
        statusBadge.classList.add("active");
      } else {
        statusBadge.textContent = "Idle";
        statusBadge.classList.remove("active");
      }

      if (data.audioActive) volIndicator.classList.add("active");
      else volIndicator.classList.remove("active");

      summaryText.textContent = data.summary || "Summary will appear here...";
      if (data.summary) summaryText.classList.remove("placeholder");

      // Language sync
      const lang = data.selectedLanguage || "english";
      document.querySelectorAll(".lang-btn").forEach(btn => {
        const btnLang = btn.dataset.lang === "en" ? "english" : (btn.dataset.lang === "hi" ? "hindi" : "marathi");
        if (btnLang === lang) btn.classList.add("active");
        else btn.classList.remove("active");
      });

      // Transcript box
      liveTranscript.textContent = (data.transcript_en || "") + (data.liveText || "") || "Listening...";

      // Auto-scroll
      liveTranscript.scrollTop = liveTranscript.scrollHeight;
    });
  } catch (e) {
    console.warn("Popup UI Update: Context invalidated.");
  }
}

// Initial load and periodic refresh
updatePopupUI();
setInterval(updatePopupUI, 1000);

$("startBtn").onclick = () => {
  if (!chrome.runtime?.id) {
    alert("Extension context invalid. Please close and re-open the popup.");
    return;
  }

  const btn = $("startBtn");
  const originalText = btn.textContent;
  btn.textContent = "Starting...";
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab?.url?.includes("meet.google.com")) {
      alert("Please open this extension on a Google Meet page.");
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    try {
      chrome.tabs.sendMessage(tab.id, { action: "START_TRANSCRIPTION" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Communication error:", chrome.runtime.lastError.message);
          alert("Extension context invalid or Google Meet tab not ready. Please REFRESH the Google Meet page.");
          btn.textContent = originalText;
          btn.disabled = false;
        }
      });
    } catch (e) {
      alert("Please refresh the Google Meet page to start recording.");
      btn.textContent = originalText;
      btn.disabled = false;
    }

    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 1500);
  });
};

$("stopBtn").onclick = () => {
  if (!chrome.runtime?.id) {
    chrome.tabs.create({ url: "http://localhost:5173/" });
    return;
  }

  const btn = $("stopBtn");
  btn.textContent = "Syncing...";
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (tab?.id) {
      try {
        chrome.tabs.sendMessage(tab.id, { action: "STOP_TRANSCRIPTION" }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Content script unreachable, opening dashboard...");
            chrome.tabs.create({ url: "http://localhost:5173/" });
          }
        });
      } catch (e) {
        chrome.tabs.create({ url: "http://localhost:5173/" });
      }
    } else {
      chrome.tabs.create({ url: "http://localhost:5173/" });
    }
  });
};

document.querySelectorAll(".lang-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const langNameMap = { "en": "english", "hi": "hindi", "mr": "marathi" };
    try {
      chrome.storage.local.set({ selectedLanguage: langNameMap[btn.dataset.lang] });
      updatePopupUI();
    } catch (e) { }
  });
});

$("downloadBtn").onclick = () => {
  try {
    chrome.storage.local.get(["summary", "actionItems", "transcript_en", "meeting"], (data) => {
      const meetingId = data.meeting?.meetingId || "meeting";
      const summary = data.summary || "No summary generated.";
      const actions = (data.actionItems || []).map(a => typeof a === 'string' ? a : a.task).join("\n- ");
      const transcript = data.transcript_en || "No transcript available.";
      const content = `Meeting Summary: ${meetingId}\n\nSUMMARY:\n${summary}\n\nACTION ITEMS:\n- ${actions}\n\nTRANSCRIPT:\n${transcript}`;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Meeting_Summary_${new Date().getTime()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  } catch (e) { }
};

$("refreshBtn").onclick = updatePopupUI;

