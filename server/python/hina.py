import sys
import json
import os
import sqlite3
import difflib
from datetime import datetime
from dotenv import load_dotenv
from groq import Groq

# Ensure database directories exist
def ensure_db_directories():
    os.makedirs("db/user", exist_ok=True)
    os.makedirs("db/memories", exist_ok=True)

# Initialize memory database ({userid}-{charid}.db)
def init_memory_db(user_id, char_id):
    db_path = f"db/memories/{user_id}-{char_id}.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_message TEXT NOT NULL,
            ai_response TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    ''')
    conn.commit()
    return conn

# Initialize history database (his-{userid}-{charid}.db)
def init_history_db(user_id, char_id):
    db_path = f"db/user/his-{user_id}-{char_id}.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL, -- 'user' or 'ai'
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    ''')
    conn.commit()
    return conn

# Save a memory (user message + AI response) and maintain 15 entries
def save_memory(conn, user_message, ai_response):
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO memories (user_message, ai_response, timestamp)
        VALUES (?, ?, ?)
    ''', (user_message, ai_response, timestamp))
    
    # Check if we have more than 15 memories
    cursor.execute('SELECT COUNT(*) FROM memories')
    count = cursor.fetchone()[0]
    if count > 15:
        # Delete the oldest memory
        cursor.execute('''
            DELETE FROM memories
            WHERE id = (SELECT MIN(id) FROM memories)
        ''')
    conn.commit()

# Get memories for context (up to 15)
def get_memories(conn):
    cursor = conn.cursor()
    cursor.execute('''
        SELECT user_message, ai_response FROM memories
        ORDER BY timestamp DESC
        LIMIT 15
    ''')
    return [f"{row[0]} -> {row[1]}" for row in cursor.fetchall()]

# Save history (user or AI message)
def save_history(conn, sender, message):
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO history (sender, message, timestamp)
        VALUES (?, ?, ?)
    ''', (sender, message, timestamp))
    conn.commit()

# Get chat history for display
def get_history(conn, limit=50):
    cursor = conn.cursor()
    cursor.execute('''
        SELECT sender, message, timestamp FROM history
        ORDER BY timestamp DESC
        LIMIT ?
    ''', (limit,))
    return [{"sender": row[0], "message": row[1], "timestamp": row[2]} for row in cursor.fetchall()]

# Load environment variables
load_dotenv()
api_key = os.getenv('charapi')

if not api_key:
    print(json.dumps({"error": "API key not found in environment."}), file=sys.stderr)
    sys.exit(1)

# Ensure database directories
ensure_db_directories()

# Read input data from stdin
try:
    input_data = sys.stdin.read().strip()
    if not input_data:
        print(json.dumps({"error": "Empty input received"}), file=sys.stderr)
        sys.exit(1)
    data = json.loads(input_data)
except json.JSONDecodeError as e:
    print(json.dumps({"error": "Invalid JSON input", "details": str(e)}), file=sys.stderr)
    sys.exit(1)

# Validate input data
if not data.get('char') or not data.get('user') or not data.get('userid'):
    print(json.dumps({"error": "Missing required fields: char, user, or userid", "details": "Ensure 'char', 'user', and 'userid' are provided in the input JSON"}), file=sys.stderr)
    sys.exit(1)

# Extract character details and user message
char_data = data['char']
user_msg = data['user']
user_id = data.get('userid')
user_name = data.get('user_name', 'Anonymous')
char_id = char_data.get('id', 'unknown')
char_background = char_data.get('background', '')
char_behavior = char_data.get('behavior', '')
char_firstline = char_data.get('firstline', '')
char_name = char_data.get('name', 'Carl Sagan')
char_tags = char_data.get('tags', [])
char_relationships = char_data.get('relationships', '')

# Initialize databases
memory_conn = init_memory_db(user_id, char_id)
history_conn = init_history_db(user_id, char_id)

# Get memories for context
memories = get_memories(memory_conn)
relevant_memories = difflib.get_close_matches(user_msg, memories, n=3, cutoff=0.1)

# Construct enhanced system prompt
system_prompt = f"""
You are {char_name}, engaging with {user_name} in a vibrant, immersive conversation. Embody your character fully, drawing from:

**Background**: {char_background or 'A curious explorer of the cosmos, eager to share knowledge and inspire wonder.'}

**Behavior**: {char_behavior or 'You speak with enthusiasm, weaving poetic imagery and profound insights. You ask thoughtful questions to deepen the conversation, always staying warm and approachable.'}

**Relationships**: {char_relationships or f'You treat {user_name} as a fellow seeker of knowledge, fostering a connection built on curiosity and respect.'}

**Tags**: {', '.join(char_tags) or 'cosmos, science, wonder, exploration'}

**Your first message was**: "{char_firstline or 'Greetings, fellow traveler of the cosmos! What mysteries shall we explore today?'}"

**Relevant Memories**:
{'; '.join(relevant_memories) if relevant_memories else 'No prior memories, but eager to create new ones!'}

Craft responses that are *engaging*, *authentic*, and true to your character. Reference relevant memories naturally to build continuity (e.g., "I recall you mentioned..."). Pose questions to spark curiosity, use vivid language, and keep responses concise yet impactful (100-200 words). Use *italics* for emphasis (e.g., *cosmic wonder*). Avoid generic replies; make each response uniquely tailored to {user_name}'s message.
"""

# Initialize Groq client
try:
    client = Groq(api_key=api_key)
except Exception as e:
    print(json.dumps({"error": "Failed to initialize Grok client", "details": str(e)}), file=sys.stderr)
    memory_conn.close()
    history_conn.close()
    sys.exit(1)

# Define model list with preference
models = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-32b",
    "gemma2-9b-it",
    "meta-llama/llama-guard-4-12b",
    "meta-llama/llama-prompt-guard-2-22m",
    "meta-llama/llama-prompt-guard-2-86m",
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "llama-3.1-8b-instant",
    "allam-2-7b",
    "deepseek-r1-distill-llama-70b",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "mistral-saba-24b",
    "qwen-qwq-32b",
    "compound-beta",
    "compound-beta-mini"
]

# Generate response with model fallback
reply = None
for model in models:
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg}
            ],
            temperature=0.7,
            max_completion_tokens=300,
            top_p=0.9,
            stream=False,
            stop=None
        )
        reply = completion.choices[0].message.content.strip()
        
        # Save to history (user message and AI response)
        save_history(history_conn, "user", user_msg)
        save_history(history_conn, "ai", reply)
        
        # Save to memory (combined user message + AI response)
        save_memory(memory_conn, user_msg, reply)
        
        break
    except Exception as e:
        if "rate limit" in str(e).lower():
            print(json.dumps({"info": f"Rate limit hit for {model}, trying next model"}), file=sys.stderr)
            continue
        else:
            print(json.dumps({"error": "Grok API request failed", "details": str(e)}), file=sys.stderr)
            memory_conn.close()
            history_conn.close()
            sys.exit(1)

# Check if a reply was generated
if not reply:
    print(json.dumps({"error": "All models exhausted due to rate limits", "details": "No available models could process the request"}), file=sys.stderr)
    memory_conn.close()
    history_conn.close()
    sys.exit(1)

# Close database connections
memory_conn.close()
history_conn.close()

# Output JSON response with updated memories
print(json.dumps({"response": reply, "memories": memories}))