// Extract character ID from URL
const charId = window.location.pathname.split("/").pop();

// Convert *italic* and **bold** into HTML
function formatText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // **bold**
    .replace(/\*(.*?)\*/g, "<em>$1</em>");             // *italic/emote*
}

// Load character data from server
async function chardata() {
  try {
    const response = await fetch(`/c/id/?id=${encodeURIComponent(charId)}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    console.log("Character data:", data);
    return data;
  } catch (error) {
    console.error("Error fetching character data:", error);
    return { name: "Unknown Character", firstline: "Unable to load character.", link: null };
  }
}

// Handle image enlarge/restore
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

// Main setup
document.addEventListener("DOMContentLoaded", async () => {
  const character = await chardata();

  const charNameElement = document.getElementById("charName");
  const charImage = document.getElementById("charImage");
  const themeSelector = document.getElementById("themeSelector");

  if (character) {
    charNameElement.textContent = character.name;

    // Set character image if available
    if (character.link) {
      charImage.innerHTML = `<img src="${character.link}" alt="${character.name}'s image" />`;
      charImage.addEventListener("click", handleImageClick);
    } else {
      charImage.innerHTML = '<span>No Image</span>';
    }

    // Inject character's first line into chat
    if (character.firstline) {
      const chatMessages = document.getElementById("chatMessages");
      const firstLineMessage = document.createElement("div");
      firstLineMessage.className = "message message-char";
      firstLineMessage.innerHTML = `
        <div class="message-header">
          <span class="sender">${character.name}</span>
          <span class="sender-badge">AI</span>
          <span class="timestamp">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div class="message-content">${formatText(character.firstline)}</div>
      `;
      chatMessages.appendChild(firstLineMessage);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  } else {
    charNameElement.textContent = "Unknown Character";
    charImage.innerHTML = '<span>No Image</span>';
  }

  // Theme selection
  if (themeSelector) {
    themeSelector.addEventListener("change", (e) => {
      document.body.className = e.target.value + "-theme";
      localStorage.setItem("theme", e.target.value); // Persist theme
    });

    // Load saved theme or default to light
    const savedTheme = localStorage.getItem("theme") || "light";
    document.body.className = savedTheme + "-theme";
    themeSelector.value = savedTheme;
  } else {
    console.error("Theme selector not found in DOM");
  }

  // Send message logic
  const sendMessageBtn = document.getElementById("sendMessage");
  if (sendMessageBtn) {
    sendMessageBtn.addEventListener("click", async () => {
      const messageInput = document.getElementById("messageInput");
      const userMessageText = messageInput.value.trim();

      if (userMessageText) {
        const chatMessages = document.getElementById("chatMessages");

        // Display user message
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

        // Send to backend
        try {
          const res = await fetch("/py/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              char: character,
              user_name : localStorage.getItem("user") || "Anonymous",
              user: userMessageText,
            }),
          });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const result = await res.json();
          console.log("AI response:", result.response);

          const aiResponseText = result.response || "Sorry, I couldn’t process that.";
          const botMessage = document.createElement("div");
          botMessage.className = "message message-char";
          botMessage.innerHTML = `
            <div class="message-header">
              <span class="sender">${character.name}</span>
              <span class="sender-badge">AI</span>
              <span class="timestamp">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div class="message-content">${formatText(aiResponseText)}</div>
          `;
          chatMessages.appendChild(botMessage);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (err) {
          console.error("AI error:", err);
          const errorMessage = document.createElement("div");
          errorMessage.className = "message message-char";
          errorMessage.innerHTML = `
            <div class="message-header">
              <span class="sender">${character.name}</span>
              <span class="sender-badge">AI</span>
              <span class="timestamp">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div class="message-content">Error: ${err.message}</div>
          `;
          chatMessages.appendChild(errorMessage);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    });
  } else {
    console.error("Send button not found in DOM");
  }

  // Auto-resize input
  const messageInput = document.getElementById("messageInput");
  if (messageInput) {
    messageInput.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = `${this.scrollHeight}px`;
      if (this.scrollHeight > 120) this.style.overflowY = "auto";
    });

    // Prevent form submission on Enter, trigger send
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        document.getElementById("sendMessage").click();
      }
    });
  } else {
    console.error("Message input not found in DOM");
  }
});