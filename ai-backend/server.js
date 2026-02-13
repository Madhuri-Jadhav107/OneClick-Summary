import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { generateSummary } from "./llm.js";

dotenv.config();

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
    const { text, transcript, segments } = req.body;
    const content = segments || text || transcript;

    if (!content || (typeof content === 'string' && content.trim().length < 5) || (Array.isArray(content) && content.length === 0)) {
      console.log(`⚠️ Content too short or empty. Received: "${content}" (Length: ${content?.length || 0})`);
      return res.json({
        summary: "Waiting for enough content to summarize...",
        actionItems: []
      });
    }

    console.log(`📝 Summarizing content. Length: ${typeof content === 'string' ? content.length : JSON.stringify(content).length} chars`);

    const result = await generateSummary(content);

    res.json({
      summary: result.summary || "No summary generated.",
      actionItems: result.actionItems || []
    });

  } catch (err) {
    console.error("❌ FULL ERROR:", err);
    const status = err.status || 500;
    const message = err.message || "AI processing failed";

    if (status === 429) {
      console.log("⚠️ Quota exceeded on current provider. Please check API key balance.");
    }

    res.status(status).json({
      error: message,
      summary: "Summary error: " + message,
      actionItems: []
    });
  }
});

app.listen(3000, () => {
  console.log("✅ AI backend running on port 3000");
  console.log("OPENAI KEY:", process.env.OPENAI_API_KEY ? "LOADED" : "MISSING");
});
