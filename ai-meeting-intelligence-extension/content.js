

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
          console.log("✅ SUMMARY RECEIVED:", data.summary);
          chrome.storage.local.set({ summary: data.summary });
        })
        .catch(err => console.error("Send failed", err));
    });
  } catch (e) {
    console.warn("⚠️ sendChunkToBackend: Context invalidated.");
  }
}

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
                chrome.storage.local.set({ speakerSegments: speakerSegments.slice(-20), participants: Array.from(participants) });
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
    if (meetingActive) {
      console.error("🛑 AI Meeting Extension: Context invalidated. Please refresh the page to continue recording.");
      meetingActive = false;
      stopSpeechRecognition();
      stopAudioDetection();
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
    console.warn("⚠️ Speech recognition error:", e.error);

    // Backgrounding/Tab switching often triggers 'aborted' or 'network'
    if (e.error === "aborted" || e.error === "network") {
      console.log("🔄 Tab backgrounded or network blip. Will restart in 1s...");
    }

    if (e.error === "not-allowed") {
      console.error("❌ Mic permission denied.");
      isListening = false;
    }
  };

  recognition.onend = () => {
    console.log("⚪ Speech recognition session ended.");
    if (isListening) {
      const delay = document.visibilityState === 'hidden' ? 5000 : 800;
      console.log(`🔄 Restarting in ${delay}ms... (Tab is ${document.visibilityState})`);
      setTimeout(() => {
        if (isListening) {
          try {
            if (!recognition) initSpeechRecognition();
            recognition.start();
          } catch (err) {
            // Attempt full re-init if start fails
            recognition = null;
            initSpeechRecognition();
            try { recognition.start(); } catch (e) { }
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

/* ================= CONTROL ================= */

function startSpeechRecognition() {
  if (isListening) return;

  initSpeechRecognition();
  isListening = true;

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

  chrome.storage.local.get(["transcript_en", "meeting", "selectedLanguage"], async (storageData) => {
    if (!checkContext()) return;

    const transcript = storageData.transcript_en || "";
    const currentMeetingId = storageData.meeting?.meetingId || meetingId || "unknown";

    console.log("🏁 Meeting ended. Requesting AI analysis...");

    try {
      const res = await fetch("http://localhost:3000/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcript,
          segments: speakerSegments,
          meeting_id: currentMeetingId
        })
      });

      const aiData = await res.json();
      const summary = aiData.summary || "Summary failed.";
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

      // Truncate to avoid URL length issues
      const encodedSummary = encodeURIComponent(summary);
      const encodedActions = encodeURIComponent(JSON.stringify(actionItems));
      const encodedParticipants = encodeURIComponent(JSON.stringify(participantList));
      const encodedSegments = encodeURIComponent(JSON.stringify(speakerSegments.slice(-15)));

      const baseLength = `http://localhost:5173/?new_meeting=true&meeting_id=${currentMeetingId}&summary=${encodedSummary}&action_items=${encodedActions}&participants=${encodedParticipants}&segments=${encodedSegments}&transcript=`.length;
      const maxLength = 2000;
      const safeTranscript = transcript.slice(0, Math.max(maxLength - baseLength, 500));

      const dashboardUrl = `http://localhost:5173/?new_meeting=true&meeting_id=${encodeURIComponent(currentMeetingId.replace(/\//g, ''))}&summary=${encodedSummary}&action_items=${encodedActions}&transcript=${encodeURIComponent(safeTranscript)}&participants=${encodedParticipants}&segments=${encodedSegments}`;

      chrome.runtime.sendMessage({ action: "OPEN_DASHBOARD", url: dashboardUrl });

    } catch (err) {
      console.error("Sync failed:", err);
      if (!checkContext()) return;
      const dashboardUrl = `http://localhost:5173/`;
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
