// Initialize Quill editor
const quill = new Quill('#editor', {
    theme: 'snow',
    modules: {
        toolbar: [
            ['bold', 'italic', 'underline'],
            ['link'],
            [{ list: 'ordered' }, { list: 'bullet' }],
        ],
    },
});

// Theme toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
    const icon = document.querySelector('#theme-toggle i');
    icon.className = document.body.classList.contains('dark-mode') ? 'ri-sun-line' : 'ri-moon-line';
});

// Get Firebase UID
function getCurrentUserUid() {
    return new Promise((resolve) => {
        firebase.auth().onAuthStateChanged((user) => {
            const storedId = localStorage.getItem('id');
            resolve(user && user.uid === storedId ? user.uid : null);
        });
    });
}

// Get Firebase ID token
function getAuthToken() {
    return new Promise((resolve, reject) => {
        const user = firebase.auth().currentUser;
        if (user && user.uid === localStorage.getItem('id')) {
            user.getIdToken().then(resolve).catch(reject);
        } else {
            resolve(null);
        }
    });
}

// Fetch posts dynamically
async function fetchPosts() {
    const token = await getAuthToken();
    if (!token) {
        showToast('Please log in to view posts.');
        window.location.href = '/login';
        return;
    }
    try {
        const res = await fetch('/api/posts?limit=10&page=1', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch posts');
        const posts = await res.json();
        const container = document.getElementById('posts-container');
        container.innerHTML = '';
        const uid = localStorage.getItem('id');
        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post-card';
            postElement.innerHTML = `
                <div class="post-header">
                    <img src="${post.authorPhoto || '/default-avatar.png'}" alt="Author">
                    <div>
                        <h3>${post.authorName}</h3>
                        <p class="text-sm">${new Date(post.createdAt).toLocaleString()}</p>
                        <p class="text-sm">${post.community}</p>
                    </div>
                </div>
                <div class="post-content">${post.content}</div>
                <div class="post-actions">
                    <button class="like-btn" data-id="${post._id}" data-liked="${post.likedBy.includes(uid)}">
                        <i class="ri-heart-line ${post.likedBy.includes(uid) ? 'liked' : ''}"></i> ${post.likeCount}
                    </button>
                    <button class="comment-btn" data-id="${post._id}"><i class="ri-chat-3-line"></i> ${post.commentCount}</button>
                </div>
                <div class="comments" id="comments-${post._id}"></div>
            `;
            container.appendChild(postElement);
            fetchComments(post._id);
        });
    } catch (error) {
        console.error('Error fetching posts:', error);
        showToast('Failed to load posts.');
    }
}

// Fetch comments
async function fetchComments(postId) {
    try {
        const res = await fetch('/com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: postId }),
        });
        if (!res.ok) throw new Error('Failed to fetch comments');
        const comments = await res.json();
        const commentsContainer = document.getElementById(`comments-${postId}`);
        commentsContainer.innerHTML = '';
        const uid = localStorage.getItem('id');
        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.innerHTML = `
                <div class="comment-header">
                    <img src="${comment.authorPhoto || '/default-avatar.png'}" alt="Author" style="width: 30px; height: 30px; border-radius: 50%;">
                    <div>
                        <h4>${comment.authorName}</h4>
                        <p class="text-xs">${new Date(comment.createdAt).toLocaleString()}</p>
                    </div>
                </div>
                <p>${comment.content}</p>
                <div class="comment-actions">
                    <button class="like-btn" data-id="${comment._id}" data-type="comment" data-liked="${comment.likedBy.includes(uid)}">
                        <i class="ri-heart-line ${comment.likedBy.includes(uid) ? 'liked' : ''}"></i> ${comment.likes}
                    </button>
                </div>
            `;
            commentsContainer.appendChild(commentElement);
        });
    } catch (error) {
        console.error('Error fetching comments:', error);
        showToast('Failed to load comments.');
    }
}

// Create post
document.getElementById('post-btn').addEventListener('click', async () => {
    const token = await getAuthToken();
    if (!token) {
        showToast('Please log in to create a post.');
        window.location.href = '/login';
        return;
    }
    const content = quill.root.innerHTML;
    const community = document.getElementById('community-select').value;
    if (!content) {
        showToast('Content is required.');
        return;
    }
    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ content, community }),
        });
        if (res.ok) {
            quill.root.innerHTML = '';
            showToast('Post created successfully!');
            fetchPosts();
        } else {
            const error = await res.json();
            showToast(error.error || 'Failed to create post.');
        }
    } catch (error) {
        console.error('Error creating post:', error);
        showToast('Error creating post.');
    }
});

// Like post/comment
document.addEventListener('click', async (e) => {
    if (e.target.closest('.like-btn')) {
        const btn = e.target.closest('.like-btn');
        const id = btn.dataset.id;
        const type = btn.dataset.type || 'post';
        const token = await getAuthToken();
        if (!token) {
            showToast('Please log in to like.');
            window.location.href = '/login';
            return;
        }
        try {
            const res = await fetch(`/api/${type}s/${id}/like`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to like');
            const data = await res.json();
            const uid = localStorage.getItem('id');
            btn.innerHTML = `<i class="ri-heart-line ${data.likedBy.includes(uid) ? 'liked' : ''}"></i> ${data[type === 'post' ? 'likeCount' : 'likes']}`;
            btn.dataset.liked = data.likedBy.includes(uid);
        } catch (error) {
            console.error(`Error liking ${type}:`, error);
            showToast(`Failed to like ${type}.`);
        }
    }
});

// Update profile image
async function updateProfileImage() {
    const token = await getAuthToken();
    if (!token) {
        showToast('Please log in to update profile image.');
        window.location.href = '/login';
        return;
    }

    const fileInput = document.getElementById('profile-image-input');
    const file = fileInput.files[0];
    if (!file) {
        showToast('Please select an image.');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
        const res = await fetch('/user/img', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to upload image');
        }

        const data = await res.json();
        document.getElementById('profile-img').src = data.path;
        showToast('Profile image updated successfully!');
    } catch (error) {
        console.error('Error uploading profile image:', error);
        showToast('Failed to update profile image.');
    }
}

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    firebase.auth().signOut().then(() => {
        localStorage.clear();
        window.location.href = '/login';
    }).catch((error) => {
        showToast('Logout failed: ' + error.message);
    });
});

// Show toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    firebase.auth().onAuthStateChanged((user) => {
        const storedId = localStorage.getItem('id');
        if (user && user.uid === storedId) {
            fetchPosts();
            // Initialize profile image upload
            const profileImgContainer = document.getElementById('profile-img-container');
            const fileInput = document.getElementById('profile-image-input');
            if (profileImgContainer && fileInput) {
                profileImgContainer.addEventListener('click', () => {
                    fileInput.click();
                });
                fileInput.addEventListener('change', () => {
                    if (fileInput.files.length > 0) {
                        updateProfileImage();
                    }
                });
            }
        } else {
            localStorage.removeItem('id');
            window.location.href = '/login';
        }
    });
    // Theme based on current time
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(Date.now() + istOffset);
    if (istTime.getUTCHours() >= 19 || istTime.getUTCHours() < 6) {
        document.body.classList.add('dark-mode');
        document.querySelector('#theme-toggle i').className = 'ri-sun-line';
    } else {
        document.body.classList.add('light-mode');
        document.querySelector('#theme-toggle i').className = 'ri-moon-line';
    }
});