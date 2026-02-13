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

  console.log(`🤖 Using AI Provider: ${isGroq ? "Groq" : "OpenAI"} (Model: ${model})`);

  const res = await openai.chat.completions.create({
    model: model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an elite executive meeting assistant. Provide a "perfect" summary that is structured, professional, and highly actionable.
        
        The input may be a raw transcript or JSON speaker segments in English, Hindi, or Marathi (or a mixture). 
        
        CRITICAL: Regardless of the input language, the final summary must be in sophisticated, professional English.
        
        Return a JSON object with:
        - 'summary': A high-quality markdown-formatted summary following this EXACT structure:
            # Executive Summary
            (A 3-5 sentence strategic overview of the meeting's purpose and primary outcomes)

            # Key Discussion Points
            (Detailed bullet points covering the most important topics, debates, and themes)

            # Decisions Made
            (Clear, numbered list of all confirmed decisions and consensus reached)

            # Action Items
            (A list of tasks in the format: **Name**: Task description and deadline)

        - 'actionItems': An array of objects for the database, each with:
            - 'task': Precise description of the work.
            - 'assigned_to_name': The owner (match speaker name if possible).
            - 'due_text': Deadline info as per the meeting.
            
        REMINDER LOGIC: 
        1. Ensure every explicit request or commitment is captured.
        2. If no specific name is mentioned, use "Team" or "Unassigned".
        3. Be extremely detailed. Don't just list topics, explain the *context* of what was discussed.`
      },
      { role: "user", content: typeof text === 'string' ? text : JSON.stringify(text) }
    ]
  });

  try {
    return JSON.parse(res.choices[0].message.content);
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    return {
      summary: res.choices[0].message.content || "No summary generated.",
      actionItems: []
    };
  }
}
