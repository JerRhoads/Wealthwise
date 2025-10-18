from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import os
import time

app = Flask(__name__, static_folder="static", template_folder="static")
CORS(app)

# -----------------------------
# In-memory "DB" (demo only)
# -----------------------------
DB = {
    "profiles": {},   # key: user_id -> profile dict
    "goals": {},      # key: user_id -> list of goals
    "snapshots": {}   # key: user_id -> last computed health snapshot
}

# -----------------------------
# Cloud Sync Stub (Firebase/Supabase)
# -----------------------------
def cloud_sync_stub(collection: str, user_id: str, payload: dict):
    """
    Placeholder for cloud persistence.
    Replace with actual SDK calls (e.g., Firebase Admin or Supabase Python).
    """
    # Example pseudo:
    # firebase.collection(collection).doc(user_id).set(payload)
    # or supabase.table(collection).upsert({ 'user_id': user_id, **payload })
    return {"status": "stubbed", "collection": collection, "user_id": user_id, "ts": int(time.time())}


# -----------------------------
# Static routes
# -----------------------------
@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/<path:path>")
def send_static(path):
    return send_from_directory("static", path)


# -----------------------------
# API: Profile & Goals
# -----------------------------
@app.post("/api/save_profile")
def save_profile():
    data = request.get_json(force=True)
    user_id = (data or {}).get("user_id", "demo")
    DB["profiles"][user_id] = data
    # Cloud stub
    cloud_sync_stub("profiles", user_id, data)
    return jsonify({"ok": True})

@app.get("/api/load_profile")
def load_profile():
    user_id = request.args.get("user_id", "demo")
    return jsonify(DB["profiles"].get(user_id, {}))

@app.post("/api/save_goals")
def save_goals():
    payload = request.get_json(force=True)
    user_id = (payload or {}).get("user_id", "demo")
    goals = payload.get("goals", [])
    DB["goals"][user_id] = goals
    cloud_sync_stub("goals", user_id, {"goals": goals})
    return jsonify({"ok": True})

@app.get("/api/load_goals")
def load_goals():
    user_id = request.args.get("user_id", "demo")
    return jsonify({"goals": DB["goals"].get(user_id, [])})

@app.post("/api/save_snapshot")
def save_snapshot():
    payload = request.get_json(force=True)
    user_id = (payload or {}).get("user_id", "demo")
    DB["snapshots"][user_id] = payload
    cloud_sync_stub("snapshots", user_id, payload)
    return jsonify({"ok": True})

@app.get("/api/load_snapshot")
def load_snapshot():
    user_id = request.args.get("user_id", "demo")
    return jsonify(DB["snapshots"].get(user_id, {}))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # Debug true for local dev
    app.run(host="0.0.0.0", port=port, debug=True)
