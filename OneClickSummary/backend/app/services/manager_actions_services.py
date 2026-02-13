from app.services.firestore import db
from datetime import datetime

def approve_action_item(action_item_id: str):
    doc_ref = db.collection("action_item_detection").document(action_item_id)

    doc_ref.update({
        "needs_manager_review": False,
        "status": "open"
    })

    return {"message": "Action item approved"}


def reject_action_item(action_item_id:str, reason: str | None=None):
    doc_ref=db.collection("action_item_detection").document(action_item_id)

    doc_ref.update({
        "status":"rejected",
        "needs_manager_review":False,
        "rejected_reason": reason,
        "rejected_at":datetime.utcnow()
    })

    return({
        "message":"action item rejected",
        "action_item_id":action_item_id
    })

def reassign_action_item(
    action_item_id: str,
    new_user_id: str,
    new_assigned_name: str
):
    doc_ref= db.collection("action_item_detection").document(action_item_id)

    doc_ref.update({
        "assigned_to_user_id": new_user_id,
        "assigned_to_name": new_assigned_name,
        "needs_manager_review": False,
        "status": "open",
        "reassigned_at": datetime.utcnow()
    })

    return {
        "message": "Action item reassigned",
        "action_item_id": action_item_id,
        "assigned_to_user_id": new_user_id,
        "assigned_to_name": new_assigned_name
    }
    