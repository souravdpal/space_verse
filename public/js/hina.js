document.addEventListener('DOMContentLoaded', async () => {
  const CHAT_STORAGE_KEY = 'chat_history';
  const MAX_MESSAGES = 50;
  async ()=>{
    let nwidu = window.idget()
    localStorage.setItem('__uid',nwidu)


  }
  let roughuuid = localStorage.getItem('__uid')
  document.getElementById("ai-chat-btn").addEventListener("click", () => {
    document.getElementById("ai-chat-box").style.display = "flex";
    loadStoredMessages();
  });

  document.getElementById("close-chat").addEventListener("click", () => {
    document.getElementById("ai-chat-box").style.display = "none";
  });

  document.getElementById("send-msg").addEventListener("click", sendMessage);

  document.getElementById("ai-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  async function sendMessage() {
    const input = document.getElementById("ai-input");
    const msg = input.value.trim();
    if (!msg) return;
    if (!localStorage.getItem('id')) {
      appendMessage("Hina", "You must be logged in to chat.");
      return;
    }

    appendMessage("You", msg);
    input.value = "";

    try {
      const data = await window.firebaseAuth.sendWithFreshToken(
        `/hina/ai/${localStorage.getItem('id')}`,
        { method: "POST", body: JSON.stringify({ query: msg }) }
      );
      appendMessage("Hina", data.reply);
    } catch (err) {
      console.error("Error sending message:", err);
      appendMessage("Hina", "Error connecting to AI server.");
    }
  }

  function appendMessage(sender, text) {
    let chat = document.getElementById("ai-chat-messages");
    let msgDiv = document.createElement("div");
    msgDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chat.appendChild(msgDiv);
    chat.scrollTop = chat.scrollHeight;

    // Store message in localStorage
    try {
      const stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)) || [];
      stored.push({ sender, text });
      if (stored.length > MAX_MESSAGES) stored.shift(); // Remove oldest
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored));
    } catch (err) {
      console.error("Error storing message:", err);
    }
  }

  function loadStoredMessages() {
    try {
      const stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY)) || [];
      let chat = document.getElementById("ai-chat-messages");
      chat.innerHTML = ''; // Clear existing messages
      stored.forEach(({ sender, text }) => {
        let msgDiv = document.createElement("div");
        msgDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
        chat.appendChild(msgDiv);
      });
      chat.scrollTop = chat.scrollHeight;
    } catch (err) {
      console.error("Error loading stored messages:", err);
    }
  }

  let currentUser = {
    id: localStorage.getItem('id')
  };

 
})