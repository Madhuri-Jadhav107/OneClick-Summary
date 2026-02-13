import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateSummary(text) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an elite executive meeting assistant. Provide a "perfect" summary that is structured, professional, and highly actionable.
        
        The input may be a raw transcript or JSON speaker segments in English, Hindi, or Marathi (or a mixture). 
        
        CRITICAL: Regardless of the input language, the final summary must be in sophisticated, professional English.
        
        Return a JSON object with:
        - 'summary': A high-quality markdown-formatted summary including:
            ### Executive Summary
            (A 2-3 sentence high-level overview)
            ### Key Discussion Points
            (Bullet points of the most important topics discussed)
            ### Decisions Made
            (Clear list of confirmed decisions)
        - 'actionItems': An array of objects, each with:
            - 'task': Precise description of the work.
            - 'assigned_to_name': The owner (match speaker name if possible).
            - 'due_text': Deadline info as per the meeting.`
      },
      { role: "user", content: typeof text === 'string' ? text : JSON.stringify(text) }
    ]
  });

  try {
    return JSON.parse(res.choices[0].message.content);
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    return { summary: res.choices[0].message.content, actionItems: [] };
  }
}
