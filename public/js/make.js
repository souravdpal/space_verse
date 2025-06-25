// Tag suggestions
const tagSuggestions = ['@hero', '@villain', '@sidekick', '@mentor', '@rival', '@friend', '@enemy'];
const tagInput = document.getElementById('charTags');
const suggestionsContainer = document.getElementById('tagSuggestions');

// Generate random ID (timestamp + random suffix to avoid collisions)
function generateId() {
    return 'char_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

// Form submission
document.getElementById('characterForm').addEventListener('submit', function(event) {
    event.preventDefault();

    // Get input values
    const character = {
        id: generateId(),
        name: document.getElementById('charName').value,
        firstLine: document.getElementById('charFirstLine').value,
        background: document.getElementById('charBackground').value,
        behavior: document.getElementById('charBehavior').value,
        relationships: document.getElementById('charRelationships').value,
        tags: document.getElementById('charTags').value
            .split(' ')
            .filter(tag => tag.startsWith('@') && tag.length > 1) || [], // Empty array if no valid tags
        link: document.getElementById('imageLink').value.trim() || undefined // Undefined if empty
    };

    // Save to server
    fetch('/c/char', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(character)
    })
    .then(res => res.json())
    .then(data => {
        if (data.msg) {
            window.location.href = `/chat/c/${character.id}`;
        } else {
            alert("Something went wrong");
        }
    })
    .catch(err => {
        console.error("Error:", err);
        alert("Server error");
    });
});

// Reset form
document.getElementById('resetForm').addEventListener('click', function() {
    document.getElementById('characterForm').reset();
});

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', function() {
    document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme');
    this.textContent = document.body.classList.contains('dark-theme') ? '🌙' : '☀️';
});

// Fullscreen toggle
document.getElementById('fullscreenToggle').addEventListener('click', function() {
    document.querySelector('.container').classList.toggle('fullscreen');
    this.textContent = document.querySelector('.container').classList.contains('fullscreen') ? '🖥️' : '🔲';
});

// Tag suggestions
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

// Create Image button
document.getElementById('createImage').addEventListener('click', function() {
    alert('Coming Soon');
});

// Particle background
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