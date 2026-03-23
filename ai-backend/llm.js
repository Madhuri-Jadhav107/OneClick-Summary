import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const isGroq = apiKey?.startsWith("gsk_");

if (!apiKey) {
  console.error("❌ CRITICAL: OPENAI_API_KEY is missing from environment variables!");
} else {
  console.log(`📡 AI Config: Key loaded (Prefix: ${apiKey.substring(0, 4)}..., IsGroq: ${isGroq})`);
}

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: isGroq ? "https://api.groq.com/openai/v1" : undefined
});

export async function generateSummary(text) {
  const model = isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

  // Check if content is too short
  const textContent = typeof text === 'string' ? text : JSON.stringify(text);
  if (textContent.length < 50) {
    console.log(`⚠️ Content too short for AI (${textContent.length} chars). Returning placeholder.`);
    return {
      summary: "# Executive Summary\nMeeting was too short to generate a meaningful summary.\n\n# Key Discussion Points\n- No significant discussion captured yet.\n\n# Decisions Made\n- None.\n\n# Action Items\n- None.",
      actionItems: []
    };
  }

  console.log(`🤖 Using AI Provider: ${isGroq ? "Groq" : "OpenAI"} (Model: ${model})`);

  try {
    const res = await openai.chat.completions.create({
      model: model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an elite executive meeting assistant. Provide a "perfect" summary that is structured, professional, and highly actionable.
          Current ISO Date: ${new Date().toISOString()}. Use this to calculate precise deadlines based on meeting context (e.g., "by tomorrow", "next Thursday").
          
          Return a JSON object with EXACTLY this structure:
          {
            "summary": "Markdown string containing # Executive Summary, # Key Discussion Points, # Decisions Made, and # Action Items sections",
            "actionItems": [
              {
                "task": "description",
                "assigned_to_name": "name",
                "due_text": "deadline",
                "due_date_iso": "YYYY-MM-DDTHH:mm:ss.sssZ"
              }
            ]
          }
          
          CRITICAL:
          1. The 'summary' field MUST be valid Markdown.
          2. The response MUST be a valid JSON object.
          3. 'due_date_iso' MUST be a valid ISO-8601 string calculated relative to the Current ISO Date provided above. If no deadline is deduced, omit the field or set to null.
          4. If no action items, set "actionItems": [].
          5. Always respond in professional English.`
        },
        { role: "user", content: textContent }
      ]
    });

    const content = res.choices[0].message.content;
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      console.log("Raw content:", content);
      return {
        summary: content || "Summary parsing failed.",
        actionItems: []
      };
    }
  } catch (err) {
    console.error("AI Generation Error:", err);
    throw err;
  }
}
