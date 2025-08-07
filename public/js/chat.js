document.addEventListener("DOMContentLoaded", async () => {
    let mockUserName;
    const charId = window.location.pathname.split("/").pop();
    const userId = localStorage.getItem('id');
    let reduceu = () => {
        window.location.href = '/';
    };

    // Debug DOM elements to verify chat.ejs
    console.log('DOM elements check:', {
        chatMessages: !!document.getElementById("chatMessages"),
        charName: !!document.getElementById("charName"),
        creatorName: !!document.getElementById("creatorName"),
        charImage: !!document.getElementById("charImage"),
        likeButton: !!document.getElementById("likeButton"),
        likeCount: !!document.getElementById("likeCount"),
        themeSelector: !!document.getElementById("themeSelector"),
        messageInput: !!document.getElementById("messageInput"),
        sendMessage: !!document.getElementById("sendMessage"),
        scrollBtn: !!document.getElementById("scrollBtn")
    });

    // Wait for Firebase auth state to resolve
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

    // Fetch user credentials
    try {
        const headers = await firebaseAuth.Tokenheader();
        console.log('Fetching /cred with headers:', headers);
        const res = await fetch(`/cred?uid=${encodeURIComponent(userId)}`, {
            headers
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Failed to fetch user data: ${res.status}, ${errorText}`);
        }
        const data = await res.json();
        mockUserName = data.name || reduceu();
    } catch (error) {
        console.error('Error fetching user credentials:', error);
        alert('Failed to load user data. Redirecting to home.');
        setTimeout(() => window.location.href = '/', 1000);
        return;
    }

    if (!charId || !userId) {
        console.warn('Missing user or character ID:', { userId, charId, mockUserName });
        alert('User or character ID missing. Redirecting to home.');
        setTimeout(() => window.location.href = '/', 1000);
        return;
    }

    // Add loader styles
    const style = document.createElement('style');
    style.textContent = `
        .loader {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: center;
            min-height: 96px;
        }
        .spinner {
            width: 24px;
            height: 24px;
            border: 4px solid #ccc;
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .loader span {
            color: #4b5563;
        }
        .dark-theme .loader span, .night-theme .loader span {
            color: #94a3b8;
        }
        #charImage {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        #charImage img {
            display: block;
            width: 64px;
            height: 64px;
            object-fit: cover;
        }
    `;
    document.head.appendChild(style);

    function formatText(text) {
        if (!text || typeof text !== 'string') {
            console.warn('Invalid text for formatting:', text);
            return 'Message not available';
        }
        return text
            // Bold: **text**
            .replace(/\*\*(.*?)\*\*/g, '<strong class="formatted-bold">$1</strong>')
            // Italic: *text*
            .replace(/\*(?!\*)(.*?)\*/g, '<em class="formatted-italic">$1</em>')
            // Replace {{user}} with mock name
            .replace(/{{user}}/g, mockUserName);

    }

    async function chardata() {
        try {
            const headers = await firebaseAuth.Tokenheader();
            console.log('Fetching /c/char with headers:', headers);
            const response = await fetch(`/c/char/${encodeURIComponent(charId)}`, {
                headers
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            const data = await response.json();
            console.log("Character data fetched:", data);

            if (!data.id || !data.name) {
                throw new Error("Incomplete character data: missing id or name");
            }
            if (!data.firstLine && !data.firstline) {
                console.warn("Character firstLine is empty or undefined");
                data.firstLine = "Hello! I'm here to chat with you.";
            }
            return {
                id: data.id,
                name: data.name,
                firstline: data.firstLine || data.firstline,
                link: data.link || null,
                creator: data.creator || "Unknown",
                creatorId: data.creatorId || null
            };
        } catch (error) {
            console.error("Error fetching character data:", error);
            const errorDiv = document.createElement("div");
            errorDiv.className = "error-message text-red-500 p-4";
            errorDiv.textContent = `Failed to load character: ${error.message}`;
            document.querySelector(".chat-container")?.prepend(errorDiv);
            return {
                name: "Unknown Character",
                firstline: "Unable to load character data. Please try again later.",
                link: null,
                id: charId,
                creator: "Unknown",
                creatorId: null
            };
        }
    }

    async function fetchHistory() {
        const chatMessages = document.getElementById("chatMessages");

        // Create and display loader
        const loaderDiv = document.createElement("div");
        loaderDiv.className = "loader";
        loaderDiv.innerHTML = `
            <div class="spinner"></div>
            <span>Loading chat history...</span>
        `;
        chatMessages?.prepend(loaderDiv);

        try {
            const headers = await firebaseAuth.Tokenheader();
            console.log('Fetching /history with headers:', headers);
            const response = await fetch(`/history?user_id=${encodeURIComponent(userId)}&char_id=${encodeURIComponent(charId)}&uid=${userId}`, {
                headers
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            const history = await response.json();
            console.log("Chat history fetched:", history);

            // Reverse history to render oldest messages first
            history.reverse();

            // Remove loader
            if (chatMessages.contains(loaderDiv)) {
                chatMessages.removeChild(loaderDiv);
            }

            return history;
        } catch (error) {
            console.error("Error fetching history:", error);
            if (chatMessages.contains(loaderDiv)) {
                chatMessages.removeChild(loaderDiv);
            }
            const errorDiv = document.createElement("div");
            errorDiv.className = "error-message text-red-500 p-4";
            errorDiv.textContent = `Failed to load chat history: ${error.message}`;
            chatMessages?.prepend(errorDiv);
            return [];
        }
    }

    async function fetchLikeStatus() {
        try {
            const headers = await firebaseAuth.Tokenheader();
            console.log('Fetching /api/char/like with headers:', headers);
            const response = await fetch(`/api/char/${encodeURIComponent(charId)}/like?uid=${userId}`, {
                headers
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            const data = await response.json();
            console.log("Like status fetched:", data);
            return data;
        } catch (error) {
            console.error("Error fetching like status:", error);
            return { likeCount: 0, liked: false };
        }
    }

    async function toggleLike() {
        try {
            const likeButton = document.getElementById("likeButton");
            const likeCountElement = document.getElementById("likeCount");
            likeButton.disabled = true;

            const headers = await firebaseAuth.Tokenheader();
            console.log('Posting to /api/char/like with headers:', headers);
            const response = await fetch(`/api/char/${encodeURIComponent(charId)}/like?uid=${userId}`, {
                method: "POST",
                headers
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            likeCountElement.textContent = data.likeCount;
            likeButton.classList.toggle("liked", data.liked);
        } catch (error) {
            console.error("Error toggling like:", error);
            alert(`Error: ${error.message}`);
        } finally {
            document.getElementById("likeButton").disabled = false;
        }
    }

    function handleImageClick() {
        const charImage = document.getElementById("charImage");
        charImage.classList.toggle("enlarged");
        if (charImage.classList.contains("enlarged")) {
            document.addEventListener("click", handleOutsideClick);
        } else {
            document.removeEventListener("click", handleOutsideClick);
        }
    }

    function handleOutsideClick(event) {
        const charImage = document.getElementById("charImage");
        if (!charImage.contains(event.target)) {
            charImage.classList.remove("enlarged");
            document.removeEventListener("click", handleOutsideClick);
        }
    }

    async function typeMessage(element, rawText) {
        if (!element || !rawText || typeof rawText !== 'string') {
            console.warn("Invalid element or text for typeMessage:", { element, rawText });
            element.innerHTML = '<span class="text-red-500">Message not available</span>';
            return;
        }
        element.innerHTML = '';
        element.classList.add('typing');

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = formatText(rawText);
        const formattedNodes = Array.from(tempDiv.childNodes);

        for (const node of formattedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || '';
                for (const char of text) {
                    element.appendChild(document.createTextNode(char));
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } else {
                element.appendChild(node.cloneNode(true));
            }
        }
        element.classList.remove('typing');
    }

    function updateScrollButton() {
        const scrollBtn = document.getElementById("scrollBtn");
        if (scrollBtn) {
            const chatMessages = document.getElementById("chatMessages");
            const isAtBottom = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 10;
            scrollBtn.classList.toggle("visible", !isAtBottom);
        }
    }

    async function main() {
        const chatMessages = document.getElementById("chatMessages");
        const charNameElement = document.getElementById("charName");
        const creatorNameElement = document.getElementById("creatorName");
        const charImage = document.getElementById("charImage");
        const likeButton = document.getElementById("likeButton");
        const likeCountElement = document.getElementById("likeCount");
        const themeSelector = document.getElementById("themeSelector");
        const scrollBtn = document.getElementById("scrollBtn");

        const character = await chardata();
        const history = await fetchHistory();
        const likeStatus = await fetchLikeStatus();

        if (character) {
            document.title = `Chat with ${character.name}`;
            charNameElement.textContent = `Chat with ${character.name}`;
            creatorNameElement.innerHTML = `by <a href="/creator/works?creatorId=${encodeURIComponent(character.creatorId)}&uid=${userId}" class="creator-link text-blue-600 hover:underline">@${character.creator}</a>`;
            if (character.link) {
                charImage.innerHTML = `<img src="${character.link}" alt="${character.name}" class="w-16 h-16 rounded-full cursor-pointer" onerror="this.src='https://ik.imagekit.io/souravdpal/default-avatar.png'; this.onerror=null; console.warn('Image failed to load:', '${character.link}');" onload="console.log('Image loaded successfully:', '${character.link}');" />`;
                charImage.addEventListener("click", handleImageClick);
            } else {
                charImage.innerHTML = '<span class="text-gray-400">No Image</span>';
                console.warn('No character image provided');
            }
            likeCountElement.textContent = likeStatus.likeCount || 0;
            likeButton.classList.toggle("liked", likeStatus.liked);
            likeButton.addEventListener("click", toggleLike);

            for (const message of history) {
                if (!message.message || typeof message.message !== 'string') {
                    console.warn('Skipping invalid message in history:', message);
                    continue; // Skip messages with undefined or non-string message field
                }
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
                chatMessages.appendChild(messageDiv);
            }

            if (character.firstline && history.length === 0) {
                console.log("Rendering firstline (new conversation):", character.firstline);
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
            } else if (history.length > 0) {
                console.log("Skipping firstline: existing chat history found");
            } else {
                console.warn("No firstline provided for character:", character.name);
            }

            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            document.title = "Chat with Unknown Character";
            charNameElement.textContent = "Chat with Unknown Character";
            creatorNameElement.innerHTML = `by <a href="/creator/works?creatorId=unknown&uid=${userId}" class="creator-link text-blue-600 hover:underline">@Unknown</a>`;
            charImage.innerHTML = '<span class="text-gray-400">No Image</span>';
            likeCountElement.textContent = '0';
            likeButton.disabled = true;
        }

        if (themeSelector) {
            themeSelector.addEventListener("change", (e) => {
                document.body.className = e.target.value + "-theme";
                localStorage.setItem("theme", e.target.value);
            });
            const savedTheme = localStorage.getItem("theme") || "light";
            document.body.className = savedTheme + "-theme";
            themeSelector.value = savedTheme;
        } else {
            console.error("Theme selector not found in DOM");
        }

        const sendMessageBtn = document.getElementById("sendMessage");
        if (sendMessageBtn) {
            sendMessageBtn.addEventListener("click", async () => {
                const messageInput = document.getElementById("messageInput");
                const userMessageText = messageInput.value.trim();

                if (userMessageText) {
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

                    const typingMessage = document.createElement("div");
                    typingMessage.className = "message message-char typing-indicator";
                    typingMessage.innerHTML = `
                        <div class="message-header">
                            <span class="sender">${character.name || 'Character'}</span>
                            <span class="sender-badge">AI</span>
                            <span class="timestamp">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div class="message-content">${character.name ? `${character.name} is typing` : ''}<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span></div>
                    `;
                    chatMessages.appendChild(typingMessage);
                    chatMessages.scrollTop = chatMessages.scrollHeight;

                    try {
                        const payload = {
                            char: character,
                            user_name: mockUserName,
                            user: userMessageText,
                            userid: userId
                        };
                        console.log('Sending payload to /py/ai:', JSON.stringify(payload, null, 2));
                        const headers = await firebaseAuth.Tokenheader();
                        console.log('Posting to /py/ai with headers:', headers);
                        const res = await fetch(`/py/ai?uid=${userId}`, {
                            method: "POST",
                            headers: {
                                ...headers,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(payload)
                        });
                        if (!res.ok) {
                            const errorText = await res.text();
                            throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
                        }
                        const result = await res.json();
                        console.log("AI response:", result);

                        chatMessages.removeChild(typingMessage);

                        let aiResponseText = result.response || "Sorry, I couldn’t process that.";
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
                        await typeMessage(botMessage.querySelector(".message-content"), aiResponseText);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    } catch (err) {
                        console.error("AI error:", err);
                        chatMessages.removeChild(typingMessage);
                        const errorMessage = document.createElement("div");
                        errorMessage.className = "message message-char";
                        errorMessage.innerHTML = `
                            <div class="message-header">
                                <span class="sender">${character.name || 'Character'}</span>
                                <span class="sender-badge">AI</span>
                                <span class="timestamp">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <div class="message-content">Error: ${err.message}</div>
                        `;
                        chatMessages.appendChild(errorMessage);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    } finally {
                        sendMessageBtn.disabled = false;
                    }
                }
            });
        } else {
            console.error("Send button not found in DOM");
        }

        const messageInput = document.getElementById("messageInput");
        if (messageInput) {
            messageInput.addEventListener("input", function () {
                this.style.height = "auto";
                this.style.height = `${this.scrollHeight}px`;
                if (this.scrollHeight > 120) this.style.overflowY = "auto";
            });

            messageInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    document.getElementById("sendMessage").click();
                }
            });
        } else {
            console.error("Message input not found in DOM");
        }

        if (scrollBtn) {
            chatMessages.addEventListener("scroll", updateScrollButton);
            scrollBtn.addEventListener("click", () => {
                chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
            });
        } else {
            console.warn("Scroll button not found in DOM");
        }
    }

    main();
});