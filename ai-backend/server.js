import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import { generateSummary } from "./llm.js";
import admin from "firebase-admin";
import { readFileSync } from "fs";

dotenv.config();

async function translateText(text, targetLang) {
  if (!text) return "";
  try {
    const params = new URLSearchParams();
    params.append('q', text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await res.json();
    return data[0].map(item => item[0]).join("");
  } catch (err) {
    console.error(`Translation failed for ${targetLang}:`, err.message);
    return text;
  }
}

// Initialize Firebase Admin
try {
  const serviceAccount = JSON.parse(
    readFileSync(new URL("./firebase_key.json", import.meta.url))
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("✅ Firebase Admin initialized");
} catch (error) {
  console.error("❌ Firebase Admin init failed:", error.message);
}

const db = admin.firestore();
const app = express();

app.use(cors());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Private-Network", "true");
  next();
});
app.use(express.json());

app.get("/", (req, res) => res.send("AI Backend is running"));

app.post("/summarize", async (req, res) => {
  try {
    console.log("🔥 /summarize HIT");
    const { text, transcript, segments, meeting_id, user_id, org_id } = req.body;

    // Use segments if available and not empty, then transcript, then text
    const validSegments = Array.isArray(segments) && segments.length > 0 ? segments : null;
    const content = validSegments || transcript || text;

    if (!content || (typeof content === 'string' && content.trim().length < 5) || (Array.isArray(content) && content.length === 0)) {
      console.log(`⚠️ Content too short for AI.`);

      // SAVE TO FIRESTORE EVEN IF SHORT (so dashboard shows something)
      if (meeting_id) {
        try {
          const meetingRef = db.collection("meetings").doc(meeting_id);
          await meetingRef.set({
            transcript: typeof content === 'string' ? content : JSON.stringify(content),
            summary: "Meeting too short for AI summary.",
            segments: segments || [],
            status: 'Processed',
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            ...(user_id ? { user_id } : {}),
            ...(org_id ? { company_id: org_id } : {})
          }, { merge: true });
          console.log(`💾 Saved short meeting ${meeting_id} to Firestore`);
        } catch (e) {
          console.error("❌ Failed to save short meeting:", e.message);
        }
      }

      return res.json({
        summary: "Waiting for enough content to summarize...",
        actionItems: []
      });
    }

    const textForAI = typeof content === 'string' ? content : JSON.stringify(content);
    console.log(`📝 Summarizing content. Length: ${textForAI.length} chars`);

    const result = await generateSummary(content);

    console.log("🌍 Translating summary and transcript to Hindi and Marathi...");
    const [summary_hi, summary_mr, transcript_hi, transcript_mr] = await Promise.all([
      translateText(result.summary, "hi"),
      translateText(result.summary, "mr"),
      translateText(textForAI, "hi"),
      translateText(textForAI, "mr")
    ]);

    // SAVE TO FIRESTORE if meeting_id is provided
    if (meeting_id) {
      try {
        const meetingRef = db.collection("meetings").doc(meeting_id);
        const meetingData = {
          summary: result.summary,
          summary_hi: summary_hi,
          summary_mr: summary_mr,
          transcript: textForAI, // Full transcript
          transcript_hi: transcript_hi,
          transcript_mr: transcript_mr,
          segments: segments || [],
          action_items_count: result.actionItems?.length || 0,
          status: 'Processed',
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        if (user_id) meetingData.user_id = user_id;
        if (org_id) meetingData.company_id = org_id;

        await meetingRef.set(meetingData, { merge: true });
        console.log(`💾 Saved meeting ${meeting_id} to Firestore`);

        // Save individual action items if they exist
        if (result.actionItems && result.actionItems.length > 0) {
          console.log(`📝 Saving ${result.actionItems.length} action items...`);
          for (const item of result.actionItems) {
            
            // Resolve User ID using substring matching
            let assignedUserId = user_id;
            try {
              if (item.assigned_to_name && item.assigned_to_name.toLowerCase() !== "unassigned") {
                const usersRef = db.collection("users");
                const userSnapshot = await usersRef.get();
                const matchedUser = userSnapshot.docs.find(d => {
                  const dataName = d.data().name || "";
                  return dataName.toLowerCase().includes(item.assigned_to_name.toLowerCase());
                });
                if (matchedUser) {
                  assignedUserId = matchedUser.id;
                }
              }
            } catch (e) {
               console.log("Error resolving user:", e.message);
            }

            const actionItemRef = await db.collection("action_items").add({
              meeting_id: meeting_id,
              description: item.task,
              assignee_name: item.assigned_to_name || "Unassigned",
              due_text: item.due_text || "Soon",
              due_date_iso: item.due_date_iso || null,
              user_id: assignedUserId || null,
              status: 'pending',
              created_at: admin.firestore.FieldValue.serverTimestamp(),
              company_id: org_id || "default_company"
            });

            // Immediate Notification
            if (assignedUserId) {
              await db.collection("notifications").add({
                user_id: assignedUserId,
                action_item_id: actionItemRef.id,
                message: `New Action Item Assigned: ${item.task} (Due: ${item.due_text})`,
                type: 'reminder',
                read: false,
                created_at: new Date().toISOString(),
                meeting_id: meeting_id,
                automated: true
              });
            }
          }
        }
      } catch (saveError) {
        console.error("❌ Failed to save to Firestore:", saveError.message);
      }
    }

    res.json({
      summary: result.summary || "No summary generated.",
      actionItems: result.actionItems || []
    });

  } catch (err) {
    console.error("❌ FULL ERROR:", err);
    res.status(err.status || 500).json({
      error: err.message || "AI processing failed",
      summary: "Summary error: " + (err.message || "Unknown error"),
      actionItems: []
    });
  }
});

app.listen(3000, () => {
  console.log("✅ AI backend running on port 3000");
});

// Run every hour to check for deadlines approaching within 24 hours
cron.schedule('0 * * * *', async () => {
  console.log("⏰ Running hourly action item reminder check...");
  try {
    const now = new Date();
    
    const snapshot = await db.collection("action_items")
      .where("status", "==", "pending")
      .get();
      
    const batch = db.batch();
    let remindersCreated = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.due_date_iso || !data.user_id) return;
      
      const dueDate = new Date(data.due_date_iso);
      const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // If deadline is < 24 hours away and reminder hasn't been sent
      if (diffHours > 0 && diffHours <= 24 && !data.reminder_24h_sent) {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          user_id: data.user_id,
          action_item_id: doc.id,
          message: `⏰ DEADLINE APPROACHING: ${data.description} (Due: ${data.due_text})`,
          type: 'reminder_deadline',
          read: false,
          created_at: new Date().toISOString(),
          meeting_id: data.meeting_id,
          automated: true
        });
        
        batch.update(doc.ref, { reminder_24h_sent: true });
        remindersCreated++;
      }
    });

    if (remindersCreated > 0) {
      await batch.commit();
      console.log(`✅ Created ${remindersCreated} deadline reminders.`);
    }
  } catch (err) {
    console.error("Cron Error:", err);
  }
});
