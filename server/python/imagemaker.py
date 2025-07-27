import requests

API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2"
headers = {"Authorization": "Bearer token"}

payload = {"inputs": "A futuristic city on Mars"}
response = requests.post(API_URL, headers=headers, json=payload)

with open("output.png", "wb") as f:
    f.write(response.content)
