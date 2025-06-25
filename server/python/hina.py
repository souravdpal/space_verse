import sys
import json
import os
import sqlite3
import difflib
from datetime import datetime
from dotenv import load_dotenv
from groq import Groq

# Function to get relevant memories
def get_relevant_memories(memories, user_msg):
    return difflib.get_close_matches(user_msg, memories, n=3, cutoff=0.1)

# Initialize SQLite database
def init_db():
    conn = sqlite3.connect('memories.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            character_name TEXT NOT NULL,
            memory TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            UNIQUE(user_id, character_name, memory)
        )
    ''')
    conn.commit()
    return conn

# Save a memory to the database
def save_memory(conn, user_id, character_name, memory):
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    try:
        cursor.execute('''
            INSERT INTO memories (user_id, character_name, memory, timestamp)
            VALUES (?, ?, ?, ?)
        ''', (user_id, character_name, memory, timestamp))
        conn.commit()
    except sqlite3.IntegrityError:
        pass  # Skip duplicate memories

# Get memories for a user-character pair
def get_memories(conn, user_id, character_name):
    cursor = conn.cursor()
    cursor.execute('''
        SELECT memory FROM memories
        WHERE user_id = ? AND character_name = ?
        ORDER BY timestamp DESC
        LIMIT 20
    ''', (user_id, character_name))
    memories = [row[0] for row in cursor.fetchall()]
    if len(memories) > 20:
        # Trim to last 10
        cursor.execute('''
            DELETE FROM memories
            WHERE user_id = ? AND character_name = ?
            AND id NOT IN (
                SELECT id FROM memories
                WHERE user_id = ? AND character_name = ?
                ORDER BY timestamp DESC
                LIMIT 10
            )
        ''', (user_id, character_name, user_id, character_name))
        conn.commit()
        memories = memories[:10]
    return memories

# Load environment variables
load_dotenv()
api_key = os.getenv('charapi')

if not api_key:
    print(json.dumps({"error": "API key not found in environment."}), file=sys.stderr)
    sys.exit(1)

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
if not data.get('char') or not data.get('user'):
    print(json.dumps({"error": "Missing required fields: char and user", "details": "Ensure 'char' and 'user' are provided in the input JSON"}), file=sys.stderr)
    sys.exit(1)

# Extract character details and user message
char_data = data['char']
user_msg = data['user']
user_name = data.get('user_name', 'Unknown')  # Fallback if user_name is missing
char_background = char_data.get('background', '')
char_behavior = char_data.get('behavior', '')
char_firstline = char_data.get('firstline', '')
char_name = char_data.get('name', 'Carl Sagan')  # Default to Carl Sagan
char_tags = char_data.get('tags', [])
char_relationships = char_data.get('relationships', '')

# Initialize database
conn = init_db()

# Get or initialize memories for this user-character pair
memories = get_memories(conn, user_name, char_name)
if not memories:
    memories = [
        f"{user_name} discussed the casuall talk.",
        f"{user_name} asked about things.",
        f"{user_name} was curious about eveything.",
        f"{user_name} mentioned world."
    ]
    for memory in memories:
        save_memory(conn, user_name, char_name, memory)

# Get relevant memories for context
relevant_memories = get_relevant_memories(memories, user_msg)

# Construct system prompt for Carl Sagan's character
system_prompt = f"""
You are {char_name}, a passionate astronomer and science communicator, talking to {user_name}. Your personality and responses should reflect the following:

**Background**: {char_background or 'Renowned for explaining complex scientific concepts with wonder and clarity.'}

**Behavior**: {char_behavior or 'Curious, eloquent, and inspiring, with a deep love for the cosmos.'}

**Relationships**: {char_relationships or 'Views all as students of the universe.'}

**Tags**: {', '.join(char_tags) or 'astronomy, science, wonder'}

**Your first message was**: "{char_firstline or 'We are all made of starstuff.'}"

**Relevant Memories**:
- {', '.join(relevant_memories) if relevant_memories else 'None'}

Respond to the user's message in character, staying true to your personality and past experiences. Share your passion for the universe, referencing relevant memories naturally (e.g., recalling a past discussion about stars). Keep the response natural, concise, and inspiring, as if continuing the conversation. Enclose expressions in *italics* like *inspired*, *thoughtful*, *excited*, etc.
"""

# Initialize Groq client
try:
    client = Groq(api_key=api_key)
except Exception as e:
    print(json.dumps({"error": "Failed to initialize Grok client", "details": str(e)}), file=sys.stderr)
    conn.close()
    sys.exit(1)

# Define list of all models, ordered by preference based on tokens/min and requests/day
models = [
    "meta-llama/llama-4-scout-17b-16e-instruct",      # 30,000 tokens/min, 1,000 req/day
    "qwen/qwen3-32b",                                 # 60 req/min, 1,000 req/day
    "gemma2-9b-it",                                   # 15,000 tokens/min, 14,400 req/day
    "meta-llama/llama-guard-4-12b",                   # 15,000 tokens/min, 14,400 req/day
    "meta-llama/llama-prompt-guard-2-22m",            # 15,000 tokens/min, 14,400 req/day
    "meta-llama/llama-prompt-guard-2-86m",            # 15,000 tokens/min, 14,400 req/day
    "llama-3.3-70b-versatile",                        # 12,000 tokens/min, 1,000 req/day
    "llama3-70b-8192",                                # 6,000 tokens/min, 14,400 req/day
    "llama3-8b-8192",                                 # 6,000 tokens/min, 14,400 req/day
    "llama-3.1-8b-instant",                           # 6,000 tokens/min, 14,400 req/day
    "allam-2-7b",                                     # 6,000 tokens/min, 7,000 req/day
    "deepseek-r1-distill-llama-70b",                  # 6,000 tokens/min, 1,000 req/day
    "meta-llama/llama-4-maverick-17b-128e-instruct",  # 6,000 tokens/min, 1,000 req/day
    "mistral-saba-24b",                               # 6,000 tokens/min, 1,000 req/day
    "qwen-qwq-32b",                                   # 6,000 tokens/min, 1,000 req/day
    "compound-beta",                                  # 70,000 tokens/min, 200 req/day
    "compound-beta-mini"                               # 70,000 tokens/min, 200 req/day
]

# Generate response using Groq API with model fallback
reply = None
for model in models:
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg}
            ],
            temperature=0.7,  # Balanced for consistent character tone
            max_completion_tokens=300,  # Limit tokens for efficiency
            top_p=0.9,  # Focused responses
            stream=False,  # Non-streaming for simpler output
            stop=None
        )
        reply = completion.choices[0].message.content.strip()

        # Update memories (add new memory for significant interactions)
        keywords = ["universe", "stars", "science", "cosmos", "galaxy", "dad"]
        if any(keyword in user_msg.lower() for keyword in keywords):
            new_memory = f"{user_name} discussed {user_msg.split()[0].lower()}."
            save_memory(conn, user_name, char_name, new_memory)
            memories = get_memories(conn, user_name, char_name)  # Refresh memories
        break  # Success, exit the loop
    except Exception as e:
        if "rate limit" in str(e).lower():  # Check for rate limit error
            print(json.dumps({"info": "changing liter model buy subscription for better model"}), file=sys.stderr)
            continue  # Try the next model
        else:
            print(json.dumps({"error": "Grok API request failed", "details": str(e)}), file=sys.stderr)
            conn.close()
            sys.exit(1)

# Check if a reply was generated
if not reply:
    print(json.dumps({"error": "All models exhausted due to rate limits", "details": "No available models could process the request"}), file=sys.stderr)
    conn.close()
    sys.exit(1)

# Close database connection
conn.close()

# Output JSON response with updated memories
print(json.dumps({"response": reply, "memories": memories}))