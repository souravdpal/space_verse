// Sample notification data
const notifications = [
    { id: 1, message: "New message from John", category: "Messages", time: new Date(Date.now() - 10 * 60 * 1000), read: false },
    { id: 2, message: "Your order has shipped", category: "Orders", time: new Date(Date.now() - 60 * 60 * 1000), read: false },
    { id: 3, message: "System update available", category: "System", time: new Date(Date.now() - 24 * 60 * 60 * 1000), read: false },
];

// Theme toggle functionality
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);

themeToggle.addEventListener('click', () => {
    const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

// Format time for display
function formatTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.round(diffMs / 1000 / 60);
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    return date.toLocaleDateString();
}

// Render notifications
function renderNotifications() {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '';

    if (notifications.length === 0) {
        notificationList.innerHTML = '<div class="empty-state">No notifications to show</div>';
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

// Mark a notification as read
function markAsRead(id) {
    const notification = notifications.find(n => n.id === id);
    if (notification) {
        notification.read = true;
        renderNotifications();
    }
}

// Mark all notifications as read
function markAllAsRead() {
    notifications.forEach(n => n.read = true);
    renderNotifications();
}

// Delete a notification
function deleteNotification(id) {
    const index = notifications.findIndex(n => n.id === id);
    if (index !== -1) {
        notifications.splice(index, 1);
        renderNotifications();
    }
}

// Clear all notifications
function clearAllNotifications() {
    notifications.length = 0;
    renderNotifications();
}

// Initial render
renderNotifications();