from app.services.firestore import db

def get_org_users(org_id: str):
    users_ref = db.collection("users")

    query = (
        users_ref
        .where("org_id", "==", org_id)
    )

    users = []

    for doc in query.stream():
        data = doc.to_dict()
        users.append({
            "user_id": data.get("user_id"),
            "display_name": data.get("display_name")
        })

    return users
