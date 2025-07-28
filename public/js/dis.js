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

function displayCards(data) {
    const cardContainer = document.getElementById('cardContainer');
    cardContainer.innerHTML = '';

    if (!data || data.length === 0) {
        cardContainer.innerHTML = '<p style="text-align: center;">No characters available.</p>';
        return;
    }

    data.forEach(character => {
        const card = document.createElement('div');
        card.className = 'card';
        const allTags = (character.tags || '').split(' ').filter(tag => tag);
        const displayedTags = allTags.slice(0, 5);
        const tagTypes = ['trait', 'skill', 'personality', 'role'];
        const tagsHTML = displayedTags.map((tag, index) => {
            const typeClass = tagTypes[index % tagTypes.length];
            return `<span class="tag ${typeClass}" title="${tag.replace('@', '')}">${tag.replace('@', '')}</span>`;
        }).join('');
        const relationshipText = character.relationships || 'No relationship details available.';
        const creatorText = character.creator || 'Unknown';
        const creatorId = character.creatorId || 'unknown';
        card.innerHTML = `
            <div class="card-content">
                <div class="card-image">
                    <img src="${character.link || `https://api.dicebear.com/7.x/bottts/svg?seed=${character.name}`}" width="140" height="140" class="avatar">
                </div>
                <div class="card-details">
                    <h3 class="character-name">${character.name || 'Unnamed Character'}</h3>
                    <div class="tags-container">${tagsHTML}</div>
                    <p class="description">${relationshipText}</p>
                    <p class="creator-name" data-creator-id="${creatorId}"> by @${creatorText}</p>
                    <p class="view-count">Views: ${character.viewCount || 0}</p>
                </div>
            </div>
        `;

        card.dataset.allTags = allTags.join(' ');
        card.addEventListener('click', () => {
            window.location.href = `/chat/c/${character.id}`;
        });
        cardContainer.appendChild(card);
    });

    // Tag click listeners
    document.querySelectorAll('.tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            const searchBox = document.getElementById('searchBox');
            const tagText = tag.textContent.replace('@', '');
            searchBox.value = tagText;
            filterCards(tagText);
        });
    });

    // Creator name click listeners
    document.querySelectorAll('.creator-name').forEach(creator => {
        creator.addEventListener('click', (e) => {
            e.stopPropagation();
            const creatorId = creator.getAttribute('data-creator-id');
            const userId = localStorage.getItem('id');
            if (userId) {
                window.location.href = `/creator/works?creatorId=${encodeURIComponent(creatorId)}&uid=${encodeURIComponent(userId)}`;
            } else {
                console.error("No user ID found in localStorage");
                window.location.href = "/login.html";
            }
        });
    });
}

function filterCards(searchTerm) {
    const cards = document.querySelectorAll('.card');
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

document.addEventListener('DOMContentLoaded', async () => {
    const characters = await fetchCharacters();
    displayCards(characters);

    const themeToggle = document.getElementById('themeToggle');
    const icon = themeToggle.querySelector('i');
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const hour = istTime.getUTCHours();

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

    const navbarToggle = document.querySelector('.navbar-toggle');
    const navbarNav = document.querySelector('.navbar-nav');
    navbarToggle.addEventListener('click', () => {
        navbarNav.classList.toggle('active');
    });

    document.querySelector('#modal .close').addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            navigateTo(target);
            navbarNav.classList.remove('active');
        });
    });

    document.getElementById('searchBox').addEventListener('input', (e) => {
        filterCards(e.target.value);
    });
});