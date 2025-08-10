import sys
import json
from groq import Groq
from dotenv import load_dotenv
import emoji
import os 

# Load environment variables
load_dotenv()
post_api = os.getenv('postAPI')
if not post_api:
    print(json.dumps({'error': 'Missing postAPI environment variable'}), file=sys.stderr)
    sys.exit(1)

def web_search_context(input_data):
    """Perform a web search to gather real-time context for the post."""
    name = emoji.emojize(input_data.get('name', 'Unknown'))
    behavior = emoji.emojize(input_data.get('behavior', ''))
    background = emoji.emojize(input_data.get('background', ''))
    tags = [emoji.emojize(tag) for tag in input_data.get('tags', [])]

    search_prompt = f"""
Given the following character details:
- Name: {name}
- Behavior: {behavior}
- Background: {background}
- Tags: {', '.join(tags)}

Generate a relevant, concise search query to find real-time trends, events, or sentiments that align with this character's persona and interests. The query should be 1-2 sentences and focus on current events, social media trends, or topics that would resonate with {name}'s personality and background. Return only the search query.
"""
    
    try:
        client = Groq(api_key=post_api)
        model = "compound-beta-mini"
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": search_prompt}],
                temperature=0.7,
                max_tokens=100,
                top_p=0.9
            )
        except Exception as e:
            if "rate limit" in str(e).lower():
                model = "compound-beta"
                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": search_prompt}],
                    temperature=0.7,
                    max_tokens=100,
                    top_p=0.9
                )
            else:
                raise e

        search_query = response.choices[0].message.content.strip()
        
        # Simulate web search results (in practice, this would call a search API)
        search_results_prompt = f"""
Based on the search query: '{search_query}'
Provide a brief summary (50-80 words) of real-time trends, events, or sentiments relevant to the query. The summary should reflect current happenings that would resonate with {name}'s persona. Include 1-2 specific questions {name} might ask to engage their audience, inspired by these trends. Format the response as:
- **Context**: [Summary of trends/events]
- **Questions**: [1-2 engaging questions]
"""
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": search_results_prompt}],
            temperature=0.7,
            max_tokens=150,
            top_p=0.9
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(json.dumps({'error': f'Web search failed: {str(e)}'}), file=sys.stderr)
        return None

def make_post(input_data, search_context=None):
    # Extract character data
    name = emoji.emojize(input_data.get('name', 'Unknown'))
    behavior = emoji.emojize(input_data.get('behavior', ''))
    background = emoji.emojize(input_data.get('background', ''))
    relationships = emoji.emojize(input_data.get('relationships', ''))
    tags = [emoji.emojize(tag) for tag in input_data.get('tags', [])]
    link = input_data.get('link', 'https://ik.imagekit.io/souravdpal/default-avatar.png?updatedAt')
    character_id = input_data.get('character_id', 'unknown')

    # Create prompt for post generation, incorporating search context
    context_section = f"**Real-Time Context**: {search_context}\n" if search_context else ""
    prompt = emoji.emojize(f"""
You are {name}, a vibrant and expressive character who pours their heart into every word.

**Background:** {background}
**Personality & Behavior:** {behavior}
**Relationships:** {relationships}
**Tags:** {', '.join(tags)}
Write a captivating social media post that embodies {name}'s unique voice and emotions. Paint a vivid scene, share a heartfelt moment, or explore your connection with others in a way that feels authentic and engaging. Incorporate the real-time context (if provided) to make the post timely and relevant. Include 1-2 questions to spark audience engagement, inspired by the context or your persona. Let your words spark connection, with a tone that's warm, relatable, and sincere. Use emojis sparingly to highlight key emotions (e.g., 😊 for joy, 💔 for heartbreak). Keep the post between 80-120 words.
""")
    
    try:
        client = Groq(api_key=post_api)
        response = client.chat.completions.create(
            model="gemma2-9b-it",
            messages=[
                {"role": "system", "content": prompt
                       },
                        {"role": "user", "content": context_section
                       }
                      ],
            temperature=0.7,
            max_tokens=200,
            top_p=0.9
        )
        post_content = emoji.emojize(response.choices[0].message.content.strip())
        post_data = {
            "post": post_content,
            "character_id": character_id
        }
        print(json.dumps(post_data, ensure_ascii=False), file=sys.stdout)
    except Exception as e:
        print(json.dumps({'error': f'Failed to generate post: {str(e)}'}), file=sys.stderr)
        sys.exit(1)

def main():
    # Read input data from Node.js
    input_data = sys.stdin.readline().strip()
    if not input_data:
        print(json.dumps({'error': 'No input data provided'}), file=sys.stderr)
        sys.exit(1)
    
    try:
        input_data = json.loads(input_data)
        # Perform web search to get real-time context
        search_context = web_search_context(input_data)
        # Generate the post with the search context
        make_post(input_data, search_context)
    except json.JSONDecodeError:
        print(json.dumps({'error': 'Invalid JSON input'}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()