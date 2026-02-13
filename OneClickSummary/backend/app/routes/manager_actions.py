from fastapi import APIRouter
from app.services.manager_actions_services import approve_action_item, reject_action_item, reassign_action_item
from pydantic import BaseModel

router = APIRouter()

@router.post("/manager/action-item/{action_item_id}/approve")
def approve_task(action_item_id: str):
    return approve_action_item(action_item_id)



class RejectRequest(BaseModel):
    reason: str | None=None


@router.post("/manager/action-item/{action_item_id}/reject")
def reject_task(action_item_id:str, payload:RejectRequest):
    return reject_action_item(
        action_item_id=action_item_id,
        reason=payload.reason
    ) 


class ReassignRequest(BaseModel):
    new_user_id:str
    new_assigned_name: str


@router.post("/manager/action-item/{action_item_id}/reassign")
def reassign_task(action_item_id:str, payload:ReassignRequest):
    return reassign_action_item(
        action_item_id=action_item_id,
        new_user_id=payload.new_user_id,
        new_assigned_name=payload.new_assigned_name
    )