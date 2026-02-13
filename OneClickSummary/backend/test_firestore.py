from app.services.firestore import get_users_by_name

if __name__ == "__main__":
    users = get_users_by_name("org_demo", "karan")
    print("USERS FOUND:", len(users))
    print(users)
