from app.services.firestore import db

def get_org_dashbaord_summary(org_id:str):
    items_ref = db.collection("action_item_detection") \
        .where("org_id","==", org_id)


    docs = list(items_ref.stream())

    total=len(docs)
    open_items=0
    completed_items=0
    needs_review=0

    for doc in docs:
        data = doc.to_dict()

        if data.get("status") == "open":
            open_items+=1

        if data.get("status") == "completed":
            completed_items+=1

        if data.get("needs_manager_review") is True:
            needs_review+=1

    return {
        "total_action_items": total,
        "open_action_items" : open_items,
        "completed_action_items" : completed_items,
        "needs_manager_review" : needs_review
    }







