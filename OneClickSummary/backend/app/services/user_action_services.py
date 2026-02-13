from app.services.firestore import db
from datetime import datetime

def complete_action_item(action_item_id:str):
    doc_ref=db.collection("action_item_detection").document(action_item_id)

    doc_ref.update({
        "status":"completed",
        "completed_at" : datetime.utcnow()
    })

    return({
        "message":"Status updated as completed",
        "action_item_id":action_item_id
    })
