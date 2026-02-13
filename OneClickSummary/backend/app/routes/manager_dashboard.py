from fastapi import APIRouter
from app.services.manager_dashboard_services import get_manager_dashboard

router=APIRouter()

@router.get("/org/{org_id}/manager/dashboard")
def manager_dashboard(org_id:str):
    pending_reviews=get_manager_dashboard(org_id)

    return {
        "org_id":org_id,
        "pending_review_content":len(pending_reviews),
        "pending_review":pending_reviews
    }

