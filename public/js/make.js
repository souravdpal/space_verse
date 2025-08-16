document.addEventListener('DOMContentLoaded', async () => {
    // Elements with IDs matching make.ejs
    const elements = {
        form: document.getElementById('characterForm'),
        createCharacterBtn: document.getElementById('create-character'),
        resetBtn: document.getElementById('reset'),
        imageUploadInput: document.getElementById('image-upload'),
        imagePreview: document.getElementById('image-preview'),
        removeImageBtn: document.getElementById('remove-image'),
        themeToggle: document.getElementById('theme-toggle-btn'),
        fullscreenToggle: document.getElementById('fullscreen-toggle-btn'),
        loaderOverlay: document.getElementById('loader'),
        tagsInput: document.getElementById('tags'),
        tagSuggestions: document.getElementById('tag-suggestions'),
        nameInput: document.getElementById('character-name'),
        backgroundInput: document.getElementById('character-background'),
        behaviorInput: document.getElementById('character-behavior'),
        relationshipsInput: document.getElementById('character-relationships'),
        firstLineInput: document.getElementById('first-line'),
        profileName: document.getElementById('profile-name')
    };
    // Check for missing elements
    const missingElements = Object.entries(elements)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
    if (missingElements.length > 0) {
        console.warn('Missing DOM elements:', missingElements.join(', '));
        showToast(`Warning: Some elements missing (${missingElements.join(', ')}). Some features may not work.`, 'warning');
    }

    // Check critical elements
    if (!elements.form || !elements.createCharacterBtn || !elements.loaderOverlay) {
        console.error('Critical elements missing:', {
            form: !!elements.form,
            createCharacterBtn: !!elements.createCharacterBtn,
            loaderOverlay: !!elements.loaderOverlay
        });
        showToast('Error: Critical page elements missing. Character creation disabled.');
        return;
    }

    // Toast utility
    function showToast(message, type = 'error') {
        const toast = document.getElementById('toast') || document.createElement('div');
        if (!toast.id) {
            toast.id = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function navigateTo(target) {
        const id = localStorage.getItem("id");
        if (!target || typeof target !== 'string') {
            console.error('Invalid navigation target:', target);
            showToast('Error: Invalid navigation target');
            return;
        }
        if (id) {
            setTimeout(() => {
                window.location.href = `${target}${encodeURIComponent(id)}`;
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

    // Reset form
    function resetForm() {
        if (elements.createCharacterBtn) {
            elements.createCharacterBtn.disabled = false;
            elements.createCharacterBtn.classList.remove('loading');
        }
        if (elements.loaderOverlay) {
            elements.loaderOverlay.classList.remove('active');
        }

        try {
            // Validate form element
            if (elements.form && elements.form instanceof HTMLFormElement) {
                elements.form.reset();
            } else {
                console.warn('Cannot reset form: not a valid form element, clearing inputs manually');
                if (elements.nameInput) elements.nameInput.value = '';
                if (elements.backgroundInput) elements.backgroundInput.value = '';
                if (elements.behaviorInput) elements.behaviorInput.value = '';
                if (elements.relationshipsInput) elements.relationshipsInput.value = '';
                if (elements.firstLineInput) elements.firstLineInput.value = '';
                if (elements.tagsInput) elements.tagsInput.value = '';
            }
            if (elements.imagePreview) {
                elements.imagePreview.innerHTML = '';
                elements.imagePreview.style.display = 'none';
            }
            if (elements.removeImageBtn) elements.removeImageBtn.style.display = 'none';
            if (elements.imageUploadInput) elements.imageUploadInput.value = '';
            if (elements.tagSuggestions) {
                elements.tagSuggestions.innerHTML = '';
                elements.tagSuggestions.style.display = 'none';
            }
            showToast('Form reset successfully', 'success');
        } catch (error) {
            console.error('Error resetting form:', error);
            showToast('Failed to reset form');
        }
    }

    // Upload image
    async function uploadImage(file, charId) {
        if (!file) return null;
        const formData = new FormData();
        formData.append('image', file);
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/char/${charId}/img`, {
                method: 'POST',
                body: formData
            });
            console.log('Image uploaded:', response);
            return response.path;
        } catch (error) {
            console.error('Error uploading image:', error);
            showToast('Failed to upload image: ' + error.message);
            return null;
        }
    }

    // Create character
    async function createCharacter(attempt = 1, maxAttempts = 3) {
        if (!elements.form || !elements.createCharacterBtn || !elements.loaderOverlay) return;

        // Validate form inputs
        if (!elements.nameInput || !elements.nameInput.value.trim()) {
            showToast('Character name is required');
            return;
        }

        elements.createCharacterBtn.disabled = true;
        elements.createCharacterBtn.classList.add('loading');
        elements.loaderOverlay.classList.add('active');

        try {
            const charId = `${ window.idget()||Date.now().toString()}-${Math.random().toString(36).slice(2, 10)}`;
            const formData = new FormData();
            formData.append('name', elements.nameInput.value.trim());
            formData.append('background', elements.backgroundInput?.value.trim() || '');
            formData.append('behavior', elements.behaviorInput?.value.trim() || '');
            formData.append('relationships', elements.relationshipsInput?.value.trim() || '');
            formData.append('tags', elements.tagsInput?.value.trim() || '');
            formData.append('firstLine', elements.firstLineInput?.value.trim() || '');
            formData.append('creatorId', localStorage.getItem('id') || '');
            formData.append('creator', localStorage.getItem('user') || 'Unknown');

            // Handle image upload separately
            if (elements.imageUploadInput && elements.imageUploadInput.files[0]) {
                const imageUrl = await uploadImage(elements.imageUploadInput.files[0], charId);
                if (imageUrl) {
                    formData.append('image', imageUrl);
                }
            }

            const response = await window.firebaseAuth.sendWithFreshToken(`/char/uploads/${charId}`, {
                method: 'POST',
                body: formData
            });

            showToast('Character created successfully', 'success');
            resetForm();
            setTimeout(() => navigateTo('/dis/u/'), 1000);
        } catch (error) {
            console.error(`Error creating character (attempt ${attempt}):`, error);
            if (attempt < maxAttempts) {
                console.log(`Retrying createCharacter (attempt ${attempt + 1})`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                return createCharacter(attempt + 1, maxAttempts);
            }
            showToast(`Failed to create character: ${error.message}`);
            resetForm();
        }
    }

    // Initialize user data
    async function initializeUserData() {
        const uid = localStorage.getItem('id');
        const token = localStorage.getItem('authToken');
        if (!uid || !token) {
            console.warn('No user ID or token found');
            showToast('No user data found. Redirecting to login.');
            window.location.href = '/login.html';
            return;
        }
        try {
            const response = await window.firebaseAuth.sendWithFreshToken(`/cred?uid=${encodeURIComponent(uid)}`);
            if (response.msg === 'none') {
                showToast('User data not found. Redirecting to login.');
                window.location.href = '/login.html';
                return;
            }
            if (elements.profileName) {
                elements.profileName.textContent = response.name || 'Guest';
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            showToast('Failed to load user data. Redirecting to login.');
            window.location.href = '/login.html';
        }
    }

    // Event listeners
    if (elements.createCharacterBtn) {
        elements.createCharacterBtn.addEventListener('click', () => createCharacter());
    }
    if (elements.resetBtn) {
        elements.resetBtn.addEventListener('click', resetForm);
    }

    // Image preview
    if (elements.imageUploadInput && elements.imagePreview) {
        elements.imageUploadInput.addEventListener('change', () => {
            const file = elements.imageUploadInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    elements.imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px;">`;
                    elements.imagePreview.style.display = 'block';
                    if (elements.removeImageBtn) elements.removeImageBtn.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (elements.removeImageBtn) {
        elements.removeImageBtn.addEventListener('click', () => {
            if (elements.imageUploadInput) elements.imageUploadInput.value = '';
            if (elements.imagePreview) {
                elements.imagePreview.innerHTML = '';
                elements.imagePreview.style.display = 'none';
            }
            elements.removeImageBtn.style.display = 'none';
        });
    }

    // Initialize user data
    await initializeUserData();

    // Particle background for canvas
    const canvas = document.getElementById('particleCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const particlesArray = [];
        const numberOfParticles = 100;

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 5 + 1;
                this.speedX = Math.random() * 3 - 1.5;
                this.speedY = Math.random() * 3 - 1.5;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.size > 0.2) this.size -= 0.1;
                if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
                if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
            }
            draw() {
                ctx.fillStyle = 'rgba(96, 165, 250, 0.5)';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function initParticles() {
            particlesArray.length = 0;
            for (let i = 0; i < numberOfParticles; i++) {
                particlesArray.push(new Particle());
            }
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particlesArray.forEach(particle => {
                particle.update();
                particle.draw();
            });
            requestAnimationFrame(animateParticles);
        }

        initParticles();
        animateParticles();

        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initParticles();
        });
    }

    // Cosmic vortex animation for loader
    if (elements.loaderOverlay) {
        const vortexCanvas = document.createElement('canvas');
        vortexCanvas.className = 'vortex-canvas';
        const particleBurst = elements.loaderOverlay.querySelector('.particle-burst');
        if (particleBurst) {
            particleBurst.appendChild(vortexCanvas);
            const ctx = vortexCanvas.getContext('2d');
            vortexCanvas.width = 300;
            vortexCanvas.height = 300;

            const vortexParticles = [];
            const vortexParticleCount = 100;
            let angle = 0;

            class VortexParticle {
                constructor() {
                    this.angle = Math.random() * Math.PI * 2;
                    this.radius = Math.random() * 100 + 50;
                    this.size = Math.random() * 3 + 2;
                    this.speed = Math.random() * 0.05 + 0.02;
                    this.opacity = Math.random() * 0.5 + 0.5;
                    this.color = `hsl(${Math.random() * 60 + 200}, 80%, 60%)`;
                }
                update() {
                    this.angle += this.speed;
                    this.x = vortexCanvas.width / 2 + Math.cos(this.angle) * this.radius;
                    this.y = vortexCanvas.height / 2 + Math.sin(this.angle) * this.radius;
                    this.opacity = Math.max(0, this.opacity - 0.005);
                    this.radius = Math.max(20, this.radius - 0.2);
                    if (this.opacity <= 0 || this.radius <= 20) {
                        this.angle = Math.random() * Math.PI * 2;
                        this.radius = 100 + Math.random() * 50;
                        this.opacity = Math.random() * 0.5 + 0.5;
                    }
                }
                draw() {
                    ctx.globalAlpha = this.opacity;
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            function initVortexParticles() {
                vortexParticles.length = 0;
                for (let i = 0; i < vortexParticleCount; i++) {
                    vortexParticles.push(new VortexParticle());
                }
            }

            function animateVortex() {
                if (!elements.loaderOverlay.classList.contains('active')) return;
                ctx.clearRect(0, 0, vortexCanvas.width, vortexCanvas.height);
                ctx.globalCompositeOperation = 'screen';
                const gradient = ctx.createRadialGradient(
                    vortexCanvas.width / 2, vortexCanvas.height / 2, 0,
                    vortexCanvas.width / 2, vortexCanvas.height / 2, 150
                );
                gradient.addColorStop(0, 'rgba(96, 165, 250, 0.3)');
                gradient.addColorStop(1, 'rgba(96, 165, 250, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, vortexCanvas.width, vortexCanvas.height);
                ctx.globalCompositeOperation = 'source-over';

                vortexParticles.forEach(particle => {
                    particle.update();
                    particle.draw();
                });
                angle += 0.02;
                requestAnimationFrame(animateVortex);
            }

            elements.loaderOverlay.addEventListener('transitionend', () => {
                if (elements.loaderOverlay.classList.contains('active')) {
                    initVortexParticles();
                    animateVortex();
                }
            });
        }
    }
});