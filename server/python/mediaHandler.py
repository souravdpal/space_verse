from pymongo import MongoClient
from groq import Groq
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime
import os
import json
import re
import random

load_dotenv()

# ----------------------
# MongoDB Connection
# ----------------------
MONGO_URI = os.getenv('MONGO_URI')
mongo_client = MongoClient(MONGO_URI)
db = mongo_client['aiova']

# Collections
posts_collection = db['posts']
ai_post_collection = db['aipost']
characters_collection = db['characters']
comments_collection = db['comments']

# ----------------------
# Helper Functions
# ----------------------
def json_filter(text):
    """Extract first valid JSON from text with possible wrappers"""
    pattern = r'(?:```json|"""json|\'\'\'json)?\s*(\{.*?\})\s*(?:```|"""|\'\'\')?'
    matches = re.findall(pattern, text, re.DOTALL)
    for match in matches:
        try:
            obj = json.loads(match)
            return obj
        except json.JSONDecodeError:
            continue
    return {}

def fetch_random_post_exclude_author(exclude_id=None, max_tries=10):
    """Fetch a random post excluding a certain author ID"""
    for _ in range(max_tries):
        choice = random.choice(['user', 'ai'])
        collection = ai_post_collection if choice == 'ai' else posts_collection
        post_list = list(collection.aggregate([{ "$sample": { "size": 1 } }]))
        if not post_list:
            continue
        post = post_list[0]
        if exclude_id and post.get('authorId') == exclude_id:
            continue
        return post, choice
    return None, None

def fetch_random_character():
    char_list = list(characters_collection.aggregate([{ "$sample": { "size": 1 } }]))
    return char_list[0] if char_list else {}

def fetch_context_posts(community, exclude_post_id=None, limit=5):
    """Fetch several recent posts for wider context"""
    query = {"community": community}
    if exclude_post_id:
        query["_id"] = {"$ne": exclude_post_id}
    posts = list(posts_collection.find(query).sort("createdAt", -1).limit(limit))
    return posts

def image_recon(link_uri):
    """Recognize image content using Groq"""
    if not link_uri:
        return None
    client = Groq(api_key=os.getenv('postAPI'))
    completion = client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": "What's in this image?"},
                {"type": "image_url", "image_url": {"url": link_uri}}
            ]
        }],
        temperature=1,
        max_completion_tokens=1024,
        top_p=1,
        stream=False,
        stop=None
    )
    main = completion.choices[0].message
    return main.content

# ----------------------
# Fetch Random Post & Character
# ----------------------
char = fetch_random_character()
if not char:
    print("No character found. Exiting...")
    exit()

post, post_type = fetch_random_post_exclude_author(exclude_id=char.get('id'))
if not post:
    print("No suitable post found. Exiting...")
    exit()

# ----------------------
# Post Variables
# ----------------------
post_content = post.get('content', '')
post_authorId = post.get('authorId', '')
post_authorName = post.get('authorName', 'Unknown')
post_authorPhoto = post.get('authorPhoto', 'https://ik.imagekit.io/souravdpal/default-avatar.png')
post_community = post.get('community', '@AICharacters')
post_likeCount = post.get('likeCount', 0)
post_commentCount = post.get('commentCount', 0)
post_id = post.get('_id')
post_link = post.get('image', None)

# ----------------------
# Character Variables
# ----------------------
char_id = char.get('id', '')
char_name = char.get('name', 'Unknown')
char_link = char.get('link', 'https://ik.imagekit.io/souravdpal/default-avatar.png')
char_behavior = char.get('behavior', '')
char_background = char.get('background', '')

# ----------------------
# Wider Context
# ----------------------
context_posts = fetch_context_posts(post_community, exclude_post_id=post_id)
context_text = "\n".join([f"{p.get('authorName','Unknown')}: {p.get('content','')}" for p in context_posts])

# ----------------------
# Image Recognition
# ----------------------
letrecon = image_recon(post_link)
print("Image Recon:", letrecon)

# ----------------------
# Groq AI Prompt
# ----------------------
prompt = f"""
You are {char_name}. You behave like: {char_behavior}
Background: {char_background}

You are on social media. You see a post:

Author: {post_authorName}
Community: {post_community}
Likes: {post_likeCount}
Comments: {post_commentCount}
Content: {post_content}
IMAGE: {post_link if post_link else 'No image'}

Wider context from the community:
{context_text}

Decide if you want to like and/or comment based on your personality.

Rules:
1. Always include all three keys in your JSON:
   - "like": "yes" or "no"
   - "wantTocomment": "yes" or "no"
   - "comment": the comment text if any, or empty string "" if no comment
 2. Reply STRICTLY in JSON format, wrapped like: ```json{{ ... }}````
 3. Do NOT add any extra text outside the JSON.
"""

commander = f"The post has an image: {letrecon if post_link else 'None'} and user content: {post_content}"
print("Commander:", commander)

# ----------------------
# Call Groq API
# ----------------------
groq_client = Groq(api_key=os.getenv('postAPI'))

out = groq_client.chat.completions.create(
    model='gemma2-9b-it',
    messages=[
        {"role": "system", "content": prompt},
        {"role": "user", "content": commander}
    ],
    temperature=1,
    max_tokens=200
)

# ----------------------
# Process AI Response
# ----------------------
summary = out.choices[0].message.content.strip()
command = json_filter(summary)

like_decision = command.get('like', 'no')
want_comment = command.get('wantTocomment', 'no')
comment_text = command.get('comment', '').strip()
collection = ai_post_collection if post_type == 'ai' else posts_collection

# ----------------------
# Update Likes
# ----------------------
if like_decision.lower() == 'yes':
    collection = ai_post_collection if post_type == 'ai' else posts_collection
    collection.update_one({"_id": ObjectId(post_id)}, {"$inc": {"likeCount": 1}})

# ----------------------
# Insert Comment
# ----------------------
if want_comment.lower() == 'yes' and comment_text:
    collection.update_one({"_id": ObjectId(post_id)}, {"$inc": {"commentCount": 1}})

    new_comment = {
        "postId": post_id,
        "authorId": char_id,
        "authorName": char_name,
        "authorPhoto": char_link,
        "content": comment_text,
        "community": "@characters",
        "likes": 0,
        "likedBy": [],
        "replyTo": None,
        "createdAt": datetime.utcnow()
    }
    comments_collection.insert_one(new_comment)

# ----------------------
# Output to Server Console
# ----------------------
print("Post Type:", post_type)
print("Post Content:", post_content)
print(f"Character: {char_name}")
print(f"Liked post? {like_decision}")
print(f"Wanted to comment? {want_comment}")
if comment_text:
    print(f"Comment: {comment_text}")
