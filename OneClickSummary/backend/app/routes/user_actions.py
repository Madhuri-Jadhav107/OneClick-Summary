from fastapi import APIRouter
from app.services.user_action_services import complete_action_item

router = APIRouter()

@router.post("/user/action-item/{action_item_id}/complete")
def complete_task(action_item_id: str):
    return complete_action_item(action_item_id)
