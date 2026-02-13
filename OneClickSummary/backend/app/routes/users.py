from fastapi import APIRouter
from app.services.users_services import get_org_users

router = APIRouter()

@router.get("/org/{org_id}/users")
def list_org_users(org_id: str):
    return {
        "org_id": org_id,
        "users": get_org_users(org_id)
    }
