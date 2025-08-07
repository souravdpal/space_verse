document.addEventListener('DOMContentLoaded', () => {
    console.log('post.js loaded at', new Date().toISOString());

    if (!window.firebaseAuth) {
        console.error('firebaseAuth.js not loaded');
        showToast('Authentication module not loaded', 'error');
        window.location.href = '/login';
        return;
    }

    // DOM Elements
    const quillEditor = document.getElementById('editor');
    const postBtn = document.getElementById('post-btn');
    const previewBtn = document.getElementById('preview-btn');
    const postImageInput = document.getElementById('post-image-input');
    const communitySelect = document.getElementById('community-select');
    const charCount = document.getElementById('char-count');
    const DEFAULT_AVATAR = 'https://ik.imagekit.io/souravdpal/default-avatar.png';
    let currentUser = { user: 'Unknown', id: null };

    // Validate DOM elements
    if (!quillEditor) console.error('Quill editor element (#editor) not found');
    if (!postBtn) console.error('Post button (#post-btn) not found');
    if (!charCount) console.error('Character count element (#char-count) not found');
    if (!communitySelect) console.error('Community select element (#community-select) not found');

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
            }, error => {
                unsubscribe();
                reject(error);
            });
        });
    }

    function initializeQuill(attempt = 1, maxAttempts = 3) {
        if (typeof Quill !== 'undefined' && quillEditor) {
            try {
                const quill = new Quill('#editor', {
                    theme: 'snow',
                    modules: {
                        toolbar: [['bold', 'italic', 'underline'], ['link', 'image'], [{ 'list': 'ordered' }, { 'list': 'bullet' }]],
                    },
                    placeholder: 'Write your post...',
                });
                console.log('Quill editor initialized successfully');
                return quill;
            } catch (error) {
                console.error('Failed to initialize Quill:', error.message);
                showToast('Failed to initialize text editor', 'error');
                return null;
            }
        } else if (attempt <= maxAttempts) {
            console.warn(`Quill library or editor element not loaded, retrying (${attempt}/${maxAttempts})...`);
            setTimeout(() => initializeQuill(attempt + 1, maxAttempts), 1000);
        } else {
            console.error('Quill library or editor element failed to load after', maxAttempts, 'attempts');
            showToast('Text editor unavailable. Please try again later.', 'error');
            return null;
        }
    }

    const quill = initializeQuill();
    if (!quill) {
        console.error('Quill initialization failed; post button will remain disabled');
        showToast('Text editor failed to load; posting unavailable', 'error');
        return;
    }

    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = message;
            toast.className = `toast show ${type}`;
            setTimeout(() => toast.className = 'toast', 3000);
        } else {
            console.error('Toast element not found');
        }
    }

    function showLoading(button, show) {
        if (button) {
            if (show) {
                button.disabled = true;
                button.innerHTML = '<span class="spinner inline"></span> Loading...';
            } else {
                button.disabled = false;
                button.innerHTML = button.id === 'post-btn' ? '<i class="ri-send-plane-fill"></i> Post' : 'Upload New Image';
            }
        }
    }

    async function uploadPostImage(file) {
        if (!currentUser.id) throw new Error('User not logged in');
        if (!file) throw new Error('No image selected');
        if (file.size > 10 * 1024 * 1024) {
            throw new Error('Image size exceeds 10MB limit; please choose a smaller file');
        }
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            throw new Error('Invalid file type; only JPEG, PNG, GIF, or WebP allowed');
        }
        const formData = new FormData();
        formData.append('image', file);
        try {
            console.log('Uploading post image', { fileName: file.name, size: file.size, type: file.type });
            const response = await window.firebaseAuth.sendWithFreshToken('/posts/image', {
                method: 'POST',
                headers: { 'X-User-ID': currentUser.id },
                body: formData
            });
            console.log('Post image uploaded:', response);
            return response.path;
        } catch (error) {
            console.error('Post image upload error:', error);
            throw error;
        }
    }

    async function createPost() {
        const content = quill.root.innerHTML;
        const community = communitySelect?.value;
        const fileInput = document.getElementById('post-image-input');
        const postButton = document.getElementById('post-btn');
        let imageUrl = null;

        console.log('createPost called', { contentLength: quill.getText().trim().length, community });

        if (!content || content === '<p><br></p>') {
            showToast('Post content is required', 'error');
            return;
        }
        if (!community) {
            showToast('Please select a community', 'error');
            return;
        }

        try {
            showLoading(postButton, true);
            if (fileInput && fileInput.files[0]) {
                try {
                    imageUrl = await uploadPostImage(fileInput.files[0]);
                } catch (error) {
                    showToast(error.message || 'Failed to upload post image', 'error');
                    return;
                }
            }

            const postData = { content, community, authorId: currentUser.id, image: imageUrl };
            console.log('Preparing post request', { postData, headers: { 'Content-Type': 'application/json', 'X-User-ID': currentUser.id } });

            const response = await window.firebaseAuth.sendWithFreshToken('/api/posts', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-User-ID': currentUser.id
                },
                body: JSON.stringify(postData)
            });

            console.log('Post created successfully:', response);
            showToast('Post created successfully', 'success');
            quill.setContents([]);
            if (fileInput) fileInput.value = '';
            const postImagePreview = document.getElementById('post-image-preview');
            if (postImagePreview) postImagePreview.classList.add('hidden');
            loadPosts();
        } catch (error) {
            console.error('Create post error:', error, { message: error.message, stack: error.stack });
            showToast(`Failed to create post: ${error.message}`, 'error');
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
        } finally {
            showLoading(postButton, false);
        }
    }

    // Update button state based on content and community
    function updatePostButtonState() {
        if (!quill || !postBtn || !communitySelect) {
            console.warn('Cannot update post button state; missing quill, postBtn, or communitySelect');
            return;
        }
        const text = quill.getText().trim();
        const community = communitySelect.value;
        const isValid = text.length > 0 && text.length <= 500 && community;
        console.log('Updating post button state', { textLength: text.length, community, isValid });
        postBtn.disabled = !isValid;
        if (charCount) {
            charCount.textContent = `${text.length}/500`;
            charCount.style.color = text.length > 500 ? '#dc3545' : '';
        }
    }

    // Attach text-change listener
    quill.on('text-change', () => {
        console.log('Quill text-change event fired', { rawTextLength: quill.getText().length, trimmedTextLength: quill.getText().trim().length });
        updatePostButtonState();
    });

    // Update on community change
    if (communitySelect) {
        communitySelect.addEventListener('change', () => {
            console.log('Community changed:', communitySelect.value);
            updatePostButtonState();
        });
    }

    // Initial state update
    setTimeout(() => {
        console.log('Initial post button state check');
        updatePostButtonState();
    }, 1000);

    if (postBtn) {
        postBtn.addEventListener('click', createPost);
    } else {
        console.error('Post button not found; cannot attach click listener');
    }

    async function loadUserProfile() {
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/cred?uid=${currentUser.id}`);
            if (response.msg === 'none') {
                window.firebaseAuth.logout();
                return;
            }
            const profileName = document.getElementById('profile-name');
            const profileBio = document.getElementById('profile-bio');
            const profileImg = document.getElementById('profile-img');
            const profileViewImage = document.getElementById('profile-view-image');
            if (profileName) profileName.textContent = response.name || 'Anonymous';
            if (profileBio) profileBio.textContent = response.bio || 'No bio available';
            if (profileImg) {
                profileImg.src = response.photo || DEFAULT_AVATAR;
                profileImg.onerror = () => { profileImg.src = DEFAULT_AVATAR; };
            }
            if (profileViewImage) {
                profileViewImage.src = response.path || DEFAULT_AVATAR;
            }
            console.log('User profile loaded:', response);
        } catch (error) {
            console.error('Error loading profile:', error);
            showToast('Failed to load profile', 'error');
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
        }
    }

    async function loadPosts() {
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/api/posts?authorId=${currentUser.id}`);
            const posts = response;
            const container = document.getElementById('posts-container');
            if (container) {
                container.innerHTML = '';
                container.classList.remove('loading');
                posts.forEach(post => {
                    const postElement = document.createElement('div');
                    postElement.className = 'post';
                    postElement.innerHTML = `
                        <div class="post-header">
                            <img src="${post.authorPhoto || DEFAULT_AVATAR}" alt="Author" class="post-author-img" onerror="this.src='${DEFAULT_AVATAR}'">
                            <div>
                                <h3>${post.authorName}</h3>
                                <p>${new Date(post.createdAt).toLocaleString()}</p>
                            </div>
                        </div>
                        <div class="post-content">${post.content}</div>
                        ${post.image ? `<img src="${post.image}" alt="Post Image" class="post-image" onerror="this.src='${DEFAULT_AVATAR}'">` : ''}
                        <div class="post-meta">
                            <span>${post.community}</span>
                            <span>${post.likeCount} Likes</span>
                            <span class="comment-toggle" data-post-id="${post._id}">View ${post.commentCount} Comments</span>
                        </div>
                        <div id="comments-${post._id}" class="comments hidden"></div>
                    `;
                    container.appendChild(postElement);
                    const commentToggle = postElement.querySelector(`.comment-toggle[data-post-id="${post._id}"]`);
                    if (commentToggle) {
                        commentToggle.addEventListener('click', () => {
                            const commentsContainer = document.getElementById(`comments-${post._id}`);
                            if (commentsContainer) {
                                if (commentsContainer.classList.contains('hidden')) {
                                    commentsContainer.classList.remove('hidden');
                                    loadComments(post._id);
                                } else {
                                    commentsContainer.classList.add('hidden');
                                    commentsContainer.innerHTML = '';
                                }
                            }
                        });
                    }
                });
            }
        } catch (error) {
            console.error('Load posts error:', error);
            showToast('Failed to load posts', 'error');
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
        }
    }

    async function loadComments(postId) {
        try {
            const response = await window.firebaseAuth.sendWithFreshToken('/com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: postId })
            });
            const comments = response;
            const commentsContainer = document.getElementById(`comments-${postId}`);
            if (!commentsContainer) return;
            commentsContainer.innerHTML = '';
            comments.forEach((comment, index) => {
                const commentElement = document.createElement('div');
                commentElement.className = 'comment';
                commentElement.style.animationDelay = `${index * 0.1}s`;
                commentElement.innerHTML = `
                    <div class="comment-header">
                        <img src="${comment.authorPhoto || DEFAULT_AVATAR}" alt="Author" class="comment-author-img" onerror="this.src='${DEFAULT_AVATAR}'">
                        <div>
                            <h4>${comment.authorName}</h4>
                            <p class="comment-meta">${new Date(comment.createdAt).toLocaleString()}</p>
                        </div>
                    </div>
                    <div class="comment-content">${comment.content}</div>
                    <div class="comment-meta">${comment.likes || 0} Likes</div>
                `;
                commentsContainer.appendChild(commentElement);
            });
        } catch (error) {
            console.error('Load comments error:', error);
            showToast('Failed to load comments', 'error');
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
        }
    }

    async function updateProfileImage() {
        const fileInput = document.getElementById('profile-image-input-modal');
        const file = fileInput?.files?.[0];
        const uploadButton = document.getElementById('upload-profile-image');
        if (!currentUser.id) {
            showToast('User not logged in', 'error');
            window.location.href = '/login';
            return;
        }
        if (!file) {
            showToast('Please select an image to upload', 'error');
            console.error('No file selected for profile image upload');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('Image size exceeds 10MB limit; please choose a smaller file', 'error');
            console.error('File size too large:', file.size);
            return;
        }
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showToast('Invalid file type; only JPEG, PNG, GIF, or WebP allowed', 'error');
            console.error('Invalid file type:', file.type);
            return;
        }
        const formData = new FormData();
        formData.append('image', file);
        try {
            showLoading(uploadButton, true);
            console.log('Uploading profile image', { fileName: file.name, size: file.size, type: file.type });
            const response = await window.firebaseAuth.sendWithFreshToken('/user/img', {
                method: 'POST',
                headers: { 'X-User-ID': currentUser.id },
                body: formData
            });
            console.log('Profile image uploaded:', response);
            const profileImg = document.getElementById('profile-img');
            const profileViewImage = document.getElementById('profile-view-image');
            if (profileImg) {
                profileImg.src = response.path || DEFAULT_AVATAR;
                profileImg.onerror = () => { profileImg.src = DEFAULT_AVATAR; };
            }
            if (profileViewImage) {
                profileViewImage.src = response.path || DEFAULT_AVATAR;
            }
            showToast('Profile image updated successfully', 'success');
            closeModal('profile-modal');
        } catch (error) {
            console.error('Upload error:', error);
            showToast(`Failed to upload profile image: ${error.message}`, 'error');
            if (error.message.includes('Unauthorized')) window.firebaseAuth.logout();
        } finally {
            showLoading(uploadButton, false);
            if (fileInput) fileInput.value = '';
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            modal.scrollTop = 0;
            console.log(`Modal ${modalId} closed`);
        } else {
            console.error(`Modal ${modalId} not found`);
        }
    }

    // Event listeners for profile image and modals
    const profileImg = document.getElementById('profile-img');
    const profileImageInput = document.getElementById('profile-image-input');
    const profileImageInputModal = document.getElementById('profile-image-input-modal');
    const uploadProfileImage = document.getElementById('upload-profile-image');
    const cancelUpload = document.getElementById('cancel-upload');
    const closeProfileModal = document.getElementById('close-profile-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const profileViewImage = document.getElementById('profile-view-image');
    const themeToggle = document.getElementById('theme-toggle');

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            document.body.classList.toggle('light-mode');
            const icon = themeToggle.querySelector('i');
            if (icon) icon.className = document.body.classList.contains('dark-mode') ? 'ri-moon-line' : 'ri-sun-line';
            console.log('Theme toggled:', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
    }

    if (profileImg && profileImageInput) {
        profileImg.addEventListener('click', () => {
            console.log('Profile image clicked, triggering file input');
            profileImageInput.click();
        });
    }

    if (profileImageInput) {
        profileImageInput.addEventListener('change', (event) => {
            console.log('Profile image input changed', { files: event.target.files });
            const modal = document.getElementById('profile-modal');
            const preview = document.getElementById('profile-image-preview-modal');
            const file = event.target.files[0];
            if (file && modal && preview && profileImageInputModal) {
                if (file.size > 10 * 1024 * 1024) {
                    showToast('Image size exceeds 10MB limit; please choose a smaller file', 'error');
                    profileImageInput.value = '';
                    preview.src = '';
                    preview.classList.add('hidden');
                    return;
                }
                const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                if (!validTypes.includes(file.type)) {
                    showToast('Invalid file type; only JPEG, PNG, GIF, or WebP allowed', 'error');
                    profileImageInput.value = '';
                    preview.src = '';
                    preview.classList.add('hidden');
                    return;
                }
                const objectURL = URL.createObjectURL(file);
                preview.src = objectURL;
                preview.classList.remove('hidden');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                profileImageInputModal.files = dataTransfer.files;
                modal.style.display = 'flex';
                modal.setAttribute('aria-hidden', 'false');
                console.log('Profile modal opened with preview:', objectURL);
            } else {
                console.error('Profile modal, preview, or modal input not found, or no file selected');
                showToast('Failed to open profile image modal', 'error');
            }
        });
    }

    if (profileImageInputModal) {
        profileImageInputModal.addEventListener('change', (event) => {
            console.log('Modal image input changed', { files: event.target.files });
            const preview = document.getElementById('profile-image-preview-modal');
            const file = event.target.files[0];
            if (file && preview) {
                if (file.size > 10 * 1024 * 1024) {
                    showToast('Image size exceeds 10MB limit; please choose a smaller file', 'error');
                    profileImageInputModal.value = '';
                    preview.src = '';
                    preview.classList.add('hidden');
                    return;
                }
                const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                if (!validTypes.includes(file.type)) {
                    showToast('Invalid file type; only JPEG, PNG, GIF, or WebP allowed', 'error');
                    profileImageInputModal.value = '';
                    preview.src = '';
                    preview.classList.add('hidden');
                    return;
                }
                preview.src = URL.createObjectURL(file);
                preview.classList.remove('hidden');
                console.log('Modal image preview updated:', preview.src);
            } else {
                console.error('No file selected or preview not found');
                showToast('No image selected in modal', 'error');
            }
        });
    }

    if (uploadProfileImage) {
        uploadProfileImage.addEventListener('click', updateProfileImage);
    }

    if (cancelUpload) {
        cancelUpload.addEventListener('click', () => {
            closeModal('profile-modal');
            if (profileImageInput) profileImageInput.value = '';
            if (profileImageInputModal) profileImageInputModal.value = '';
            const preview = document.getElementById('profile-image-preview-modal');
            if (preview) {
                preview.src = '';
                preview.classList.add('hidden');
            }
            console.log('Profile image upload cancelled');
        });
    }

    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => {
            closeModal('profile-modal');
            if (profileImageInput) profileImageInput.value = '';
            if (profileImageInputModal) profileImageInputModal.value = '';
            const preview = document.getElementById('profile-image-preview-modal');
            if (preview) {
                preview.src = '';
                preview.classList.add('hidden');
            }
            console.log('Profile modal closed');
        });
    }

    if (postImageInput) {
        postImageInput.addEventListener('change', () => {
            const file = postImageInput.files[0];
            const preview = document.getElementById('post-image-preview');
            if (file && preview) {
                if (file.size > 10 * 1024 * 1024) {
                    showToast('Image size exceeds 10MB limit; please choose a smaller file', 'error');
                    postImageInput.value = '';
                    preview.src = '';
                    preview.classList.add('hidden');
                    return;
                }
                const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                if (!validTypes.includes(file.type)) {
                    showToast('Invalid file type; only JPEG, PNG, GIF, or WebP allowed', 'error');
                    postImageInput.value = '';
                    preview.src = '';
                    preview.classList.add('hidden');
                    return;
                }
                preview.src = URL.createObjectURL(file);
                preview.classList.remove('hidden');
                console.log('Post image preview updated:', preview.src);
            } else if (preview) {
                preview.src = '';
                preview.classList.add('hidden');
            }
        });
    }

    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            const content = quill.root.innerHTML;
            const image = document.getElementById('post-image-preview')?.src;
            const previewContent = document.getElementById('preview-content');
            const previewImage = document.getElementById('preview-image');
            const previewModal = document.getElementById('preview-modal');
            if (previewContent && previewModal) {
                previewContent.innerHTML = content;
                if (previewImage && image && !document.getElementById('post-image-preview').classList.contains('hidden')) {
                    previewImage.src = image;
                    previewImage.classList.remove('hidden');
                } else if (previewImage) {
                    previewImage.src = '';
                    previewImage.classList.add('hidden');
                }
                previewModal.style.display = 'flex';
                previewModal.setAttribute('aria-hidden', 'false');
                console.log('Post preview modal opened');
            } else {
                console.error('Preview modal or content not found');
                showToast('Failed to open post preview', 'error');
            }
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            closeModal('preview-modal');
            const previewContent = document.getElementById('preview-content');
            const previewImage = document.getElementById('preview-image');
            if (previewContent) previewContent.innerHTML = '';
            if (previewImage) {
                previewImage.src = '';
                previewImage.classList.add('hidden');
            }
            console.log('Post preview modal closed');
        });
    }

    if (profileViewImage) {
        profileViewImage.addEventListener('click', () => {
            const imageSrc = document.getElementById('profile-image-preview-modal')?.src;
            if (imageSrc && imageSrc !== window.location.href) {
                window.open(imageSrc, '_blank');
                console.log('Opening profile image in new tab:', imageSrc);
            } else {
                console.error('No valid image source for profile view');
                showToast('No image to view', 'error');
            }
        });
    }

    async function initializeApp() {
        try {
            await waitForAuthState();
            console.log('Authentication state resolved, initializing app for user:', currentUser);
            await loadUserProfile();
            await loadPosts();
            updatePostButtonState();
        } catch (error) {
            console.error('Error initializing app:', error);
            showToast('Failed to initialize app', 'error');
            window.firebaseAuth.logout();
        }
    }

    initializeApp();
});