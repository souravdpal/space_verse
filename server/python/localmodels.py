from diffusers import DiffusionPipeline
import torch

# Load model (requires authentication for gated models like FLUX.1-dev)
pipe = DiffusionPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-dev",
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
)

# Move to GPU if available
pipe = pipe.to("cuda" if torch.cuda.is_available() else "cpu")

# Define prompt
prompt = "Astronaut in a jungle, cold color palette, muted colors, detailed, 8k"

# Generate image
image = pipe(prompt).images[0]

# Save output
image.save("output.png")
print("✅ Image saved as 'output.png'")
