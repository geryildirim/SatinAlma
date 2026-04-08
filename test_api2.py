import sys
sys.path.append('.')
from fastapi.testclient import TestClient
from main import app
import database

client = TestClient(app)
# Get token
resp = client.post("/api/token", data={"username":"admin", "password":"123"})
token = resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Create test company
client.post("/api/companies", json={"name": "Test Company"}, headers=headers)

# Post user companies
resp2 = client.post("/api/users/1/companies", headers=headers, json={"company_ids": [1]})
print("POST status:", resp2.status_code, resp2.text)

# Get all users
resp3 = client.get("/api/users", headers=headers)
print("GET users:", resp3.json())

