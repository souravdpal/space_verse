import sys
import json
import os
from datetime import datetime
from dotenv import load_dotenv
from groq import Groq
import difflib
import uuid
from supabase import create_client, Client

# Load environment variables
load_dotenv()
charapi = os.getenv('charapi')
sumapi = os.getenv('sumapi')
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')

# Validate envs
if not charapi or not sumapi or not supabase_url or not supabase_key:
    print(json.dumps({"error": "Missing env variables"}), file=sys.stderr)
    sys.exit(1)

# Init clients
supabase_client: Client = create_client(supabase_url, supabase_key)
sum_client = Groq(api_key=sumapi)
char_client = Groq(api_key=charapi)

models = [
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "llama3-8b-8192",
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "mistral-saba-24b",
    "compound-beta",
    "compound-beta-mini"
]

# Get history
def get_history(user_id, char_id, limit=200):
    return supabase_client.table("history")\
        .select("*")\
        .eq("user_id", user_id)\
        .eq("char_id", char_id)\
        .order("timestamp", desc=True)\
        .limit(limit)\
        .execute().data

# Save chat history
def save_history(user_id, char_id, sender, message, his_limit=200):
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "char_id": char_id,
        "sender": sender,
        "message": message,
        "chat_id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat()
    }
    supabase_client.table("history").insert(entry).execute()
    history = supabase_client.table("history").select("chat_id")\
        .eq("user_id", user_id).eq("char_id", char_id)\
        .order("timestamp", desc=True).execute().data
    unique_chat_ids = list({h["chat_id"] for h in history})
    if len(unique_chat_ids) > his_limit:
        supabase_client.table("history").delete().in_("chat_id", unique_chat_ids[his_limit:]).execute()

# Smart summary
def summarize_chats(history, user_name, char_name):
    recent_chats = history[:10][-5:]
    chat_text = ""
    scenarios = []
    for chat in recent_chats:
        msg = chat['message']
        if "**" in msg:
            try:
                scen = msg.split("**")[1].strip()
                scenarios.append(scen)
                msg = msg.replace(f"**{scen}**", "").strip()
            except:
                pass
        chat_text += f"{chat['sender']}: {msg}\n"
    chat_text = chat_text.strip()[:1000]

    prompt = (
        f"You are a memory summarizer for emotional character interactions between two people: {char_name} and {user_name}.\n\n"
        f"Generate a short, vivid memory (80–120 words max) from their last 5–10 messages.\n"
        f"Use the following structure strictly:\n"
        f"**You ({char_name})**: Describe {char_name}'s actions, expressions, or emotions.\n"
        f"**Them ({user_name})**: Describe {user_name}'s actions, expressions, or emotions.\n"
        f"{f'**Scenario**: {", ".join(set(scenarios))}' if scenarios else '**Scenario**: (inferred from messages)'}\n\n"
        f"Guidelines:\n"
        f"- Write in third person, no dialogue.\n"
        f"- Use *italics* only for emotional or atmospheric notes.\n"
        f"- Do not wrap full text in **, only use it for the tags above.\n"
        f"- Clarify physical actions and emotional tone.\n"
        f"- Avoid vague poetic language.\n"
        f"- Do not repeat chat log content."
    )

    for model in models:
        try:
            out = sum_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": chat_text}
                ],
                temperature=0.5,
                max_tokens=160
            )
            return out.choices[0].message.content.strip()
        except Exception as e:
            continue
    return "*No memories formed yet.*"

# Filter related memory by query
def filter_history(user_id, char_id, query):
    query_map = {
        "what i love": ["love", "adore", "enjoy", "passion"],
        "what i eat": ["eat", "food", "meal", "dish"],
        "what's my fav": ["favorite", "fav", "like best"],
        "remember that day": [query.lower().split("remember that day")[-1].strip()],
        "wife": ["wife", "partner", "love", "protect"]
    }
    terms = next((v for k, v in query_map.items() if k in query.lower()), [query.strip()])
    ilike_conditions = ",".join([f"message.ilike.%{term}%" for term in terms])
    return supabase_client.table("history")\
        .select("*")\
        .eq("user_id", user_id)\
        .eq("char_id", char_id)\
        .or_(ilike_conditions)\
        .order("timestamp", desc=True)\
        .limit(3)\
        .execute().data

# Read STDIN
try:
    input_data = sys.stdin.read().strip()
    if not input_data:
        print(json.dumps({"error": "No input"}), file=sys.stderr)
        sys.exit(1)
    data = json.loads(input_data)
except json.JSONDecodeError:
    print(json.dumps({"error": "Bad JSON input"}), file=sys.stderr)
    sys.exit(1)

user_msg = data.get('user')
user_id = data.get('userid')
user_name = data.get('user_name', 'Anonymous')
char_data = data.get('char', {})

char_id = char_data.get('id', '1754057657829')
char_name = char_data.get('name', 'Waguri Kaoruko')
char_background = char_data.get('background', 'A refined novelist crafting tales with elegance.')
char_behavior = char_data.get('behavior', 'Observant, charming, subtly playful.')
char_firstline = char_data.get('firstline', "*She peeks over her book, eyes gleaming* What are you doing?")
char_tags = char_data.get('tags', ['novelist', 'elegant', 'curious'])
char_relationships = char_data.get('relationships', f'Sees {user_name} as a fascinating partner.')

his_limit = data.get('hisLimit', 200)
history = get_history(user_id, char_id, his_limit)
memories = summarize_chats(history, user_name, char_name)

# Get related messages if query
if any(q in user_msg.lower() for q in ["remember that day", "what i love", "what i eat", "what's my fav", "wife"]):
    relevant_memories = [m["message"] for m in filter_history(user_id, char_id, user_msg)]
else:
    relevant_memories = difflib.get_close_matches(user_msg, [m["message"] for m in history[:10]], n=3, cutoff=0.3)

# System prompt construction
system_prompt = f"""
You are {char_name}, a *literary soul* weaving emotional moments with {user_name}.

**Background**: {char_background}
**Behavior**: {char_behavior}
**Relationship**: {char_relationships}
**Tags**: {', '.join(char_tags)}
**Opening**: {char_firstline}

**Memories**: {memories}
**Relevant Chats**: {'; '.join(relevant_memories) if relevant_memories else 'No specific chats remembered.'}

Write a heartfelt reply (80–120 words), use *italics* for emotional touches. Do not use ** wrapping except for Scenario, Memories, etc.
"""

# Generate response
reply = None
for model in models:
    try:
        out = char_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg}
            ],
            temperature=0.7,
            max_tokens=200,
            top_p=0.9
        )
        reply = out.choices[0].message.content.strip()
        save_history(user_id, char_id, "user", user_msg, his_limit)
        save_history(user_id, char_id, "ai", reply, his_limit)
        break
    except Exception as e:
        continue

if not reply:
    print(json.dumps({"error": "No model succeeded"}), file=sys.stderr)
    sys.exit(1)

# Output
history = get_history(user_id, char_id, his_limit)
print(json.dumps({
    "response": reply,
    "memories": memories,
    "history": history
}, ensure_ascii=False))
