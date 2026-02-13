import os 
import re
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
# If key not found in local .env, try to find it in the root directory
if not os.getenv("GROQ_API_KEY"):
    load_dotenv(os.path.join(os.path.dirname(__file__), "../../../.env"))

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
# print("GROQ_API:", os.getenv("GROQ_API_KEY"))

def extract_action_items_and_summary(transcript: str, language: str = "english"):
    prompt = f"""
    You are an AI assistant that summarizes meeting transcripts and extracts action items.
    
    The meeting was conducted in {language}. Please provide the response in {language}.

    CRITICAL SUMMARY RULES:
    1. Provide a concise summary of the key discussion points (3-5 sentences).

    CRITICAL EXTRACTION RULES:
    1. Distinguish clearly between the SPEAKER and the ASSIGNEE.
    2. Do NOT assume "I", "me", or "we" refers to the assignee.
    3. Split multiple actions into separate tasks.
    4. If a task uses phrases like "ask X to do Y":
       - assign the task to X
       - the task is Y
       - do NOT create a task for the person who is asking
    5. Do NOT assign tasks to abstract entities.
    6. If assignee cannot be determined, set assigned_to_name = "Unassigned".
    7. Merge repeated or semantically similar tasks.
    8. Preserve deadlines exactly as mentioned.
    9. Return ONLY valid JSON.

    Return ONLY valid JSON in the following format:
    {{
      "summary": "string",
      "action_items": [
        {{
            "task": "string",
            "assigned_to_name": "string or null",
            "due_text": "string or null",
            "confidence_score": float
        }}
      ]
    }}

    Transcript:
    {transcript}
    """

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": f"You are a helpful assistant proficient in {language}."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2
    )

    return response.choices[0].message.content


import json

def parse_llm_response(raw_output: str):
    if not isinstance(raw_output, str):
        return {"summary": "", "action_items": []}

    # Clean markdown if present
    cleaned = raw_output.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r'^```(?:json)?\n?|\n?```$', '', cleaned, flags=re.MULTILINE).strip()

    try:
        data = json.loads(cleaned)
        # Ensure it has the right structure
        if not isinstance(data, dict):
             return {"summary": str(data), "action_items": []}
        return data
    except Exception as e:
        print(f"JSON Parse Error: {e}")
        print(f"Original output: {raw_output}")
        return {"summary": "Summary parsing failed.", "action_items": []}
