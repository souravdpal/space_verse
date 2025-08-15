document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements
    const elements = {
        cardContainer: document.getElementById('cardContainer'),
        searchBox: document.getElementById('searchBox'),
        themeToggle: document.getElementById('themeToggle'),
        navbarToggle: document.querySelector('.navbar-toggle'),
        navbarNav: document.querySelector('.navbar-nav'),
        modalClose: document.querySelector('#modal .close')
    };

    // Check for missing elements
    const missingElements = Object.entries(elements)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
    if (missingElements.length > 0) {
        console.warn('Missing DOM elements:', missingElements.join(', '));
        showToast(`Warning: Some elements missing (${missingElements.join(', ')}). Some features may not work.`, 'warning');
    }

    // Critical elements check
    if (!elements.cardContainer) {
        console.error('Critical element cardContainer missing');
        showToast('Error: Card container missing. Cannot display characters.');
        return;
    }

    // Toast utility
    function showToast(message, type = 'error') {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function navigateTo(target) {
        const id = localStorage.getItem("id");
        if (!target || typeof target !== 'string') {
            console.error('Invalid navigation target:', target);
            showToast('Error: Invalid navigation target');
            return;
        }
        let uuidgen = window.idget()
        if (uuidgen) {
            setTimeout(() => {
                window.location.href = `${target}${uuidgen}`;
            }, 1000);
        } else {
            console.error("No user ID found");
            showToast('No user ID found. Redirecting to login.');
            setTimeout(() => {
                window.location.href = "/login.html";
            }, 1000);
        }
    }

    // Wait for Firebase with timeout
    const waitForFirebase = () => {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds
            const checkFirebase = () => {
                if (window.firebase && window.firebase.auth && window.firebase.apps.length) {
                    console.log('✅ Firebase SDK and app initialized');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    console.error('Firebase initialization timeout');
                    reject(new Error('Firebase initialization timeout'));
                } else {
                    console.log('⌛ Waiting for Firebase SDK and initialization...');
                    attempts++;
                    setTimeout(checkFirebase, 100);
                }
            };
            checkFirebase();
        });
    };

    try {
        await waitForFirebase();
    } catch (error) {
        console.error('Error waiting for Firebase SDK:', error);
        showToast('Failed to initialize Firebase. Please try again.');
        return;
    }

    // Wait for auth with timeout
    const waitForAuth = () => {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    console.log('✅ Authenticated user:', user.displayName || user.uid);
                    unsubscribe();
                    resolve(user);
                } else if (attempts >= maxAttempts) {
                    console.error('Authentication timeout');
                    unsubscribe();
                    reject(new Error('Authentication timeout'));
                } else {
                    attempts++;
                    setTimeout(() => {}, 100);
                }
            });
        });
    };

    try {
        await waitForAuth();
    } catch (error) {
        console.error('Error waiting for auth:', error);
        showToast('No authenticated user. Redirecting to login.');
        setTimeout(() => window.location.href = '/login.html', 1000);
        return;
    }

    async function fetchCharacters(attempt = 1, maxAttempts = 3) {
        try {
            const userId = localStorage.getItem('id');
            if (!userId) {
                throw new Error('No user ID found in localStorage');
            }
            const response = await window.firebaseAuth.sendWithFreshToken(`/c/list?uid=${encodeURIComponent(userId)}`);
            console.log('Characters fetched:', response);
            return response;
        } catch (error) {
            console.error(`Error fetching characters (attempt ${attempt}):`, error);
            if (attempt < maxAttempts) {
                console.log(`Retrying fetchCharacters (attempt ${attempt + 1})`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
                return fetchCharacters(attempt + 1, maxAttempts);
            }
            showToast(`Failed to fetch characters: ${error.message}`);
            return [];
        }
    }

    function displayCards(data) {
        if (!elements.cardContainer) return;
        elements.cardContainer.innerHTML = '';

        if (!data || data.length === 0) {
            elements.cardContainer.innerHTML = '<p style="text-align: center;">No characters available.</p>';
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
                        <div class="loader" id="card-image-loader-${character.id}"><div class="spinner"></div><span>Loading...</span></div>
                        <img  src="${character.link || `https://api.dicebear.com/7.x/bottts/svg?seed=${character.name}`}" width="140" height="140" class="avatar" data-char-id="${character.id}">
                    </div>
                    <div class="card-details">
                        <h3 class="character-name">${character.name || 'Unnamed Character'}</h3>
                        <div class="tags-container">${tagsHTML}</div>
                        <p class="description">${relationshipText}</p>
                        <p class="creator-name" data-creator-id="${creatorId}">by @${creatorText}</p>
                        <p class="view-count">Views: ${character.viewCount || 0}</p>
                    </div>
                </div>
            `;

            card.dataset.allTags = allTags.join(' ');
            card.addEventListener('click', () => {
                window.location.href = `/chat/c/${character.id}`;
            });
            elements.cardContainer.appendChild(card);

            // Handle image load and error
            const img = card.querySelector(`img[data-char-id="${character.id}"]`);
            const loader = card.querySelector(`#card-image-loader-${character.id}`);
            if (img && loader) {
                img.onload = () => {
                    loader.style.display = 'none';
                    img.style.display = 'block';
                };
                img.onerror = () => {
                    loader.style.display = 'none';
                    img.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${character.name}`;
                    img.style.display = 'block';
                };
                img.style.display = 'none';
            }
        });

        // Tag click listeners
        document.querySelectorAll('.tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                if (elements.searchBox) {
                    const tagText = tag.textContent.replace('@', '');
                    elements.searchBox.value = tagText;
                    filterCards(tagText);
                }
            });
        });

        // Creator name click listeners
        document.querySelectorAll('.creator-name').forEach(creator => {
            creator.addEventListener('click', (e) => {
                e.stopPropagation();
                const creatorId = creator.getAttribute('data-creator-id');
                navigateTo(`/creator/works?creatorId=${encodeURIComponent(creatorId)}&uid=`);
            });
        });
    }

    function filterCards(searchTerm) {
        if (!elements.cardContainer) return;
        const cards = elements.cardContainer.querySelectorAll('.card');
        searchTerm = searchTerm.toLowerCase();
        cards.forEach(card => {
            const name = card.querySelector('.character-name')?.textContent.toLowerCase() || '';
            const displayedTags = card.querySelector('.tags-container')?.textContent.toLowerCase() || '';
            const allTags = card.dataset.allTags?.toLowerCase() || '';
            const relationship = card.querySelector('.description')?.textContent.toLowerCase() || '';
            card.style.display = (name.includes(searchTerm) || displayedTags.includes(searchTerm) || allTags.includes(searchTerm) || relationship.includes(searchTerm)) ? 'flex' : 'none';
        });
    }

    // Add loader styles
    const style = document.createElement('style');
    style.textContent = `
        .loader {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: center;
            min-height: 140px;
        }
        .spinner {
            width: 24px;
            height: 24px;
            border: 4px solid #ccc;
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .loader span {
            color: #4b5563;
        }
        .dark-theme .loader span, .night-theme .loader span {
            color: #94a3b8;
        }
        .card-image {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .card-image img {
            display: none;
        }
    `;
    document.head.appendChild(style);

    // Fetch and display characters
    const characters = await fetchCharacters();
    displayCards(characters);

    // Theme toggle
    if (elements.themeToggle) {
        const icon = elements.themeToggle.querySelector('i');
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(now.getTime() + istOffset);
        const hour = istTime.getUTCHours();

        if (hour >= 18 || hour < 6) {
            document.body.classList.add('night-theme');
            icon?.classList.add('fa-cloud-moon');
        } else if (!document.body.classList.contains('light-theme')) {
            document.body.classList.add('dark-theme');
            icon?.classList.add('fa-moon');
        }

        elements.themeToggle.addEventListener('click', () => {
            if (document.body.classList.contains('dark-theme')) {
                document.body.classList.replace('dark-theme', 'night-theme');
                icon?.classList.replace('fa-moon', 'fa-cloud-moon');
            } else if (document.body.classList.contains('night-theme')) {
                document.body.classList.replace('night-theme', 'light-theme');
                icon?.classList.replace('fa-cloud-moon', 'fa-sun');
            } else {
                document.body.classList.replace('light-theme', 'dark-theme');
                icon?.classList.replace('fa-sun', 'fa-moon');
            }
        });
    }

    // Navbar toggle
    if (elements.navbarToggle && elements.navbarNav) {
        elements.navbarToggle.addEventListener('click', () => {
            elements.navbarNav.classList.toggle('active');
        });
    }

    // Modal close
    if (elements.modalClose) {
        elements.modalClose.addEventListener('click', () => {
            const modal = document.getElementById('modal');
            if (modal) modal.style.display = 'none';
        });
    }

    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            navigateTo(target);
            if (elements.navbarNav) elements.navbarNav.classList.remove('active');
        });
    });

    // Search input
    if (elements.searchBox) {
        elements.searchBox.addEventListener('input', (e) => {
            filterCards(e.target.value);
        });
    }
});