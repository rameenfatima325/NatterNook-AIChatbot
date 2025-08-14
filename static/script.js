/* ---------------- State ---------------- */
let personality = "";
let chats = {};  // { id: {personality, title?: string, messages: [{sender, text, time}] } }
let currentChatId = "";

/* ---------------- Screens & History ---------------- */
const SCREEN_IDS = {
  welcome: "welcomeScreen",
  personality: "personalityScreen",
  chat: "chatScreen",
};

// Ensure consistent background and disable page-level scrolling
function setConsistentBackground() {
  document.body.style.backgroundColor = "#fff7e6";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

/* ---------------- Cleanup for empty stub ---------------- */
/**
 * If the currentChatId refers to a stub with no personality and no messages,
 * delete it and adjust currentChatId/UI accordingly.
 */
function cleanupEmptyStub() {
  if (!currentChatId || !chats[currentChatId]) return;

  const chat = chats[currentChatId];
  const isEmptyStub = (!chat.personality || chat.personality === "") &&
                      (!chat.messages || chat.messages.length === 0);

  if (!isEmptyStub) return;

  // delete the stub
  delete chats[currentChatId];

  // pick a new current chat if available
  const remaining = Object.keys(chats);
  currentChatId = remaining[0] || "";

  // update UI
  if (currentChatId) {
    personality = chats[currentChatId].personality || "";
    document.getElementById("currentPersonality").textContent = personality;
    renderChatWindow();
  } else {
    personality = "";
    document.getElementById("currentPersonality").textContent = "";
    const chatWindow = document.getElementById("chatWindow");
    if (chatWindow) chatWindow.innerHTML = "";
  }

  saveChats();
  renderChatList();
}

/* Animation Orchestrator */
function animateTransition(fromId, toId, { inClass = "fly-in-right", outClass = "fly-out-left", duration = 550 } = {}) {
  const fromEl = document.getElementById(fromId);
  const toEl = document.getElementById(toId);
  if (!fromEl || !toEl) return;

  document.body.classList.add("transitioning");
  toEl.classList.remove("hidden");
  toEl.classList.add("pre-active", inClass);
  fromEl.classList.add(outClass);
  toEl.style.zIndex = 3;
  fromEl.style.zIndex = 2;

  let finished = 0;
  const cleanup = () => {
    fromEl.classList.remove(outClass, "active");
    fromEl.classList.add("hidden");
    toEl.classList.remove(inClass, "pre-active");
    toEl.classList.add("active");
    toEl.style.zIndex = "";
    fromEl.style.zIndex = "";
    document.body.classList.remove("transitioning");
  };

  const onEnd = () => {
    finished++;
    if (finished >= 2) {
      clearTimeout(fallbackTimer);
      cleanup();
    }
  };

  const fallbackTimer = setTimeout(cleanup, duration + 150);
  fromEl.addEventListener("animationend", onEnd, { once: true });
  toEl.addEventListener("animationend", onEnd, { once: true });
}

/* Show screen helper */
function showScreen(screenKey, { push = true } = {}) {
  const targetId = SCREEN_IDS[screenKey];

  // Determine currently-active screen key (if any)
  const currentKey = Object.keys(SCREEN_IDS).find(k => {
    const id = SCREEN_IDS[k];
    return document.getElementById(id)?.classList.contains("active");
  });

  // If we're leaving the personality screen, cleanup any empty stub
  if (currentKey === "personality" && screenKey !== "personality") {
    cleanupEmptyStub();
  }

  const current = Object.values(SCREEN_IDS).find(id => document.getElementById(id)?.classList.contains("active"));

  if (current && targetId && current !== targetId) {
    animateTransition(current, targetId);
  } else {
    Object.values(SCREEN_IDS).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === targetId) el.classList.remove("hidden"), el.classList.add("active");
      else el.classList.remove("active"), el.classList.add("hidden");
    });
  }

  setConsistentBackground();
  if (push) history.pushState({ screen: screenKey }, "", `#${screenKey}`);
}

function initRouter() {
  const hash = location.hash.replace("#", "");
  const initial = hash && SCREEN_IDS[hash] ? hash : "welcome";
  history.replaceState({ screen: initial }, "", `#${initial}`);
  showScreen(initial, { push: false });

  window.addEventListener("popstate", e => {
    const target = e.state?.screen || "welcome";
    showScreen(target, { push: false });
  });
}

/* ---------------- Navigation triggers ---------------- */
function goToPersonality() {
  // create a fresh chat stub so New Chat truly starts fresh
  currentChatId = `chat_${Date.now()}`;
  chats[currentChatId] = { personality: "", title: "", messages: [] };
  saveChats();
  renderChatList();

  // clear displayed personality while choosing
  document.getElementById("currentPersonality").textContent = "";
  showScreen("personality");
}

function selectPersonality(selected) {
  personality = selected;
  document.getElementById("currentPersonality").textContent = selected;

  // If current stub exists and has no messages and no personality, reuse it.
  if (currentChatId && chats[currentChatId] &&
      (!chats[currentChatId].messages || chats[currentChatId].messages.length === 0) &&
      !chats[currentChatId].personality) {
    chats[currentChatId].personality = selected;
  } else {
    // otherwise create a new chat entry
    currentChatId = `chat_${Date.now()}`;
    chats[currentChatId] = { personality: selected, title: "", messages: [] };
  }

  saveChats();
  renderChatList();
  renderChatWindow();
  showScreen("chat");
}

/* ----------------- Title generation utilities ----------------- */
const STOPWORDS = new Set([
  "i","me","my","we","our","you","your","he","she","it","they","them",
  "the","a","an","and","or","but","is","are","was","were","will","have","has",
  "to","of","in","on","for","with","that","this","what","how","can","do","did",
  "please","thanks","thank","hi","hello","hey","ok","okay"
]);

function generateRelevantTitle(text) {
  if (!text) return "";
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w));

  if (words.length === 0) return "";

  const freq = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);

  const sorted = Object.keys(freq).sort((a,b) => freq[b] - freq[a] || b.length - a.length);
  const titleWords = sorted.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1));
  return titleWords.join(' ');
}

/* ---------------- Chat helpers ---------------- */
function appendMessage(sender, text) {
  const chatWin = document.getElementById("chatWindow");
  if (!chatWin) return;

  // compute time once so saved time matches displayed time
  const timeStr = formatTime(new Date());

  const msgWrap = document.createElement("div");
  msgWrap.className = `message ${sender}`;

  // Meta (sender name + time)
  const meta = document.createElement("div");
  meta.className = "meta";

  const senderLabel = document.createElement("span");
  senderLabel.className = "sender";
  senderLabel.textContent = sender === "bot" ? "Chatterly" : "You";

  const timeLabel = document.createElement("span");
  timeLabel.className = "time";
  timeLabel.textContent = timeStr;

  meta.appendChild(senderLabel);
  meta.appendChild(timeLabel);

  // Content (safe: use textContent to avoid injecting HTML; preserve newlines with CSS pre-wrap)
  const content = document.createElement("div");
  content.className = "content";
  content.textContent = text; // safe — keeps plain text; CSS `white-space: pre-wrap` will show newlines

  msgWrap.appendChild(meta);
  msgWrap.appendChild(content);

  chatWin.appendChild(msgWrap);
  chatWin.scrollTop = chatWin.scrollHeight;

  // ensure chat exists (if not, create)
  if (!chats[currentChatId]) {
    chats[currentChatId] = { personality: personality || "Default", title: "", messages: [] };
  }

  // save message with time so reload preserves the timestamp
  chats[currentChatId].messages.push({ sender, text, time: timeStr });

  // After pushing the message, attempt to create a title (async)
  createChatTitleIfNeeded(currentChatId);

  saveChats();
  renderChatList();
}

function formatTime(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function appendTypingAnimation() {
  const chat = document.getElementById("chatWindow");
  if (!chat) return;
  const typing = document.createElement("div");
  typing.className = "message bot";
  typing.id = "typing";
  typing.textContent = "...";
  chat.appendChild(typing);
  chat.scrollTop = chat.scrollHeight;
}

function removeTypingAnimation() {
  document.getElementById("typing")?.remove();
}

/* ---------------- Renderers ---------------- */
function renderChatList() {
  const chatList = document.getElementById("chatList");
  if (!chatList) return;
  chatList.innerHTML = "";

  Object.entries(chats).forEach(([id, chat]) => {
    const item = document.createElement("div");
    item.className = "chat-item";
    if (id === currentChatId) item.classList.add("active");

    const titleEl = document.createElement("span");
    titleEl.className = "chat-title";

    // nicer fallback when personality/title missing
    if (chat.title && chat.title.trim()) {
      titleEl.textContent = chat.title.trim();
    } else if (chat.personality) {
      titleEl.textContent = `${chat.personality} chat`;
    } else {
      titleEl.textContent = `New chat`;
    }

    titleEl.style.flex = "1";
    titleEl.style.cursor = "pointer";
    titleEl.onclick = () => {
      currentChatId = id;
      personality = chat.personality || "";
      document.getElementById("currentPersonality").textContent = personality;
      renderChatWindow();
      showScreen("chat");
      renderChatList();
    };

    const menuBtn = document.createElement("button");
    menuBtn.className = "chat-menu-btn";
    menuBtn.setAttribute("aria-label", "Chat options");
    menuBtn.textContent = "⋮";
    menuBtn.style.marginLeft = "8px";
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      showChatMenu(id, menuBtn);
    };

    item.appendChild(titleEl);
    item.appendChild(menuBtn);
    chatList.appendChild(item);
  });
}

function showChatMenu(chatId, btn) {
  document.querySelectorAll(".chat-menu").forEach(menu => menu.remove());

  const menu = document.createElement("div");
  menu.className = "chat-menu";

  const delBtn = document.createElement("button");
  delBtn.className = "chat-menu-item";
  delBtn.type = "button";
  delBtn.textContent = "Delete";
  delBtn.onclick = () => { deleteChat(chatId); menu.remove(); };

  menu.appendChild(delBtn);
  document.body.appendChild(menu);

  const rect = btn.getBoundingClientRect();
  menu.style.position = "absolute";
  menu.style.top = `${rect.bottom + window.scrollY}px`;

  const menuWidth = menu.offsetWidth || 160;
  let left = rect.right - menuWidth + window.scrollX;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - menuWidth - 8;
  if (left > maxLeft) left = maxLeft;
  if (left < window.scrollX + 8) left = rect.left + window.scrollX;
  menu.style.left = `${left}px`;

  setTimeout(() => {
    document.addEventListener("click", () => menu.remove(), { once: true });
  }, 0);
}

function renderChatWindow() {
  const chatWindow = document.getElementById("chatWindow");
  if (!chatWindow) return;
  chatWindow.innerHTML = "";

  const currentChat = chats[currentChatId];
  if (!currentChat) return;

  currentChat.messages.forEach(({ sender, text, time }) => {
    const msgWrap = document.createElement("div");
    msgWrap.className = `message ${sender}`;

    const meta = document.createElement("div");
    meta.className = "meta";

    const senderLabel = document.createElement("span");
    senderLabel.className = "sender";
    senderLabel.textContent = sender === "bot" ? "Chatterly" : "You";

    const timeLabel = document.createElement("span");
    timeLabel.className = "time";
    timeLabel.textContent = time || "";

    meta.appendChild(senderLabel);
    meta.appendChild(timeLabel);

    const content = document.createElement("div");
    content.className = "content";
    content.textContent = text;

    msgWrap.appendChild(meta);
    msgWrap.appendChild(content);
    chatWindow.appendChild(msgWrap);
  });

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* ---------------- Chat deletion ---------------- */
function deleteChat(id) {
  delete chats[id];

  if (currentChatId === id) {
    const remaining = Object.keys(chats);
    currentChatId = remaining[0] || "";
    if (currentChatId) {
      personality = chats[currentChatId].personality;
      document.getElementById("currentPersonality").textContent = personality;
      renderChatWindow();
    } else {
      document.getElementById("currentPersonality").textContent = "";
      document.getElementById("chatWindow").innerHTML = "";
    }
  }

  saveChats();
  renderChatList();
}

/* ---------------- Persistence ---------------- */
function saveChats() {
  localStorage.setItem("chatterly_chats", JSON.stringify(chats));
}
function loadChats() {
  const saved = localStorage.getItem("chatterly_chats");
  if (saved) {
    try { chats = JSON.parse(saved); } catch { chats = {}; }
  }

  // if no currentChatId set, choose the first saved chat
  if (!currentChatId) {
    const first = Object.keys(chats)[0];
    if (first) currentChatId = first;
  }

  renderChatList();

  // Render the chat window and set personality label if a chat is selected
  if (currentChatId && chats[currentChatId]) {
    personality = chats[currentChatId].personality || "";
    document.getElementById("currentPersonality").textContent = personality;
    renderChatWindow();
  }
}

/* ---------------- Title creation (calls server, falls back client) ---------------- */
async function createChatTitleIfNeeded(chatId) {
  const chat = chats[chatId];
  if (!chat) return;
  if (chat.title && chat.title.trim() && chat.title !== "Generating…") return;
  if (!chat.messages || chat.messages.length < 2) return;

  const combined = chat.messages.slice(0,2).map(m => m.text).join(' ');

  chat.title = "Generating…";
  saveChats();
  renderChatList();

  try {
    const res = await fetch('/summarize', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ text: combined })
    });
    if (res.ok) {
      const data = await res.json();
      chat.title = (data.title && data.title.trim()) ? data.title : generateRelevantTitle(combined) || `${chat.personality || 'Chat'} chat`;
    } else {
      chat.title = generateRelevantTitle(combined) || `${chat.personality || 'Chat'} chat`;
    }
  } catch (err) {
    chat.title = generateRelevantTitle(combined) || `${chat.personality || 'Chat'} chat`;
  }

  saveChats();
  renderChatList();
}

/* ---------------- Form submission ---------------- */
document.getElementById("chatForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const input = document.getElementById("userInput");
  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", message);
  input.value = "";
  appendTypingAnimation();

  try {
    // only include history if there are messages
    const recentFull = chats[currentChatId]?.messages || [];
    const recent = recentFull.length ? recentFull.slice(-20) : [];

    const history = recent.map(m => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text
    }));

    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        personality,
        history // empty array if no messages
      })
    });

    const data = await res.json();
    removeTypingAnimation();
    appendMessage("bot", data.response);
  } catch (err) {
    removeTypingAnimation();
    appendMessage("bot", "[Error] Failed to get response.");
  }
});

document.getElementById("newChatBtn").addEventListener("click", () => {
  goToPersonality();
});

/* ---------------- Init ---------------- */
window.onload = function () {
  setConsistentBackground();
  loadChats();
  initRouter();
  window.scrollTo({ top: 0, left: 0 });
};

/* Expose for inline handlers */
window.goToPersonality = goToPersonality;
window.selectPersonality = selectPersonality;
