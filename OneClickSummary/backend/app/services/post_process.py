def normalize(text: str):
    return text.lower().replace("by", "").replace("before", "").strip()


def deduplicate_tasks(action_items):
    final = []

    for item in action_items:
        item_task = normalize(item["task"])
        item_assignee = item["assigned_to_user_id"]

        merged = False

        for existing in final:
            existing_task = normalize(existing["task"])
            existing_assignee = existing["assigned_to_user_id"]

            # SAME PERSON + SIMILAR TASK
            if item_assignee == existing_assignee and (
                item_task in existing_task or existing_task in item_task
            ):
                # keep more specific task (longer / has deadline)
                if len(item_task) > len(existing_task) or item.get("due_text"):
                    final.remove(existing)
                    final.append(item)
                merged = True
                break

        if not merged:
            final.append(item)

    return final
