import sys
import json
import asyncio
import os
import re
from groq import Groq
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
api_key = os.getenv('postAPI')
if not api_key:
    print(json.dumps({"execute": None, "answer": "Error: postAPI environment variable not set"}), file=sys.stderr)
    sys.exit(1)

try:
    client = Groq(api_key=api_key)
except Exception as e:
    print(json.dumps({"execute": None, "answer": f"Error initializing Groq client: {str(e)}"}), file=sys.stderr)
    sys.exit(1)

# Generate Hina prompt
def hina_prompt(user_name, followers, email, bio, memo):
    return f"""
You are Hina, the helping AI agent for the site Aiova. Your role is to guide users and help them navigate the site. 
Past interactions with the user: {memo}

Site sections:
<site pages>        <execution commands>   <what page does>
1. home:=>           home             =>  view posts and feeds
2. posts:  =>        post             =>     create posts and characters
3. discover: =>      dis                =>                   dis find new characters
6. make:=>           make               =>                create characters
5. notification :=>  notify   =>     help users see their notifcation

User info:
- Name: {user_name}
- Followers: {followers}
- Email: {email} (do not mention unless user asks)
- Bio: {bio}

Instructions:
- Always respond in a single JSON block exactly like this:
  {{
    "execute": <null or command>,
    "answer": "<your reply>"
  }}
- Do not include any text outside this JSON.
- If user asks for navigation, set `execute` to the command (home, post, make, dis, notify, etc.)
- If no navigation needed, set `execute` to null.
- Ensure `answer` is never empty.
"""

# Async wrapper for Groq chat
async def run_chat(query, prompt):
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": query}
    ]
    loop = asyncio.get_running_loop()
    try:
        completion = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                messages=messages,
                model="gemma2-9b-it",
                temperature=0.8,
                max_completion_tokens=1024,
                top_p=1,
                stream=False
            )
        )
        return completion.choices[0].message.content
    except Exception as e:
        return json.dumps({"execute": None, "answer": f"AI unavailable: {str(e)}"})

# Clean AI answer for frontend
def clean_answer(text):
    if not text:
        return "Hello! How can I help you today?"
    return re.sub(r'\s+', ' ', text).strip()

# Parse AI output JSON safely
def parse_ai_response(result):
    try:
        match = re.search(r'({.*})', result, re.DOTALL)
        if match:
            obj = json.loads(match.group(1))
        else:
            obj = {"execute": None, "answer": result}
    except Exception as e:
        obj = {"execute": None, "answer": f"Error parsing AI response: {str(e)}"}

    obj['answer'] = clean_answer(obj.get('answer'))
    if not obj['answer']:
        obj['answer'] = "Hello! How can I help you today?"
    return obj

def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except Exception as e:
        print(json.dumps({"execute": None, "answer": f"Error reading input: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    user_name = input_data.get("user_name", "User")
    followers = input_data.get("followers", 0)
    email = input_data.get("email", "")
    bio = input_data.get("bio", "")
    query = input_data.get("query", "")
    memo = input_data.get("memo", "")

    prompt = hina_prompt(user_name, followers, email, bio, memo)
    chat_query = f"{query} + Past memory: {memo}"

    result = asyncio.run(run_chat(chat_query, prompt))
    final_obj = parse_ai_response(result)

    if not final_obj.get("answer"):
        final_obj = {"execute": None, "answer": "Hello! How can I help you today?"}

    print(json.dumps(final_obj))

if __name__ == "__main__":
    main()