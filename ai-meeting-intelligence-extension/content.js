

console.log("AI Meeting content script loaded (SAFE MODE)");

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
        body: JSON.stringify({ text: chunk, transcript: chunk, meeting_id: meetId })
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

  if (Date.now() - lastSentTime > 15000) {
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
    console.error("SpeechRecognition not supported");
    return;
  }

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;

  chrome.storage.local.get("selectedLanguage", (data) => {
    const langMap = {
      "english": "en-US",
      "hindi": "hi-IN",
      "marathi": "mr-IN"
    };
    recognition.lang = langMap[data.selectedLanguage] || "en-US";
    console.log("🎙️ Speech Recognition initialized in:", recognition.lang);
  });

  recognition.onstart = () => {
    console.log("🟢 Speech recognition started");
  };

  recognition.onresult = (event) => {
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      let text = result[0].transcript.trim();

      lastSpeechTime = Date.now();

      if (result.isFinal) {
        const now = Date.now();
        const gap = now - lastFinalTime;
        if (gap > 1800 && fullTranscript && !/[.!?]$/.test(fullTranscript)) {
          fullTranscript = fullTranscript.trim() + ". ";
        }

        fullTranscript += text + " ";
        lastFinalTime = now;
        pushChunk(text);

        // SYNC ALL TRANSCRIPTIONS
        chrome.storage.local.get(["transcript_en"], (old) => {
          if (!checkContext()) return;
          const en = (old.transcript_en || "") + text + " ";
          chrome.storage.local.set({ transcript_en: en });
        });
      } else {
        interimText += text + " ";
      }
    }

    // Save live text for UI AND storage (interim sync)
    chrome.storage.local.set({
      transcript: fullTranscript + interimText,
      liveText: interimText
    });

    // Periodically sync interim to transcript_en if it's long
    if (interimText.length > 50) {
      chrome.storage.local.get(["transcript_en"], (old) => {
        if (!checkContext()) return;
        // We don't want to double-count, so we only use this for live UI mostly, 
        // but transcript_en should ideally be finalized text. 
        // However, for "missing" text, we'll ensure transcript_en gets periodic updates.
      });
    }
  };

  recognition.onerror = (e) => {
    // We log but don't warn for common non-critical errors
    if (e.error === "no-speech") {
      console.log("ℹ️ Speech recognition: No speech detected (normal).");
      return; // Handled by onend restart
    }

    console.warn("⚠️ Speech recognition error:", e.error);

    // Backgrounding/Tab switching often triggers 'aborted' or 'network'
    if (e.error === "aborted" || e.error === "network") {
      console.log("🔄 Tab backgrounded or network blip. Will restart...");
    }

    if (e.error === "not-allowed") {
      console.error("❌ Mic permission denied.");
      isListening = false;
    }
  };

  recognition.onend = () => {
    console.log("⚪ Speech recognition session ended.");
    if (isListening) {
      // Visibility state affects restart delay
      let delay = document.visibilityState === 'hidden' ? 5000 : 800;

      // If we had a network error recently, add exponential backoff
      if (retryCount > 0) {
        delay = Math.min(delay * Math.pow(2, retryCount), 30000);
        console.log(`📡 Network/Retry backoff active: ${delay}ms (Retry #${retryCount})`);
      }

      console.log(`🔄 Restarting in ${delay}ms... (Tab is ${document.visibilityState})`);
      setTimeout(() => {
        if (isListening) {
          try {
            if (!recognition) initSpeechRecognition();
            recognition.start();
            console.log("🟢 Speech recognition restart: Success");
            retryCount = 0;
          } catch (err) {
            console.warn("⚠️ Restart failed, cooling down...", err.message);
            retryCount++;
            // Force re-init and attempt one more time shortly
            recognition = null;
          }
        }
      }, delay);
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
      console.log("💓 Keep-alive: Recognition was null but isListening is true. Re-initializing...");
      initSpeechRecognition();
      try { recognition.start(); } catch (e) { }
    } else {
      // recognition exists, but let's check if it's actually alive by trying to start it
      // if it's already running, it will throw an error, which we catch
      try {
        recognition.start();
        console.log("💓 Keep-alive: Recognition was stopped. Restarted.");
      } catch (e) {
        // Already running, which is good
      }
    }
  }
}, 10000);

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
  } catch (err) {
    console.warn("Audio permission denied or device error:", err);
    if (!checkContext()) return;
    chrome.storage.local.set({ audioError: err.message });
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
  const isMeeting = location.hostname.includes("meet.google.com") && location.pathname.length > 1;

  if (isMeeting && !meetingActive) {
    meetingActive = true;
    meetingId = location.pathname.replace(/^\//, '');
    speakingSeconds = 0;
    silentSeconds = 0;
    fullTranscript = "";

    const meetingData = {
      meetingId,
      status: "Meeting Active",
      startedAt: new Date().toLocaleTimeString()
    };

    if (!checkContext()) return;
    chrome.storage.local.set({
      meeting: meetingData,
      transcript_en: "",
      decisions: [],
      actionItems: [],
      audioStats: { speakingSeconds: 0, silentSeconds: 0 }
    });

    startAudioTracking();
    startCaptionObserver();
    speakerSegments = []; // Ensure fresh segments for a new meeting
    console.log("✅ Meeting joined:", meetingId);
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

  chrome.storage.local.get(["transcript_en", "transcript", "meeting", "selectedLanguage", "summary"], async (storageData) => {
    if (!checkContext()) return;

    // MULTI-USER SYNC: Construct the final transcript from speaker segments (if available)
    // This ensures the transcript on the dashboard shows everyone, not just the user.
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
          meeting_id: currentMeetingId
        })
      });

      const aiData = await res.json();

      // FALLBACK: If the final AI call returns "Waiting..." but we already have a real summary in storage, use the stored one!
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

      // Truncate to avoid URL length issues (Node/Vite typical limit is ~16KB, so 14KB is safe)
      const encodedSummary = encodeURIComponent(summary);
      const encodedActions = encodeURIComponent(JSON.stringify(actionItems));
      const encodedParticipants = encodeURIComponent(JSON.stringify(participantList));
      const encodedSegments = encodeURIComponent(JSON.stringify(speakerSegments.slice(-500)));

      const baseLength = `http://localhost:5173/?new_meeting=true&meeting_id=${currentMeetingId}&summary=${encodedSummary}&action_items=${encodedActions}&participants=${encodedParticipants}&segments=${encodedSegments}&transcript=`.length;
      const maxLength = 14000;
      // SYNC THE END OF THE TRANSCRIPT IF TRUNCATED (Capture the most recent discussion)
      const safeTranscript = transcript.length > (maxLength - baseLength)
        ? transcript.slice(-(maxLength - baseLength))
        : transcript;

      const dashboardUrl = `http://localhost:5173/?new_meeting=true&meeting_id=${encodeURIComponent(currentMeetingId.replace(/\//g, ''))}&summary=${encodedSummary}&action_items=${encodedActions}&transcript=${encodeURIComponent(safeTranscript)}&participants=${encodedParticipants}&segments=${encodedSegments}`;

      chrome.runtime.sendMessage({ action: "OPEN_DASHBOARD", url: dashboardUrl });

    } catch (err) {
      console.error("Sync failed:", err);
      if (!checkContext()) return;

      // Fallback: sync transcript even if AI fails
      const safeTranscript = transcript.slice(-5000);
      const dashboardUrl = `http://localhost:5173/?new_meeting=true&meeting_id=${encodeURIComponent(currentMeetingId.replace(/\//g, ''))}&summary=Sync failed (Backend Error).&transcript=${encodeURIComponent(safeTranscript)}&participants=${encodeURIComponent(JSON.stringify(Array.from(participants)))}&segments=${encodeURIComponent(JSON.stringify(speakerSegments.slice(-50)))}`;

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
