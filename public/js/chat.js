document.addEventListener("DOMContentLoaded", async () => {
    const charId = window.location.pathname.split("/").pop();
    const userId = localStorage.getItem('id');
    let mockUserName;
    let offset = 0;
    const limit = 10;
    let isLoadingHistory = false;

    // Redirect if missing critical IDs
    if (!charId || !userId) {
        console.warn('Missing user or character ID:', { userId, charId });
        alert('User or character ID missing. Redirecting to home.');
        setTimeout(() => window.location.href = '/', 1000);
        return;
    }

    // Add global loader
    const globalLoader = document.createElement("div");
    globalLoader.className = "global-loader fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-50";
    globalLoader.innerHTML = `
        <div class="loader flex flex-col items-center gap-4">
            <div class="spinner w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-gray-600 dark:text-gray-300 text-lg">Loading...</span>
        </div>
    `;
    document.body.prepend(globalLoader);

    // Add critical styles
    const style = document.createElement('style');
    style.textContent = `
        .global-loader { transition: opacity 0.3s ease; }
        .global-loader.hidden { opacity: 0; pointer-events: none; }
        .loader { display: flex; align-items: center; gap: 8px; justify-content: center; min-height: 96px; }
        .spinner { width: 24px; height: 24px; border: 4px solid #ccc; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .loader span { color: #4b5563; }
        .dark-theme .loader span, .night-theme .loader span { color: #94a3b8; }
        #charImage img { width: 64px; height: 64px; object-fit: cover; border-radius: 50%; cursor: pointer; }
        .message-content em { font-style: italic; color: #555; }
        .dark-theme .message-content em { color: #bbb; }
        .history-loader { padding: 16px; text-align: center; }
    `;
    document.head.appendChild(style);

    // Wait for Firebase auth
    const waitForAuth = () => new Promise((resolve, reject) => {
        firebase.auth().onAuthStateChanged(user => user ? resolve(user) : reject(new Error('No authenticated user')));
    });

    // Format text for messages
    function formatText(text) {
        if (!text || typeof text !== 'string') return 'Message not available';
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong class="formatted-bold">$1</strong>')
            .replace(/\*(?!\*)(.*?)\*/g, '<em class="formatted-italic">$1</em>')
            .replace(/{{user}}/g, mockUserName)
            .replace(/\n/g, '<br>');
    }

    // Fetch user credentials
    async function fetchUserCredentials() {
        try {
            const headers = await firebaseAuth.Tokenheader();
            const res = await fetch(`/cred?uid=${encodeURIComponent(userId)}`, { headers });
            if (!res.ok) throw new Error(`Failed to fetch user data: ${res.status}`);
            const data = await res.json();
            mockUserName = data.name || (() => { window.location.href = '/'; throw new Error('No user name'); })();
        } catch (error) {
            console.error('Error fetching user credentials:', error);
            alert('Failed to load user data. Redirecting to home.');
            setTimeout(() => window.location.href = '/', 1000);
            throw error;
        }
    }

    // Fetch character data
    async function fetchCharacterData() {
        try {
            const headers = await firebaseAuth.Tokenheader();
            const response = await fetch(`/c/char/${encodeURIComponent(charId)}`, { headers });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (!data.id || !data.name) throw new Error("Incomplete character data");
            return {
                id: data.id,
                name: data.name,
                firstline: data.firstLine || data.firstline || "Hello! I'm here to chat with you.",
                link: data.link || null,
                creator: data.creator || "Unknown",
                creatorId: data.creatorId || null
            };
        } catch (error) {
            console.error("Error fetching character data:", error);
            return { name: "Unknown Character", firstline: "Unable to load character data.", link: null, id: charId, creator: "Unknown", creatorId: null };
        }
    }

    // Fetch chat history
    async function fetchHistory(newOffset) {
        if (isLoadingHistory) return [];
        isLoadingHistory = true;
        const chatMessages = document.getElementById("chatMessages");
        const loaderDiv = document.createElement("div");
        loaderDiv.className = "history-loader";
        loaderDiv.innerHTML = `<div class="spinner"></div><span>Loading more messages...</span>`;
        chatMessages.prepend(loaderDiv);

        try {
            const headers = await firebaseAuth.Tokenheader();
            const response = await fetch(`/history?user_id=${encodeURIComponent(userId)}&char_id=${encodeURIComponent(charId)}&uid=${userId}&offset=${newOffset}&limit=${limit}`, { headers });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const history = await response.json();
            offset = newOffset + limit;
            return history.reverse(); // Oldest first
        } catch (error) {
            console.error("Error fetching history:", error);
            const errorDiv = document.createElement("div");
            errorDiv.className = "error-message text-red-500 p-4";
            errorDiv.textContent = `Failed to load more history: ${error.message}`;
            chatMessages.prepend(errorDiv);
            return [];
        } finally {
            chatMessages.removeChild(loaderDiv);
            isLoadingHistory = false;
        }
    }

    // Fetch like status
    async function fetchLikeStatus() {
        try {
            const headers = await firebaseAuth.Tokenheader();
            const response = await fetch(`/api/char/${encodeURIComponent(charId)}/like?uid=${userId}`, { headers });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error("Error fetching like status:", error);
            return { likeCount: 0, liked: false };
        }
    }

    // Toggle like
    async function toggleLike() {
        const likeButton = document.getElementById("likeButton");
        const likeCountElement = document.getElementById("likeCount");
        likeButton.disabled = true;
        try {
            const headers = await firebaseAuth.Tokenheader();
            const response = await fetch(`/api/char/${encodeURIComponent(charId)}/like?uid=${userId}`, {
                method: "POST",
                headers
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            likeCountElement.textContent = data.likeCount;
            likeButton.classList.toggle("liked", data.liked);
        } catch (error) {
            console.error("Error toggling like:", error);
            alert(`Error: ${error.message}`);
        } finally {
            likeButton.disabled = false;
        }
    }

    // Type message with animation
    async function typeMessage(element, rawText) {
        if (!element || !rawText || typeof rawText !== 'string') {
            element.innerHTML = '<span class="text-red-500">Message not available</span>';
            return;
        }
        element.innerHTML = '';
        element.classList.add('typing');
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = formatText(rawText);
        for (const node of tempDiv.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                for (const char of node.textContent || '') {
                    element.appendChild(document.createTextNode(char));
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } else {
                element.appendChild(node.cloneNode(true));
            }
        }
        element.classList.remove('typing');
    }

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Main function
    async function main() {
        try {
            await waitForAuth();
            await fetchUserCredentials();
        } catch (error) {
            console.error('Auth error:', error);
            alert('No authenticated user. Redirecting to login.');
            setTimeout(() => window.location.href = '/login', 1000);
            return;
        }

        const chatMessages = document.getElementById("chatMessages");
        const charNameElement = document.getElementById("charName");
        const creatorNameElement = document.getElementById("creatorName");
        const charImage = document.getElementById("charImage");
        const likeButton = document.getElementById("likeButton");
        const likeCountElement = document.getElementById("likeCount");
        const themeSelector = document.getElementById("themeSelector");
        const scrollBtn = document.getElementById("scrollBtn");

        // Set placeholder UI
        charNameElement.textContent = "Loading Character...";
        creatorNameElement.textContent = "by @Loading...";
        charImage.innerHTML = '<div class="spinner w-16 h-16"></div>';
        likeCountElement.textContent = '0';

        // Fetch initial data
        const [character, history, likeStatus] = await Promise.all([
            fetchCharacterData(),
            fetchHistory(0),
            fetchLikeStatus()
        ]);

        // Remove global loader
        globalLoader.classList.add("hidden");
        setTimeout(() => globalLoader.remove(), 300);

        // Update UI with character data
        document.title = `Chat with ${character.name}`;
        charNameElement.textContent = `Chat with ${character.name}`;
        creatorNameElement.innerHTML = `by <a href="/creator/works?creatorId=${encodeURIComponent(character.creatorId)}&uid=${userId}" class="creator-link text-blue-600 hover:underline">@${character.creator}</a>`;
        charImage.innerHTML = character.link
            ? `<img src="${character.link}" alt="${character.name}" class="w-16 h-16 rounded-full cursor-pointer" onerror="this.src='https://ik.imagekit.io/souravdpal/default-avatar.png'; console.warn('Image failed to load:', '${character.link}');" />`
            : '<span class="text-gray-400">No Image</span>';
        likeCountElement.textContent = likeStatus.likeCount || 0;
        likeButton.classList.toggle("liked", likeStatus.liked);
        likeButton.addEventListener("click", toggleLike);

        // Render initial history
        const fragment = document.createDocumentFragment();
        for (const message of history) {
            if (!message.message || typeof message.message !== 'string') continue;
            const messageDiv = document.createElement("div");
            messageDiv.className = `message ${message.sender === 'user' ? 'message-user' : 'message-char'}`;
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="sender">${message.sender === 'user' ? 'You' : character.name}</span>
                    <span class="sender-badge">${message.sender === 'user' ? 'User' : 'AI'}</span>
                    <span class="timestamp">${new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="message-content">${formatText(message.message)}</div>
            `;
            fragment.appendChild(messageDiv);
        }
        chatMessages.appendChild(fragment);

        // Render firstline if no history
        if (character.firstline && history.length === 0) {
            const firstLineMessage = document.createElement("div");
            firstLineMessage.className = "message message-char";
            firstLineMessage.innerHTML = `
                <div class="message-header">
                    <span class="sender">${character.name}</span>
                    <span class="sender-badge">AI</span>
                    <span class="timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="message-content"></div>
            `;
            chatMessages.appendChild(firstLineMessage);
            await typeMessage(firstLineMessage.querySelector(".message-content"), character.firstline);
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Setup infinite scroll for history
        const loadMoreHistory = debounce(async () => {
            if (chatMessages.scrollTop < 50 && !isLoadingHistory) {
                const newHistory = await fetchHistory(offset);
                const fragment = document.createDocumentFragment();
                for (const message of newHistory) {
                    if (!message.message || typeof message.message !== 'string') continue;
                    const messageDiv = document.createElement("div");
                    messageDiv.className = `message ${message.sender === 'user' ? 'message-user' : 'message-char'}`;
                    messageDiv.innerHTML = `
                        <div class="message-header">
                            <span class="sender">${message.sender === 'user' ? 'You' : character.name}</span>
                            <span class="sender-badge">${message.sender === 'user' ? 'User' : 'AI'}</span>
                            <span class="timestamp">${new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div class="message-content">${formatText(message.message)}</div>
                    `;
                    fragment.appendChild(messageDiv);
                }
                chatMessages.prepend(fragment);
                if (newHistory.length > 0) chatMessages.scrollTop = 50; // Keep scroll position
            }
        }, 200);

        chatMessages.addEventListener("scroll", loadMoreHistory);

        // Theme selector
        if (themeSelector) {
            themeSelector.addEventListener("change", (e) => {
                document.body.className = e.target.value + "-theme";
                localStorage.setItem("theme", e.target.value);
            });
            const savedTheme = localStorage.getItem("theme") || "light";
            document.body.className = savedTheme + "-theme";
            themeSelector.value = savedTheme;
        }

        // Send message
        const sendMessageBtn = document.getElementById("sendMessage");
        const messageInput = document.getElementById("messageInput");
        if (sendMessageBtn && messageInput) {
            sendMessageBtn.addEventListener("click", async () => {
                const userMessageText = messageInput.value.trim();
                if (!userMessageText) return;

                sendMessageBtn.disabled = true;
                const userMessage = document.createElement("div");
                userMessage.className = "message message-user";
                userMessage.innerHTML = `
                    <div class="message-header">
                        <span class="sender">You</span>
                        <span class="sender-badge">User</span>
                        <span class="timestamp">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div class="message-content">${formatText(userMessageText)}</div>
                `;
                chatMessages.appendChild(userMessage);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                messageInput.value = "";

                const botMessage = document.createElement("div");
                botMessage.className = "message message-char";
                botMessage.innerHTML = `
                    <div class="message-header">
                        <span class="sender">${character.name || 'Character'}</span>
                        <span class="sender-badge">AI</span>
                        <span class="timestamp">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div class="message-content"></div>
                `;
                chatMessages.appendChild(botMessage);
                chatMessages.scrollTop = chatMessages.scrollHeight;

                try {
                    const payload = { char: character, user_name: mockUserName, user: userMessageText, userid: userId };
                    const headers = await firebaseAuth.Tokenheader();
                    const res = await fetch(`/py/ai?uid=${userId}`, {
                        method: "POST",
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let responseText = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const contentIndex = buffer.indexOf('\n\n');
                        if (contentIndex === -1) continue;
                        const eventData = buffer.slice(0, contentIndex);
                        buffer = buffer.slice(contentIndex + 2);
                        const lines = eventData.split('\n');
                        let event = 'message';
                        let data = '';
                        for (const line of lines) {
                            if (line.startsWith('event:')) event = line.slice(6).trim();
                            else if (line.startsWith('data:')) data += line.slice(5).trim();
                        }
                        if (event === 'message') {
                            const delta = JSON.parse(data);
                            responseText += delta;
                            botMessage.querySelector(".message-content").innerHTML = formatText(responseText);
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        } else if (event === 'error') {
                            const err = JSON.parse(data);
                            botMessage.querySelector(".message-content").innerHTML = `Error: ${err.error}`;
                        }
                    }
                } catch (err) {
                    console.error("AI error:", err);
                    botMessage.querySelector(".message-content").innerHTML = `Error: ${err.message}`;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } finally {
                    sendMessageBtn.disabled = false;
                }
            });

            messageInput.addEventListener("input", function () {
                this.style.height = "auto";
                this.style.height = `${this.scrollHeight}px`;
                if (this.scrollHeight > 120) this.style.overflowY = "auto";
            });

            messageInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessageBtn.click();
                }
            });
        }

        // Scroll button
        if (scrollBtn) {
            const updateScrollButton = () => {
                scrollBtn.classList.toggle("visible", chatMessages.scrollTop + chatMessages.clientHeight < chatMessages.scrollHeight - 10);
            };
            chatMessages.addEventListener("scroll", updateScrollButton);
            scrollBtn.addEventListener("click", () => {
                chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
            });
        }
    }

    main();
});