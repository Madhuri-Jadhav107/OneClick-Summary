import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

import os
if not firebase_admin._apps:
    path = os.path.join(os.path.dirname(__file__), "../../firebase_key.json")
    cred = credentials.Certificate(path)
    firebase_admin.initialize_app(cred)

db = firestore.client()


def get_users_by_name(org_id:str, first_name:str):
    user_ref = db.collection("users")
    query = (
        user_ref
        .where("org_id", "==", org_id)
        .where("first_name","==", first_name)
    )
    results = query.stream()
    return [doc.to_dict() for doc in results]

def save_action_items(action_items, org_id, meeting_id):
    batch = db.batch()

    for item in action_items:
        doc_ref = db.collection("action_item_detection").document()

        batch.set(doc_ref, {
            "org_id": org_id,
            "meeting_id": meeting_id,
            "task": item["task"],
            "assigned_to_user_id": item["assigned_to_user_id"],
            "assigned_to_name": item["assigned_to_name"],
            "due_text": item["due_text"],
            "due_date": item.get("due_date"),
            "confidence_score": item["confidence_score"],
            "needs_manager_review": item["needs_manager_review"],
            "status": "open",
            "created_at": datetime.utcnow()
        })

    batch.commit()
