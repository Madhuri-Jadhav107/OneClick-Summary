from app.services.firestore import db


def get_manager_dashboard(org_id: str):
    collection_ref = db.collection("action_item_detection") 

    query=(
        collection_ref
        .where("org_id","==", org_id)
    )

    docs=query.stream()

    pending_reviews=[]

    for doc in docs:
        data = doc.to_dict()
        # data["action_item_id"] = doc.id
        
        if (
            data.get("needs_manager_review") is True
            or data.get("assigned_to_user_id") is None
        ):
            pending_reviews.append({
                "action_item_id": doc.id,
                "task": data.get("task"),
                "assigned_to_name": data.get("assigned_to_name"),
                "assigned_to_user_id": data.get("assigned_to_user_id"),
                "due_text": data.get("due_text"),
                "confidence_score": data.get("confidence_score"),
                "needs_manager_review": data.get("needs_manager_review"),
                "status": data.get("status")
            })

    return pending_reviews



