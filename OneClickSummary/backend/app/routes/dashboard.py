from app.services.dashboard_services import get_org_dashbaord_summary
from fastapi import APIRouter

router = APIRouter()

@router.get("/org/{org_id}/dashboard")
def org_dashboard(org_id:str):
    summary = get_org_dashbaord_summary(org_id)

    return{
        "org_id":org_id,
        "summary":summary
    }


