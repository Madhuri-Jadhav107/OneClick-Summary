from datetime import datetime, timedelta, timezone
import re

IST = timezone(timedelta(hours=5, minutes=30))
UTC = timezone.utc

WEEKDAY_MAP = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

TIME_HINTS = {
    "morning": 10,
    "afternoon": 14,
    "evening": 18,
    "night": 21,
    "eod": 23,
}

def parse_due_text(due_text: str):
    if not due_text:
        return None

    text = due_text.lower().strip()
    now = datetime.now(IST)

    hour = 23
    minute = 59

    # ---- time extraction ----
    time_match = re.search(r'(\d{1,2})(?:\s*(am|pm))?', text)
    if time_match:
        hour = int(time_match.group(1))
        if time_match.group(2) == "pm" and hour < 12:
            hour += 12
        minute = 0
    else:
        for hint, h in TIME_HINTS.items():
            if hint in text:
                hour = h
                minute = 0
                break

    # ---- relative days ----
    if "day after tomorrow" in text:
        target = now + timedelta(days=2)
        return target.replace(hour=hour, minute=minute, second=0, microsecond=0).astimezone(UTC)

    if "tomorrow" in text:
        target = now + timedelta(days=1)
        return target.replace(hour=hour, minute=minute, second=0, microsecond=0).astimezone(UTC)

    if "today" in text:
        return now.replace(hour=hour, minute=minute, second=0, microsecond=0).astimezone(UTC)

    # ---- weekdays ----
    for day, day_index in WEEKDAY_MAP.items():
        if day in text:
            days_ahead = (day_index - now.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7

            target = now + timedelta(days=days_ahead)
            return target.replace(hour=hour, minute=minute, second=0, microsecond=0).astimezone(UTC)

    # ---- ambiguous ----
    return None
