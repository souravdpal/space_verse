const firebaseConfig = {
    apiKey: "AIzaSyA3_Otys41HjaAnDG8f2jFuzzuUJTiF-Po",
    authDomain: "store-work-10c7d.firebaseapp.com",
    projectId: "store-work-10c7d",
    storageBucket: "store-work-10c7d.firebasestorage.app",
    messagingSenderId: "364380068504",
    appId: "1:364380068504:web:fe303c05a95bb777b6ceed",
    measurementId: "G-DSG9XHW38R",
};
firebase.initializeApp(firebaseConfig);
if(localStorage.getItem('id')==undefined){
    window.location.href('/login')
}
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

// Character count and post button control
const charLimit = 500;
quill.on('text-change', () => {
    const text = quill.getText().trim();
    const charCount = text.length;
    const charCountElement = document.getElementById('char-count');
    charCountElement.textContent = `${charCount}/${charLimit}`;
    const postButton = document.getElementById('post-btn');
    if (charCount === 0 || charCount > charLimit) {
        charCountElement.style.color = '#ef4444';
        postButton.disabled = true;
        postButton.style.opacity = '0.5';
        postButton.style.cursor = 'not-allowed';
    } else {
        charCountElement.style.color = '';
        postButton.disabled = false;
        postButton.style.opacity = '1';
        postButton.style.cursor = 'pointer';
    }
});

// Theme toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
    const icon = document.querySelector('#theme-toggle i');
    icon.className = document.body.classList.contains('dark-mode') ? 'ri-sun-line' : 'ri-moon-line';
    document.getElementById('current-bio').style.color = document.body.classList.contains('dark-mode') ? '#94a3b8' : '#4b5563';
});

// Get Firebase UID
function getCurrentUserUid() {
    return new Promise((resolve) => {
        firebase.auth().onAuthStateChanged((user) => {
            resolve(user ? user.uid : null);
        });
    });
}

// Get Firebase ID token
function getAuthToken() {
    return new Promise((resolve, reject) => {
        const user = firebase.auth().currentUser;
        if (user) {
            user.getIdToken().then(resolve).catch(reject);
        } else {
            resolve(null);
        }
    });
}

// Utility function to normalize image URLs
function getImageUrl(path) {
    if (path && (path.startsWith('/userimage/uploads/') || path.startsWith('/postimage/uploads/'))) {
        return `/api${path}`;
    }
    return path || '/images/default-avatar.png';
}

// Fetch user data
async function fetchUserData(uid) {
    try {
        const res = await fetch(`/cred?uid=${uid}`);
        if (!res.ok) throw new Error(`Failed to fetch user data: ${res.statusText}`);
        const data = await res.json();
        if (data.msg === 'none') {
            throw new Error('User not found');
        }
        return {
            photo: getImageUrl(data.photo),
            name: data.name || 'Guest',
            bio: data.bio || 'Not set',
            status: data.status || 'Offline',
            followers: data.followers || 0,
        };
    } catch (error) {
        console.error('Error fetching user data:', error);
        showToast('Failed to load user data.');
        return null;
    }
}

// Fetch posts
async function fetchPosts() {
    const token = await getAuthToken();
    const uid = await getCurrentUserUid();
    const localStorageId = localStorage.getItem('id');
    if (!token || !uid || !localStorageId) {
        showToast('Please log in to view your posts.');
        window.location.href = '/login';
        return;
    }
    try {
        const res = await fetch(`/api/posts?limit=10&page=1`, {
            headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': uid },
        });
        if (!res.ok) throw new Error(`Failed to fetch posts: ${res.statusText}`);
        const posts = await res.json();
        const container = document.getElementById('posts-container');
        container.innerHTML = '';
        container.classList.remove('loading');
        const filteredPosts = posts.filter(post => post.authorId === localStorageId);
        if (filteredPosts.length === 0) {
            container.innerHTML = '<p class="text-center">No posts yet. Create one above!</p>';
            return;
        }
        filteredPosts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post-card';
            const imageHtml = post.image ? `<img src="${getImageUrl(post.image)}" alt="Post Image" class="post-image" onerror="this.src='/images/default-avatar.png';">` : '';
            postElement.innerHTML = `
                <div class="post-header">
                    <img src="${getImageUrl(post.authorPhoto)}" alt="Author" onerror="this.src='/images/default-avatar.png';">
                    <div>
                        <h3>${post.authorName}</h3>
                        <p class="text-sm">${new Date(post.createdAt).toLocaleString()}</p>
                        <p class="text-sm">${post.community}</p>
                    </div>
                </div>
                ${imageHtml}
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
        container.classList.remove('loading');
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
        if (!res.ok) throw new Error(`Failed to fetch comments: ${res.statusText}`);
        const comments = await res.json();
        const commentsContainer = document.getElementById(`comments-${postId}`);
        commentsContainer.innerHTML = '';
        const uid = await getCurrentUserUid();
        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.innerHTML = `
                <div class="comment-header">
                    <img src="${getImageUrl(comment.authorPhoto)}" alt="Author" onerror="this.src='/images/default-avatar.png';">
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

// Update bio
async function updateBio() {
    const token = await getAuthToken();
    const uid = await getCurrentUserUid();
    if (!token || !uid) {
        showToast('Please log in to update your bio.');
        window.location.href = '/login';
        return;
    }
    const bioInput = document.getElementById('bio-input');
    const bio = bioInput.value.trim();
    if (!bio) {
        showToast('Bio cannot be empty.');
        return;
    }
    try {
        const res = await fetch('/api/user/bio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-user-id': uid,
            },
            body: JSON.stringify({ bio }),
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to update bio');
        }
        const data = await res.json();
        document.getElementById('current-bio').textContent = `Current Bio: ${data.bio}`;
        document.getElementById('pro-bio').textContent = `Bio: ${data.bio}`;
        showToast('Bio updated successfully!');
        bioInput.value = '';
    } catch (error) {
        console.error('Error updating bio:', error);
        showToast('Failed to update bio.');
    }
}

// Update profile image
async function updateProfileImage() {
    const token = await getAuthToken();
    const uid = await getCurrentUserUid();
    if (!token || !uid) {
        showToast('Please log in to update profile image.');
        window.location.href = '/login';
        return;
    }
    const fileInput = document.getElementById('profile-image-input-modal');
    const file = fileInput.files[0];
    if (!file) {
        showToast('Please select an image.');
        return;
    }
    const formData = new FormData();
    formData.append('image', file);
    try {
        const res = await fetch('/api/user/img', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-user-id': uid,
            },
            body: formData,
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error('Profile image upload failed:', { status: res.status, response: errorText });
            if (res.status === 404) {
                throw new Error('Profile image endpoint not found. Please check server configuration.');
            }
            const error = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Failed to upload image: ${res.statusText}`);
        }
        const data = await res.json();
        const imagePath = getImageUrl(data.path);
        document.getElementById('profile-img').src = imagePath;
        document.getElementById('profile-view-image').src = imagePath;
        document.getElementById('profile-image-preview-modal').src = '';
        document.getElementById('profile-image-preview-modal').style.display = 'none';
        document.getElementById('profile-image-input-modal').value = '';
        document.getElementById('profile-modal').style.display = 'none';
        showToast('Profile image updated successfully!');
    } catch (error) {
        console.error('Error uploading profile image:', error.message);
        showToast(`Failed to update profile image: ${error.message}`);
    }
}

// Upload post image
async function uploadPostImage() {
    const token = await getAuthToken();
    const uid = await getCurrentUserUid();
    if (!token || !uid) {
        showToast('Please log in to upload an image.');
        window.location.href = '/login';
        return null;
    }
    const fileInput = document.getElementById('post-image-input');
    const file = fileInput.files[0];
    if (!file) {
        console.log('No file selected for upload');
        return null;
    }
    const formData = new FormData();
    formData.append('image', file);
    try {
        const res = await fetch('/api/posts/image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-user-id': uid,
            },
            body: formData,
        });
        const text = await res.text(); // Get raw response for debugging
        if (!res.ok) {
            console.error('Post image upload failed:', { status: res.status, response: text });
            throw new Error(`Failed to upload post image: ${res.status} ${text}`);
        }
        const data = JSON.parse(text); // Parse JSON after logging raw text
        console.log('Image upload response:', data);
        if (!data.path || !data.imageName) {
            throw new Error('Invalid server response: missing path or imageName');
        }
        return { path: data.path, imageName: data.imageName };
    } catch (error) {
        console.error('Error uploading post image:', error.message);
        showToast(`Failed to upload post image: ${error.message}`);
        return null;
    }
}

// Create post
document.getElementById('post-btn').addEventListener('click', async () => {
    const token = await getAuthToken();
    const uid = await getCurrentUserUid();
    if (!token || !uid) {
        showToast('Please log in to create a post.');
        window.location.href = '/login';
        return;
    }
    const content = quill.root.innerHTML;
    const text = quill.getText().trim();
    const community = document.getElementById('community-select').value;
    if (!text || text.length > charLimit) {
        showToast('Content is required and must be within 500 characters.');
        return;
    }
    const imageData = await uploadPostImage();
    if (!imageData && document.getElementById('post-image-input').files[0]) {
        showToast('Image upload failed, please try again.');
        return;
    }
    try {
        console.log('Creating post with data:', { content, community, authorId: uid, image: imageData?.path, imageName: imageData?.imageName });
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-user-id': uid,
            },
            body: JSON.stringify({
                content,
                community,
                authorId: uid,
                image: imageData ? imageData.path : null,
                imageName: imageData ? imageData.imageName : null
            }),
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || `Failed to create post: ${res.status}`);
        }
        const newPost = await res.json();
        console.log('Post created successfully:', newPost);
        quill.root.innerHTML = '';
        document.getElementById('post-image-input').value = '';
        document.getElementById('post-image-preview').src = '';
        document.getElementById('post-image-preview').style.display = 'none';
        showToast('Post created successfully!');
        await fetchPosts();
    } catch (error) {
        console.error('Error creating post:', error.message);
        showToast(`Error creating post: ${error.message}`);
    }
});

// Create post
document.getElementById('post-btn').addEventListener('click', async () => {
    const token = await getAuthToken();
    const uid = await getCurrentUserUid();
    if (!token || !uid) {
        showToast('Please log in to create a post.');
        window.location.href = '/login';
        return;
    }
    const content = quill.root.innerHTML;
    const text = quill.getText().trim();
    const community = document.getElementById('community-select').value;
    if (!text || text.length > charLimit) {
        showToast('Content is required and must be within 500 characters.');
        return;
    }
    const imageData = await uploadPostImage();
    if (!imageData && document.getElementById('post-image-input').files[0]) {
        showToast('Image upload failed, please try again.');
        return;
    }
    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-user-id': uid,
            },
            body: JSON.stringify({
                content,
                community,
                authorId: uid,
                image: imageData ? imageData.path : null,
                imageName: imageData ? imageData.imageName : null
            }),
        });
        if (res.ok) {
            const newPost = await res.json();
            quill.root.innerHTML = '';
            document.getElementById('post-image-input').value = '';
            document.getElementById('post-image-preview').src = '';
            document.getElementById('post-image-preview').style.display = 'none';
            showToast('Post created successfully!');
            // Refresh posts to show new post for all users
            await fetchPosts();
        } else {
            const error = await res.json();
            throw new Error(error.error || 'Failed to create post');
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
        const uid = await getCurrentUserUid();
        if (!token || !uid) {
            showToast('Please log in to like.');
            window.location.href = '/login';
            return;
        }
        try {
            const res = await fetch(`/api/${type}s/${id}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': uid,
                },
            });
            if (!res.ok) throw new Error(`Failed to like ${type}: ${res.statusText}`);
            const data = await res.json();
            btn.innerHTML = `<i class="ri-heart-line ${data.likedBy.includes(uid) ? 'liked' : ''}"></i> ${data[type === 'post' ? 'likeCount' : 'likes']}`;
            btn.dataset.liked = data.likedBy.includes(uid);
        } catch (error) {
            console.error(`Error liking ${type}:`, error);
            showToast(`Failed to like ${type}.`);
        }
    }
});

// Post preview
document.getElementById('preview-btn').addEventListener('click', () => {
    const content = quill.root.innerHTML;
    const fileInput = document.getElementById('post-image-input');
    const file = fileInput.files[0];
    const modal = document.getElementById('preview-modal');
    const previewContent = document.getElementById('preview-content');
    previewContent.innerHTML = content;
    if (file) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.className = 'post-image';
        img.style.marginBottom = '1rem';
        previewContent.insertBefore(img, previewContent.firstChild);
    }
    modal.style.display = 'flex';
});

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('preview-modal').style.display = 'none';
});

// Profile picture popup
function initializeProfilePopup(currentPhoto) {
    const modal = document.createElement('div');
    modal.id = 'profile-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content profile-modal-content">
            <span class="close-modal">&times;</span>
            <h2>Profile Image</h2>
            <div class="profile-image-view">
                <img id="profile-view-image" src="${getImageUrl(currentPhoto)}" alt="Profile Image" onerror="this.src='/images/default-avatar.png';">
            </div>
            <div class="profile-image-options">
                <button id="view-full-image">View Full Size</button>
                <input type="file" id="profile-image-input-modal" accept="image/*">
                <img id="profile-image-preview-modal" class="profile-image-preview" style="display: none;">
                <div class="profile-image-buttons">
                    <button id="upload-profile-image">Upload New Image</button>
                    <button id="cancel-upload">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const closeModal = document.querySelector('#profile-modal .close-modal');
    const fileInput = document.getElementById('profile-image-input-modal');
    const preview = document.getElementById('profile-image-preview-modal');
    const viewFullButton = document.getElementById('view-full-image');
    const uploadButton = document.getElementById('upload-profile-image');
    const cancelButton = document.getElementById('cancel-upload');

    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
        fileInput.value = '';
        preview.src = '';
        preview.style.display = 'none';
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) {
            preview.src = URL.createObjectURL(fileInput.files[0]);
            preview.style.display = 'block';
        } else {
            preview.src = '';
            preview.style.display = 'none';
        }
    });

    viewFullButton.addEventListener('click', () => {
        const img = document.getElementById('profile-view-image');
        window.open(img.src, '_blank');
    });

    uploadButton.addEventListener('click', async () => {
        if (fileInput.files[0]) {
            await updateProfileImage();
        } else {
            showToast('Please select an image.');
        }
    });

    cancelButton.addEventListener('click', () => {
        modal.style.display = 'none';
        fileInput.value = '';
        preview.src = '';
        preview.style.display = 'none';
    });

    document.getElementById('profile-img-container').addEventListener('click', () => {
        modal.style.display = 'flex';
    });
}

// Back to top
window.addEventListener('scroll', () => {
    const backToTop = document.getElementById('back-to-top');
    if (window.scrollY > 300) {
        backToTop.classList.add('visible');
    } else {
        backToTop.classList.remove('visible');
    }
});

document.getElementById('back-to-top').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Bio update initialization
function initializeBioUpdate(currentBio) {
    const bioSection = document.querySelector('.profile-info');
    const existingBioInputs = bioSection.querySelectorAll('#bio-input, .update-bio-btn');
    existingBioInputs.forEach(el => el.remove());
    const currentBioElement = document.createElement('p');
    currentBioElement.id = 'current-bio';
    currentBioElement.textContent = `Current Bio: ${currentBio}`;
    currentBioElement.style.marginTop = '0.5rem';
    currentBioElement.style.color = document.body.classList.contains('dark-mode') ? '#94a3b8' : '#4b5563';
    const bioInput = document.createElement('input');
    bioInput.id = 'bio-input';
    bioInput.type = 'text';
    bioInput.placeholder = 'Enter your new bio (max 100 chars)';
    bioInput.maxLength = 100;
    bioInput.className = 'bio-input';
    const updateBioBtn = document.createElement('button');
    updateBioBtn.textContent = 'Update Bio';
    updateBioBtn.className = 'update-bio-btn';
    updateBioBtn.addEventListener('click', updateBio);
    bioSection.appendChild(currentBioElement);
    bioSection.appendChild(bioInput);
    bioSection.appendChild(updateBioBtn);
}

// Post image input initialization
function initializePostImageInput() {
    const postOptions = document.querySelector('.post-options');
    const existingImageInputs = postOptions.querySelectorAll('.image-input-container');
    existingImageInputs.forEach(el => el.remove());
    const imageInputContainer = document.createElement('div');
    imageInputContainer.className = 'image-input-container';
    const imageInput = document.createElement('input');
    imageInput.id = 'post-image-input';
    imageInput.type = 'file';
    imageInput.accept = 'image/*';
    imageInput.className = 'image-input';
    const imagePreview = document.createElement('img');
    imagePreview.id = 'post-image-preview';
    imagePreview.className = 'image-preview';
    imagePreview.style.display = 'none';
    imageInput.addEventListener('change', () => {
        if (imageInput.files[0]) {
            imagePreview.src = URL.createObjectURL(imageInput.files[0]);
            imagePreview.style.display = 'block';
        } else {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
        }
    });
    imageInputContainer.appendChild(imageInput);
    imageInputContainer.appendChild(imagePreview);
    postOptions.insertBefore(imageInputContainer, document.getElementById('community-select'));
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
        metaViewport = document.createElement('meta');
        metaViewport.name = 'viewport';
        metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(metaViewport);
    }

    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            const uid = user.uid;
            const userData = await fetchUserData(uid);
            if (userData) {
                document.getElementById('profile-name').textContent = userData.name;
                document.getElementById('profile-status').innerHTML = `Status: <span class="status-indicator ${userData.status.toLowerCase()}"></span> ${userData.status}`;
                document.getElementById('profile-img').src = getImageUrl(userData.photo);
                initializeBioUpdate(userData.bio);
                initializePostImageInput();
                initializeProfilePopup(userData.photo);
                fetchPosts();
            } else {
                window.location.href = '/login';
            }
        } else {
            window.location.href = '/login';
        }
    });
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

// Show toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}