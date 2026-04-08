import requests
import json

base_url = "http://localhost:8000"
resp = requests.post(f"{base_url}/api/token", data={"username":"admin", "password":"123"})
token = resp.json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}

# Get users
users = requests.get(f"{base_url}/api/users", headers=headers).json()
print("Users:", users)

# Assign companies to user 1
resp2 = requests.post(f"{base_url}/api/users/1/companies", headers=headers, json={"company_ids": [1]})
print("Assign response:", resp2.status_code, resp2.text)

# Get users again
users_after = requests.get(f"{base_url}/api/users", headers=headers).json()
print("Users after:", users_after)

