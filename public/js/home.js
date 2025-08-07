document.addEventListener('DOMContentLoaded', () => {
    // Diagnostic log to trace placeholder images
    console.log('Checking for placeholder images...');
    document.querySelectorAll('img').forEach(img => {
        if (img.src.includes('via.placeholder.com') || img.src.includes('api.dicebear.com')) {
            console.warn(`Found placeholder in img: ${img.src}`);
            img.src = 'https://ik.imagekit.io/souravdpal/default-avatar.png';
        }
    });

    // Ensure Firebase auth is loaded
    if (!window.firebaseAuth) {
        console.error('firebaseAuth.js not loaded');
        showToast('Authentication module not loaded');
        window.location.href = '/login';
        return;
    }

    // DOM Elements
    const postFeed = document.getElementById('post-feed');
    const myPostsList = document.getElementById('my-posts-list');
    const communityNav = document.querySelectorAll('#community-nav, #community-nav-mobile');
    const communityDropdown = document.querySelectorAll('#community-dropdown, #community-dropdown-mobile');
    const modeToggle = document.querySelectorAll('#mode-toggle, #mode-toggle-mobile');
    const userPhoto = document.querySelectorAll('#user-photo, #user-photo-mobile');
    const logOutBtn = document.querySelectorAll('#log-out, #log-out-mobile');
    const createPostBtn = document.querySelectorAll('#create-post, #create-post-mobile');
    const notificationsBtn = document.querySelectorAll('#notifications, #notifications-mobile');
    const notificationCount = document.querySelectorAll('#notification-count, #notification-count-mobile');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const loader = document.getElementById('loader');
    const mobileNavToggle = document.getElementById('mobile-nav-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    const mobileNavClose = document.getElementById('mobile-nav-close');
    const userAvatars = document.querySelectorAll('.user-avatar img');
    const userDropdowns = document.querySelectorAll('.user-dropdown');
    const postForm = document.getElementById('post-form');
    const successMessage = document.getElementById('success-message');
    const notificationList = document.getElementById('notification-list');

    // Current User
    let currentUser = {
        user: 'Unknown',
        id: null,
    };

    // State
    let filteredPosts = [];
    let myPosts = [];
    let isFetching = false;
    let allPostsPage = 1;
    let myPostsPage = 1;
    let currentCommunity = 'all';
    const commentVisibility = new Map();
    let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');

    // Wait for Firebase auth state to resolve
    async function waitForAuthState() {
        return new Promise((resolve, reject) => {
            const unsubscribe = firebase.auth().onAuthStateChanged(user => {
                unsubscribe(); // Unsubscribe after first call
                if (user) {
                    currentUser = {
                        user: user.displayName || 'Unknown',
                        id: user.uid,
                    };
                    resolve(user);
                } else {
                    reject(new Error('No authenticated user'));
                }
            }, error => {
                unsubscribe();
                reject(error);
            });
        });
    }

    // Notification Count Function
    async function getUnreadNotificationCount(uid) {
        try {
            const headers = await window.firebaseAuth.Tokenheader();
            const res = await fetch(`/notify/number?uid=${encodeURIComponent(uid)}`, { headers });
            if (!res.ok) throw new Error(`Failed to fetch notification count: ${res.statusText}`);
            const data = await res.json();
            console.log('Unread Count:', data.unreadCount);

            // Update all notification counters
            const countElements = [
                document.getElementById('mobile-countNot'),
                document.getElementById('desktop-countNot')
            ];
            countElements.forEach(el => {
                if (el) {
                    el.textContent = data.unreadCount || 0;
                }
            });
            return data.unreadCount || 0;
        } catch (err) {
            console.error('❌ Failed to fetch unread notification count:', err);
            return 0;
        }
    }

    // Show Login Notification
    function showLoginNotification(count) {
        const notificationPopup = document.getElementById('login-notification');
        const notificationMessage = document.getElementById('login-notification-message');
        if (notificationPopup && notificationMessage) {
            notificationMessage.textContent = `Welcome back! You have ${count} unread notification${count === 1 ? '' : 's'}.`;
            notificationPopup.classList.add('show');
            setTimeout(() => {
                notificationPopup.classList.remove('show');
            }, 5000);
        }
    }

    // Navigation Functions


    // Popup Functions
    function showLogoutPopup() {
        const popup = document.getElementById('logout-popup');
        if (popup) {
            popup.style.display = 'flex';
            hideAllDropdowns();
        }
    }


    // Dropdown and Menu Toggles
    function hideAllDropdowns() {
        document.querySelectorAll('.user-dropdown').forEach(dd => dd.classList.add('hidden'));
        document.querySelectorAll('#mobile-community-dropdown, #desktop-community-dropdown')
            .forEach(dd => dd.classList.add('hidden'));
    }

    // Fetch Profile Data
    async function fetchProfileData(id) {
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/cred?uid=${encodeURIComponent(id)}`);
            if (response.msg === 'none') {
                window.firebaseAuth.logout();
                return null;
            }

            let photoUrl = response.photo && response.photo.startsWith('https://ik.imagekit.io/souravdpal/')
                ? response.photo
                : 'https://ik.imagekit.io/souravdpal/default-avatar.png';

            userPhoto.forEach((img) => img.src = photoUrl);
            return { photo: photoUrl, name: response.name || 'Guest' };
        } catch (error) {
            console.error('Error fetching profile:', error);
            userPhoto.forEach((img) => img.src = 'https://ik.imagekit.io/souravdpal/default-avatar.png');
            if (error.message.includes('Unauthorized')) {
                window.firebaseAuth.logout();
            }
            return null;
        }
    }

    // Dark/Light Mode
    let isDarkMode = localStorage.getItem('theme') !== 'light';
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('light-mode', !isDarkMode);
    modeToggle.forEach((toggle) => {
        toggle.innerHTML = isDarkMode
            ? '<i class="fas fa-moon"></i><span>Dark Mode</span>'
            : '<i class="fas fa-sun"></i><span>Light Mode</span>';
        toggle.addEventListener('click', () => {
            isDarkMode = !isDarkMode;
            document.body.classList.toggle('dark-mode', isDarkMode);
            document.body.classList.toggle('light-mode', !isDarkMode);
            modeToggle.forEach((t) => {
                t.innerHTML = isDarkMode
                    ? '<i class="fas fa-moon"></i><span>Dark Mode</span>'
                    : '<i class="fas fa-sun"></i><span>Light Mode</span>';
            });
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
            mobileNav.classList.remove('open');
            userDropdowns.forEach((dropdown) => dropdown.classList.add('hidden'));
        });
    });

    // Sidebar and Mobile Nav
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
            userDropdowns.forEach((dropdown) => dropdown.classList.add('hidden'));
            sidebar.style.display = window.innerWidth > 768 ? 'flex' : 'none';
        });
    }

    if (sidebar) {
        if (localStorage.getItem('sidebarCollapsed') === 'true' && window.innerWidth > 768) {
            sidebar.classList.add('collapsed');
        }
        sidebar.style.display = window.innerWidth > 768 ? 'flex' : 'none';
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.style.display = 'flex';
            mobileNav.classList.remove('open');
        } else {
            sidebar.style.display = 'none';
        }
    });

    if (mobileNavToggle && mobileNav && mobileNavClose) {
        mobileNavToggle.addEventListener('click', () => {
            mobileNav.classList.add('open');
            userDropdowns.forEach((dropdown) => dropdown.classList.add('hidden'));
        });
        mobileNavClose.addEventListener('click', () => {
            mobileNav.classList.remove('open');
            userDropdowns.forEach((dropdown) => dropdown.classList.add('hidden'));
        });
    }

    userAvatars.forEach((avatar) => {
        avatar.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = avatar.closest('.user-avatar').querySelector('.user-dropdown');
            userDropdowns.forEach((dd) => dd.classList.add('hidden'));
            dropdown.classList.toggle('hidden');
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-avatar')) {
            userDropdowns.forEach((dropdown) => dropdown.classList.add('hidden'));
        }
    });

    // Community Dropdowns
    const communityNavs = [
        document.getElementById('mobile-community-nav'),
        document.getElementById('desktop-community-nav')
    ];

    communityNavs.forEach(nav => {
        if (nav) {
            nav.addEventListener('click', e => {
                e.preventDefault();
                const dropdownId = nav.id.includes('mobile') ? 'mobile-community-dropdown' : 'desktop-community-dropdown';
                const dropdown = document.getElementById(dropdownId);
                if (dropdown) {
                    dropdown.classList.toggle('hidden');
                }
            });
        }
    });

    communityDropdown.forEach((dropdown) => {
        dropdown.addEventListener('click', async (e) => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                currentCommunity = e.target.getAttribute('data-filter');
                allPostsPage = 1;
                loader.style.display = 'flex';
                try {
                    filteredPosts = await fetchPosts(currentCommunity);
                    renderPosts();
                } catch (error) {
                    showToast('Failed to load posts.');
                }
                loader.style.display = 'none';
                communityDropdown.forEach((dd) => dd.classList.add('hidden'));
                mobileNav.classList.remove('open');
            }
        });
    });

    // Show Section
    function showSection(sectionId) {
        document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');
        document.querySelector(`button[onclick="showSection('${sectionId}')"]`).classList.add('active');

        if (sectionId === 'my-posts') {
            fetchMyPosts();
        } else if (sectionId === 'all-posts') {
            renderPosts();
        } else if (sectionId === 'notifications') {
            renderNotifications();
        }
    }

    // Fetch Posts
    async function fetchPosts(community = 'all', page = 1) {
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/api/posts?limit=10&page=${page}&community=${encodeURIComponent(community)}`);
            return response.map(post => ({
                id: post._id,
                user: post.authorName,
                photo: post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                authorId: post.authorId,
                community: post.community,
                content: post.content,
                image: post.image || null,
                likes: post.likeCount,
                likedBy: post.likedBy || [],
                commentCount: post.commentCount,
                comments: [],
                createdAt: new Date(post.createdAt)
            }));
        } catch (error) {
            console.error('Error fetching posts:', error);
            if (error.message.includes('Unauthorized')) {
                window.firebaseAuth.logout();
            }
            return [];
        }
    }

    // Fetch My Posts
    async function fetchMyPosts(page = 1) {
        if (!myPostsList) {
            console.warn('my-posts-list element not found. Ensure home.html contains <div id="my-posts-list">');
            return;
        }
        myPostsList.innerHTML = '<div class="empty-state">Loading...</div>';
        try {
            const posts = await fetchPosts('all', page);
            myPosts = posts.filter(post => post.authorId === currentUser.id);
            renderMyPosts();
        } catch (error) {
            console.error('Error fetching my posts:', error);
            myPostsList.innerHTML = '<div class="empty-state">Failed to load posts.</div>';
        }
    }

    // Fetch Comments
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
                content: comment.content,
                likes: comment.likes || 0,
                likedBy: comment.likedBy || [],
                replyTo: comment.replyTo || null,
                community: comment.community,
                createdAt: new Date(comment.createdAt)
            }));
        } catch (error) {
            console.error('Error fetching comments:', error);
            if (error.message.includes('Unauthorized')) {
                window.firebaseAuth.logout();
            }
            return [];
        }
    }

    // Clean Comment Content
    function cleanCommentContent(content) {
        const tagPattern = /@(\w+)/g;
        const seenTags = new Set();
        let cleanedContent = content;
        cleanedContent = cleanedContent.replace(tagPattern, (match, username) => {
            if (seenTags.has(username)) return '';
            seenTags.add(username);
            return `@${username}`;
        });
        return cleanedContent.trim();
    }

    // Render Posts
    function renderPosts() {
        if (!postFeed) {
            console.warn('post-feed element not found. Ensure home.html contains <div id="post-feed">');
            return;
        }
        postFeed.innerHTML = '';
        if (filteredPosts.length === 0) {
            postFeed.innerHTML = '<div class="empty-state">No posts to show.</div>';
            return;
        }
        filteredPosts.forEach(post => postFeed.appendChild(createPostElement(post)));
    }

    // Render My Posts
    function renderMyPosts() {
        if (!myPostsList) {
            console.warn('my-posts-list element not found. Ensure home.html contains <div id="my-posts-list">');
            return;
        }
        myPostsList.innerHTML = '';
        if (myPosts.length === 0) {
            myPostsList.innerHTML = '<div class="empty-state">No posts to show.</div>';
            return;
        }
        myPosts.forEach(post => myPostsList.appendChild(createPostElement(post)));
    }

    // Create Post Element
    function createPostElement(post) {
        const isCurrentUser = currentUser.id === post.authorId;
        const postDiv = document.createElement('div');
        postDiv.className = 'post-card';
        const areCommentsVisible = commentVisibility.get(post.id) || false;
        postDiv.innerHTML = `
            <div class="flex items-start gap-4">
                <div class="profile-img">
                    <img loading="lazy" src="${post.photo}" alt="${post.user}'s profile image" onerror="this.src='https://ik.imagekit.io/souravdpal/default-avatar.png';">
                </div>
                <div class="flex-grow">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-semibold text-blue-600 text-sm">${post.user}</span>
                        <span class="text-gray-500 text-xs capitalize bg-gray-700 px-2 py-0.5 rounded-full">${post.community}</span>
                    </div>
                    <p class="text-gray-200 text-sm mb-2">${post.content}</p>
                    ${post.image ? `
                        <div class="post-image-container">
                            <img loading="lazy" src="${post.image}" alt="Post image" class="post-image" onerror="this.src='https://ik.imagekit.io/souravdpal/default-avatar.png';">
                        </div>
                    ` : ''}
                    <div class="flex gap-3 mb-3">
                        <button class="like-btn flex items-center gap-1 text-gray-400 text-sm ${post.likedBy.includes(currentUser.id) ? 'liked' : ''}" data-id="${post.id}" data-tooltip="Like">
                            <i class="fas fa-heart"></i>
                            <span>${post.likes}</span>
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

        const likeBtn = postDiv.querySelector('.like-btn');
        likeBtn.addEventListener('click', async () => {
            if (!currentUser.id) {
                window.location.href = '/login';
                return;
            }
            try {
                const response = await window.firebaseAuth.sendWithFreshToken(`/api/posts/${post.id}/like/${currentUser.id}`, {
                    method: 'POST'
                });
                post.likes = response.likeCount;
                post.likedBy = response.likedBy;
                renderPosts();
                renderMyPosts();
            } catch (error) {
                console.error('Error liking post:', error);
                showToast('Failed to like post.');
                if (error.message.includes('Unauthorized')) {
                    window.firebaseAuth.logout();
                }
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
                        console.error('Error adding comment:', error);
                        showToast('Failed to add comment.');
                        if (error.message.includes('Unauthorized')) {
                            window.firebaseAuth.logout();
                        }
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
                    <button class="close-modal bg-red-600 text-white py-1 px-3 rounded-lg mt-3 text-sm">Close</button>
                </div>
            `;
            document.body.appendChild(shareModal);
            shareModal.classList.add('open');
            shareModal.querySelector('[data-platform="copy"]').addEventListener('click', () => {
                navigator.clipboard.writeText(url).then(() => {
                    showToast('Link copied!');
                    shareModal.remove();
                });
            });
            shareModal.querySelector('[data-platform="twitter"]').addEventListener('click', () => {
                window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.content)}`, '_blank');
                shareModal.remove();
            });
            shareModal.querySelector('[data-platform="facebook"]').addEventListener('click', () => {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
                shareModal.remove();
            });
            shareModal.querySelector('.close-modal').addEventListener('click', () => shareModal.remove());
        });

        const commentsDiv = postDiv.querySelector('.comments');
        if (areCommentsVisible && post.comments.length > 0) {
            post.comments.forEach(comment => commentsDiv.appendChild(createCommentElement(comment, postDiv)));
        }

        const showAllCommentsBtn = postDiv.querySelector('.show-all-comments-btn');
        if (showAllCommentsBtn) {
            showAllCommentsBtn.addEventListener('click', async () => {
                const isVisible = commentVisibility.get(post.id) || false;
                if (!isVisible) {
                    post.comments = await fetchComments(post.id);
                }
                commentVisibility.set(post.id, !isVisible);
                renderPosts();
                renderMyPosts();
            });
        }

        return postDiv;
    }

    // Create Comment Element
    function createCommentElement(comment, postDiv) {
        const isCurrentUser = currentUser.id === comment.user;
        const commentDiv = document.createElement('div');
        commentDiv.className = `comment ${comment.replyTo ? 'reply' : ''}`;

        let displayContent = comment.content;
        let replyTag = '';
        if (comment.replyTo) {
            const tagPattern = new RegExp(`@${comment.replyTo}\\b`, 'i');
            if (tagPattern.test(comment.content)) {
                replyTag = `<span class="at-tag">@${comment.replyTo}</span>`;
                displayContent = comment.content.replace(tagPattern, '').trim();
            }
        }

        commentDiv.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="profile-img">
                    <img loading="lazy" src="${comment.photo}" alt="${comment.user}'s profile image" onerror="this.src='https://ik.imagekit.io/souravdpal/default-avatar.png';">
                </div>
                <div class="flex-grow">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-semibold text-blue-600 text-sm">${comment.user}</span>
                        <span class="text-gray-500 text-xs capitalize bg-gray-700 px-2 py-0.5 rounded-full">${comment.community}</span>
                    </div>
                    <p class="text-gray-200 text-sm mb-2">
                        ${replyTag}${displayContent ? `<span class="comment-content">${displayContent}</span>` : ''}
                    </p>
                    <div class="flex gap-4">
                        <button class="like-btn flex items-center gap-1 text-gray-400 text-sm ${comment.likedBy.includes(currentUser.id) ? 'liked' : ''}" data-id="${comment.id}" data-tooltip="Like">
                            <i class="fas fa-heart"></i>
                            <span>${comment.likes}</span>
                        </button>
                        <button class="reply-btn flex items-center gap-1 text-gray-400 text-sm" data-id="${comment.id}" data-user="${comment.user}" data-tooltip="Reply">
                            <i class="fas fa-reply"></i>
                            <span>Reply</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const likeBtn = commentDiv.querySelector('.like-btn');
        likeBtn.addEventListener('click', async () => {
            if (!currentUser.id) {
                window.location.href = '/login';
                return;
            }
            try {
                const response = await window.firebaseAuth.sendWithFreshToken(`/api/comments/${comment.id}/like`, {
                    method: 'POST'
                });
                comment.likes = response.likes;
                comment.likedBy = response.likedBy;
                renderPosts();
                renderMyPosts();
            } catch (error) {
                console.error('Error liking comment:', error);
                showToast('Failed to like comment.');
                if (error.message.includes('Unauthorized')) {
                    window.firebaseAuth.logout();
                }
            }
        });

        const replyBtn = commentDiv.querySelector('.reply-btn');
        replyBtn.addEventListener('click', () => {
            const username = replyBtn.getAttribute('data-user');
            const commentForm = postDiv.querySelector('.comment-form');
            const commentText = commentForm.querySelector('textarea');
            commentForm.classList.remove('hidden');
            commentText.value = `@${username} `;
            commentText.focus();
            commentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        return commentDiv;
    }

    // Handle Scroll
    function handleScroll() {
        if (isFetching) return;
        const activeSection = document.querySelector('.section.active');
        const list = activeSection.querySelector('.post-list');
        if (!list) return;
        const { scrollTop, scrollHeight, clientHeight } = list;
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            isFetching = true;
            loader.style.display = 'flex';
            if (activeSection.id === 'all-posts') {
                allPostsPage++;
                fetchPosts(currentCommunity, allPostsPage).then(newPosts => {
                    filteredPosts.push(...newPosts);
                    renderPosts();
                    loader.style.display = 'none';
                    isFetching = false;
                });
            } else if (activeSection.id === 'my-posts') {
                myPostsPage++;
                fetchMyPosts(myPostsPage).then(() => {
                    loader.style.display = 'none';
                    isFetching = false;
                });
            }
        }
    }

    if (postFeed) postFeed.addEventListener('scroll', handleScroll);
    if (myPostsList) myPostsList.addEventListener('scroll', handleScroll);

    // Post Form
    if (postForm) {
        postForm.addEventListener('submit', async (e) => {
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
                const newPost = await window.firebaseAuth.sendWithFreshToken('/api/posts', {
                    method: 'POST',
                    body: JSON.stringify({ content, community, authorId: currentUser.id })
                });
                filteredPosts.unshift({
                    id: newPost._id,
                    user: newPost.authorName,
                    photo: newPost.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
                    authorId: newPost.authorId,
                    community: newPost.community,
                    content: newPost.content,
                    image: newPost.image || null,
                    likes: newPost.likeCount,
                    likedBy: newPost.likedBy || [],
                    commentCount: newPost.commentCount,
                    comments: [],
                    createdAt: new Date(newPost.createdAt)
                });
                notifications.push({
                    id: Date.now(),
                    message: `New post created in ${community}: ${content.substring(0, 20)}...`,
                    category: 'Posts',
                    time: new Date(),
                    read: false
                });
                localStorage.setItem('notifications', JSON.stringify(notifications));
                updateNotificationCount();
                if (successMessage) {
                    successMessage.classList.remove('hidden');
                    setTimeout(() => successMessage.classList.add('hidden'), 3000);
                }
                postForm.reset();
                renderPosts();
                showSection('all-posts');
            } catch (error) {
                console.error('Error creating post:', error);
                showToast('Failed to create post.');
                if (error.message.includes('Unauthorized')) {
                    window.firebaseAuth.logout();
                }
            }
        });
    } else {
        console.warn('post-form element not found. Ensure home.html contains <form id="post-form"> with <textarea id="post-content"> and <select id="post-community">');
    }

    // Notifications
    function renderNotifications() {
        if (!notificationList) {
            console.warn('notification-list element not found. Ensure home.html contains <div id="notification-list">');
            return;
        }
        notificationList.innerHTML = '';
        if (notifications.length === 0) {
            notificationList.innerHTML = '<div class="empty-state">No notifications to show.</div>';
            return;
        }
        notifications.forEach(notification => {
            const notificationDiv = document.createElement('div');
            notificationDiv.className = `notification ${notification.read ? 'read' : ''}`;
            notificationDiv.innerHTML = `
                <div class="notification-content">
                    <span class="category">${notification.category}</span>
                    <p>${notification.message}</p>
                    <span class="time">${formatTime(notification.time)}</span>
                </div>
                <div class="notification-actions">
                    <button class="notification-btn mark-read-btn ${notification.read ? 'disabled' : ''}" 
                            onclick="markAsRead(${notification.id})" 
                            ${notification.read ? 'disabled' : ''}>
                        Mark as Read
                    </button>
                    <button class="notification-btn delete-btn" onclick="deleteNotification(${notification.id})">
                        Delete
                    </button>
                </div>
            `;
            notificationList.appendChild(notificationDiv);
        });
    }

    function updateNotificationCount() {
        const unreadCount = notifications.filter(n => !n.read).length;
        notificationCount.forEach(count => {
            count.textContent = unreadCount;
            count.classList.toggle('hidden', unreadCount === 0);
        });
    }

    function formatTime(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffMins = Math.round(diffMs / 1000 / 60);
        if (diffMins < 60) return `${diffMins} minutes ago`;
        const diffHours = Math.round(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hours ago`;
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

    // Show Toast
    function showToast(msg) {
        const toast = document.createElement('div');
        toast.innerText = msg;
        toast.className = 'toast';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Event Listeners
    logOutBtn.forEach(btn => btn.addEventListener('click', () => {
        showLogoutPopup();
        userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
        mobileNav.classList.remove('open');
    }));

    createPostBtn.forEach(btn => btn.addEventListener('click', (e) => {
        e.preventDefault();
        postpop();
        mobileNav.classList.remove('open');
        userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
    }));

    notificationsBtn.forEach(btn => btn.addEventListener('click', (e) => {
        e.preventDefault();
        openNotifications();
        mobileNav.classList.remove('open');
        userDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
    }));

    const confirmLogout = document.getElementById('confirm-logout');
    const cancelLogout = document.getElementById('cancel-logout');
    if (confirmLogout) {
        confirmLogout.addEventListener('click', () => window.firebaseAuth.logout());
    }
    if (cancelLogout) {
        cancelLogout.addEventListener('click', () => {
            const popup = document.getElementById('logout-popup');
            if (popup) {
                popup.style.display = 'none';
            }
        });
    }

    const closeNotification = document.getElementById('close-notification');
    if (closeNotification) {
        closeNotification.addEventListener('click', () => {
            const notificationPopup = document.getElementById('login-notification');
            if (notificationPopup) {
                notificationPopup.classList.remove('show');
            }
        });
    }

    // Mode Toggle
    document.querySelectorAll('#mobile-mode-toggle, #desktop-mode-toggle').forEach(button => {
        button.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const icon = button.querySelector('i');
            const text = button.querySelector('span');
            if (document.body.classList.contains('dark-mode')) {
                icon.classList.replace('fa-sun', 'fa-moon');
                text.textContent = 'Dark Mode';
            } else {
                icon.classList.replace('fa-moon', 'fa-sun');
                text.textContent = 'Light Mode';
            }
        });
    });

    // Initialize App
    async function initializeApp() {
        try {
            await waitForAuthState();
            console.log('Authentication state resolved, initializing app for user:', currentUser);
            await fetchProfileData(currentUser.id);
            loader.style.display = 'flex';
            try {
                filteredPosts = await fetchPosts();
                renderPosts();
                updateNotificationCount();
                getUnreadNotificationCount(currentUser.id).then(count => {
                    if (count > 0) {
                        showLoginNotification(count);
                    }
                });
            } catch (error) {
                console.error('Error initializing posts:', error);
                showToast('Failed to load posts.');
            }
            loader.style.display = 'none';
        } catch (error) {
            console.error('Error waiting for auth state:', error);
            // firebaseAuth.js handles redirect to /login for unauthenticated users
        }
    }

    initializeApp();
});