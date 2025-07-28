const tagSuggestions = ['@hero', "@shy", '@cute', '@villain', '@sidekick', '@mentor', '@rival', '@friend', '@enemy'];
const tagInput = document.getElementById('charTags');
const suggestionsContainer = document.getElementById('tagSuggestions');
const imageUpload = document.getElementById('imageUpload');
const uploadButton = document.getElementById('uploadImage');
const imagePreview = document.getElementById('imagePreview');

// ID generator
function generateId() {
    return 'char_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

// Image preview setup
uploadButton.addEventListener('click', () => {
    imageUpload.click();
});

imageUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.innerHTML = `
                <div class="image-preview-container">
                    <img src="${e.target.result}" alt="Character Preview">
                    <button type="button" class="remove-image">✖</button>
                </div>
            `;
            document.querySelector('.remove-image').addEventListener('click', () => {
                imagePreview.innerHTML = '';
                imageUpload.value = '';
            });
        };
        reader.readAsDataURL(file);
    }
});

// Character form submit
document.getElementById('characterForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    const charId = generateId();

    // Fetch creator info
    let res = await fetch(`/cred?uid=${localStorage.getItem('id')}`);
    let data = await res.json();
    let serveruser = data.name;

    const formData = new FormData();
    formData.append('id', charId);
    formData.append('name', document.getElementById('charName').value);
    formData.append('firstLine', document.getElementById('charFirstLine').value);
    formData.append('background', document.getElementById('charBackground').value);
    formData.append('behavior', document.getElementById('charBehavior').value);
    formData.append('relationships', document.getElementById('charRelationships').value);
    formData.append('tags', document.getElementById('charTags').value);
    formData.append('creatorId', localStorage.getItem('id'));
    formData.append('creator', serveruser);

    if (imageUpload.files[0]) {
        formData.append('image', imageUpload.files[0], `${charId}.png`);
    }

    try {
        const uploadResponse = await fetch(`/char/uploads/${charId}`, {
            method: 'POST',
            body: formData
        });

        const responseData = await uploadResponse.json();
        if (uploadResponse.ok) {
            window.location.href = `/chat/c/${charId}`;
        } else {
            alert("Character creation failed: " + (responseData.error || "Unknown error"));
        }
    } catch (err) {
        console.error("Upload error:", err);
        alert("Server error: " + err.message);
    }
});

// Reset form
document.getElementById('resetForm').addEventListener('click', () => {
    document.getElementById('characterForm').reset();
    imagePreview.innerHTML = '';
    imageUpload.value = '';
});

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme');
    document.getElementById('themeToggle').textContent =
        document.body.classList.contains('dark-theme') ? '🌙' : '☀️';
});

// Fullscreen toggle
document.getElementById('fullscreenToggle').addEventListener('click', () => {
    const container = document.querySelector('.container');
    container.classList.toggle('fullscreen');
    document.getElementById('fullscreenToggle').textContent =
        container.classList.contains('fullscreen') ? '🖥️' : '🔲';
});

// Tag suggestion
tagInput.addEventListener('input', function () {
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

// Placeholder for image generation
document.getElementById('createImage').addEventListener('click', () => {
    alert('Coming Soon');
});

// 🎇 Particle canvas background
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
