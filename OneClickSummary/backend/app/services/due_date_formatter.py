def format_due_date(due_date, due_text):
    if due_date is None:
        if due_text:
            return "Please confirm due date"
        return "No due date"

    # agar date hai toh frontend readable banane do
    return due_date
