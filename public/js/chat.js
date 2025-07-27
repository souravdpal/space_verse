document.addEventListener("DOMContentLoaded", () => {
  const charId = window.location.pathname.split("/").pop();
  const userId = 'mock-user-123'; // Mock user ID
  const mockUserName = 'Mock User'; // Mock user name for /py/ai

  function formatText(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="formatted-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="formatted-italic">$1</em>');
  }

  async function chardata() {
    try {
      const headers = { 'X-User-ID': userId };
      const response = await fetch(`/c/id/?id=${encodeURIComponent(charId)}&uid=${userId}`, { headers });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      const data = await response.json();
      console.log("Character data:", data);
      if (!data.id || !data.name) {
        throw new Error("Incomplete character data returned");
      }
      return data;
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
    try {
      const headers = { 'X-User-ID': userId };
      const response = await fetch(`/history?user_id=${encodeURIComponent(userId)}&char_id=${encodeURIComponent(charId)}&uid=${userId}`, { headers });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      const history = await response.json();
      console.log("Chat history:", history);
      return history;
    } catch (error) {
      console.error("Error fetching history:", error);
      const errorDiv = document.createElement("div");
      errorDiv.className = "error-message text-red-500 p-4";
      errorDiv.textContent = `Failed to load chat history: ${error.message}`;
      document.getElementById("chatMessages")?.prepend(errorDiv);
      return [];
    }
  }

  async function fetchLikeStatus() {
    try {
      const headers = { 'X-User-ID': userId };
      const response = await fetch(`/api/char/${encodeURIComponent(charId)}/like?uid=${userId}`, { headers });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      console.log("Like status:", data);
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

      const headers = {
        'X-User-ID': userId,
        'Content-Type': 'application/json'
      };
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
    element.innerHTML = '';
    element.classList.add('typing');

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = formatText(rawText);
    const formattedNodes = Array.from(tempDiv.childNodes);

    for (let node of formattedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const words = node.textContent.split(/(\s+)/);
        for (let word of words) {
          element.appendChild(document.createTextNode(word));
          await new Promise(resolve => setTimeout(resolve, 60));
          element.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      } else {
        const span = node.cloneNode(true);
        const words = span.textContent.split(/(\s+)/);
        for (let word of words) {
          const innerSpan = span.cloneNode(false);
          innerSpan.textContent = word;
          element.appendChild(innerSpan);
          await new Promise(resolve => setTimeout(resolve, 60));
          element.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }
    }

    element.classList.remove('typing');
  }

  function updateScrollButton() {
    const chatMessages = document.getElementById("chatMessages");
    const scrollBtn = document.getElementById("scrollToBottom");
    if (chatMessages.scrollTop < chatMessages.scrollHeight - chatMessages.clientHeight - 50) {
      scrollBtn.style.display = 'flex';
    } else {
      scrollBtn.style.display = 'none';
    }
  }

  async function main() {
    const character = await chardata();
    const likeStatus = await fetchLikeStatus();
    const chatMessages = document.getElementById("chatMessages");
    const charNameElement = document.getElementById("charName");
    const creatorNameElement = document.getElementById("creatorName");
    const charImage = document.getElementById("charImage");
    const themeSelector = document.getElementById("themeSelector");
    const scrollBtn = document.getElementById("scrollToBottom");
    const likeButton = document.getElementById("likeButton");
    const likeCountElement = document.getElementById("likeCount");

    if (character && character.id && character.name) {
      try {
        document.title = `Chat with ${character.name}`;
        charNameElement.textContent = `Chat with ${character.name}`;
        creatorNameElement.innerHTML = `by <a href="/creator/works?creatorId=${encodeURIComponent(character.creatorId || 'unknown')}&uid=${userId}" class="creator-link text-blue-600 hover:underline"><strong>@${character.creator || 'Unknown'}</strong></a>`;

        if (character.link) {
          charImage.innerHTML = `<img src="${character.link}" alt="${character.name}'s image" class="w-24 h-24 rounded-full object-cover" />`;
          charImage.addEventListener("click", handleImageClick);
        } else {
          charImage.innerHTML = '<span class="text-gray-400">No Image Available</span>';
        }

        likeCountElement.textContent = likeStatus.likeCount;
        likeButton.classList.toggle("liked", likeStatus.liked);
        likeButton.addEventListener("click", toggleLike);

        const history = await fetchHistory();
        history.forEach(entry => {
          const message = document.createElement("div");
          const isUser = entry.sender === "user";
          message.className = `message ${isUser ? 'message-user' : 'message-char'}`;
          message.innerHTML = `
            <div class="message-header">
              <span class="sender">${isUser ? 'You' : character.name}</span>
              <span class="sender-badge">${isUser ? 'User' : 'AI'}</span>
              <span class="timestamp">${new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="message-content">${formatText(entry.message)}</div>
          `;
          chatMessages.appendChild(message);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (!history.length && character.firstline) {
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
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      } catch (error) {
        console.error("Error rendering chat:", error);
      }
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
            const headers = {
              'Content-Type': 'application/json',
              'X-User-ID': userId
            };
            const res = await fetch(`/py/ai?uid=${userId}`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                char: character,
                user_name: mockUserName,
                user: userMessageText,
                userid: userId
              })
            });
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const result = await res.json();
            console.log("AI response:", result);

            chatMessages.removeChild(typingMessage);

            const aiResponseText = result.response || "Sorry, I couldn’t process that.";
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
    }
  }

  main();
});