from datetime import datetime, timezone
from app.services.firestore import db

def get_users_dashboard(user_id:str):
    now = datetime.now(timezone.utc)

    tasks= db.collection("action_item_detection") \
        .where("assigned_to_user_id", "==", user_id) \
        .stream()

    total=0
    open_tasks=0
    completed=0
    overdue=0
    needs_review=0

    for doc in tasks:
        t = doc.to_dict()
        total+=1

        if t.get("status") == "completed":
            completed+=1

        else:
            open_tasks+=1

        if t.get("needs_manager_review"):
            needs_review+=1

        due_date=t.get("due_date")
        if due_date and due_date < now and t.get("status") != "completed":
            overdue+=1

    return {
        "total_tasks": total,
        "open_tasks": open_tasks,
        "completed_tasks": completed,
        "overdue_tasks": overdue,
        "needs_manager_review": needs_review
    }



