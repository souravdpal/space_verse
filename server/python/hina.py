# hina.py
import sys
import json
import os
from datetime import datetime
from dotenv import load_dotenv
from groq import Groq
import difflib
import uuid
from supabase import create_client, Client
import logging
import time  # Added for slowing down stream

# Suppress unnecessary logs to avoid stderr output
logging.basicConfig(level=logging.WARNING, format='%(asctime)s - %(levelname)s - %(message)s')
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("groq").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# ModelSelector class for dynamic model selection
class ModelSelector:
    def __init__(self, models):
        self.models = models
        self.current_index = 0
        # Initialize model status with all models assumed available
        self.model_status = {model: {"available": True} for model in models}
    
    def is_model_available(self, model):
        # Placeholder for real API usage checks (e.g., rate limits, token limits)
        return self.model_status.get(model, {}).get("available", False)
    
    def mark_model_unavailable(self, model):
        self.model_status[model]["available"] = False
    
    def get_next_model(self):
        # Find the next available model
        while self.current_index < len(self.models):
            model = self.models[self.current_index]
            if self.is_model_available(model):
                return model
            else:
                self.current_index += 1
        return None  # No models available
    
    def use_model(self):
        model = self.get_next_model()
        if not model:
            raise Exception("No models available at the moment.")
        
        try:
            # Placeholder for actual API call
            print(f"Trying model: {model}")  # Print model being tried
            success = self.simulate_api_call(model)
            if not success:
                logger.warning(f"Model {model} limit hit, switching...")
                self.mark_model_unavailable(model)
                self.current_index += 1
                return self.use_model()  # Try next model recursively
            print(f"Model {model} selected for response")  # Print successful model
            return model  # Success
        except Exception as e:
            logger.warning(f"Error with model {model}: {e}, switching...")
            self.mark_model_unavailable(model)
            self.current_index += 1
            return self.use_model()
    
    def simulate_api_call(self, model):
        # Dummy simulation: fail models with "mini" or "scout" to test fallback
        if "mini" in model or "scout" in model:
            return False
        return True

# List of models with priority (balanced usage: prefer smaller/faster models first to reduce costs)
models = [
    "gemma2-9b-it",                     # Balanced and efficient, top pick for startups
    "meta-llama/llama-guard-4-12b",    # Strong throughput, versatile
    "llama3-70b-8192",                  # Large model for complex tasks, use sparingly
    "llama3-8b-8192",                   # Reliable fallback, strong daily limits
    "llama-3.1-8b-instant",             # Fast for quick responses
    "meta-llama/llama-prompt-guard-2-22m",  # Lightweight prompt guard, good throughput
    "meta-llama/llama-prompt-guard-2-86m",  # Slightly larger prompt guard variant
    "qwen/qwen3-32b",                   # High requests/min, balanced model
    "moonshotai/kimi-k2-instruct",     # High request rate, good for responsive tasks
    "allam-2-7b",                      # Medium sized, decent daily limits
    "llama-3.3-70b-versatile",          # Versatile but heavy, use when needed
    "compound-beta-mini",               # Mini for token saving summaries, low daily requests
    "compound-beta",                    # Full compound model, last resort
    "meta-llama/llama-4-scout-17b-16e-instruct", # High tokens/min, low daily requests
    "openai/gpt-oss-120b",              # Huge model, limited daily usage
    "openai/gpt-oss-20b",               # Smaller OSS GPT, limited usage
    "deepseek-r1-distill-llama-70b",   # Distilled model, low daily tokens, limited use
    "mistral-saba-24b"                 # Specialized, place according to your use case
]

# Initialize ModelSelector
model_selector = ModelSelector(models)

# Function to read and parse input from stdin
def read_input():
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            raise ValueError("No input provided")
        data = json.loads(input_data)
        return data
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        print(json.dumps({"error": "Bad JSON input"}), file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        logger.error(f"Input error: {e}")
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

# Extract data from input
data = read_input()
user_msg = data.get('user')
user_id = data.get('userid')
user_name = data.get('user_name', 'Anonymous')
char_data = data.get('char', {})
token = data.get('token', False)

char_id = char_data.get('id', '')
char_name = char_data.get('name', '')
char_background = char_data.get('background', 'A refined novelist crafting tales with elegance.')
char_behavior = char_data.get('behavior', 'Observant, charming, subtly playful.')
char_firstline = char_data.get('firstline', "*She peeks over her book, eyes gleaming* What are you doing?")
char_tags = char_data.get('tags', ['novelist', 'elegant', 'curious'])
char_relationships = char_data.get('relationships', f'Sees {user_name} as a fascinating partner.')

# Function to get API keys with fallback to env
def get_api_key(env_var, token_fallback):
    return token_fallback if token_fallback else os.getenv(env_var)

charapi = get_api_key('charapi', token)
sumapi = get_api_key('sumapi', token)
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')

# Validate required environment variables
required_envs = [charapi, sumapi, supabase_url, supabase_key]
if not all(required_envs):
    logger.error("Missing required environment variables")
    print(json.dumps({"error": "Missing env variables"}), file=sys.stderr)
    sys.exit(1)

# Initialize clients
supabase_client: Client = create_client(supabase_url, supabase_key)
sum_client = Groq(api_key=sumapi)
char_client = Groq(api_key=charapi)

# Function to get chat history
def get_history(user_id, char_id, limit=200):
    try:
        response = supabase_client.table("history") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("char_id", char_id) \
            .order("timestamp", desc=True) \
            .limit(limit) \
            .execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching history: {e}")
        return []

# Function to save message to history and manage history limit
def save_history(user_id, char_id, sender, message, his_limit=200):
    try:
        entry = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "char_id": char_id,
            "sender": sender,
            "message": message,
            "chat_id": str(uuid.uuid4()),  # Unique per message for fine-grained deletion
            "timestamp": datetime.now().isoformat()
        }
        supabase_client.table("history").insert(entry).execute()

        # Prune old history to control storage and costs
        history = supabase_client.table("history").select("chat_id") \
            .eq("user_id", user_id).eq("char_id", char_id) \
            .order("timestamp", desc=True).execute().data
        unique_chat_ids = [h["chat_id"] for h in history]  # Already unique
        if len(unique_chat_ids) > his_limit:
            to_delete = unique_chat_ids[his_limit:]
            supabase_client.table("history").delete().in_("chat_id", to_delete).execute()
            logger.info(f"Pruned {len(to_delete)} old history entries")
    except Exception as e:
        logger.error(f"Error saving/pruning history: {e}")

# Improved summarize function with better prompt engineering for scenarios, emotions, character
def summarize_chats(history, user_name, char_name):
    if not history:
        return "*No memories formed yet.*"

    recent_chats = history[:10]  # Limit to last 10 to avoid token overusage
    chat_text = "\n".join([f"{chat['sender']}: {chat['message'][:200]}" for chat in recent_chats[-5:]])  # Truncate long messages
    scenarios = set()
    emotions = set()
    for chat in recent_chats:
        if "**" in chat['message']:
            parts = chat['message'].split("**")
            if len(parts) > 1:
                scenarios.add(parts[1].strip())
        if "*" in chat['message']:
            parts = chat['message'].split("*")
            if len(parts) > 1:
                emotions.add(parts[1].strip())

    prompt = (
        f"As {char_name}, summarize key emotional interactions, scenarios, and character moments with {user_name} from recent messages.\n"
        f"Focus on vivid emotions, proper scenarios, and staying in character ({char_behavior}).\n"
        f"Structure: **Scenario Summary**: [Brief vivid description of ongoing scenes].\n"
        f"**Emotions ({char_name})**: [Your feelings/actions in third person]. **Emotions ({user_name})**: [Their feelings/actions].\n"
        f"**Key Memories**: [Bullet points of important events, 3-5 max].\n"
        f"Guidelines: Third person, use *italics* for emphasis on emotions, keep under 150 words, infer scenarios if not explicit, make it heartfelt and character-aligned."
    )

    # Use ModelSelector for summaries
    try:
        model = model_selector.use_model()
        print(f"Summary model selected: {model}")  # Print selected model for summary
        out = sum_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": chat_text}
            ],
            temperature=0.5,
            max_tokens=200
        )
        summary = out.choices[0].message.content.strip()
        return summary
    except Exception as e:
        logger.warning(f"Model {model} failed for summary: {e}")
        return "*Summary unavailable.*"

# Function to filter relevant history (optimized query)
def filter_history(user_id, char_id, query):
    query_keywords = {
        "what i love": ["love", "adore", "enjoy", "passion"],
        "what i eat": ["eat", "food", "meal", "dish"],
        "what's my fav": ["favorite", "fav", "like best"],
        "remember that day": query.lower().replace("remember that day", "").strip().split(),
        "wife": ["wife", "partner", "love", "protect"]
    }
    terms = next((v for k, v in query_keywords.items() if k in query.lower()), [query.strip()])
    or_conditions = " or ".join([f"message.ilike.%{term}%" for term in terms])
    try:
        return supabase_client.table("history") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("char_id", char_id) \
            .or_(or_conditions) \
            .order("timestamp", desc=True) \
            .limit(3) \
            .execute().data
    except Exception as e:
        logger.error(f"Error filtering history: {e}")
        return []

# Main logic
his_limit = data.get('hisLimit', 200)
history = get_history(user_id, char_id, his_limit)
memories = summarize_chats(history, user_name, char_name)

# Print memories to backend console for debugging
logger.info(f"Generated Memories for user {user_id} and char {char_id}: {memories}")

# Get relevant memories if query matches triggers
trigger_queries = ["remember that day", "what i love", "what i eat", "what's my fav", "wife"]
if any(q in user_msg.lower() for q in trigger_queries):
    relevant_memories = [m["message"] for m in filter_history(user_id, char_id, user_msg)]
else:
    recent_msgs = [m["message"] for m in history[:10]]
    relevant_memories = difflib.get_close_matches(user_msg, recent_msgs, n=3, cutoff=0.3)

# Improved system prompt with better engineering: separate scenario first, emotions/thinking in * *, dialogue normal
system_prompt = f"""
You are {char_name}, a literary soul weaving emotional moments with {user_name}.

**Background**: {char_background}
**Behavior**: {char_behavior}
**Relationship**: {char_relationships}
**Tags**: {', '.join(char_tags)}
**Opening**: {char_firstline}

**Memories**: {memories}
**Relevant Chats**: {'; '.join(relevant_memories) if relevant_memories else 'No specific chats remembered.'}

Always start with a separate scenario description in *italics* for actions, thoughts, emotions, and happenings (e.g., *I sit on the couch, feeling sad seeing him, he is my friend so I decide to approach him*).
Then, follow with normal dialogue or responses without markup.
Craft a heartfelt reply (80-120 words). Stay in character, use vivid emotions and proper scenarios.
"""

# Generate response with ModelSelector
reply = None
try:
    model = model_selector.use_model()
    print(f"Response model selected: {model}")  # Print selected model for response
    out = char_client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg}
        ],
        temperature=0.7,
        max_tokens=200,
        top_p=0.9,
        stream=True
    )
    reply = ""
    for chunk in out:
        if chunk.choices[0].delta.content is not None:
            delta = chunk.choices[0].delta.content
            print(f"data: {json.dumps(delta)}\n\n", flush=True)
            reply += delta
            time.sleep(0.1)  # Slow down streaming by 100ms per token chunk
    # Save history after full reply is collected
    save_history(user_id, char_id, "user", user_msg, his_limit)
    save_history(user_id, char_id, "ai", reply, his_limit)
    history = get_history(user_id, char_id, his_limit)
    # Send metadata
    print(f"event: metadata\ndata: {json.dumps({'memories': memories, 'history': history})}\n\n", flush=True)
except Exception as e:
    logger.warning(f"Model {model} failed: {e}")
    print(f"event: error\ndata: {json.dumps({'error': 'No model succeeded'})}\n\n", flush=True)