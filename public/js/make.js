const tagSuggestions = ['@hero', '@villain', '@sidekick', '@mentor', '@rival', '@friend', '@enemy'];
const tagInput = document.getElementById('charTags');
const suggestionsContainer = document.getElementById('tagSuggestions');
const imageUpload = document.getElementById('imageUpload');
const uploadButton = document.getElementById('uploadImage');
const imagePreview = document.getElementById('imagePreview');

function generateId() {
    return 'char_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

// Trigger file input click when upload button is clicked
uploadButton.addEventListener('click', () => {
    imageUpload.click();
});

// Handle image upload and preview
imageUpload.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.innerHTML = `
                <div class="image-preview-container">
                    <img src="${e.target.result}" alt="Character Preview">
                    <button type="button" class="remove-image">✖</button>
                </div>
            `;
            // Add event listener for remove button
            document.querySelector('.remove-image').addEventListener('click', () => {
                imagePreview.innerHTML = '';
                imageUpload.value = ''; // Clear file input
            });
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('characterForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const charId = generateId();
    
    // Handle image upload if present
    let imageUrl = document.getElementById('imageLink').value.trim();
    if (imageUpload.files[0]) {
        const formData = new FormData();
        formData.append('image', imageUpload.files[0], `${charId}.png`);
        
        try {
            const uploadResponse = await fetch(`/char/uploads/${charId}`, {
                method: 'POST',
                body: formData
            });
            const responseData = await uploadResponse.json();
            if (uploadResponse.ok && responseData.msg === 'Image uploaded successfully') {
                imageUrl = responseData.path || `/charimage/uploads/${charId}.png`;
                console.log('Image uploaded, path:', imageUrl);
            } else {
                throw new Error(responseData.error || 'Image upload failed');
            }
        } catch (err) {
            console.error("Image upload error:", err);
            alert("Failed to upload image: " + err.message);
            return; // Stop form submission if image upload fails
        }
    }

    const character = {
        id: charId,
        name: document.getElementById('charName').value,
        firstLine: document.getElementById('charFirstLine').value,
        background: document.getElementById('charBackground').value,
        behavior: document.getElementById('charBehavior').value,
        relationships: document.getElementById('charRelationships').value,
        tags: document.getElementById('charTags').value
            .split(' ')
            .filter(tag => tag.startsWith('@') && tag.length > 1) || [],
        image: imageUrl || undefined,
        creatorId : localStorage.getItem('id'),
        creator : localStorage.getItem('username')

    };

    try {
        const charResponse = await fetch('/c/char', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(character)
        });
        const charData = await charResponse.json();
        if (charResponse.ok && charData.msg) {
            window.location.href = `/chat/c/${charId}`;
        } else {
            alert("Something went wrong: " + (charData.error || "Unknown error"));
        }
    } catch (err) {
        console.error("Character creation error:", err);
        alert("Server error: " + err.message);
    }
});

document.getElementById('resetForm').addEventListener('click', function() {
    document.getElementById('characterForm').reset();
    imagePreview.innerHTML = '';
    imageUpload.value = '';
});

document.getElementById('themeToggle').addEventListener('click', function() {
    document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme');
    this.textContent = document.body.classList.contains('dark-theme') ? '🌙' : '☀️';
});

document.getElementById('fullscreenToggle').addEventListener('click', function() {
    document.querySelector('.container').classList.toggle('fullscreen');
    this.textContent = document.querySelector('.container').classList.contains('fullscreen') ? '🖥️' : '🔲';
});

tagInput.addEventListener('input', function() {
    const value = this.value.toLowerCase();
    if (value.includes('@')) {
        const lastWord = value.split(' ').pop();
        const suggestions = tagSuggestions.filter(tag =>
            tag.toLowerCase().startsWith(lastWord)
        );
        suggestionsContainer.innerHTML = suggestions
            .map(tag => `<div onclick="addTag('${tag}')">${tag}</div>`)
            .join('');
        suggestionsContainer.style.display = suggestions.length ? 'block' : 'none';
    } else {
        suggestionsContainer.style.display = 'none';
    }
});

function addTag(tag) {
    const current = tagInput.value.split(' ').slice(0, -1).join(' ');
    tagInput.value = current ? `${current} ${tag} ` : `${tag} `;
    suggestionsContainer.style.display = 'none';
    tagInput.focus();
}

document.getElementById('createImage').addEventListener('click', function() {
    alert('Coming Soon');
});

const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const particles = [];
const particleCount = 120;

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2.5 + 1;
        this.speedX = Math.random() * 0.4 - 0.2;
        this.speedY = Math.random() * 0.4 - 0.2;
        this.opacity = Math.random() * 0.3 + 0.1;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
    }

    draw() {
        ctx.fillStyle = document.body.classList.contains('dark-theme')
            ? `rgba(200, 200, 255, ${this.opacity})`
            : `rgba(50, 50, 100, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    requestAnimationFrame(animateParticles);
}

initParticles();
animateParticles();

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});