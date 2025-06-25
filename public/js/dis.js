// Function to navigate
function navigateTo(target) {
    const id = localStorage.getItem("id");
    if (id) {
        setTimeout(() => {
            window.location.href = target + encodeURIComponent(id);
        }, 1000);
    } else {
        console.error("No user ID found in localStorage");
        setTimeout(() => {
            window.location.href = "/login.html";
        }, 1000);
    }
}

// Function to fetch character data from /c/list
async function fetchCharacters() {
    try {
        const response = await fetch('/c/list');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching characters:', error);
        return [];
    }
}

// Function to display cards with limited tags
function displayCards(data) {
    const cardContainer = document.getElementById('cardContainer');
    cardContainer.innerHTML = '';

    if (!data || data.length === 0) {
        cardContainer.innerHTML = '<p style="text-align: center;">No characters available.</p>';
        return;
    }

    // Add Create New card
    const createCard = document.createElement('div');
    createCard.className = 'card create-card';
    createCard.innerHTML = '<h3>➕ Create New Character</h3>';
    createCard.addEventListener('click', () => {
        let id = localStorage.getItem('id')
        window.location.href = `/make/u/${encodeURIComponent(id)}`;
    });
    cardContainer.appendChild(createCard);

    data.forEach(character => {
        const card = document.createElement('div');
        card.className = 'card';
        const allTags = character.tags || [];
        const displayedTags = allTags.slice(0, 5); // Show only first 5 tags
        const tagTypes = ['trait', 'skill', 'personality', 'role']; // Cycle through these types
        const tagsHTML = displayedTags.map((tag, index) => {
            const typeClass = tagTypes[index % tagTypes.length];
            return `<span class="tag ${typeClass}">${tag.replace('@', '')}</span>`; // Remove @ and add type class
        }).join('');
        const relationshipText = character.relationships || '';
        card.innerHTML = `
            <div class="card-content">
                <div class="card-image">
                    <img src="${character.link || `https://api.dicebear.com/7.x/bottts/svg?seed=${character.name}`}" width="100" height="100" class="avatar">
                </div>
                <div class="card-details">
                    <h3 class="character-name">${character.name || 'Unnamed Character'}</h3>
                    <div class="tags-container">${tagsHTML}</div>
                    <p class="description">${relationshipText}</p>
                </div>
            </div>
        `;

        // Store all tags for filtering
        card.dataset.allTags = allTags.join(' ');

        card.addEventListener('click', () => {
            window.location.href = `/chat/c/${character.id}`;
        });
        cardContainer.appendChild(card);
    });
}

// Search and filter functionality
function filterCards(searchTerm) {
    const cards = document.querySelectorAll('.card:not(.create-card)');
    searchTerm = searchTerm.toLowerCase();
    cards.forEach(card => {
        const name = card.querySelector('.character-name').textContent.toLowerCase();
        const displayedTags = card.querySelector('.tags-container') ? card.querySelector('.tags-container').textContent.toLowerCase() : '';
        const allTags = card.dataset.allTags.toLowerCase();
        const relationship = card.querySelector('.description') ? card.querySelector('.description').textContent.toLowerCase() : '';
        if (name.includes(searchTerm) || displayedTags.includes(searchTerm) || allTags.includes(searchTerm) || relationship.includes(searchTerm)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    const characters = await fetchCharacters();
    displayCards(characters);

    // Theme Toggle with Night Mode Default at 06:24 PM IST
    const themeToggle = document.getElementById('themeToggle');
    const icon = themeToggle.querySelector('i');
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    const hour = istTime.getUTCHours();

    // Set night theme by default between 6 PM and 6 AM IST
    if (hour >= 18 || hour < 6) {
        document.body.classList.add('night-theme');
        icon.classList.add('fa-cloud-moon');
    } else if (!document.body.classList.contains('light-theme')) {
        document.body.classList.add('dark-theme');
        icon.classList.add('fa-moon');
    }

    themeToggle.addEventListener('click', () => {
        if (document.body.classList.contains('dark-theme')) {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('night-theme');
            icon.classList.replace('fa-moon', 'fa-cloud-moon');
        } else if (document.body.classList.contains('night-theme')) {
            document.body.classList.remove('night-theme');
            document.body.classList.add('light-theme');
            icon.classList.replace('fa-cloud-moon', 'fa-sun');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            icon.classList.replace('fa-sun', 'fa-moon');
        }
    });

    // Navbar Toggle
    const navbarToggle = document.querySelector('.navbar-toggle');
    const navbarNav = document.querySelector('.navbar-nav');
    navbarToggle.addEventListener('click', () => {
        navbarNav.classList.toggle('active');
    });

    // Modal Close
    document.querySelector('#modal .close').addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });

    // Navigation Links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            navigateTo(target);
            navbarNav.classList.remove('active'); // Close navbar after click
        });
    });

    // Search functionality
    document.getElementById('searchBox').addEventListener('input', (e) => {
        filterCards(e.target.value);
    });

    // Tag click filtering
    document.querySelectorAll('.tag').forEach(tag => {
        tag.addEventListener('click', () => {
            filterCards(tag.textContent);
        });
    });
});