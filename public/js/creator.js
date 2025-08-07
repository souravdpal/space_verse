document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Firebase SDK and initialization
    const waitForFirebase = () => {
        return new Promise((resolve, reject) => {
            const checkFirebase = () => {
                if (window.firebase && window.firebase.auth && window.firebase.apps.length) {
                    console.log('✅ Firebase SDK and app initialized');
                    resolve();
                } else {
                    console.log('⌛ Waiting for Firebase SDK and initialization...');
                    setTimeout(checkFirebase, 100);
                }
            };
            checkFirebase();
        });
    };

    // Wait for user authentication
    const waitForAuth = () => {
        return new Promise((resolve, reject) => {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    console.log('✅ Authenticated user:', user.displayName || user.uid);
                    resolve(user);
                } else {
                    console.error('⚠️ No authenticated user');
                    reject(new Error('No authenticated user'));
                }
            });
        });
    };

    // Initialize Firebase and authentication
    async function initializeAuth() {
        try {
            await waitForFirebase();
            const user = await waitForAuth();
            const token = await user.getIdToken(true);
            localStorage.setItem('authToken', token);
            localStorage.setItem('id', user.uid);
            console.log('✅ Auth initialized:', { uid: user.uid });
            return user.uid;
        } catch (error) {
            console.error('Initialization error:', error);
            showToast('Failed to initialize. Redirecting to login.', 'error');
            setTimeout(() => window.location.href = '/login', 2000);
            throw error;
        }
    }

    let userId;
    try {
        userId = await initializeAuth();
        window.currentUserId = userId;
    } catch (error) {
        return;
    }

    // DOM elements
    const elements = {
        creatorName: document.querySelector('.creator-name'),
        creatorBio: document.querySelector('.creator-bio'),
        creatorPhoto: document.querySelector('.creator-photo'),
        followerCount: document.querySelector('.follower-count'),
        followButton: document.querySelector('.follow-btn'),
        characterContainer: document.querySelector('.slider-container'),
        shareButton: document.querySelector('.share-btn'),
        navbarToggle: document.querySelector('.navbar-toggle'),
        navbarNav: document.querySelector('.navbar-nav'),
        themeToggle: document.querySelector('#theme-toggle')
    };

    // Check for missing elements
    const missingElements = Object.entries(elements)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
    if (missingElements.length > 0) {
        console.warn('Missing DOM elements:', missingElements.join(', '));
    }

    // Debounce function
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Show toast message
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast') || document.createElement('div');
        if (!document.getElementById('toast')) {
            toast.id = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
        console.log(`Toast shown: ${message} (${type})`);
    }

    // Setup follow button with debouncing and loading state
    function setupFollowButton() {
        if (!elements.followButton) {
            console.warn('Follow button (.follow-btn) not found in DOM');
            return;
        }

        // Log initial button state
        const initialFollowingState = elements.followButton.classList.contains('following');
        const initialButtonText = elements.followButton.textContent.trim();
        console.log(`Initial follow button state: ${initialFollowingState ? 'Following' : 'Not following'}, text: ${initialButtonText}`);

        const creatorId = elements.followButton.getAttribute('data-creator-id');
        // Disable button if user is viewing their own profile
        if (creatorId === userId) {
            console.log('Disabling follow button: User viewing own profile');
            elements.followButton.disabled = true;
            elements.followButton.textContent = 'Your Profile';
            elements.followButton.setAttribute('aria-label', 'Your own profile');
            return;
        }

        const followAction = async () => {
            if (!creatorId || !userId) {
                console.error('Cannot follow: Missing creator ID or user ID', { creatorId, userId });
                showToast('Cannot follow: Missing ID', 'error');
                return;
            }

            // Store current state for rollback on error
            const currentFollowingState = elements.followButton.classList.contains('following');
            const currentText = elements.followButton.textContent.trim();

            // Check server follow status
            const followUrl = `/api/user/${creatorId}/follow?uid=${userId}`;
            console.log(`[${new Date().toISOString()}] Checking follow status for creator: ${creatorId}, URL: ${followUrl}`);
            let serverFollowingState;
            try {
                const statusResponse = await window.firebaseAuth.sendWithFreshToken('GET', followUrl);
                serverFollowingState = statusResponse.followed;
                console.log(`Server follow status: ${serverFollowingState ? 'Following' : 'Not following'}`);
                // Sync UI with server
                if (serverFollowingState !== currentFollowingState) {
                    console.warn(`UI-server mismatch: UI=${currentFollowingState}, Server=${serverFollowingState}`);
                    elements.followButton.classList.toggle('following', serverFollowingState);
                    elements.followButton.textContent = serverFollowingState ? 'Unfollow' : 'Follow';
                    elements.followButton.setAttribute('aria-label', serverFollowingState ? 'Unfollow creator' : 'Follow creator');
                }
            } catch (error) {
                console.error(`Failed to check follow status for creator ${creatorId}:`, error.message);
                showToast(`Failed to verify follow status: ${error.message}`, 'error');
                return;
            }

            // Add loading state
            elements.followButton.disabled = true;
            elements.followButton.textContent = 'Loading...';

            console.log(`[${new Date().toISOString()}] Sending follow request for creator: ${creatorId}, URL: ${followUrl}`);

            try {
                const response = await window.firebaseAuth.sendWithFreshToken('POST', followUrl);
                if (response.followed === undefined || response.followerCount === undefined) {
                    throw new Error('Invalid response from server');
                }

                // Update UI immediately
                const isFollowing = response.followed;
                elements.followButton.classList.toggle('following', isFollowing);
                elements.followButton.textContent = isFollowing ? 'Unfollow' : 'Follow';
                elements.followButton.setAttribute('aria-label', isFollowing ? 'Unfollow creator' : 'Follow creator');
                elements.followerCount.textContent = `Followers: ${response.followerCount >= 1000000 ? (response.followerCount / 1000000).toFixed(1) + 'm' : response.followerCount >= 1000 ? (response.followerCount / 1000).toFixed(1) + 'k' : response.followerCount}`;
                elements.followerCount.setAttribute('data-follower-count', response.followerCount);
                showToast(isFollowing ? 'Followed successfully!' : 'Unfollowed successfully!', 'success');
                console.log(`Follow action completed: ${isFollowing ? 'Following' : 'Not following'}, followers: ${response.followerCount}`);
            } catch (error) {
                console.error(`Failed to follow creator ${creatorId}:`, error.message);
                showToast(`Failed to follow: ${error.message}`, 'error');
                // Revert UI to previous state
                elements.followButton.classList.toggle('following', currentFollowingState);
                elements.followButton.textContent = currentText;
                elements.followButton.setAttribute('aria-label', currentFollowingState ? 'Unfollow creator' : 'Follow creator');
            } finally {
                elements.followButton.disabled = false;
            }
        };

        elements.followButton.addEventListener('click', debounce(followAction, 300));
    }

    // Setup like buttons
    function setupLikeButtons() {
        document.querySelectorAll('.like-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const charId = button.getAttribute('data-char-id');
                if (!charId || !userId) {
                    console.error('Cannot like: Missing character ID or user ID');
                    showToast('Cannot like: Missing ID', 'error');
                    return;
                }
                try {
                    const response = await window.firebaseAuth.sendWithFreshToken('POST', `/api/char/${charId}/like?uid=${userId}`);
                    if (response.liked === undefined || response.likeCount === undefined) {
                        throw new Error('Invalid response from server');
                    }
                    button.classList.toggle('liked', response.liked);
                    button.querySelector('.like-count').textContent = response.likeCount;
                    showToast(response.liked ? 'Liked!' : 'Unliked!', 'success');
                } catch (error) {
                    console.error('Failed to like character:', error);
                    showToast('Failed to like: ' + error.message, 'error');
                }
            });
        });
    }

    // Setup character cards
    function setupCharacterCards() {
        document.querySelectorAll('.character-card').forEach(card => {
            card.addEventListener('click', () => {
                const charId = card.getAttribute('data-char-id');
                if (charId) {
                    window.location.href = `/chat/c/${encodeURIComponent(charId)}`;
                } else {
                    console.error('Character card missing data-char-id');
                    showToast('Cannot open chat: Missing character ID', 'error');
                }
            });
        });
    }

    // Handle share button
    function setupShareButton() {
        if (!elements.shareButton) {
            console.warn('Share button (.share-btn) not found in DOM');
            return;
        }

        elements.shareButton.addEventListener('click', () => {
            const creatorId = elements.followButton?.getAttribute('data-creator-id');
            if (!creatorId) {
                console.error('Cannot share: Missing creator ID');
                showToast('Cannot share: Missing creator ID', 'error');
                return;
            }
            const shareUrl = `${window.location.origin}/creator/works?creatorId=${encodeURIComponent(creatorId)}&uid=${encodeURIComponent(userId)}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast('Profile URL copied to clipboard!', 'success');
                console.log('Share URL copied:', shareUrl);
            }).catch(err => {
                console.error('Failed to copy share URL:', err);
                showToast('Failed to copy share URL', 'error');
            });
        });
    }

    // Navbar toggle
    if (elements.navbarToggle && elements.navbarNav) {
        elements.navbarToggle.addEventListener('click', () => {
            elements.navbarNav.classList.toggle('active');
            console.log('Navbar toggled');
        });
    }

    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            if (!target) {
                console.error('Nav link missing data-target attribute');
                showToast('Navigation error: Invalid target', 'error');
                return;
            }
            const uid = localStorage.getItem('id');
            if (!uid) {
                showToast('Please log in to continue.', 'error');
                setTimeout(() => window.location.href = '/login', 1000);
                return;
            }
            window.location.href = `${target}${encodeURIComponent(uid)}`;
            if (elements.navbarNav) elements.navbarNav.classList.remove('active');
            console.log(`Navigating to: ${target}${uid}`);
        });
    });

    // Initialize UI interaction logic
    async function initialize() {
        try {
            if (elements.creatorName && !elements.creatorName.textContent) {
                console.warn('Creator name not set in DOM');
                showToast('Creator name not loaded properly', 'warning');
            }
            setupLikeButtons();
            setupCharacterCards();
            setupFollowButton();
            setupShareButton();
            console.log('UI initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            showToast('Failed to initialize UI: ' + error.message, 'error');
        }
    }

    // Start initialization
    initialize();
});