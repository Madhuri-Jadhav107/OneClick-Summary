from fastapi import APIRouter
from app.services.user_dashboard_services import get_users_dashboard


router=APIRouter()


@router.get("/user/{user_id}/dashboard")
def user_dashboard(user_id:str):
    data = get_users_dashboard(user_id)

    return{
        "user_id":user_id,
        "dashboard": data
    }
