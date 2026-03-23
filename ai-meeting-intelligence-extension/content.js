

console.log("AI Meeting content script loaded (SAFE MODE)");

/* ================= DEBUG OVERLAY ================= */
function createDebugOverlay() {
  if (document.getElementById("ai-debug-overlay")) return;

  const div = document.createElement("div");
  div.id = "ai-debug-overlay";
  div.style.position = "fixed";
  div.style.bottom = "10px";
  div.style.left = "10px";
  div.style.width = "300px";
  div.style.background = "rgba(0, 0, 0, 0.8)";
  div.style.color = "#0f0";
  div.style.fontFamily = "monospace";
  div.style.fontSize = "12px";
  div.style.padding = "10px";
  div.style.borderRadius = "5px";
  div.style.zIndex = "999999";
  div.style.pointerEvents = "none";
  div.style.whiteSpace = "pre-wrap";
  div.innerText = "AI Meeting Intelligence: Ready\nWaiting for start...";
  document.body.appendChild(div);
}

function logDebug(msg) {
  console.log(msg);
  const overlay = document.getElementById("ai-debug-overlay");
  if (overlay) {
    overlay.innerText = msg + "\n" + overlay.innerText.substring(0, 200);
  }
}

// Initialize Overlay
createDebugOverlay();

/* ================= STATE ================= */
let transcriptBuffer = [];
let lastSentTime = Date.now();

let meetingActive = false;
let meetingId = null;

let speakingSeconds = 0;
let silentSeconds = 0;
let audioInterval = null;

let recognition = null;
let isListening = false;
let retryCount = 0;

let fullTranscript = "";
//let lastSpeechTime = 0;
let lastSpeechTime = Date.now();
let lastFinalTime = Date.now();

function sendChunkToBackend(chunk) {
  if (!checkContext()) return;
  try {
    chrome.storage.local.get(["selectedLanguage", "org_id", "user_id", "meetingId"], (settings) => {
      if (!checkContext()) return;
      const meetId = settings.meetingId || "demo_meeting";

      fetch("http://localhost:3000/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: chunk,
          transcript: fullTranscript,
          segments: speakerSegments, // send segments too if available
          meeting_id: meetId,
          user_id: settings.user_id,
          org_id: settings.org_id
        })
      })
        .then(res => res.json())
        .then(data => {
          if (!checkContext()) return;
          // Robust check: Only save if it's a real summary (e.g. has markdown headers)
          // Avoid saving error messages or the "Waiting" placeholder
          const isRealSummary = data.summary &&
            data.summary.includes("###") &&
            !data.summary.includes("Waiting for enough content") &&
            !data.summary.includes("Summary error");

          if (isRealSummary) {
            console.log("✅ REAL SUMMARY RECEIVED:", data.summary.substring(0, 50) + "...");
            chrome.storage.local.set({ summary: data.summary });
          } else {
            console.log("ℹ️ Interim AI response ignored (not a full summary yet)");
          }
        })
        .catch(err => console.error("Send failed", err));
    });
  } catch (e) {
    console.warn("⚠️ sendChunkToBackend: Context invalidated.");
  }
}

// RECOVERY: Load existing state on startup
chrome.storage.local.get(["transcript", "transcript_en", "isListening", "participants", "speakerSegments", "summary"], (data) => {
  if (data.transcript_en) fullTranscript = data.transcript_en;
  if (data.isListening) {
    console.log("🔄 Recovering listening state...");
    isListening = true;
    initSpeechRecognition();
    try { recognition.start(); } catch (e) { }
  }
  if (data.participants) participants = new Set(data.participants);
  if (data.speakerSegments) speakerSegments = data.speakerSegments;
  console.log("📂 State recovered from storage");
});

let lastSpeaker = "";
let participants = new Set();
let speakerSegments = [];

// SCRAPE GOOGLE MEET CAPTIONS
function startCaptionObserver() {
  if (!checkContext()) return;
  const targetNode = document.body;
  if (!targetNode) return;

  const callback = (mutationsList) => {
    if (!checkContext()) return;
    try {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          // Standard and Fallback selectors for Google Meet captions
          const captionBlocks = document.querySelectorAll('div[jsname="tS79Yd"], .VfPpkd-LgbsSe, .i9777');
          captionBlocks.forEach(block => {
            const nameEl = block.querySelector('[jsname="K97o9b"]') || block.querySelector('.VfPpkd-v9777');
            const textEl = block.querySelector('[jsname="ys0sbe"]') || block.querySelector('.VfPpkd-LgbsSe');

            if (nameEl && textEl) {
              const name = nameEl.textContent.trim();
              const text = textEl.textContent.trim();

              if (name && text) {
                participants.add(name);
                if (name !== lastSpeaker) {
                  lastSpeaker = name;
                  speakerSegments.push({ speaker: name, text: text, time: new Date().toLocaleTimeString() });
                } else {
                  const lastSeg = speakerSegments[speakerSegments.length - 1];
                  if (lastSeg) lastSeg.text = text;
                }
                chrome.storage.local.set({ speakerSegments: speakerSegments.slice(-500), participants: Array.from(participants) });
              }
            }
          });
        }
      }
    } catch (err) {
      console.warn("🔍 Caption observer: Error or context invalidated.");
    }
  };

  const observer = new MutationObserver(callback);
  observer.observe(targetNode, { childList: true, subtree: true });
}

// Helper to check if extension context is valid
function checkContext() {
  if (!chrome.runtime?.id) {
    if (meetingActive || isListening) {
      console.error("🛑 AI Meeting Extension: Context invalidated. Please refresh the page to continue recording.");

      // Stop all active processes to avoid spamming errors
      meetingActive = false;
      isListening = false;

      try { stopSpeechRecognition(); } catch (e) { }
      try { stopAudioDetection(); } catch (e) { }
      if (audioInterval) clearInterval(audioInterval);

      // Nullify observers/intervals
      audioInterval = null;
      recognition = null;
    }
    return false;
  }
  return true;
}

// Global error listener for context invalidation
window.addEventListener('error', (e) => {
  if (e.message?.includes('Extension context invalidated')) {
    checkContext(); // Trigger cleanup
  }
}, true);

function pushChunk(text) {
  if (!checkContext()) return;
  transcriptBuffer.push(text);

  const totalWords = fullTranscript.split(" ").length;
  logDebug(`📝 Buffered: "${text}" (Total: ${totalWords} words)`);

  if (Date.now() - lastSentTime > 5000) { // Reduced to 5s for faster feedback
    const combined = transcriptBuffer.join(" ");
    if (combined.trim()) sendChunkToBackend(combined);
    transcriptBuffer = [];
    lastSentTime = Date.now();
  }
}

/* ================= TRANSLATION ================= */

async function translateText(text, targetLang) {
  if (!text) return "";

  // English → English (clean / passthrough)
  if (targetLang === "en") return text;

  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx" +
    `&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return data[0].map(item => item[0]).join("");
  } catch (err) {
    console.error("Translation failed:", err);
    return "";
  }
}



/* ================= KEYWORDS ================= */

// const DECISION_WORDS = ["decided", "approved", "confirmed", "finalized", "agreed"];
// const ACTION_WORDS = ["create", "prepare", "submit", "review", "fix", "build", "deploy", "test", "design", "will"];

/* ================= SPEECH TO TEXT ================= */

function initSpeechRecognition() {
  if (recognition) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.error("❌ SpeechRecognition not supported in this browser.");
    return;
  }

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;

  // Set default language immediately, update if storage has it
  recognition.lang = "en-US";
  chrome.storage.local.get("selectedLanguage", (data) => {
    const langMap = {
      "english": "en-US",
      "hindi": "hi-IN",
      "marathi": "mr-IN"
    };
    if (data.selectedLanguage && langMap[data.selectedLanguage]) {
      recognition.lang = langMap[data.selectedLanguage];
    }
    logDebug("🎙️ Speech Recognition initialized in: " + recognition.lang);
  });

  recognition.onstart = () => {
    logDebug("🟢 Speech recognition STARTED. Speak into your mic.");
    chrome.storage.local.set({ isListening: true });
  };

  recognition.onresult = (event) => {
    let interimText = "";
    let hasFinal = false;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      let text = result[0].transcript.trim();

      lastSpeechTime = Date.now();

      if (result.isFinal) {
        hasFinal = true;
        const now = Date.now();
        // Add punctuation if gap > 2s
        const gap = now - lastFinalTime;
        if (gap > 2000 && fullTranscript && !/[.!?]$/.test(fullTranscript)) {
          fullTranscript = fullTranscript.trim() + ". ";
        }

        fullTranscript += text + " ";
        lastFinalTime = now;
        pushChunk(text); // Send to backend

        // Sync finalized transcript
        chrome.storage.local.get(["transcript_en"], (old) => {
          if (!checkContext()) return;
          const en = (old.transcript_en || "") + text + " ";
          chrome.storage.local.set({ transcript_en: en });
        });

        logDebug(`📝 Captured: "${text}"`);
      } else {
        interimText += text + " ";
      }
    }

    // Save live text
    chrome.storage.local.set({
      transcript: fullTranscript + interimText,
      liveText: interimText
    });
  };

  recognition.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "network") return; // Expected during silence or network blips; onend handles it

    logDebug(`⚠️ Speech error: "${e.error}"`);

    if (e.error === "not-allowed") {
      logDebug("❌ Mute/Block/Timeout detected!");
      isListening = false;
      chrome.storage.local.set({ isListening: false });
    }
  };

  recognition.onend = () => {
    logDebug("⚪ Speech session paused/ended.");

    if (isListening && recognition) {
      setTimeout(() => {
        if (!isListening) return;
        try {
          recognition.start();
          logDebug("🔄 Resumed listening.");
        } catch (e) {
          // If already started, it throws an error which is fine
        }
      }, 500); 
    }
  };
}

// Ensure recognition restarts when returning to the tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isListening) {
    console.log("📑 Tab became active. Forcing speech recognition check...");
    if (recognition) {
      try { recognition.start(); } catch (e) { /* already running */ }
    } else {
      initSpeechRecognition();
      try { recognition.start(); } catch (e) { }
    }
  }
});

// Periodic keep-alive check to prevent silent stops
setInterval(() => {
  if (isListening) {
    if (!recognition) {
      console.log("💓 Re-initializing dead recognition...");
      initSpeechRecognition();
      try { recognition.start(); } catch (e) { }
    } else {
      try {
        recognition.start(); // This silently fails if already running, which is perfect
      } catch (e) {}
    }
  }
}, 5000);

/* ================= CONTROL ================= */

function startSpeechRecognition() {
  if (isListening) return;

  initSpeechRecognition();
  isListening = true;
  chrome.storage.local.set({ isListening: true });

  try {
    recognition.start();
  } catch (e) {
    console.warn("Start blocked:", e.message);
  }
}

function stopSpeechRecognition() {
  isListening = false;

  if (recognition) {
    recognition.stop();
    recognition = null;
  }

  chrome.storage.local.set({ liveText: "" });
}




/* ================= AUDIO DETECTION (VOLUME) - MODERNIZED ================= */
let volumeAudioContext;
let volumeAnalyser;
let volumeMic;
let volumeUpdateLoop;

async function startAudioDetection() {
  if (!checkContext()) return;
  // DISABLING THIS BECAUSE IT STEALS THE MIC AND CAUSES SPEECHRECOGNITION TO ABORT
  return;

  if (volumeAudioContext) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    volumeAudioContext = new AudioContext();
    volumeAnalyser = volumeAudioContext.createAnalyser();
    volumeMic = volumeAudioContext.createMediaStreamSource(stream);

    volumeAnalyser.smoothingTimeConstant = 0.8;
    volumeAnalyser.fftSize = 256;
    volumeMic.connect(volumeAnalyser);

    const checkVolume = () => {
      if (!checkContext()) {
        stopAudioDetection();
        return;
      }

      const array = new Uint8Array(volumeAnalyser.frequencyBinCount);
      volumeAnalyser.getByteFrequencyData(array);
      const volume = array.reduce((a, b) => a + b) / array.length;

      chrome.storage.local.set({ audioActive: volume > 10 });
      volumeUpdateLoop = requestAnimationFrame(checkVolume);
    };

    checkVolume();
    logDebug("🔊 Audio detection started. Indicators should move if you speak.");
  } catch (err) {
    logDebug("❌ Audio permission denied or device error: " + err);
    if (!checkContext()) return;
    chrome.storage.local.set({ audioError: err.message });
    alert("Error accessing microphone: " + err.message + "\nPlease check browser permission for meet.google.com");
  }
}

function stopAudioDetection() {
  if (volumeUpdateLoop) cancelAnimationFrame(volumeUpdateLoop);
  if (volumeAudioContext) {
    volumeAudioContext.close().catch(() => { });
    volumeAudioContext = null;
  }
}

/* ================= AUDIO TRACKING ================= */

function startAudioTracking() {
  if (!checkContext()) return;
  startAudioDetection();

  audioInterval = setInterval(() => {
    if (!checkContext()) {
      clearInterval(audioInterval);
      return;
    }
    const now = Date.now();
    if (now - lastSpeechTime < 1500) {
      speakingSeconds++;
    } else {
      silentSeconds++;
    }

    chrome.storage.local.set({
      audioStats: { speakingSeconds, silentSeconds }
    });
  }, 1000);
}

/* ================= MEETING DETECTION ================= */

function detectMeeting() {
  const hostname = location.hostname;
  const isMeet = hostname.includes("meet.google.com") && location.pathname.length > 1;
  const isZoom = hostname.includes("zoom.us") && location.pathname.includes("/wc/");
  const isTeams = hostname.includes("teams.microsoft.com");

  const isMeeting = isMeet || isZoom || isTeams;

  if (isMeeting && !meetingActive) {
    meetingActive = true;
    if (isMeet) {
      meetingId = location.pathname.replace(/^\//, '');
    } else if (isZoom) {
      meetingId = "Zoom_" + location.pathname.split("/").pop();
    } else if (isTeams) {
      meetingId = "Teams_" + Date.now().toString().slice(-6);
    }

    // Check if we are re-joining the same meeting (Refresh scenario)
    chrome.storage.local.get(["meeting", "transcript_en"], (data) => {
      if (data.meeting && data.meeting.meetingId === meetingId) {
        logDebug("♻️ Re-joined same meeting. Resuming transcript...");
        fullTranscript = data.transcript_en || "";
      } else {
        logDebug("⚠️ New meeting detected. Resetting transcript. New ID: " + meetingId);
        fullTranscript = "";
        speakingSeconds = 0;
        silentSeconds = 0;

        // Only clear storage for a truly NEW meeting
        if (!checkContext()) return;
        chrome.storage.local.set({
          meeting: {
            meetingId,
            status: "Meeting Active",
            startedAt: new Date().toLocaleTimeString()
          },
          transcript_en: "",
          decisions: [],
          actionItems: [],
          audioStats: { speakingSeconds: 0, silentSeconds: 0 }
        });
      }

      startAudioTracking();
      startCaptionObserver();
      speakerSegments = [];
      logDebug("✅ Meeting joined: " + meetingId);
    });
  }

  if (!isMeeting && meetingActive) {
    endMeeting();
  }
}

/* ================= END MEETING ================= */

async function endMeeting() {
  meetingActive = false;
  clearInterval(audioInterval);
  stopAudioDetection();
  stopSpeechRecognition();

  if (!checkContext()) return;

  chrome.storage.local.get(["transcript_en", "transcript", "meeting", "selectedLanguage", "summary", "user_id", "org_id"], async (storageData) => {
    if (!checkContext()) return;

    // MULTI-USER SYNC: Construct the final transcript from speaker segments (if available)
    let synthesizedTranscript = "";
    if (speakerSegments && speakerSegments.length > 0) {
      synthesizedTranscript = speakerSegments.map(s => `${s.speaker}: ${s.text}`).join("\n");
      console.log(`🧵 Synthesized multi-user transcript from ${speakerSegments.length} segments.`);
    } else {
      synthesizedTranscript = storageData.transcript || storageData.transcript_en || "";
      console.log("🎙️ Falling back to single-user mic transcript (No captions detected).");
    }

    const currentMeetingId = storageData.meeting?.meetingId || meetingId || "unknown";
    const storedSummary = storageData.summary || "";

    console.log(`🏁 Meeting ended. Requesting final AI analysis for ${synthesizedTranscript.length} chars...`);

    try {
      const res = await fetch("http://localhost:3000/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: synthesizedTranscript,
          segments: speakerSegments,
          meeting_id: currentMeetingId,
          user_id: storageData.user_id,
          org_id: storageData.org_id
        })
      });

      const aiData = await res.json();

      let summary = aiData.summary || "Summary failed.";
      if (summary.includes("Waiting for enough content") && storedSummary && storedSummary.length > 50) {
        console.log("♻️ Final AI call was too short; falling back to last good stored summary.");
        summary = storedSummary;
      }

      const actionItems = aiData.actionItems || [];
      const participantList = Array.from(participants);

      if (!checkContext()) return;
      chrome.storage.local.set({
        meeting: {
          meetingId: currentMeetingId,
          status: "Ended",
          endedAt: new Date().toLocaleTimeString()
        },
        summary: summary,
        actionItems: actionItems,
        participants: participantList
      });

      // CLEAN REDIRECT: Only pass essential IDs. The dashboard will fetch the rest from Firestore.
      const dashboardUrl = `http://localhost:5173/?new_meeting=true&meeting_id=${encodeURIComponent(currentMeetingId.replace(/\//g, ''))}`;

      chrome.runtime.sendMessage({ action: "OPEN_DASHBOARD", url: dashboardUrl });

    } catch (err) {
      console.error("Sync failed:", err);
      if (!checkContext()) return;

      const dashboardUrl = `http://localhost:5173/?new_meeting=true&meeting_id=${encodeURIComponent(currentMeetingId.replace(/\//g, ''))}&error=sync_failed`;

      chrome.runtime.sendMessage({ action: "OPEN_DASHBOARD", url: dashboardUrl });
    }
  });

  console.log("Meeting ended");
}

/* ================= URL WATCH ================= */

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    detectMeeting();
  }
}, 2000);

detectMeeting();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!checkContext()) return;

  if (msg.action === "PING") {
    sendResponse({ status: "ALIVE" });
  } else if (msg.action === "START_TRANSCRIPTION") {
    if (!isListening) {
      isListening = true;
      initSpeechRecognition();
      recognition.start();
      chrome.storage.local.set({ meeting: { ...msg.meeting, status: "Meeting Active", startedAt: new Date().toLocaleTimeString() } });
    }
    sendResponse({ success: true, status: "Started" });
  } else if (msg.action === "STOP_TRANSCRIPTION") {
    stopSpeechRecognition();
    endMeeting();
    sendResponse({ success: true, status: "Stopped" });
  }
  return true;
});
