from pydantic import BaseModel

class MeetingRequest(BaseModel):
    meeting_id: str
    org_id: str
    recorder_user_id: str
    transcript: str
    language: str = "english"

