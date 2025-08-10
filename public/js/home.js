document.addEventListener('DOMContentLoaded', () => {
    // Utility to sanitize strings and remove HTML tags
    function sanitizeHTML(str) {
        if (!str) return '';
        // Create a temporary element to strip HTML tags
        const div = document.createElement('div');
        div.innerHTML = str;
        return div.textContent || div.innerText || '';
    }

    // Replace placeholder images
    function replacePlaceholderImages(img) {
        if (img.src.includes('via.placeholder.com') || img.src.includes('api.dicebear.com')) {
            console.warn(`Replacing placeholder image: ${img.src}`);
            img.src = 'https://ik.imagekit.io/souravdpal/default-avatar.png';
        }
    }

    // Ensure Firebase auth is loaded
    if (!window.firebaseAuth) {
        console.error('firebaseAuth.js not loaded');
        showToast('Authentication module not loaded');
        window.location.href = '/login';
        return;
    }

    // DOM Elements
    const elements = {
        postFeed: document.getElementById('post-feed'),
        myPostsList: document.getElementById('my-posts-list'),
        communityNav: document.querySelectorAll('#community-nav, #community-nav-mobile'),
        communityDropdown: document.querySelectorAll('#community-dropdown, #community-dropdown-mobile'),
        modeToggle: document.querySelectorAll('#mode-toggle, #mode-toggle-mobile'),
        userPhoto: document.querySelectorAll('#user-photo, #user-photo-mobile'),
        logOutBtn: document.querySelectorAll('#log-out, #log-out-mobile'),
        createPostBtn: document.querySelectorAll('#create-post, #create-post-mobile'),
        notificationsBtn: document.querySelectorAll('#notifications, #notifications-mobile'),
        notificationCount: document.querySelectorAll('#notification-count, #notification-count-mobile'),
        sidebarToggle: document.getElementById('sidebar-toggle'),
        sidebar: document.querySelector('.sidebar'),
        loader: document.getElementById('loader'),
        mobileNavToggle: document.getElementById('mobile-nav-toggle'),
        mobileNav: document.getElementById('mobile-nav'),
        mobileNavClose: document.getElementById('mobile-nav-close'),
        userAvatars: document.querySelectorAll('.user-avatar img'),
        userDropdowns: document.querySelectorAll('.user-dropdown'),
        postForm: document.getElementById('post-form'),
        successMessage: document.getElementById('success-message'),
        notificationList: document.getElementById('notification-list'),
        searchBar: document.getElementById('search-bar'),
        confirmLogout: document.getElementById('confirm-logout'),
        cancelLogout: document.getElementById('cancel-logout'),
        closeNotification: document.getElementById('close-notification'),
    };

    // Validate critical DOM elements
    if (!elements.postFeed) console.error('post-feed element not found');
    if (!elements.postForm) console.warn('post-form element not found. Post creation disabled.');
    if (!elements.searchBar) console.warn('search-bar element not found. Search disabled.');
    if (!elements.notificationList) console.warn('notification-list element not found. Notifications disabled.');

    // Current User
    let currentUser = { user: 'Unknown', id: null };

    // State
    let filteredPosts = [];
    let myPosts = [];
    let isFetching = false;
    let allPostsPage = 1;
    let myPostsPage = 1;
    let currentCommunity = 'all';
    let searchQuery = '';
    const commentVisibility = new Map();
    let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
    let viewedPosts = JSON.parse(localStorage.getItem('viewedPosts') || '{}');
    const CACHE_KEY = 'cachedPosts';
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const POSTS_PER_PAGE = 10;

    // Fallback to hide loader
    setTimeout(() => {
        if (elements.loader) elements.loader.style.display = 'none';
    }, 10000);

    // Validate scrollable container
    function validateScrollableContainer(element, name) {
        if (!element) {
            console.error(`${name} element not found`);
            return false;
        }
        const style = window.getComputedStyle(element);
        const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll';
        const hasHeight = style.height !== 'auto' && parseFloat(style.height) > 0 || style.maxHeight !== 'none' && parseFloat(style.maxHeight) > 0;
        if (!isScrollable || !hasHeight) {
            console.warn(`${name} is not scrollable. Ensure CSS includes 'overflow-y: auto' and a defined 'height' or 'max-height'.`);
            return false;
        }
        return true;
    }

    // Wait for Firebase auth state
    async function waitForAuthState() {
        return new Promise((resolve, reject) => {
            const unsubscribe = firebase.auth().onAuthStateChanged(user => {
                unsubscribe();
                if (user) {
                    currentUser = { user: user.displayName || 'Unknown', id: user.uid };
                    resolve(user);
                } else {
                    reject(new Error('No authenticated user'));
                }
            }, reject);
        });
    }

    // Fetch profile data
    async function fetchProfileData(id) {
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/cred?uid=${encodeURIComponent(id)}`);
            if (response.msg === 'none') {
                window.firebaseAuth.logout();
                return null;
            }
            let photoUrl = response.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
            elements.userPhoto.forEach(img => {
                img.src = photoUrl;
                replacePlaceholderImages(img);
            });
            return { photo: photoUrl, name: response.name || 'Guest' };
        } catch (error) {
            console.error('Error fetching profile:', error.message);
            elements.userPhoto.forEach(img => {
                img.src = 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                replacePlaceholderImages(img);
            });
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
            return null;
        }
    }

    // Fetch character data
    async function fetchCharacterData(charId) {
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/c/char/${encodeURIComponent(charId)}`);
            if (response.error) {
                console.error('Character not found:', response.error);
                return { link: 'https://ik.imagekit.io/souravdpal/default-avatar.png' };
            }
            return { link: response.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png', name: response.name };
        } catch (error) {
            console.error('Error fetching character:', error.message);
            return { link: 'https://ik.imagekit.io/souravdpal/default-avatar.png' };
        }
    }

    // Cache management
    function getCachedPosts(community) {
        const cached = localStorage.getItem(`${CACHE_KEY}_${community}`);
        if (!cached) return null;
        const { timestamp, posts } = JSON.parse(cached);
        if (Date.now() - timestamp > CACHE_DURATION) {
            localStorage.removeItem(`${CACHE_KEY}_${community}`);
            return null;
        }
        return posts;
    }

    function setCachedPosts(posts, community) {
        localStorage.setItem(`${CACHE_KEY}_${community}`, JSON.stringify({ timestamp: Date.now(), posts }));
    }

    function clearCache(community) {
        localStorage.removeItem(`${CACHE_KEY}_${community}`);
    }

    // Fetch posts
    async function fetchPosts(community = 'all', page = 1) {
        try {
            const viewedPostIds = Object.keys(viewedPosts).filter(id => viewedPosts[id] > 0);
            const response = await window.firebaseAuth.sendWithFreshToken(`/api/posts/priority?limit=${POSTS_PER_PAGE}&page=${page}&community=${encodeURIComponent(community)}`, {
                method: 'POST',
                body: JSON.stringify({ userId: currentUser.id, viewedPostIds })
            });
            const posts = await Promise.all(response.map(async post => {
                let photo = post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                let normalizedCommunity = post.community === 'Characters' ? '@Characters' : post.community;
                if (!post.authorPhoto) {
                    if (normalizedCommunity === '@Characters' || normalizedCommunity === '@AICharacters') {
                        const charData = await fetchCharacterData(post.authorId);
                        photo = charData.link;
                    } else {
                        const userData = await fetchProfileData(post.authorId);
                        photo = userData?.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    }
                }
                return {
                    id: post._id,
                    user: post.authorName || 'Unknown',
                    photo,
                    authorId: post.authorId,
                    community: normalizedCommunity,
                    content: sanitizeHTML(post.content), // Strip HTML tags
                    image: post.image || null,
                    likes: post.likeCount || 0,
                    likedBy: post.likedBy || [],
                    commentCount: post.commentCount || 0,
                    comments: [],
                    createdAt: new Date(post.createdAt),
                    viewCount: post.viewCount || 0
                };
            }));
            if (posts.length > 0) setCachedPosts(posts, community);
            return posts;
        } catch (error) {
            console.error('Error fetching posts:', error.message);
            const cachedPosts = getCachedPosts(community);
            if (cachedPosts) return cachedPosts.map(post => ({ ...post, community: post.community === 'Characters' ? '@Characters' : post.community }));
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
            return [];
        }
    }

    // Fetch my posts
    async function fetchMyPosts(page = 1) {
        if (!elements.myPostsList) return;
        elements.myPostsList.innerHTML = '<div class="empty-state">Loading...</div>';
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/api/posts?limit=${POSTS_PER_PAGE}&page=${page}&authorId=${encodeURIComponent(currentUser.id)}`);
            myPosts = await Promise.all(response.map(async post => {
                let photo = post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                if (post.community === '@Characters' || post.community === '@AICharacters') {
                    const charData = await fetchCharacterData(post.authorId);
                    photo = charData.link;
                } else if (!post.authorPhoto) {
                    const userData = await fetchProfileData(post.authorId);
                    photo = userData?.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                }
                return {
                    id: post._id,
                    user: post.authorName || 'Unknown',
                    photo,
                    authorId: post.authorId,
                    community: post.community,
                    content: sanitizeHTML(post.content), // Strip HTML tags
                    image: post.image || null,
                    likes: post.likeCount || 0,
                    likedBy: post.likedBy || [],
                    commentCount: post.commentCount || 0,
                    comments: [],
                    createdAt: new Date(post.createdAt),
                    viewCount: post.viewCount || 0
                };
            }));
            if (myPosts.length > 0) setCachedPosts(myPosts, 'my-posts');
            renderMyPosts();
        } catch (error) {
            console.error('Error fetching my posts:', error.message);
            elements.myPostsList.innerHTML = '<div class="empty-state">Failed to load posts.</div>';
            const cachedPosts = getCachedPosts('my-posts');
            if (cachedPosts) {
                myPosts = cachedPosts;
                renderMyPosts();
            }
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
        }
    }

    // Track post views
    function trackPostView(postId) {
        viewedPosts[postId] = (viewedPosts[postId] || 0) + 1;
        localStorage.setItem('viewedPosts', JSON.stringify(viewedPosts));
    }

    // Fetch comments
    async function fetchComments(postId) {
        try {
            const response = await window.firebaseAuth.sendWithFreshToken('/com', {
                method: 'POST',
                body: JSON.stringify({ query: postId })
            });
            return response.map(comment => ({
                id: comment._id,
                user: comment.authorName,
                photo: comment.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                content: sanitizeHTML(comment.content), // Strip HTML tags
                likes: comment.likes || 0,
                likedBy: comment.likedBy || [],
                replyTo: comment.replyTo || null,
                community: comment.community,
                createdAt: new Date(comment.createdAt)
            }));
        } catch (error) {
            console.error('Error fetching comments:', error.message);
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
            return [];
        }
    }

    // Clean comment content
    function cleanCommentContent(content) {
        const tagPattern = /@(\w+)/g;
        const seenTags = new Set();
        let cleanedContent = content.replace(tagPattern, (match, username) => {
            if (seenTags.has(username)) return '';
            seenTags.add(username);
            return `@${username}`;
        });
        return sanitizeHTML(cleanedContent.trim()); // Strip HTML tags
    }

    // Filter posts
    function filterPosts(posts, query) {
        if (!query.trim()) return posts;
        const lowerQuery = query.toLowerCase();
        return posts.filter(post =>
            post.content.toLowerCase().includes(lowerQuery) ||
            post.user.toLowerCase().includes(lowerQuery) ||
            post.community.toLowerCase().includes(lowerQuery)
        );
    }

    // Render posts
    function renderPosts(append = false) {
        if (!elements.postFeed) return;
        const postsToRender = searchQuery ? filterPosts(filteredPosts, searchQuery) : filteredPosts;
        if (!append) {
            elements.postFeed.innerHTML = '';
            if (postsToRender.length === 0) {
                elements.postFeed.innerHTML = `<div class="empty-state">${searchQuery ? 'No posts match your search.' : 'No posts to show.'}</div>`;
                return;
            }
        }
        const fragment = document.createDocumentFragment();
        const postsToDisplay = append ? postsToRender.slice(-POSTS_PER_PAGE) : postsToRender;
        postsToDisplay.forEach(post => {
            const postElement = createPostElement(post);
            fragment.appendChild(postElement);
            const observer = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting) {
                    trackPostView(post.id);
                    observer.disconnect();
                }
            }, { threshold: 0.5 });
            observer.observe(postElement);
        });
        elements.postFeed.appendChild(fragment);
        elements.postFeed.querySelectorAll('img').forEach(img => {
            if (!img.src || img.src === '') {
                img.src = 'https://ik.imagekit.io/souravdpal/default-avatar.png';
            }
        });
    }

    // Render my posts
    function renderMyPosts(append = false) {
        if (!elements.myPostsList) return;
        const postsToRender = searchQuery ? filterPosts(myPosts, searchQuery) : myPosts;
        if (!append) {
            elements.myPostsList.innerHTML = '';
            if (postsToRender.length === 0) {
                elements.myPostsList.innerHTML = `<div class="empty-state">${searchQuery ? 'No posts match your search.' : 'No posts to show.'}</div>`;
                return;
            }
        }
        const fragment = document.createDocumentFragment();
        const postsToDisplay = append ? postsToRender.slice(-POSTS_PER_PAGE) : postsToRender;
        postsToDisplay.forEach(post => fragment.appendChild(createPostElement(post)));
        elements.myPostsList.appendChild(fragment);
        elements.myPostsList.querySelectorAll('img').forEach(img => {
            if (!img.src || img.src === '') {
                img.src = 'https://ik.imagekit.io/souravdpal/default-avatar.png';
            }
        });
    }

    // Create post element
    function createPostElement(post) {
        const isCurrentUser = currentUser.id === post.authorId;
        const areCommentsVisible = commentVisibility.get(post.id) || false;
        const postDiv = document.createElement('div');
        postDiv.className = 'post-card';
        postDiv.innerHTML = `
            <div class="flex items-start gap-4">
                <div class="profile-img">
                    <img loading="lazy" src="${post.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png'}" alt="${sanitizeHTML(post.user)}'s profile image">
                </div>
                <div class="flex-grow">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-semibold text-blue-600 text-sm">${sanitizeHTML(post.user)}</span>
                        <span class="com-p text-gray-500 text-xs capitalize bg-gray-700 px-2 py-0.5 rounded-full">${sanitizeHTML(post.community)}</span>
                        <span class="text-gray-400 text-xs">${formatTime(post.createdAt)}</span>
                    </div>
                    <p class="text-gray-200 text-sm mb-2">${post.content}</p>
                    ${post.image ? `
                        <div class="post-image-container">
                            <img loading="lazy" src="${post.image}" alt="Post image" class="post-image">
                        </div>
                    ` : ''}
                    <div class="flex gap-3 mb-3">
                        <button class="like-btn flex items-center gap-1 text-gray-400 text-sm ${post.likedBy.includes(currentUser.id) ? 'liked' : ''}" data-id="${post.id}" data-community="${post.community}" data-tooltip="Like">
                            <i class="fas fa-heart"></i>
                            <span>${post.likes || 0}</span>
                        </button>
                        <button class="comment-btn flex items-center gap-1 text-gray-400 text-sm" data-id="${post.id}" data-tooltip="${areCommentsVisible ? 'Hide Comments' : 'Show Comments'}">
                            <i class="fas fa-comment"></i>
                            <span>${post.commentCount}</span>
                        </button>
                        <button class="share-btn flex items-center gap-1 text-gray-400 text-sm" data-id="share?uid=${currentUser.id}&post=${post.id}" data-tooltip="Share">
                            <i class="fas fa-share"></i>
                            <span>Share</span>
                        </button>
                    </div>
                    <div class="comment-form ${areCommentsVisible ? '' : 'hidden'}">
                        <textarea class="w-full bg-gray-700 text-gray-200 p-2 rounded-lg text-sm" rows="2" placeholder="Add a comment or reply with @username..."></textarea>
                        <button class="bg-blue-600 text-white py-1 px-3 rounded-lg mt-1 text-sm">Submit</button>
                    </div>
                    <div class="comments ${areCommentsVisible ? '' : 'hidden'}">
                        ${post.commentCount > 0 ? `
                            <button class="show-all-comments-btn text-blue-600 text-xs">${areCommentsVisible ? `Hide ${post.commentCount} comments` : `Show ${post.commentCount} comments`}</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        const comP = postDiv.querySelector('.com-p');
        if (comP) {
            comP.style.cursor = 'pointer';
            comP.style.transition = 'background-color 0.2s ease, transform 0.15s ease';
            comP.style.position = 'relative';

            const tooltip = document.createElement('div');
            tooltip.textContent = `Talk to ${post.user}`;
            tooltip.style.cssText = `
                position: absolute;
                bottom: 125%;
                left: 50%;
                transform: translateX(-50%);
                background: #111827;
                color: #fff;
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 0.75rem;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
                z-index: 9999;
            `;
            const arrow = document.createElement('div');
            arrow.style.cssText = `
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-top: 5px solid #111827;
            `;
            tooltip.appendChild(arrow);
            comP.appendChild(tooltip);

            comP.addEventListener('mouseenter', () => {
                comP.style.backgroundColor = '#2563eb';
                comP.style.color = '#ffffff';
                comP.style.transform = 'scale(1.05)';
                tooltip.style.opacity = '1';
            });
            comP.addEventListener('mouseleave', () => {
                comP.style.backgroundColor = '#374151';
                comP.style.color = '';
                comP.style.transform = 'scale(1)';
                tooltip.style.opacity = '0';
            });
            comP.addEventListener('click', () => {
                const content = comP.textContent.trim();
                if (content.startsWith('@') && content.length > 1) {
                    window.location.href = `/chat/c/${post.authorId}`;
                }
            });
        }

        const likeBtn = postDiv.querySelector('.like-btn');
        likeBtn.addEventListener('click', async () => {
            if (!currentUser.id) {
                window.location.href = '/login';
                return;
            }
            try {
                const postId = likeBtn.getAttribute('data-id');
                const community = likeBtn.getAttribute('data-community');
                const isAIPost = community === '@AICharacters';
                const endpoint = isAIPost ? `/api/aiposts/${postId}/like?uid=${currentUser.id}` : `/api/posts/${postId}/like/${currentUser.id}`;
                const response = await window.firebaseAuth.sendWithFreshToken(endpoint, { method: 'POST' });
                const targetArray = isAIPost ? filteredPosts : (elements.postFeed.contains(likeBtn) ? filteredPosts : myPosts);
                const post = targetArray.find(p => p.id === postId);
                if (post) {
                    post.likes = response.likes !== undefined ? response.likes : response.likeCount || 0;
                    post.likedBy = response.likedBy || [];
                    renderPosts();
                    renderMyPosts();
                }
            } catch (error) {
                console.error('Error liking post:', error.message);
                showToast('Failed to like post.');
                if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
            }
        });

        const commentBtn = postDiv.querySelector('.comment-btn');
        commentBtn.addEventListener('click', async () => {
            const isVisible = commentVisibility.get(post.id) || false;
            if (!isVisible) {
                post.comments = await fetchComments(post.id);
            }
            commentVisibility.set(post.id, !isVisible);
            renderPosts();
            renderMyPosts();
        });

        const commentForm = postDiv.querySelector('.comment-form');
        if (commentForm) {
            const commentText = commentForm.querySelector('textarea');
            const submitBtn = commentForm.querySelector('button');
            submitBtn.addEventListener('click', async () => {
                if (!currentUser.id) {
                    window.location.href = '/login';
                    return;
                }
                if (commentText.value.trim()) {
                    const content = cleanCommentContent(commentText.value);
                    const replyMatch = content.match(/^@(\w+)/);
                    try {
                        const response = await window.firebaseAuth.sendWithFreshToken('/add/comment', {
                            method: 'POST',
                            body: JSON.stringify({
                                postid: post.id,
                                content,
                                authorId: currentUser.id
                            })
                        });
                        const currentUserProfile = await fetchProfileData(currentUser.id);
                        const newComment = {
                            id: response.comment._id,
                            user: currentUser.user,
                            photo: currentUserProfile?.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                            content,
                            likes: 0,
                            likedBy: [],
                            replyTo: replyMatch ? replyMatch[1] : null,
                            community: post.community,
                            createdAt: new Date()
                        };
                        post.comments.push(newComment);
                        post.commentCount++;
                        commentText.value = '';
                        renderPosts();
                        renderMyPosts();
                        showToast('Comment added!');
                    } catch (error) {
                        console.error('Error adding comment:', error.message);
                        showToast('Failed to add comment.');
                        if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
                    }
                }
            });
        }

        const shareBtn = postDiv.querySelector('.share-btn');
        shareBtn.addEventListener('click', () => {
            const url = `${window.location.origin}/post/share?uid=${currentUser.id}&post=${post.id}`;
            const shareModal = document.createElement('div');
            shareModal.className = 'share-modal';
            shareModal.innerHTML = `
                <div class="share-modal-content">
                    <h3 class="text-md font-semibold mb-3 text-gray-200">Share Post</h3>
                    <button class="share-option text-sm" data-platform="copy">Copy Link</button>
                    <button class="share-option text-sm" data-platform="twitter">Share on Twitter</button>
                    <button class="share-option text-sm" data-platform="facebook">Share on Facebook</button>
                    <button class="close-modal text-sm">Close</button>
                </div>
            `;
            document.body.appendChild(shareModal);
            shareModal.querySelector('[data-platform="copy"]').addEventListener('click', () => {
                navigator.clipboard.writeText(url);
                showToast('Link copied to clipboard!');
                shareModal.remove();
            });
            shareModal.querySelector('[data-platform="twitter"]').addEventListener('click', () => {
                window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`, '_blank');
                shareModal.remove();
            });
            shareModal.querySelector('[data-platform="facebook"]').addEventListener('click', () => {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
                shareModal.remove();
            });
            shareModal.querySelector('.close-modal').addEventListener('click', () => shareModal.remove());
        });

        return postDiv;
    }

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    // Handle search
    const handleSearch = debounce(async () => {
        if (isFetching) return;
        isFetching = true;
        if (elements.loader) elements.loader.style.display = 'flex';
        const newSearchQuery = elements.searchBar?.value.trim() || '';
        const activeSection = document.querySelector('.section.active') || { id: 'all-posts' };

        if (activeSection.id === 'notifications') {
            isFetching = false;
            if (elements.loader) elements.loader.style.display = 'none';
            return;
        }

        if (newSearchQuery !== searchQuery) {
            searchQuery = newSearchQuery;
            try {
                let posts = [];
                if (activeSection.id === 'all-posts') {
                    allPostsPage = 1;
                    clearCache(currentCommunity);
                    if (searchQuery) {
                        const response = await window.firebaseAuth.sendWithFreshToken(
                            `/api/posts/search?query=${encodeURIComponent(searchQuery)}&limit=${POSTS_PER_PAGE}&page=1&community=${encodeURIComponent(currentCommunity)}`
                        );
                        posts = response.map(post => ({
                            id: post._id,
                            user: post.authorName || 'Unknown',
                            photo: post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                            authorId: post.authorId,
                            community: post.community === 'Characters' ? '@Characters' : post.community,
                            content: sanitizeHTML(post.content), // Strip HTML tags
                            image: post.image || null,
                            likes: post.likeCount || 0,
                            likedBy: post.likedBy || [],
                            commentCount: post.commentCount || 0,
                            comments: post.comments || [],
                            createdAt: new Date(post.createdAt),
                            viewCount: post.viewCount || 0
                        }));
                    } else {
                        posts = await fetchPosts(currentCommunity, 1);
                    }
                    filteredPosts = posts;
                    renderPosts();
                } else if (activeSection.id === 'my-posts') {
                    myPostsPage = 1;
                    clearCache('my-posts');
                    if (searchQuery) {
                        const response = await window.firebaseAuth.sendWithFreshToken(
                            `/api/posts/search?query=${encodeURIComponent(searchQuery)}&limit=${POSTS_PER_PAGE}&page=1&authorId=${encodeURIComponent(currentUser.id)}`
                        );
                        posts = response.map(post => ({
                            id: post._id,
                            user: post.authorName || 'Unknown',
                            photo: post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                            authorId: post.authorId,
                            community: post.community === 'Characters' ? '@Characters' : post.community,
                            content: sanitizeHTML(post.content), // Strip HTML tags
                            image: post.image || null,
                            likes: post.likeCount || 0,
                            likedBy: post.likedBy || [],
                            commentCount: post.commentCount || 0,
                            comments: post.comments || [],
                            createdAt: new Date(post.createdAt),
                            viewCount: post.viewCount || 0
                        }));
                        myPosts = posts;
                    } else {
                        await fetchMyPosts(1);
                        posts = myPosts;
                    }
                    renderMyPosts();
                }
                if (posts.length > 0) {
                    setCachedPosts(posts, searchQuery ? `search_${searchQuery}` : activeSection.id === 'all-posts' ? currentCommunity : 'my-posts');
                }
            } catch (error) {
                console.error('Error searching posts:', error.message);
                showToast('Failed to search posts.');
                const cacheKey = activeSection.id === 'all-posts' ? currentCommunity : 'my-posts';
                const cachedPosts = getCachedPosts(cacheKey);
                if (cachedPosts) {
                    if (activeSection.id === 'all-posts') {
                        filteredPosts = cachedPosts;
                        renderPosts();
                    } else {
                        myPosts = cachedPosts;
                        renderMyPosts();
                    }
                } else {
                    if (activeSection.id === 'all-posts') {
                        filteredPosts = [];
                        renderPosts();
                    } else {
                        myPosts = [];
                        renderMyPosts();
                    }
                }
                if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
            } finally {
                isFetching = false;
                if (elements.loader) elements.loader.style.display = 'none';
            }
        } else {
            isFetching = false;
            if (elements.loader) elements.loader.style.display = 'none';
        }
    }, 300);

    if (elements.searchBar) {
        elements.searchBar.addEventListener('input', handleSearch);
    }

    // Handle infinite scroll
    const handleScroll = debounce(async () => {
        if (isFetching) return;
        const activeSection = document.querySelector('.section.active');
        let scrollElement = activeSection?.id === 'all-posts' ? elements.postFeed : (activeSection?.id === 'my-posts' ? elements.myPostsList : elements.postFeed);
        if (!scrollElement) return;
        if (!validateScrollableContainer(scrollElement, scrollElement.id)) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollElement;
        if (scrollTop + clientHeight >= scrollHeight - 200) {
            isFetching = true;
            if (elements.loader) elements.loader.style.display = 'flex';
            try {
                if (!activeSection || activeSection.id === 'all-posts') {
                    allPostsPage++;
                    clearCache(currentCommunity);
                    let newPosts = [];
                    if (searchQuery) {
                        const response = await window.firebaseAuth.sendWithFreshToken(
                            `/api/posts/search?query=${encodeURIComponent(searchQuery)}&limit=${POSTS_PER_PAGE}&page=${allPostsPage}&community=${encodeURIComponent(currentCommunity)}`
                        );
                        newPosts = response.map(post => ({
                            id: post._id,
                            user: post.authorName || 'Unknown',
                            photo: post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                            authorId: post.authorId,
                            community: post.community === 'Characters' ? '@Characters' : post.community,
                            content: sanitizeHTML(post.content), // Strip HTML tags
                            image: post.image || null,
                            likes: post.likeCount || 0,
                            likedBy: post.likedBy || [],
                            commentCount: post.commentCount || 0,
                            comments: post.comments || [],
                            createdAt: new Date(post.createdAt),
                            viewCount: post.viewCount || 0
                        }));
                    } else {
                        newPosts = await fetchPosts(currentCommunity, allPostsPage);
                    }
                    if (newPosts.length === 0) {
                        showToast('No more posts available.');
                        allPostsPage--;
                        isFetching = false;
                        if (elements.loader) elements.loader.style.display = 'none';
                        return;
                    }
                    filteredPosts.push(...newPosts);
                    renderPosts(true);
                } else if (activeSection.id === 'my-posts') {
                    myPostsPage++;
                    clearCache('my-posts');
                    const prevMyPostsLength = myPosts.length;
                    if (searchQuery) {
                        const response = await window.firebaseAuth.sendWithFreshToken(
                            `/api/posts/search?query=${encodeURIComponent(searchQuery)}&limit=${POSTS_PER_PAGE}&page=${myPostsPage}&authorId=${encodeURIComponent(currentUser.id)}`
                        );
                        const newPosts = response.map(post => ({
                            id: post._id,
                            user: post.authorName || 'Unknown',
                            photo: post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                            authorId: post.authorId,
                            community: post.community === 'Characters' ? '@Characters' : post.community,
                            content: sanitizeHTML(post.content), // Strip HTML tags
                            image: post.image || null,
                            likes: post.likeCount || 0,
                            likedBy: post.likedBy || [],
                            commentCount: post.commentCount || 0,
                            comments: post.comments || [],
                            createdAt: new Date(post.createdAt),
                            viewCount: post.viewCount || 0
                        }));
                        myPosts.push(...newPosts);
                        if (newPosts.length === 0) {
                            showToast('No more posts available.');
                            myPostsPage--;
                            isFetching = false;
                            if (elements.loader) elements.loader.style.display = 'none';
                            return;
                        }
                        renderMyPosts(true);
                    } else {
                        await fetchMyPosts(myPostsPage);
                        if (myPosts.length === prevMyPostsLength) {
                            showToast('No more posts available.');
                            myPostsPage--;
                            isFetching = false;
                            if (elements.loader) elements.loader.style.display = 'none';
                            return;
                        }
                        renderMyPosts(true);
                    }
                }
                if (filteredPosts.length > 0 || myPosts.length > 0) {
                    setCachedPosts(
                        activeSection.id === 'all-posts' ? filteredPosts : myPosts,
                        searchQuery ? `search_${searchQuery}` : activeSection.id === 'all-posts' ? currentCommunity : 'my-posts'
                    );
                }
            } catch (error) {
                console.error('Error loading more posts:', error.message);
                showToast('Failed to load more posts.');
                if (!activeSection || activeSection.id === 'all-posts') allPostsPage--;
                else if (activeSection.id === 'my-posts') myPostsPage--;
            } finally {
                isFetching = false;
                if (elements.loader) elements.loader.style.display = 'none';
            }
        }
    }, 200);

    function attachScrollListeners() {
        if (elements.postFeed) {
            validateScrollableContainer(elements.postFeed, 'post-feed');
            elements.postFeed.addEventListener('scroll', handleScroll);
        }
        if (elements.myPostsList) {
            validateScrollableContainer(elements.myPostsList, 'my-posts-list');
            elements.myPostsList.addEventListener('scroll', handleScroll);
        }
    }

    attachScrollListeners();

    // Post form submission
    if (elements.postForm) {
        elements.postForm.addEventListener('submit', async e => {
            e.preventDefault();
            const content = document.getElementById('post-content')?.value.trim();
            const community = document.getElementById('post-community')?.value;
            if (!content) {
                showToast('Content is required.');
                return;
            }
            if (!community) {
                showToast('Please select a community.');
                return;
            }
            try {
                let postData = { content: sanitizeHTML(content), community, authorId: currentUser.id };
                const characterTagMatch = content.match(/@Characters\s+(\w+)/i);
                if (characterTagMatch || community === '@Characters') {
                    const charId = characterTagMatch ? characterTagMatch[1] : currentUser.id;
                    const characterData = await fetchCharacterData(charId);
                    if (characterData && characterData.link) {
                        postData.authorId = charId;
                        postData.authorName = characterData.name || currentUser.user;
                        postData.authorPhoto = characterData.link;
                        if (community !== '@Characters') {
                            postData.community = '@Characters';
                        }
                    } else {
                        showToast('Character not found, posting as current user.');
                    }
                }
                const newPost = await window.firebaseAuth.sendWithFreshToken('/api/posts', {
                    method: 'POST',
                    body: JSON.stringify(postData)
                });
                filteredPosts.unshift({
                    id: newPost._id,
                    user: newPost.authorName || currentUser.user,
                    photo: newPost.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                    authorId: newPost.authorId,
                    community: newPost.community,
                    content: sanitizeHTML(newPost.content), // Strip HTML tags
                    image: newPost.image || null,
                    likes: newPost.likeCount || 0,
                    likedBy: newPost.likedBy || [],
                    commentCount: newPost.commentCount || 0,
                    comments: [],
                    createdAt: new Date(newPost.createdAt),
                    viewCount: 0
                });
                notifications.push({
                    id: Date.now(),
                    message: `New post created in ${newPost.community}: ${sanitizeHTML(newPost.content).substring(0, 20)}...`, // Strip HTML tags
                    category: 'Posts',
                    time: new Date(),
                    read: false
                });
                localStorage.setItem('notifications', JSON.stringify(notifications));
                clearCache(newPost.community);
                updateNotificationCount();
                if (elements.successMessage) {
                    elements.successMessage.classList.remove('hidden');
                    setTimeout(() => elements.successMessage.classList.add('hidden'), 3000);
                }
                elements.postForm.reset();
                searchQuery = '';
                if (elements.searchBar) elements.searchBar.value = '';
                renderPosts();
                showSection('all-posts');
            } catch (error) {
                console.error('Error creating post:', error.message);
                showToast('Failed to create post.');
                if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
            }
        });
    }

    // Notifications
    function renderNotifications() {
        if (!elements.notificationList) return;
        elements.notificationList.innerHTML = '';
        if (notifications.length === 0) {
            elements.notificationList.innerHTML = '<div class="empty-state">No notifications to show.</div>';
            return;
        }
        const fragment = document.createDocumentFragment();
        notifications.forEach(notification => {
            const notificationDiv = document.createElement('div');
            notificationDiv.className = `notification ${notification.read ? 'read' : ''}`;
            notificationDiv.innerHTML = `
                <div class="notification-content">
                    <span class="category">${sanitizeHTML(notification.category)}</span>
                    <p>${sanitizeHTML(notification.message)}</p>
                    <span class="time">${formatTime(notification.time)}</span>
                </div>
                <div class="notification-actions">
                    <button class="notification-btn mark-read-btn ${notification.read ? 'disabled' : ''}" data-id="${notification.id}" ${notification.read ? 'disabled' : ''}>Mark as Read</button>
                    <button class="notification-btn delete-btn" data-id="${notification.id}">Delete</button>
                </div>
            `;
            fragment.appendChild(notificationDiv);
        });
        elements.notificationList.appendChild(fragment);
        elements.notificationList.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', () => markAsRead(parseInt(btn.getAttribute('data-id'), 10)));
        });
        elements.notificationList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteNotification(parseInt(btn.getAttribute('data-id'), 10)));
        });
    }

    function updateNotificationCount() {
        const unreadCount = notifications.filter(n => !n.read).length;
        elements.notificationCount.forEach(count => {
            count.textContent = unreadCount;
            count.classList.toggle('hidden', unreadCount === 0);
        });
    }

    function formatTime(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffMins = Math.round(diffMs / 1000 / 60);
        if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        const diffHours = Math.round(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        return new Date(date).toLocaleDateString();
    }

    window.markAsRead = function (id) {
        const notification = notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            localStorage.setItem('notifications', JSON.stringify(notifications));
            renderNotifications();
            updateNotificationCount();
        }
    };

    window.deleteNotification = function (id) {
        notifications = notifications.filter(n => n.id !== id);
        localStorage.setItem('notifications', JSON.stringify(notifications));
        renderNotifications();
        updateNotificationCount();
    };

    window.markAllAsRead = function () {
        notifications.forEach(n => n.read = true);
        localStorage.setItem('notifications', JSON.stringify(notifications));
        renderNotifications();
        updateNotificationCount();
    };

    window.clearAllNotifications = function () {
        notifications = [];
        localStorage.setItem('notifications', JSON.stringify(notifications));
        renderNotifications();
        updateNotificationCount();
    };

    // Show toast
    function showToast(msg) {
        const toast = document.createElement('div');
        toast.innerText = sanitizeHTML(msg); // Strip HTML tags
        toast.className = 'toast';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Show section
    function showSection(sectionId) {
        document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('active');
        const btn = document.querySelector(`.tab-btn[onclick="showSection('${sectionId}')"]`);
        if (btn) btn.classList.add('active');
        if (sectionId === 'my-posts') {
            fetchMyPosts();
        } else if (sectionId === 'all-posts') {
            renderPosts();
        } else if (sectionId === 'notifications') {
            renderNotifications();
        }
    }

    // Event listeners
    elements.logOutBtn.forEach(btn => btn.addEventListener('click', () => {
        const popup = document.getElementById('logout-popup');
        if (popup) {
            popup.style.display = 'flex';
            elements.userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
            elements.mobileNav.classList.remove('open');
        }
    }));

    elements.createPostBtn.forEach(btn => btn.addEventListener('click', e => {
        e.preventDefault();
        if (typeof postpop === 'function') postpop();
        elements.mobileNav.classList.remove('open');
        elements.userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
    }));

    elements.notificationsBtn.forEach(btn => btn.addEventListener('click', e => {
        e.preventDefault();
        if (typeof openNotifications === 'function') openNotifications();
        elements.mobileNav.classList.remove('open');
        elements.userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
    }));

    if (elements.confirmLogout) {
        elements.confirmLogout.addEventListener('click', () => window.firebaseAuth.logout());
    }
    if (elements.cancelLogout) {
        elements.cancelLogout.addEventListener('click', () => {
            const popup = document.getElementById('logout-popup');
            if (popup) popup.style.display = 'none';
        });
    }
    if (elements.closeNotification) {
        elements.closeNotification.addEventListener('click', () => {
            const notificationPopup = document.getElementById('login-notification');
            if (notificationPopup) notificationPopup.classList.remove('show');
        });
    }

    elements.communityNav.forEach(nav => {
        nav.addEventListener('click', e => {
            e.preventDefault();
            const dropdownId = nav.id.includes('mobile') ? 'mobile-community-dropdown' : 'desktop-community-dropdown';
            const dropdown = document.getElementById(dropdownId);
            if (dropdown) dropdown.classList.toggle('hidden');
        });
    });

    elements.communityDropdown.forEach(dropdown => {
        dropdown.addEventListener('click', async e => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                currentCommunity = e.target.getAttribute('data-filter') || 'all';
                allPostsPage = 1;
                filteredPosts = [];
                clearCache(currentCommunity);
                if (elements.loader) elements.loader.style.display = 'flex';
                try {
                    filteredPosts = await fetchPosts(currentCommunity);
                    renderPosts();
                } catch (error) {
                    console.error('Error loading community posts:', error.message);
                    showToast('Failed to load posts.');
                }
                if (elements.loader) elements.loader.style.display = 'none';
                elements.communityDropdown.forEach(dd => dd.classList.add('hidden'));
                elements.mobileNav.classList.remove('open');
            }
        });
    });

    if (elements.sidebarToggle) {
        elements.sidebarToggle.addEventListener('click', () => {
            if (elements.sidebar) {
                elements.sidebar.classList.toggle('collapsed');
                localStorage.setItem('sidebarCollapsed', elements.sidebar.classList.contains('collapsed'));
                elements.userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
                elements.sidebar.style.display = window.innerWidth > 768 ? 'flex' : 'none';
            }
        });
    }

    if (elements.sidebar) {
        if (localStorage.getItem('sidebarCollapsed') === 'true' && window.innerWidth > 768) {
            elements.sidebar.classList.add('collapsed');
        }
        elements.sidebar.style.display = window.innerWidth > 768 ? 'flex' : 'none';
    }

    window.addEventListener('resize', () => {
        if (elements.sidebar) {
            elements.sidebar.style.display = window.innerWidth > 768 ? 'flex' : 'none';
            elements.mobileNav.classList.remove('open');
        }
    });

    if (elements.mobileNavToggle && elements.mobileNav && elements.mobileNavClose) {
        elements.mobileNavToggle.addEventListener('click', () => {
            elements.mobileNav.classList.add('open');
            elements.userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
        });
        elements.mobileNavClose.addEventListener('click', () => {
            elements.mobileNav.classList.remove('open');
            elements.userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
        });
    }

    elements.userAvatars.forEach(avatar => {
        avatar.addEventListener('click', e => {
            e.stopPropagation();
            const dropdown = avatar.closest('.user-avatar')?.querySelector('.user-dropdown');
            if (dropdown) {
                elements.userDropdowns.forEach(dd => dd.classList.add('hidden'));
                dropdown.classList.toggle('hidden');
            }
        });
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.user-avatar')) {
            elements.userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
        }
    });

    // Dark/light mode
    let isDarkMode = localStorage.getItem('theme') !== 'light';
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('light-mode', !isDarkMode);
    elements.modeToggle.forEach(toggle => {
        toggle.innerHTML = isDarkMode
            ? '<i class="fas fa-moon"></i><span>Dark Mode</span>'
            : '<i class="fas fa-sun"></i><span>Light Mode</span>';
        toggle.addEventListener('click', () => {
            isDarkMode = !isDarkMode;
            document.body.classList.toggle('dark-mode', isDarkMode);
            document.body.classList.toggle('light-mode', !isDarkMode);
            elements.modeToggle.forEach(t => {
                t.innerHTML = isDarkMode
                    ? '<i class="fas fa-moon"></i><span>Dark Mode</span>'
                    : '<i class="fas fa-sun"></i><span>Light Mode</span>';
            });
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
            elements.mobileNav.classList.remove('open');
            elements.userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
        });
    });

    // Get unread notification count
    async function getUnreadNotificationCount(uid) {
        try {
            const headers = await window.firebaseAuth.Tokenheader();
            const res = await fetch(`/notify/number?uid=${encodeURIComponent(uid)}`, { headers });
            if (!res.ok) throw new Error(`Failed to fetch notification count: ${res.statusText}`);
            const data = await res.json();
            const countElements = [document.getElementById('mobile-countNot'), document.getElementById('desktop-countNot')];
            countElements.forEach(el => {
                if (el) el.textContent = data.unreadCount || 0;
            });
            return data.unreadCount || 0;
        } catch (err) {
            console.error('Failed to fetch unread notification count:', err.message);
            return 0;
        }
    }

    // Show login notification
    function showLoginNotification(count) {
        const notificationPopup = document.getElementById('login-notification');
        const notificationMessage = document.getElementById('login-notification-message');
        if (notificationPopup && notificationMessage) {
            notificationMessage.textContent = `Welcome back! You have ${count} unread notification${count === 1 ? '' : 's'}.`;
            notificationPopup.classList.add('show');
            setTimeout(() => notificationPopup.classList.remove('show'), 5000);
        }
    }

    // Initialize app
    async function initializeApp() {
        try {
            await waitForAuthState();
            if (elements.loader) elements.loader.style.display = 'flex';
            await fetchProfileData(currentUser.id);
            clearCache(currentCommunity);
            filteredPosts = await fetchPosts();
            renderPosts();
            updateNotificationCount();
            const count = await getUnreadNotificationCount(currentUser.id);
            if (count > 0) showLoginNotification(count);
        } catch (error) {
            console.error('Error initializing app:', error.message);
            showToast('Failed to initialize app. Please try again.');
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
        } finally {
            if (elements.loader) elements.loader.style.display = 'none';
        }
    }

    initializeApp();
});