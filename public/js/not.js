document.addEventListener('DOMContentLoaded', async () => {
    const uid = localStorage.getItem('id');
    if (!uid) {
        window.location.href = '/';
    }
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

    try {
        await waitForFirebase(); // Ensure Firebase SDK and app are initialized
    } catch (error) {
        console.error('Error waiting for Firebase SDK:', error);
        alert('Failed to initialize Firebase. Please try again.');
        return;
    }

    // Token header function for API requests
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

    try {
        await waitForAuth(); // Ensure user is authenticated
    } catch (error) {
        console.error('Error waiting for auth:', error);
        alert('No authenticated user. Redirecting to login.');
        setTimeout(() => window.location.href = '/login', 1000);
        return;
    }

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    themeToggle.addEventListener('click', () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Format time nicely
    function formatTime(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffMins = Math.round(diffMs / 1000 / 60);
        if (diffMins < 60) return `${diffMins} minutes ago`;
        const diffHours = Math.round(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hours ago`;
        return new Date(date).toLocaleDateString();
    }

    // Load and render notifications
    async function renderNotifications() {
        const notificationList = document.getElementById('notification-list');
        notificationList.innerHTML = '<div class="loader">Loading...</div>';

        try {
            const res = await fetch(`/notify/data?uid=${uid}`, {
                headers: await firebaseAuth.Tokenheader()
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch notifications: ${res.status} ${res.statusText}`);
            }

            const notifications = await res.json();
            notificationList.innerHTML = '';

            if (!Array.isArray(notifications) || notifications.length === 0) {
                notificationList.innerHTML = '<div class="empty-state">No notifications to show</div>';
                return;
            }

            // Sort: unseen first, then by newest time
            notifications.sort((a, b) => {
                if (a.status !== b.status) return a.status - b.status; // Unread first
                return new Date(b.time) - new Date(a.time); // Newest first
            });

            notifications.forEach(notification => {
                const notificationDiv = document.createElement('div');
                notificationDiv.className = `notification ${notification.status ? 'read' : ''}`;
                notificationDiv.innerHTML = `
                <div class="notification-content">
                    <span class="category">${notification.category || 'General'}</span>
                    <p>
                        ${!notification.status ? '<span class="new-indicator">🔴</span>' : ''}
                        ${notification.message}
                    </p>
                    <span class="time">${formatTime(notification.time)}</span>
                </div>
                <div class="notification-actions">
                    <button class="notification-btn mark-read-btn ${notification.status ? 'disabled' : ''}" 
                            data-notid="${notification._id}" 
                            ${notification.status ? 'disabled' : ''}>
                        Mark as Read
                    </button>
                    <button class="notification-btn delete-btn" data-notid="${notification._id}">
                        Delete
                    </button>
                </div>
            `;
                notificationList.appendChild(notificationDiv);
            });

            // Add event listeners for buttons
            document.querySelectorAll('.mark-read-btn').forEach(btn => {
                btn.addEventListener('click', () => markAsRead(btn.dataset.notid));
            });
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteNotification(btn.dataset.notid));
            });
        } catch (err) {
            console.error('Error loading notifications:', err);
            notificationList.innerHTML = '<div class="error">Failed to load notifications: ' + err.message + '</div>';
        }
    }

    // Expose functions to global scope
    window.markAsRead = async function(notid) {
        try {
            const res = await fetch(`/notify/read?notid=${notid}`, {
                headers: await firebaseAuth.Tokenheader()
            });
            if (!res.ok) {
                throw new Error(`Failed to mark notification as read: ${res.status} ${res.statusText}`);
            }
            await renderNotifications();
        } catch (err) {
            console.error('Failed to mark as read:', err);
            alert('Failed to mark notification as read: ' + err.message);
        }
    };

    window.deleteNotification = async function(id) {
        try {
            const res = await fetch(`/notify/delete?notid=${id}`, {
                method: 'DELETE',
                headers: await firebaseAuth.Tokenheader()
            });
            if (!res.ok) {
                throw new Error(`Failed to delete notification: ${res.status} ${res.statusText}`);
            }
            await renderNotifications();
        } catch (err) {
            console.error('Failed to delete notification:', err);
            alert('Failed to delete notification: ' + err.message);
        }
    };

    window.markAllAsRead = async function() {
        try {
            const res = await fetch(`/notify/data?uid=${uid}`, {
                headers: await firebaseAuth.Tokenheader()
            });
            if (!res.ok) {
                throw new Error(`Failed to fetch notifications: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            const unread = data.filter(n => !n.status);

            for (let note of unread) {
                await fetch(`/notify/read?notid=${note._id}`, {
                    headers: await firebaseAuth.Tokenheader()
                });
            }
            await renderNotifications();
        } catch (err) {
            console.error('Failed to mark all as read:', err);
            alert('Failed to mark all notifications as read: ' + err.message);
        }
    };

    window.clearAllNotifications = async function() {
        try {
            const res = await fetch(`/notify/data?uid=${uid}`, {
                headers: await firebaseAuth.Tokenheader()
            });
            if (!res.ok) {
                throw new Error(`Failed to fetch notifications: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();

            for (let note of data) {
                await fetch(`/notify/delete?notid=${note._id}`, {
                    method: 'DELETE',
                    headers: await firebaseAuth.Tokenheader()
                });
            }
            await renderNotifications();
        } catch (err) {
            console.error('Failed to clear all notifications:', err);
            alert('Failed to clear all notifications: ' + err.message);
        }
    };

    // Initial render
    await renderNotifications();

    // Attach event listeners for action buttons
    document.querySelector('.mark-all-btn').addEventListener('click', window.markAllAsRead);
    document.querySelector('.clear-all-btn').addEventListener('click', window.clearAllNotifications);
});