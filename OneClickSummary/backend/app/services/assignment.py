from app.services.firestore import get_users_by_name

def resolve_assignee(org_id:str, assigned_to_name:str):
    """
    Returns :
    user_id(str) if exactly one match
    None if zero or multiple matches
    """

    if not assigned_to_name:
        return None

    users = get_users_by_name(org_id, assigned_to_name)

    if len(users)==1:
        return users[0].get("user_id")

    return None

    