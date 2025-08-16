document.addEventListener('DOMContentLoaded', async () => {
  const CHAT_STORAGE_KEY = 'chat_history';
  const MAX_MESSAGES = 50;

  // Generate or get UID
  let V4id = window.idget ? window.idget() : `uid_${Date.now()}`;
  let roughuuid = localStorage.getItem('__uid');
  if (!roughuuid) {
    localStorage.setItem('__uid', V4id);
    roughuuid = V4id;
  }

  // Chat box open/close buttons
  document.getElementById("ai-chat-btn").addEventListener("click", () => {
    document.getElementById("ai-chat-box").style.display = "flex";
    loadStoredMessages();
  });

  document.getElementById("close-chat").addEventListener("click", () => {
    document.getElementById("ai-chat-box").style.display = "none";
  });

  // Send message events
  document.getElementById("send-msg").addEventListener("click", sendMessage);
  document.getElementById("ai-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Clean AI answer for frontend
  function cleanAnswerForFrontend(text) {
    if (!text) return 'Hello! How can I help you today?';
    return text
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Convert **bold** markdown to HTML
  function formatBold(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  // Append a message to the chat and save in localStorage
  function appendMessage(sender, text, cls = "ai-message") {
    const chat = document.getElementById("ai-chat-messages");
    const msgDiv = document.createElement("div");
    msgDiv.className = cls;
    msgDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chat.appendChild(msgDiv);
    chat.scrollTop = chat.scrollHeight;

    try {
      const stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)) || [];
      stored.push({ sender, text });
      if (stored.length > MAX_MESSAGES) stored.shift();
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored));
    } catch (err) {
      console.error("Error storing message:", err);
    }

    return msgDiv;
  }

  // Load stored messages from localStorage
  function loadStoredMessages() {
    try {
      const stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)) || [];
      const chat = document.getElementById("ai-chat-messages");
      chat.innerHTML = '';
      stored.forEach(({ sender, text }) => {
        const formattedText = formatBold(cleanAnswerForFrontend(text));
        const cls = sender === "You" ? "user-message" : "ai-message";
        const msgDiv = document.createElement("div");
        msgDiv.className = cls;
        msgDiv.innerHTML = `<strong>${sender}:</strong> ${formattedText}`;
        chat.appendChild(msgDiv);
      });
      chat.scrollTop = chat.scrollHeight;
    } catch (err) {
      console.error("Error loading stored messages:", err);
    }
  }

  // Send message to AI server
  async function sendMessage() {
    const input = document.getElementById("ai-input");
    const msg = input.value.trim();
    if (!msg) return;

    // Check login
    if (!localStorage.getItem('id')) {
      appendMessage("Hina", "You must be logged in to chat.", "ai-message");
      return;
    }

    appendMessage("You", msg, "user-message");
    input.value = "";

    const loadingDiv = appendMessage("Hina", "Hina is typing...", "ai-message loading");

    try {
      const stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)) || [];
      const lastFive = stored.slice(-5);

      const response = await window.firebaseAuth.sendWithFreshToken(
        `/hina/ai/${localStorage.getItem('id')}`,
        {
          method: "POST",
          body: JSON.stringify({
            query: msg,
            memo: lastFive.length ? JSON.stringify(lastFive) : 'no memories yet'
          })
        }
      );

      loadingDiv.remove();

      const cleanReply = cleanAnswerForFrontend(response.result || "Hello! How can I help you today?");
      const formattedReply = formatBold(cleanReply);
      appendMessage("Hina", formattedReply, "ai-message");

      // Handle commands
      const cmd = response.command || null;
      if (cmd) {
        const commands = ['home', 'dis', 'make', 'post', 'notify'];
        if (commands.includes(cmd)) {
          const url = cmd === 'home' ? '/home' : `${cmd}/u/${V4id}`;
          window.history.replaceState({}, "", url);
          appendMessage("System", `Navigated to ${cmd}. If not loaded, try refreshing.`, "ai-message");
        } else if (cmd === 'Allow') {
          appendMessage("Hina", "Hina does not yet have real-time screen abilities. Coming soon!", "ai-message");
        } else {
          appendMessage("Hina", `Unknown command: ${cmd}`, "ai-message");
        }
      }

    } catch (err) {
      console.error("Error sending message:", err);
      loadingDiv.remove();
      appendMessage("Hina", "Error connecting to AI server. Please try again.", "ai-message");
    }
  }
});
