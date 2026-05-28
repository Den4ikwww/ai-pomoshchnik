import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFvrwVTOVJs4taMF2VwDwTxP1a3JYWsow",
  authDomain: "flutter-ai-playground-219ed.firebaseapp.com",
  projectId: "flutter-ai-playground-219ed",
  storageBucket: "flutter-ai-playground-219ed.firebasestorage.app",
  messagingSenderId: "1042887981071",
  appId: "1:1042887981071:web:1c49d513000dae97b98b7a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// 🔒 Сессия сохраняется между перезагрузками
setPersistence(auth, browserLocalPersistence).catch(() => {});

let firebaseUser = null;
let currentUserName = "Друг";
let tasks = [];
let homeFilter = "reminder";
let notifyFilter = "all";
let showFavoritesOnly = false;
let awaitingTypeConfirm = null;
let recognition = null;
let voiceRecording = false;
let chatInput = null;
let chatMessages = null;

const $ = (id) => document.getElementById(id);
const safeGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const haptic = (ms = 10) => navigator.vibrate && navigator.vibrate(ms);

// ==========================================
// 🎨 ТЕМА
// ==========================================
function applyTheme(theme) {
  const t = theme || safeGet("app_theme", "dark");
  if (t === "system") {
    document.body.classList.toggle("light-theme", !window.matchMedia("(prefers-color-scheme: dark)").matches);
  } else {
    document.body.classList.toggle("light-theme", t === "light");
  }
  safeSet("app_theme", t);
}
function setupTheme() {
  const sel = $("theme-select");
  if (!sel) return;
  sel.value = safeGet("app_theme", "dark");
  applyTheme(sel.value);
  sel.onchange = () => applyTheme(sel.value);
}

// ==========================================
// ☁️ FIREBASE SYNC
// ==========================================
async function syncTasksToFirebase(uid, list) {
  if (!uid) return;
  try {
    const ref = collection(db, `users/${uid}/tasks`);
    const snap = await getDocs(ref);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    list.filter(t => !t.deletedAt).forEach(t => {
      batch.set(doc(ref), {
        id: t.id, title: t.title, completed: !!t.done, type: t.type,
        notifyType: t.notifyType, datetime: t.datetime || null, created: t.created, createdAt: serverTimestamp()
      });
    });
    await batch.commit();
  } catch (e) { console.error("Sync error:", e); }
}

async function loadTasksFromFirebase(uid) {
  if (!uid) return [];
  try {
    const q = query(collection(db, `users/${uid}/tasks`), orderBy("createdAt", "desc"));
    return (await getDocs(q)).docs.map(d => ({
      id: d.data().id || d.id, title: d.data().title, type: d.data().type || (d.data().datetime ? "reminder" : "note"),
      notifyType: d.data().notifyType || "brief", datetime: d.data().datetime || null,
      created: d.data().created || new Date().toISOString(), done: d.data().completed || false, deletedAt: null
    }));
  } catch { return []; }
}

async function saveTasks() {
  safeSet("ai_tasks", tasks);
  if (firebaseUser) await syncTasksToFirebase(firebaseUser.uid, tasks);
}

// ==========================================
// 📱 UI ROUTING
// ==========================================
function showScreen(id) {  ["auth-screen", "consent-screen", "app-wrapper"].forEach(s => {
    const el = $(s);
    if (el) el.style.display = s === id ? (s === "app-wrapper" ? "block" : "flex") : "none";
  });
}

function initApp() {
  initNav();
  renderMemory();
  setupChat();
  renderHome();
  renderMyAccount();
}

function initNav() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.onclick = () => {
      haptic(15);
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      const tabEl = $(`tab-${tab}`);
      if (tabEl) tabEl.classList.add("active");
      
      const titles = { home: "Дом", chat: "Чат", memory: "Память", settings: "Настройки" };
      const pt = $("page-title"); if (pt) pt.textContent = titles[tab] || "Дом";
      const hi = $("header-icon"); if (hi) hi.innerHTML = { home: '<i class="fas fa-home"></i>', chat: '<i class="fas fa-comment-dots"></i>', memory: '<i class="fas fa-brain"></i>', settings: '<i class="fas fa-cog"></i>' }[tab] || '';
      
      const bar = $("input-bar"), main = $("main-content");
      if (tab === "chat") { bar && (bar.style.display = "flex"); main && main.classList.add("chat-active"); }
      else { bar && (bar.style.display = "none"); main && main.classList.remove("chat-active"); }
    };
  });
}

// ==========================================
// 🏠 HOME RENDER
// ==========================================
function setHomeFilter(type) { haptic(15); homeFilter = type; updateFilterUI(); renderHome(); }
function setNotifyFilter(type) { haptic(15); notifyFilter = type; updateFilterUI(); renderHome(); }

function updateFilterUI() {
  document.querySelectorAll(".home-filters .filter-chip").forEach(c => c.classList.toggle("active", c.dataset.filter === homeFilter));
  document.querySelectorAll(".notify-tab").forEach(t => t.classList.toggle("active", t.dataset.filter === notifyFilter));
  const tabs = $("notify-tabs-inline"), info = $("notify-info");
  if (homeFilter === "note") { tabs.style.display = "none"; info.style.display = "none"; return; }
  tabs.style.display = "flex"; info.style.display = "block";
  const labels = { all: "Активные напоминания.", important: "Двойное уведомление.", brief: "Исчезает через 24ч.", permanent: "Ежедневно." };
  info.innerHTML = `<strong>${notifyFilter === "all" ? "Все" : notifyFilter.charAt(0).toUpperCase() + notifyFilter.slice(1)}:</strong> ${labels[notifyFilter]}`;}

function updateStats() {
  const a = { active: 0, done: 0, remind: 0, notes: 0 };
  tasks.filter(t => !t.deletedAt).forEach(t => t.done ? a.done++ : (a.active++, t.datetime ? a.remind++ : a.notes++));
  if ($("stat-active")) $("stat-active").textContent = a.active;
  if ($("stat-done")) $("stat-done").textContent = a.done;
  if ($("stat-remind")) $("stat-remind").textContent = a.remind;
  if ($("stat-notes")) $("stat-notes").textContent = a.notes;
}

function renderHome() {
  updateStats();
  const list = $("home-tasks"); if (!list) return;
  let vis = tasks.filter(t => !t.deletedAt && (homeFilter === "reminder" ? t.datetime : !t.datetime));
  if (homeFilter === "reminder" && notifyFilter !== "all") vis = vis.filter(t => t.notifyType === notifyFilter && !t.done);
  vis.sort((a, b) => new Date(b.created) - new Date(a.created));
  vis = vis.filter(t => new Date(t.created).getTime() > Date.now() - 604800000);
  if (vis.length === 0) { list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Пусто</div>'; return; }

  list.innerHTML = vis.map((t, i) => {
    const hasDT = !!t.datetime;
    const label = !hasDT ? "Заметка" : (t.notifyType === "important" ? "Важные" : t.notifyType === "brief" ? "Краткие" : "Постоянные");
    const tagClass = !hasDT ? "note-tag" : `${t.notifyType}-tag`;
    const dateStr = t.datetime ? new Date(t.datetime).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    const check = t.done ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : "";
    return `<div class="task-wrapper fade-in${t.done ? " completed" : ""}" data-id="${t.id}" style="animation-delay:${i * 0.05}s">
      <div class="task-item${t.done ? " completed" : ""}">
        <div class="task-left" onclick="toggleDone('${t.id}', event)"><div class="check-circle${t.done ? " checked" : ""}">${check}</div></div>
        <div class="task-content" onclick="openEditModal('${t.id}')"><span class="type-tag ${tagClass}">${label}</span><h3>${escapeHtml(t.title)}</h3><div class="task-date">${dateStr}</div></div>
        <div class="task-right${t.done ? " trash-active" : ""}" data-id="${t.id}" data-done="${t.done}">
          <svg class="trash-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </div>
      </div>
    </div>`;
  }).join("");
  initTrashActions();
}

function escapeHtml(s) { return s ? s.replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])) : ""; }

// ==========================================
// 🗑️ ACTIONS
// ==========================================
function initTrashActions() {
  document.querySelectorAll(".task-right").forEach(trash => {
    const id = trash.dataset.id, isDone = trash.dataset.done === "true";
    trash.replaceWith(trash.cloneNode(true));
    const el = $(`.task-right[data-id="${id}"][data-done="${isDone}"]`);
    if (!el) return;    if (isDone) {
      el.onclick = e => { e.stopPropagation(); haptic(50); deleteToTrash(id); };
    } else {
      let timer;
      const activate = () => el.classList.add("trash-active");
      const deactivate = () => { el.classList.remove("trash-active"); clearTimeout(timer); };
      el.onmousedown = el.ontouchstart = e => { e.stopPropagation(); activate(); timer = setTimeout(() => showCustomConfirm("Удалить?", () => deleteToTrash(id)), 500); };
      el.onmouseup = el.onmouseleave = el.ontouchend = el.ontouchmove = e => { if(e) e.stopPropagation(); deactivate(); };
    }
  });
}

function toggleDone(id, e) { if (e) e.stopPropagation(); haptic(15); const t = tasks.find(x => x.id === id); if (t) { t.done = !t.done; saveTasks(); renderHome(); } }
function deleteToTrash(id) { haptic(50); tasks = tasks.filter(t => t.id !== id); saveTasks(); renderHome(); renderMemory(); showToast(); }

// ==========================================
// 🗂️ MEMORY & MODALS
// ==========================================
function toggleFavFilter() { haptic(15); showFavoritesOnly = !showFavoritesOnly; $("fav-toggle")?.classList.toggle("active", showFavoritesOnly); renderMemory(); }
function renderMemory() {
  const wrap = $("memory-categories"); if (!wrap) return;
  const f = showFavoritesOnly ? categories.filter(c => c.fav) : categories;
  const icons = { passwords: "🔐", dates: "📅", notes: "📝", addresses: "📍", health: "💪", transport: "🚗", study: "📚", people: "👥", pets: "🐾", ideas: "💡", favorites: "⭐", home: "🏠", work: "💼", gardener: "🌱", plans: "📌", inventory: "📦", deleted: "🗑️" };
  wrap.innerHTML = f.map(c => `<div class="category-item"><div class="cat-icon">${icons[c.id] || "📌"}</div><div class="cat-name">${c.name}</div><svg class="heart-icon${c.fav ? " liked" : ""}" viewBox="0 0 24 24" onclick="toggleCategoryFav('${c.id}',event)"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>`).join("");
}
function toggleCategoryFav(id, e) { if (e) e.stopPropagation(); haptic(15); const c = categories.find(x => x.id === id); if (c) { c.fav = !c.fav; safeSet("ai_categories", categories); renderMemory(); } }

function showCustomConfirm(msg, cb) {
  const o = document.createElement("div"); o.className = "custom-confirm-overlay"; o.innerHTML = `<div class="custom-confirm-dialog"><p>${msg}</p><div class="custom-confirm-buttons"><button class="confirm-yes">Да</button><button class="confirm-no">Нет</button></div></div>`;
  document.body.appendChild(o);
  o.querySelector(".confirm-yes").onclick = () => { document.body.removeChild(o); cb?.(); };
  o.querySelector(".confirm-no").onclick = () => document.body.removeChild(o);
  o.onclick = e => { if (e.target === o) document.body.removeChild(o); };
}

function openEditModal(id) { haptic(15); const t = tasks.find(x => x.id === id); if (!t) return; $("edit-id").value = t.id; $("edit-title").value = t.title; $("edit-notify-type").value = t.notifyType || "important"; $("edit-datetime").value = t.datetime || ""; $("edit-modal").classList.add("active"); }
function closeModal() { haptic(10); $("edit-modal")?.classList.remove("active"); }
function saveEdit() {
  const id = $("edit-id").value; if (!id) return;
  const t = tasks.find(x => x.id === id); if (!t) return;
  t.title = $("edit-title").value || "Без названия"; t.notifyType = $("edit-notify-type").value; t.datetime = $("edit-datetime").value; t.type = t.datetime ? "reminder" : "note";
  saveTasks(); renderHome(); closeModal();
}

// ==========================================
// 🔐 AUTH & SUPPORT
// ==========================================
function togglePasswordVisibility(inputId, btn) {
  const inp = $(inputId); if (!inp) return;
  inp.type = inp.type === "password" ? "text" : "password";  btn.innerHTML = inp.type === "password" ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}

function showHowToLogin() {
  haptic(10);
  const o = document.createElement("div"); o.className = "policy-overlay"; o.innerHTML = `<div class="policy-content"><h3>Как войти</h3><p>• Через <b>Email и пароль</b><br>• Через <b>Google аккаунт</b><br><br>Забыли пароль? Напишите в поддержку.</p><button class="policy-btn">Понятно</button></div>`;
  document.body.appendChild(o); const close = () => { o.remove(); }; o.querySelector(".policy-btn").onclick = close; o.onclick = e => e.target === o && close();
}

function contactSupport() {
  haptic(15);
  const phone = "79800984901";
  const messengerMaxLink = "https://m.me/your_max_id"; // 🔧 ЗАМЕНИ НА СВОЮ ССЫЛКУ MESSENGER MAX
  const o = document.createElement("div"); o.className = "policy-overlay";
  o.innerHTML = `<div class="policy-content" style="text-align:center">
    <h3>Связаться с поддержкой</h3>
    <p>Выберите мессенджер:</p>
    <div style="display:flex; gap:10px; justify-content:center; margin:16px 0">
      <a href="https://wa.me/${phone}?text=Привет!%20Нужна%20помощь%20с%20приложением" target="_blank" style="flex:1; background:#25D366; color:#fff; padding:12px; border-radius:12px; text-decoration:none; font-weight:600">WhatsApp</a>
      <a href="${messengerMaxLink}" target="_blank" style="flex:1; background:#0088cc; color:#fff; padding:12px; border-radius:12px; text-decoration:none; font-weight:600">Messenger Max</a>
    </div>
    <button class="policy-btn">Закрыть</button>
  </div>`;
  document.body.appendChild(o); const close = () => o.remove(); o.querySelector(".policy-btn").onclick = close; o.onclick = e => e.target === o && close();
}

function logoutUser() {
  haptic(50); showCustomConfirm("Выйти из аккаунта?", async () => {
    try { await auth.signOut(); } catch (e) { console.error(e); }
    localStorage.removeItem("ai_tasks"); localStorage.removeItem("consent_accepted");
    firebaseUser = null; tasks = []; showScreen("auth-screen");
  });
}

function exportData() {
  haptic(20); if (tasks.length === 0) return alert("Нет задач");
  const a = document.createElement("a"); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks, null, 2));
  a.download = `backup_${Date.now()}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function editUserName() {
  const n = prompt("Новое имя:", currentUserName); if (!n?.trim()) return;
  currentUserName = n.trim();
  if (firebaseUser) updateProfile(firebaseUser, { displayName: currentUserName });
  safeSet(`profile_${firebaseUser.uid}`, { name: currentUserName }); renderMyAccount(); showToast();
}

function showPolicyModal(type) {
  haptic(15); const data = type === "terms" ? { t: "Условия", p: "1. Используйте на свой страх и риск.\n2. Данные в Firebase.\n3. Не передаём третьим лицам." } : { t: "Конфиденциальность", p: "1. Собираем email и имя.\n2. Задачи в облаке.\n3. Голос обрабатывается локально." };
  const o = document.createElement("div"); o.className = "policy-overlay"; o.innerHTML = `<div class="policy-content"><h3>${data.t}</h3><p style="white-space:pre-line">${data.p}</p><button class="policy-btn">Понятно</button></div>`;  document.body.appendChild(o); const close = () => o.remove(); o.querySelector(".policy-btn").onclick = close; o.onclick = e => e.target === o && close();
}

function renderMyAccount() {
  const s = $("tab-settings"); if (!s) return;
  const email = firebaseUser?.email || "—"; const photo = firebaseUser?.photoURL || "https://via.placeholder.com/48/10B981/ffffff?text=👤";
  const old = s.querySelector('.category-item[onclick*="editUserName"]'); if (old) old.remove();
  s.insertAdjacentHTML("afterbegin", `<div class="category-item" onclick="editUserName()" style="position:relative;"><div class="cat-icon" style="background:none;padding:0;"><img src="${photo}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #10B981;"></div><div class="cat-name">${currentUserName}<br><small style="color:#888;font-size:12px;">${email}</small></div></div>`);
}

let categories = safeGet("ai_categories", [
  { id: "passwords", name: "Пароли", fav: false }, { id: "dates", name: "Даты", fav: false }, { id: "notes", name: "Заметки", fav: false },
  { id: "addresses", name: "Адреса", fav: false }, { id: "health", name: "Здоровье", fav: false }, { id: "transport", name: "Транспорт", fav: false },
  { id: "study", name: "Учёба", fav: false }, { id: "people", name: "Люди", fav: false }, { id: "pets", name: "Питомцы", fav: false },
  { id: "ideas", name: "Идеи", fav: false }, { id: "favorites", name: "Любимое", fav: false }, { id: "home", name: "Быт", fav: false },
  { id: "work", name: "Работа", fav: false }, { id: "gardener", name: "Садовник", fav: false }, { id: "plans", name: "Планы", fav: false },
  { id: "inventory", name: "Инвентаризация", fav: false }, { id: "deleted", name: "Удаленные", fav: false }
]);

// ==========================================
// 💬 CHAT & VOICE
// ==========================================
function addMessage(txt, s) { if (!chatMessages) return; const d = document.createElement("div"); d.className = `message ${s}`; d.innerHTML = `<div class="bubble fade-in">${escapeHtml(txt)}</div>`; chatMessages.appendChild(d); chatMessages.scrollTop = chatMessages.scrollHeight; }
function toSafeStr(t) { return String(t || "").toLowerCase().trim(); }

function parseUserInput(text) {
  try {
    let l = toSafeStr(text), d = new Date(), c = text, hasDate = false, hasTime = false, h = 0, m = 0;
    if (l.includes("послезавтра")) { d.setDate(d.getDate() + 2); c = c.replace(/послезавтра/gi, ""); hasDate = true; }
    else if (l.includes("завтра")) { d.setDate(d.getDate() + 1); c = c.replace(/завтра/gi, ""); hasDate = true; }
    const tm = l.match(/(?:в|на|к)?\s*(\d{1,2})[.:](\d{2})/);
    if (tm) { h = parseInt(tm[1]); m = parseInt(tm[2]); if (h < 24 && m < 60) { d.setHours(h, m); hasTime = true; } }
    if (hasTime && !hasDate) { const now = new Date(); const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m); if (t < now) { d.setDate(d.getDate() + 1); d.setHours(h, m); } hasDate = true; }
    if (hasDate && !hasTime) d.setHours(9, 0, 0, 0);
    if (!hasDate && !hasTime) return { dt: null, title: text };
    const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, "0"), da = String(d.getDate()).padStart(2, "0"), hh = String(d.getHours()).padStart(2, "0"), mi = String(d.getMinutes()).padStart(2, "0");
    c = c.trim(); return { dt: `${y}-${mo}-${da}T${hh}:${mi}`, title: c.charAt(0).toUpperCase() + c.slice(1) };
  } catch { return { dt: null, title: String(text) }; }
}

function detectType(t) { const l = toSafeStr(t); if (l.includes("постоянно") || l.includes("каждый")) return "permanent"; if (l.includes("важно") || l.includes("врач")) return "important"; return "unknown"; }

function processUserMessage(text) {
  addMessage(text, "user"); const l = toSafeStr(text);
  if (l.match(/^(привет|здравствуй|добрый|hi)/i)) { addMessage('Привет! 👋 Напиши задачу, например:<br>"Завтра в 18.00 полить цветы"', "ai"); return; }
  if (awaitingTypeConfirm) {
    if (l === "1" || l.includes("важн")) awaitingTypeConfirm.notifyType = "important";
    else if (l === "2" || l.includes("кратк")) awaitingTypeConfirm.notifyType = "brief";
    else if (l === "3" || l.includes("постоянн")) awaitingTypeConfirm.notifyType = "permanent";
    else { addMessage("Напиши 1, 2 или 3.", "ai"); return; }    tasks.push(awaitingTypeConfirm); awaitingTypeConfirm = null; saveTasks(); renderHome(); addMessage("✅ Записал!", "ai"); showToast(); return;
  }
  const p = parseUserInput(text); let type = "note"; if (p.dt || l.includes("напомн")) type = "reminder";
  const nType = detectType(text); const task = { id: String(Date.now()), title: p.title || text, type, notifyType: nType === "unknown" ? "brief" : nType, datetime: p.dt, created: new Date().toISOString(), done: false, deletedAt: null };
  if (type === "reminder" && nType === "unknown") { awaitingTypeConfirm = task; addMessage("Какой тип?<br>1. Важные<br>2. Краткие<br>3. Постоянные", "ai"); return; }
  tasks.push(task); saveTasks(); renderHome(); addMessage("✓ Записано!", "ai"); showToast();
}

function handleSend() { const txt = chatInput?.value.trim(); if (!txt) return; processUserMessage(txt); chatInput.value = ""; }

function toggleVoiceInput() { voiceRecording ? stopVoice() : startVoice(); }
function startVoice() {
  haptic(15); const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMessage("🎤 Голосовой ввод не поддерживается в этом браузере.", "ai"); return; }
  recognition = new SR(); recognition.lang = "ru-RU"; recognition.interimResults = false;
  recognition.onstart = () => { voiceRecording = true; updateVoiceUI(); addMessage("🎤 Слушаю...", "ai"); };
  recognition.onresult = e => { const t = e.results[0][0].transcript.trim(); if (t) processUserMessage(t); };
  recognition.onerror = e => { voiceRecording = false; updateVoiceUI(); addMessage(`🎤 Ошибка: ${e.error}`, "ai"); };
  recognition.onend = () => { voiceRecording = false; updateVoiceUI(); };
  try { recognition.start(); } catch { voiceRecording = false; updateVoiceUI(); addMessage("🎤 Не удалось запустить.", "ai"); }
}
function stopVoice() { if (recognition) recognition.stop(); voiceRecording = false; updateVoiceUI(); }
function updateVoiceUI() { const b = $("voice-btn"); if (!b) return; b.innerHTML = voiceRecording ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-microphone"></i>'; b.style.background = voiceRecording ? "#EF4444" : "var(--bg-relief)"; b.style.color = voiceRecording ? "#fff" : "var(--text-muted)"; b.classList.toggle("voice-recording", voiceRecording); }

function setupChat() {
  chatInput = $("chat-input"); chatMessages = $("chat-messages");
  $("send-btn")?.addEventListener("click", handleSend);
  chatInput?.addEventListener("keypress", e => { if (e.key === "Enter") handleSend(); });
  $("voice-btn")?.addEventListener("click", toggleVoiceInput);
  const clearBtn = $("clear-chat-btn");
  if (clearBtn) clearBtn.onclick = () => { if (confirm("Очистить историю чата?")) { chatMessages.innerHTML = ""; localStorage.removeItem("ai_chat_history"); addMessage("🧹 История очищена", "ai"); } };
  if (chatMessages && chatMessages.children.length === 0) { const name = firebaseUser?.displayName || "Пользователь"; chatMessages.innerHTML = `<div class="message ai"><div class="bubble">Привет, ${name}! 👋 Я готов к работе.</div></div>`; }
}

// ==========================================
// 🔥 INIT & AUTH STATE
// ==========================================
function initExports() {
  window.toggleDone = toggleDone; window.deleteToTrash = deleteToTrash; window.openEditModal = openEditModal;
  window.closeModal = closeModal; window.saveEdit = saveEdit; window.setHomeFilter = setHomeFilter;
  window.setNotifyFilter = setNotifyFilter; window.toggleFavFilter = toggleFavFilter; window.toggleCategoryFav = toggleCategoryFav;
  window.logoutUser = logoutUser; window.exportData = exportData; window.contactSupport = contactSupport;
  window.togglePasswordVisibility = togglePasswordVisibility; window.showHowToLogin = showHowToLogin;
  window.editUserName = editUserName; window.toggleVoiceInput = toggleVoiceInput; window.showPolicyModal = showPolicyModal;
}

onAuthStateChanged(auth, async (user) => {
  firebaseUser = user;
  if (user) {
    currentUserName = safeGet(`profile_${user.uid}`, {})?.name || user.displayName || user.email?.split("@")[0] || "Пользователь";    const loaded = await loadTasksFromFirebase(user.uid);
    if (loaded.length > 0) { tasks = loaded; safeSet("ai_tasks", tasks); }
    showScreen(localStorage.getItem("consent_accepted") === "true" ? "app-wrapper" : "consent-screen");
    initApp(); renderMyAccount();
  } else {
    firebaseUser = null; tasks = []; showScreen("auth-screen");
  }
});

window.onload = function () {
  initExports(); setupTheme();
  const login = $("btn-login"), reg = $("btn-register"), google = $("btn-google");
  const emailIn = $("auth-email"), passIn = $("auth-pass"), errEl = $("auth-error");
  const setLoad = (btn, loading) => { if (!btn) return; btn.disabled = loading; btn.innerHTML = loading ? '⏳ Загрузка...' : btn.getAttribute("data-original-text") || btn.innerHTML; };

  if (login) { login.dataset.originalText = "Войти"; login.onclick = async () => { setLoad(login, true); errEl.textContent = ""; try { await signInWithEmailAndPassword(auth, emailIn.value.trim(), passIn.value); } catch (e) { errEl.textContent = e.message; } finally { setLoad(login, false); } }; }
  if (reg) { reg.dataset.originalText = "Зарегистрироваться"; reg.onclick = async () => { setLoad(reg, true); errEl.textContent = ""; if (passIn.value.length < 6) { errEl.textContent = "Пароль минимум 6 символов"; setLoad(reg, false); return; } try { await createUserWithEmailAndPassword(auth, emailIn.value.trim(), passIn.value); } catch (e) { errEl.textContent = e.message; } finally { setLoad(reg, false); } }; }
  if (google) { google.onclick = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { errEl.textContent = e.message; } }; }
  
  $("how-to-login")?.addEventListener("click", showHowToLogin);
  $("btn-support-auth")?.addEventListener("click", contactSupport);

  const chk = $("agree-check"), nameIn = $("user-name"), consBtn = $("btn-consent-next");
  const updCons = () => { if (consBtn) consBtn.disabled = !(chk?.checked && nameIn?.value.trim()); };
  chk?.addEventListener("change", updCons); nameIn?.addEventListener("input", updCons);
  consBtn?.addEventListener("click", async () => { haptic(15); const n = nameIn?.value.trim() || "Пользователь"; if (firebaseUser) await updateProfile(firebaseUser, { displayName: n }); safeSet(`profile_${firebaseUser.uid}`, { name: n }); currentUserName = n; localStorage.setItem("consent_accepted", "true"); showScreen("app-wrapper"); initApp(); renderMyAccount(); });
};