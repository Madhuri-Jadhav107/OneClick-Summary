from fastapi import APIRouter
from app.schemas import MeetingRequest
from app.llm import extract_action_items_and_summary, parse_llm_response
from app.services.assignment import resolve_assignee
from app.services.post_process import deduplicate_tasks
from app.services.firestore import save_action_items, db
from app.services.parse_date import parse_due_text
from app.services.due_date_formatter import format_due_date
from datetime import datetime

router = APIRouter()

@router.post("/process_meeting")
def process_meeting(data: MeetingRequest):
    try:
        raw_output = extract_action_items_and_summary(data.transcript, data.language)
        parsed_data = parse_llm_response(raw_output)
        
        summary = parsed_data.get("summary", "Summary not available.")
        action_items = parsed_data.get("action_items", [])
        
        resolved_items = []

        for item in action_items:
            assigned_user_id = resolve_assignee(
                org_id=data.org_id,
                assigned_to_name=item.get("assigned_to_name")
            )
            due_date = parse_due_text(item.get("due_text"))
            resolved_items.append({
                "task": item.get("task"),
                "assigned_to_name": item.get("assigned_to_name"),
                "assigned_to_user_id": assigned_user_id,
                "due_text": item.get("due_text"),
                "display_due_date": format_due_date(due_date, item.get("due_text")),
                "due_date": due_date,
                "confidence_score": item.get("confidence_score"),
                "needs_manager_review": assigned_user_id is None
            })
        
        resolved_items = deduplicate_tasks(resolved_items)
        
        # Save action items
        save_action_items(
            resolved_items,
            org_id=data.org_id,
            meeting_id=data.meeting_id    
        )

        # Save summary and meeting info
        meeting_ref = db.collection("meetings").document(data.meeting_id)
        meeting_ref.set({
            "org_id": data.org_id,
            "recorder_user_id": data.recorder_user_id,
            "transcript": data.transcript,
            "summary": summary,
            "language": data.language,
            "created_at": datetime.utcnow()
        }, merge=True)

        return {
            "message": "Meeting processed successfully",
            "meeting_id": data.meeting_id,
            "summary": summary,
            "action_items": resolved_items
        }
    except Exception as e:
        print(f"❌ Error in process_meeting: {e}")
        return {"error": str(e)}, 500
