// ==========================================
// 🛡️ FIREBASE ВЕРСИЯ (ВХОД + СВЕТЛАЯ ТЕМА + АВТОСОХРАНЕНИЕ)
// ==========================================
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

// ==========================================
// АВТОСОХРАНЕНИЕ СЕССИИ
// ==========================================
setPersistence(auth, browserLocalPersistence)
  .catch((error) => console.error("Persistence error:", error));

let firebaseUser = null;
let currentUserName = "Друг";

const $ = id => document.getElementById(id);
const safeGet = (k, d) => { 
  try { 
    const v = localStorage.getItem(k); 
    return v && v !== 'null' ? JSON.parse(v) : d; 
  } catch(e) { 
    return d; 
  } 
};
const safeSet = (k, v) => { 
  try { 
    localStorage.setItem(k, JSON.stringify(v)); 
  } catch(e) {} 
};
const haptic = ms => navigator.vibrate && navigator.vibrate(ms || 10);

// ==========================================
// 🎨 ТЕМА ОФОРМЛЕНИЯ
// ==========================================
function applyTheme(theme) {
  const body = document.body;
  const savedTheme = theme || safeGet('app_theme', 'dark');
  
  if (savedTheme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) {
      body.classList.remove('light-theme');
    } else {
      body.classList.add('light-theme');
    }
  } else if (savedTheme === 'light') {
    body.classList.add('light-theme');
  } else {
    body.classList.remove('light-theme');
  }
  
  safeSet('app_theme', savedTheme);
  return savedTheme;
}

function setupTheme() {
  const themeSelect = document.getElementById('theme-select');
  if (!themeSelect) return;
  
  const savedTheme = safeGet('app_theme', 'dark');
  themeSelect.value = savedTheme;
  applyTheme(savedTheme);
  
  themeSelect.onchange = () => {
    const newTheme = themeSelect.value;
    applyTheme(newTheme);
  };
}

var tasks = safeGet('ai_tasks', []);
var homeFilter = 'reminder';
var showOldTasks = false;
var notifyFilter = 'all';
var showFavoritesOnly = false;
var awaitingTypeConfirm = null;
var deletedItemsCount = safeGet('deleted_count', 0);

var categories = [
  {id:'passwords', name:'Пароли', fav:false},
  {id:'dates', name:'Даты', fav:false},
  {id:'notes', name:'Заметки', fav:false},
  {id:'addresses', name:'Адреса', fav:false},
  {id:'health', name:'Здоровье', fav:false},
  {id:'transport', name:'Транспорт', fav:false},
  {id:'study', name:'Учёба', fav:false},
  {id:'people', name:'Люди', fav:false},
  {id:'pets', name:'Питомцы', fav:false},
  {id:'ideas', name:'Идеи', fav:false},
  {id:'favorites', name:'Любимое', fav:false},
  {id:'home', name:'Быт', fav:false},
  {id:'work', name:'Работа', fav:false},
  {id:'gardener', name:'Садовник', fav:false},
  {id:'plans', name:'Планы на будущее', fav:false},
  {id:'inventory', name:'Инвентаризация', fav:false},
  {id:'deleted', name:'Удаленные', fav:false}
];

safeSet('ai_categories', categories);

var headerIcons = {
  home: '<i class="fas fa-home"></i>',
  chat: '<i class="fas fa-comment-dots"></i>',
  memory: '<i class="fas fa-brain"></i>',
  settings: '<i class="fas fa-cog"></i>'
};

// ==========================================
// 📦 СИНХРОНИЗАЦИЯ С FIREBASE
// ==========================================
async function syncTasksToFirebase(userId, tasksList) {
  if (!userId) return;
  try {
    const tasksRef = collection(db, `users/${userId}/tasks`);
    const snapshot = await getDocs(tasksRef);
    const batch = writeBatch(db);
    snapshot.forEach(docSnap => batch.delete(docSnap.ref));
    for (const task of tasksList) {
      if (!task.deletedAt) {
        const newRef = doc(tasksRef);
        batch.set(newRef, {
          id: task.id,
          title: task.title,
          completed: task.done || false,
          type: task.type,
          notifyType: task.notifyType,
          datetime: task.datetime || null,
          created: task.created,
          createdAt: serverTimestamp()
        });
      }
    }
    await batch.commit();
    console.log("✅ Задачи синхронизированы с Firebase");
  } catch(e) { console.error("Ошибка синхронизации:", e); }
}

async function loadTasksFromFirebase(userId) {
  if (!userId) return [];
  try {
    const tasksRef = collection(db, `users/${userId}/tasks`);
    const q = query(tasksRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const loadedTasks = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      loadedTasks.push({
        id: data.id || docSnap.id,
        title: data.title,
        type: data.type || (data.datetime ? 'reminder' : 'note'),
        notifyType: data.notifyType || 'brief',
        datetime: data.datetime || null,
        created: data.created || new Date().toISOString(),
        done: data.completed || false,
        deletedAt: null
      });
    });
    return loadedTasks;
  } catch(e) { 
    console.error("Ошибка загрузки из Firebase:", e);
    return [];
  }
}

async function saveTasks() {
  safeSet('ai_tasks', tasks);
  if (firebaseUser) await syncTasksToFirebase(firebaseUser.uid, tasks);
}

// ==========================================
// 📱 ЭКРАНЫ И ИНИЦИАЛИЗАЦИЯ
// ==========================================
function showScreen(id) {
  var screens = ['auth-screen', 'consent-screen', 'app-wrapper'];
  for (var i = 0; i < screens.length; i++) {
    var s = screens[i];
    var el = $(s);
    if (el) {
      if (id === s) {
        el.style.display = (s === 'app-wrapper') ? 'block' : 'flex';
      } else {
        el.style.display = 'none';
      }
    }
  }
}

function initApp() {
  initNav();
  renderMemory();
  setupChat();
  renderHome();
  renderMyAccount();
}

function initNav() {
  var items = document.querySelectorAll('.nav-item');
  for (var i = 0; i < items.length; i++) {
    items[i].onclick = (function(btn) {
      return function() {
        haptic(15);
        var allItems = document.querySelectorAll('.nav-item');
        for (var j = 0; j < allItems.length; j++) {
          allItems[j].classList.remove('active');
        }
        var tabs = document.querySelectorAll('.tab');
        for (var j = 0; j < tabs.length; j++) {
          tabs[j].classList.remove('active');
        }
        btn.classList.add('active');
        var tab = btn.getAttribute('data-tab');
        var tabEl = document.getElementById('tab-' + tab);
        if (tabEl) tabEl.classList.add('active');
        
        var titles = {home:'Дом', chat:'Чат', memory:'Память', settings:'Настройки'};
        var pageTitle = $('page-title');
        if (pageTitle && titles[tab]) {
          pageTitle.textContent = titles[tab];
        }
        var headerIcon = $('header-icon');
        if (headerIcon && headerIcons[tab]) {
          headerIcon.innerHTML = headerIcons[tab];
        }
        
        var bar = $('input-bar');
        var main = $('main-content');
        if (tab === 'chat') {
          if (bar) bar.style.display = 'flex';
          if (main) main.classList.add('chat-active');
        } else {
          if (bar) bar.style.display = 'none';
          if (main) main.classList.remove('chat-active');
        }
      };
    })(items[i]);
  }
}

window.setHomeFilter = function(type) {
  haptic(15);
  homeFilter = type;
  var chips = document.querySelectorAll('.home-filters .filter-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.remove('active');
  }
  var c = document.querySelector('.home-filters .filter-chip[data-filter="' + type + '"]');
  if (c) c.classList.add('active');
  showOldTasks = false;
  
  var notifyTabs = document.getElementById('notify-tabs-inline');
  var notifyInfo = $('notify-info');
  if (type === 'note') {
    if (notifyTabs) notifyTabs.style.display = 'none';
    if (notifyInfo) notifyInfo.style.display = 'none';
  } else {
    if (notifyTabs) notifyTabs.style.display = 'flex';
    if (notifyInfo) notifyInfo.style.display = 'block';
  }
  
  renderHome();
};

window.setNotifyFilter = function(type) {
  haptic(15);
  notifyFilter = type;
  var tabs = document.querySelectorAll('.notify-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('active');
  }
  var t = document.querySelector('.notify-tab[data-filter="' + type + '"]');
  if (t) t.classList.add('active');
  
  var infoText = '<strong>Все:</strong> Активные напоминания.';
  if (type === 'important') infoText = '<strong>Важные:</strong> Двойное уведомление.';
  else if (type === 'brief') infoText = '<strong>Краткие:</strong> Исчезает через 24ч.';
  else if (type === 'permanent') infoText = '<strong>Постоянные:</strong> Ежедневно.';
  
  var notifyInfo = $('notify-info');
  if (notifyInfo) notifyInfo.innerHTML = infoText;
  renderHome();
};

function getNotifyLabel(type, hasDateTime) {
  if (!hasDateTime) return 'Заметка';
  if (type === 'important') return 'Важные';
  if (type === 'brief') return 'Краткие';
  return 'Постоянные';
}

function getNotifyColor(type, hasDateTime) {
  if (!hasDateTime) return 'note-tag';
  if (type === 'important') return 'important-tag';
  if (type === 'brief') return 'brief-tag';
  return 'permanent-tag';
}

function formatDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('ru', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
}

// ==========================================
// 🏠 ГЛАВНЫЙ РЕНДЕР
// ==========================================
function updateStats() {
  if (!Array.isArray(tasks)) tasks = [];
  var active = 0, done = 0, remind = 0, notes = 0;
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (!t.deletedAt) {
      if (t.done) done++;
      else {
        active++;
        if (t.datetime) remind++;
        else notes++;
      }
    }
  }
  var statActive = $('stat-active');
  var statDone = $('stat-done');
  var statRemind = $('stat-remind');
  var statNotes = $('stat-notes');
  if (statActive) statActive.textContent = active;
  if (statDone) statDone.textContent = done;
  if (statRemind) statRemind.textContent = remind;
  if (statNotes) statNotes.textContent = notes;
}

function renderHome() {
  if (!Array.isArray(tasks)) tasks = [];
  
  updateStats();

  var list = $('home-tasks');
  if (!list) return;

  var vis = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (t.deletedAt) continue;
    if (homeFilter === 'reminder') {
      if (t.datetime) vis.push(t);
    } else {
      if (!t.datetime) vis.push(t);
    }
  }
  
  if (homeFilter === 'reminder' && notifyFilter !== 'all') {
    var filtered = [];
    for (var i = 0; i < vis.length; i++) {
      if (vis[i].notifyType === notifyFilter && !vis[i].done) {
        filtered.push(vis[i]);
      }
    }
    vis = filtered;
  }
  
  vis.sort(function(a, b) {
    return new Date(b.created) - new Date(a.created);
  });
  
  var weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  var rec = [];
  if (showOldTasks) {
    rec = vis;
  } else {
    for (var i = 0; i < vis.length; i++) {
      if (vis[i].created && new Date(vis[i].created).getTime() > weekAgo) {
        rec.push(vis[i]);
      }
    }
  }  
  if (rec.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#666">Пусто</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < rec.length; i++) {
    var t = rec[i];
    var isDone = t.done;
    var hasDateTime = t.datetime && t.datetime.length > 0;
    var label = getNotifyLabel(t.notifyType, hasDateTime);
    var tagClass = getNotifyColor(t.notifyType, hasDateTime);
    var dateStr = formatDate(t.datetime);
    var checkIcon = isDone ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '';
    var doneClass = isDone ? ' completed' : '';
    var checkedClass = isDone ? ' checked' : '';
    var trashActiveClass = isDone ? ' trash-active' : '';
    
    html += '<div class="task-wrapper fade-in' + doneClass + '" data-id="' + t.id + '" style="animation-delay:' + (i * 0.05) + 's">';
    html += '  <div class="task-item' + doneClass + '">';
    html += '    <div class="task-left" onclick="toggleDone(\'' + t.id + '\', event)">';
    html += '      <div class="check-circle' + checkedClass + '">' + checkIcon + '</div>';
    html += '    </div>';
    html += '    <div class="task-content" onclick="openEditModal(\'' + t.id + '\')">';
    html += '      <span class="type-tag ' + tagClass + '">' + label + '</span>';
    html += '      <h3>' + escapeHtml(t.title) + '</h3>';
    html += '      <div class="task-date">' + dateStr + '</div>';
    html += '    </div>';
    html += '    <div class="task-right' + trashActiveClass + '" data-id="' + t.id + '" data-done="' + isDone + '">';
    html += '      <svg class="trash-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
  }
  list.innerHTML = html;
  initTrashActions();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ==========================================
// 🗑️ ДЕЙСТВИЯ С КОРЗИНОЙ
// ==========================================
function initTrashActions() {
  var trashIcons = document.querySelectorAll('.task-right');
  for (var i = 0; i < trashIcons.length; i++) {
    var trash = trashIcons[i];
    var isDone = trash.getAttribute('data-done') === 'true';
    
    trash.onclick = null;
    trash.onmousedown = null;
    trash.onmouseup = null;
    trash.onmouseleave = null;
    trash.ontouchstart = null;
    trash.ontouchend = null;
    trash.ontouchmove = null;
    
    if (isDone) {
      trash.onclick = function(e) {
        e.stopPropagation();
        haptic(50);
        var taskWrapper = this.closest('.task-wrapper');
        if (taskWrapper) {
          var id = taskWrapper.getAttribute('data-id');
          if (id) {
            deleteToTrash(id);
          }
        }
      };
    } else {
      var timer = null;
      
      var makeActive = function(element) {
        element.classList.add('trash-active');
      };
      
      var makeInactive = function(element) {
        element.classList.remove('trash-active');
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
      
      var handleDelete = function(element) {
        var taskWrapper = element.closest('.task-wrapper');
        if (taskWrapper) {
          var id = taskWrapper.getAttribute('data-id');
          if (id) {
            showCustomConfirm('Удалить задачу?', function() {
              deleteToTrash(id);
            });
          }
        }
        makeInactive(element);
      };
      
      trash.ontouchstart = function(e) {
        e.stopPropagation();
        makeActive(this);
        timer = setTimeout(function(self) {
          return function() {
            handleDelete(self);
          };
        }(this), 500);
      };
      
      trash.ontouchend = function(e) {
        e.stopPropagation();
        makeInactive(this);
      };
      
      trash.ontouchmove = function(e) {
        makeInactive(this);
      };
      
      trash.onmousedown = function(e) {
        e.stopPropagation();
        makeActive(this);
        timer = setTimeout(function(self) {
          return function() {
            handleDelete(self);
          };
        }(this), 500);
      };
      
      trash.onmouseup = function(e) {
        e.stopPropagation();
        makeInactive(this);
      };
      
      trash.onmouseleave = function(e) {
        makeInactive(this);
      };
    }
  }
}

// ==========================================
// 🔔 КАСТОМНОЕ ОКНО ПОДТВЕРЖДЕНИЯ
// ==========================================
function showCustomConfirm(message, onConfirm) {
  var overlay = document.createElement('div');
  overlay.className = 'custom-confirm-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
  
  var dialog = document.createElement('div');
  dialog.className = 'custom-confirm-dialog';
  dialog.style.cssText = 'background:#1a1a1a;border-radius:16px;padding:20px;min-width:250px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
  
  var text = document.createElement('p');
  text.textContent = message;
  text.style.cssText = 'color:#4ade80;font-size:16px;margin-bottom:20px;font-family:system-ui,-apple-system,sans-serif;';
  
  var buttonsDiv = document.createElement('div');
  buttonsDiv.style.cssText = 'display:flex;gap:12px;justify-content:center;';
  
  var confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Да';
  confirmBtn.style.cssText = 'background:#4ade80;border:none;padding:8px 24px;border-radius:8px;color:#1a1a1a;font-weight:600;cursor:pointer;font-size:14px;transition:all 0.2s;';
  
  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Нет';
  cancelBtn.style.cssText = 'background:#333;border:none;padding:8px 24px;border-radius:8px;color:#fff;cursor:pointer;font-size:14px;transition:all 0.2s;';
  
  buttonsDiv.appendChild(confirmBtn);
  buttonsDiv.appendChild(cancelBtn);
  dialog.appendChild(text);
  dialog.appendChild(buttonsDiv);
  overlay.appendChild(dialog);
  
  document.body.appendChild(overlay);
  
  confirmBtn.onclick = function() {
    document.body.removeChild(overlay);
    if (onConfirm) onConfirm();
  };
  
  cancelBtn.onclick = function() {
    document.body.removeChild(overlay);
  };
  
  overlay.onclick = function(e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };
}

// ==========================================
// 🗂️ ДЕЙСТВИЯ
// ==========================================
window.toggleDone = function(id, e) {
  if (e) e.stopPropagation();
  haptic(15);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) {
      tasks[i].done = !tasks[i].done;
      saveTasks();
      renderHome();
      break;
    }
  }
};

window.deleteToTrash = function(id) {
  haptic(50);
  var newTasks = [];
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id !== id) {
      newTasks.push(tasks[i]);
    }
  }
  tasks = newTasks;
  saveTasks();
  renderHome();
  renderMemory();
  showToast();
};

// ==========================================
// 🗂️ ПАМЯТЬ
// ==========================================
window.toggleFavFilter = function() {
  haptic(15);
  showFavoritesOnly = !showFavoritesOnly;
  var toggle = $('fav-toggle');
  if (toggle) toggle.classList.toggle('active', showFavoritesOnly);
  renderMemory();
};

function renderMemory() {
  var memoryCategories = $('memory-categories');
  if (!memoryCategories) return;
  
  var f = showFavoritesOnly ? categories.filter(c => c.fav) : categories;
  var html = '';
  
  var icons = {
    'passwords': '🔐', 'dates': '📅', 'notes': '📝', 'addresses': '📍',
    'health': '💪', 'transport': '🚗', 'study': '📚', 'people': '👥',
    'pets': '🐾', 'ideas': '💡', 'favorites': '⭐', 'home': '🏠',
    'work': '💼', 'gardener': '🌱', 'plans': '📌', 'inventory': '📦',
    'deleted': '🗑️'
  };
  
  for (var i = 0; i < f.length; i++) {
    var c = f[i];
    var likedClass = c.fav ? ' liked' : '';
    var icon = icons[c.id] || '📌';
    
    html += '<div class="category-item">';
    html += '  <div class="cat-icon">' + icon + '</div>';
    html += '  <div class="cat-name">' + c.name + '</div>';
    html += '  <svg class="heart-icon' + likedClass + '" viewBox="0 0 24 24" onclick="toggleCategoryFav(\'' + c.id + '\',event)"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    html += '</div>';
  }
  memoryCategories.innerHTML = html;
}

window.toggleCategoryFav = function(id, e) {
  if (e) e.stopPropagation();
  haptic(15);
  for (var i = 0; i < categories.length; i++) {
    if (categories[i].id === id) {
      categories[i].fav = !categories[i].fav;
      safeSet('ai_categories', categories);
      renderMemory();
      break;
    }
  }
};

// ==========================================
// 🛠️ МОДАЛКА И УТИЛИТЫ
// ==========================================
window.openEditModal = function(id) {
  haptic(15);
  var t = null;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) { t = tasks[i]; break; }
  }
  if (!t) return;
  
  $('edit-id').value = t.id;
  $('edit-title').value = t.title;
  $('edit-notify-type').value = t.notifyType || 'important';
  $('edit-datetime').value = t.datetime || '';
  $('edit-modal').classList.add('active');
};

window.closeModal = function() {
  haptic(10);
  $('edit-modal').classList.remove('active');
};

window.saveEdit = function() {
  var id = $('edit-id').value;
  if (!id) return;
  
  var newTitle = $('edit-title').value || 'Без названия';
  var newNotifyType = $('edit-notify-type').value || 'important';
  var newDatetime = $('edit-datetime').value || '';
  
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) {
      tasks[i].title = newTitle;
      tasks[i].notifyType = newNotifyType;
      tasks[i].datetime = newDatetime;
      tasks[i].type = (newDatetime && newDatetime.length > 0) ? 'reminder' : 'note';
      break;
    }
  }
  
  saveTasks();
  renderHome();
  closeModal();
};

window.logoutUser = function() {
  haptic(50);
  showCustomConfirm('Выйти из аккаунта?', function() {
    localStorage.clear();
    tasks = [];
    firebaseUser = null;
    showScreen('auth-screen');
  });
};

window.exportData = function() {
  haptic(20);
  if (tasks.length === 0) { alert('Нет задач'); return; }
  var a = document.createElement('a');
  a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks, null, 2));
  a.download = 'backup_' + Date.now() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.contactSupport = function() {
  haptic(30);
  const phone = "+79800984901";
  const url = `https://wa.me/${phone}?text=Здравствуйте!%20Нужна%20помощь%20с%20Умным%20блокнотом`;
  setTimeout(() => window.location.href = url, 100);
};

function showToast() {
  var t = $('toast');
  if (t) {
    t.classList.add('show');
    setTimeout(function() { t.classList.remove('show'); }, 2000);
  }
}

// ==========================================
// 💬 ЧАТ
// ==========================================
var voiceRecording = false;
var mediaRecorder = null;
var audioChunks = [];
var chatInput = null;
var chatMessages = null;

function addMessage(txt, s) {
  if (!chatMessages) return;
  var d = document.createElement('div');
  d.className = 'message ' + s;
  d.innerHTML = '<div class="bubble fade-in">' + txt + '</div>';
  chatMessages.appendChild(d);
  setTimeout(function() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 50);
}

function toSafeStr(t) { return String(t || '').toLowerCase().trim(); }

function parseUserInput(text) {
  try {
    var l = toSafeStr(text);
    var d = new Date();
    var c = text;
    var hasDate = false, hasTime = false, h = 0, m = 0;
    
    if (l.indexOf('послезавтра') !== -1) { d.setDate(d.getDate() + 2); c = c.replace(/послезавтра/gi, ''); hasDate = true; } 
    else if (l.indexOf('завтра') !== -1) { d.setDate(d.getDate() + 1); c = c.replace(/завтра/gi, ''); hasDate = true; }
    
    var tm = l.match(/(\d{1,2})[.:](\d{2})/);
    if (tm) { h = parseInt(tm[1]); m = parseInt(tm[2]); if (h >= 0 && h < 24 && m >= 0 && m < 60) { d.setHours(h, m, 0, 0); hasTime = true; } }
    
    if (hasTime && !hasDate) { var now = new Date(); var taskTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0); if (taskTime < now) { d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); } hasDate = true; }
    if (hasDate && !hasTime) { d.setHours(9, 0, 0, 0); }
    if (!hasDate && !hasTime) { return {dt: null, title: text}; }
    
    var y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0'), hh = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
    c = c.trim(); if (c.length > 0) { c = c.charAt(0).toUpperCase() + c.slice(1); } else { c = "Задача"; }
    return {dt: y + '-' + mo + '-' + da + 'T' + hh + ':' + mi, title: c};
  } catch(e) { return {dt: null, title: String(text)}; }
}

function detectType(t) {
  var l = toSafeStr(t);
  if (l.indexOf('постоянно') !== -1 || l.indexOf('каждый') !== -1) return 'permanent';
  if (l.indexOf('важно') !== -1 || l.indexOf('врач') !== -1) return 'important';
  return 'unknown';
}

function processUserMessage(text) {
  addMessage(text, 'user');
  
  var lower = toSafeStr(text);
  
  if (lower.indexOf('привет') !== -1 || lower.indexOf('здравствуй') !== -1 || lower.indexOf('добрый') !== -1 || lower.indexOf('hi') !== -1) {
    addMessage('Привет! 👋 Напиши задачу, например:<br>"Завтра в 18.00 полить цветы"', 'ai');
    return;
  }
  
  if (awaitingTypeConfirm) {
    if (lower === '1' || lower.indexOf('важн') !== -1) awaitingTypeConfirm.notifyType = 'important';
    else if (lower === '2' || lower.indexOf('кратк') !== -1) awaitingTypeConfirm.notifyType = 'brief';
    else if (lower === '3' || lower.indexOf('постоянн') !== -1) awaitingTypeConfirm.notifyType = 'permanent';
    else { addMessage('Напиши 1, 2 или 3.', 'ai'); return; }
    tasks.push(awaitingTypeConfirm);
    awaitingTypeConfirm = null;
    saveTasks();
    renderHome();
    addMessage('✅ Записал!', 'ai');
    showToast();
    return;
  }
  
  var p = parseUserInput(text);
  var type = 'note', cat = '';
  if (p.dt || lower.indexOf('напомн') !== -1) { type = 'reminder'; cat = 'Напоминание'; }
  else if (lower.indexOf('пароль') !== -1 || lower.indexOf('идея') !== -1) { type = 'note'; cat = lower.indexOf('пароль') !== -1 ? 'Безопасность' : 'Личное'; }
  
  var nType = detectType(text);
  var task = {
    id: String(Date.now()), title: p.title || text, type: type,
    notifyType: nType === 'unknown' ? 'brief' : nType, category: cat,
    datetime: p.dt, created: new Date().toISOString(), done: false, deletedAt: null
  };
  
  if (type === 'reminder' && nType === 'unknown') {
    awaitingTypeConfirm = task;
    addMessage('Какой тип?<br>1. Важные<br>2. Краткие<br>3. Постоянные', 'ai');
    return;
  }
  
  tasks.push(task);
  saveTasks();
  renderHome();
  addMessage('✓ Записано!', 'ai');
  showToast();
}

function handleSend() {
  if (!chatInput) return;
  var text = chatInput.value.trim();
  if (!text) return;
  processUserMessage(text);
  chatInput.value = '';
}

// ==========================================
// 🎤 ГОЛОСОВОЙ ВВОД
// ==========================================
function toggleVoiceInput() {
  if (voiceRecording) {
    stopVoiceInput();
  } else {
    startVoiceInput();
  }
}

function startVoiceInput() {
  haptic(15);
  
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (SpeechRecognition) {
    voiceRecording = true;
    updateVoiceButton();
    
    var recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.continuous = false;
    
    recognition.onresult = function(event) {
      var transcript = event.results[0][0].transcript;
      if (transcript) {
        processUserMessage(transcript);
      }
    };
    
    recognition.onerror = function(event) {
      voiceRecording = false;
      updateVoiceButton();
      
      if (event.error === 'no-speech') {
        addMessage('🎤 Ничего не услышано', 'ai');
      } else if (event.error === 'not-allowed') {
        alert('Доступ к микрофону запрещён. Разрешите в настройках браузера.');
      } else if (event.error !== 'aborted') {
        addMessage('🎤 Ошибка: ' + event.error, 'ai');
      }
    };
    
    recognition.onend = function() {
      voiceRecording = false;
      updateVoiceButton();
    };
    
    recognition.start();
    
  } else {
    alert('Голосовой ввод не поддерживается в этом браузере');
  }
}

function stopVoiceInput() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  voiceRecording = false;
  updateVoiceButton();
}

function updateVoiceButton() {
  var voiceBtn = $('voice-btn');
  if (voiceBtn) {
    if (voiceRecording) {
      voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
      voiceBtn.style.background = '#EF4444';
      voiceBtn.style.color = '#fff';
    } else {
      voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
      voiceBtn.style.background = 'var(--bg-relief)';
      voiceBtn.style.color = 'var(--text-muted)';
    }
  }
}

function setupChat() {
  chatInput = $('chat-input');
  chatMessages = $('chat-messages');
  var sendBtn = $('send-btn');
  var voiceBtn = $('voice-btn');
  
  var userName = 'Пользователь';
  if (firebaseUser && firebaseUser.displayName) userName = firebaseUser.displayName;
  
  if (chatMessages) {
    chatMessages.innerHTML = '<div class="message ai"><div class="bubble">Привет, ' + userName + '! 👋 Я готов к работе.</div></div>';
  }
  
  if (sendBtn) sendBtn.onclick = handleSend;
  if (chatInput) chatInput.onkeypress = function(e) { if (e.key === 'Enter') handleSend(); };
  
  if (voiceBtn) {
    voiceBtn.onclick = toggleVoiceInput;
  }
}

// ==========================================
// 🔑 ФУНКЦИЯ TOGGLE ПАРОЛЯ
// ==========================================
window.togglePasswordVisibility = function(inputId, btn) {
  var input = document.getElementById(inputId);
  if (input) {
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
      input.type = 'password';
      btn.innerHTML = '<i class="fas fa-eye"></i>';
    }
  }
};

// ==========================================
// 🔥 FIREBASE АВТОРИЗАЦИЯ
// ==========================================
function setupFirebaseUI() {
  const loginBtn = $('btn-login');
  const registerBtn = $('btn-register');
  const googleBtn = $('btn-google');
  const authEmail = $('auth-email');
  const authPass = $('auth-pass');
  const authError = $('auth-error');

  if (loginBtn) {
    loginBtn.onclick = async () => {
      const email = authEmail?.value.trim();
      const pass = authPass?.value;
      if (!email || !pass) {
        if (authError) authError.textContent = 'Введите email и пароль';
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, email, pass);
        if (authError) authError.textContent = '';
      } catch(err) {
        if (authError) authError.textContent = err.message;
      }
    };
  }

  if (registerBtn) {
    registerBtn.onclick = async () => {
      const email = authEmail?.value.trim();
      const pass = authPass?.value;
      if (!email || !pass) {
        if (authError) authError.textContent = 'Введите email и пароль';
        return;
      }
      if (pass.length < 6) {
        if (authError) authError.textContent = 'Пароль минимум 6 символов';
        return;
      }
      try {
        await createUserWithEmailAndPassword(auth, email, pass);
        if (authError) authError.textContent = '';
      } catch(err) {
        if (authError) authError.textContent = err.message;
      }
    };
  }

  if (googleBtn) {
    googleBtn.onclick = async () => {
      try {
        await signInWithPopup(auth, googleProvider);
        if (authError) authError.textContent = '';
      } catch(err) {
        if (authError) authError.textContent = err.message;
      }
    };
  }
}

// ==========================================
// МОДАЛКА "КАК ВОЙТИ"
// ==========================================
window.showHowToLogin = function() {
  const modalHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;align-items:center;justify-content:center;">
      <div style="background:#1f1f1f;border-radius:20px;padding:24px;max-width:340px;margin:20px;border:1px solid #333;width:100%;">
        <h3 style="margin-bottom:16px;color:#10B981;">Как войти в приложение</h3>
        <p style="color:#ddd;line-height:1.6;font-size:14.5px;">
          • Через <strong>Email и пароль</strong><br>
          • Через <strong>Google аккаунт</strong><br><br>
          Если забыли пароль — напишите в поддержку.
        </p>
        <button onclick="this.closest('div[style*=\"position:fixed\"]').remove()" 
                style="margin-top:20px;width:100%;padding:14px;background:#10B981;color:#000;border:none;border-radius:16px;font-weight:600;">
          Понятно
        </button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

// ==========================================
// МОЙ АККАУНТ
// ==========================================
function renderMyAccount() {
  const settingsTab = document.getElementById('tab-settings');
  if (!settingsTab) return;

  const user = firebaseUser;
  const email = user ? (user.email || '—') : '—';
  const photo = user && user.photoURL ? user.photoURL : 'https://via.placeholder.com/48/10B981/ffffff?text=👤';

  const html = `
    <div class="category-item" onclick="editUserName()" style="position:relative;">
      <div class="cat-icon" style="background:none;padding:0;">
        <img src="${photo}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #10B981;">
      </div>
      <div class="cat-name">
        ${currentUserName}<br>
        <small style="color:#888;font-size:12px;">${email}</small>
      </div>
      <div id="notification-badge" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);width:10px;height:10px;background:#EF4444;border-radius:50%;display:none;"></div>
    </div>
  `;

  const oldBlock = settingsTab.querySelector('.category-item[onclick*="editUserName"]');
  if (oldBlock) oldBlock.remove();

  settingsTab.insertAdjacentHTML('afterbegin', html);
}

// ==========================================
// РЕДАКТИРОВАНИЕ ИМЕНИ
// ==========================================
window.editUserName = function() {
  const newName = prompt("Новое имя:", currentUserName);
  if (!newName || !newName.trim()) return;

  currentUserName = newName.trim();
  
  if (firebaseUser) {
    updateProfile(firebaseUser, { displayName: currentUserName });
    safeSet(`profile_${firebaseUser.uid}`, { name: currentUserName });
  }
  
  const accountBlock = document.querySelector('#tab-settings .category-item[onclick*="editUserName"]');
  if (accountBlock) accountBlock.remove();
  
  renderMyAccount();
  showToast();
};

// ==========================================
// 👂 ОТСЛЕЖИВАНИЕ АВТОРИЗАЦИИ
// ==========================================
onAuthStateChanged(auth, async (user) => {
  firebaseUser = user;

  if (user) {
    const profile = safeGet(`profile_${user.uid}`, {});
    currentUserName = profile.name || user.displayName || user.email?.split('@')[0] || 'Пользователь';

    const loadedTasks = await loadTasksFromFirebase(user.uid);
    if (loadedTasks.length > 0) {
      tasks = loadedTasks;
      safeSet('ai_tasks', tasks);
    }

    if (localStorage.getItem('consent_accepted') === 'true') {
      showScreen('app-wrapper');
      initApp();
      renderMyAccount();
    } else {
      showScreen('consent-screen');
    }
  } else {
    firebaseUser = null;
    tasks = [];
    showScreen('auth-screen');
  }
});

// ==========================================
// 🚀 ЗАПУСК
// ==========================================
window.onload = function() {
  setupFirebaseUI();
  
  const howToLoginBtn = $('#how-to-login');
  if (howToLoginBtn) {
    howToLoginBtn.onclick = () => window.showHowToLogin();
  }
  
  const btnSupportAuth = $('#btn-support-auth');
  if (btnSupportAuth) {
    btnSupportAuth.onclick = () => window.contactSupport();
  }
  
  var agreeCheck = $('agree-check');
  var userNameInput = $('user-name');
  var btnConsent = $('btn-consent-next');

  function updateConsentButton() {
    var agreed = agreeCheck && agreeCheck.checked;
    var nameFilled = userNameInput && userNameInput.value.trim().length > 0;
    if (btnConsent) btnConsent.disabled = !(agreed && nameFilled);
  }

  if (agreeCheck) agreeCheck.onchange = updateConsentButton;
  if (userNameInput) userNameInput.oninput = updateConsentButton;

  if (btnConsent) {
    btnConsent.onclick = async () => {
      haptic(15);
      var n = (userNameInput && userNameInput.value.trim()) || 'Пользователь';
      
      if (firebaseUser) {
        await updateProfile(firebaseUser, { displayName: n });
        safeSet(`profile_${firebaseUser.uid}`, { name: n });
        currentUserName = n;
      }
      
      localStorage.setItem('consent_accepted', 'true');
      
      showScreen('app-wrapper');
      initApp();
      renderMyAccount();
    };
  }

  setupTheme();
  
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const savedTheme = safeGet('app_theme', 'dark');
    if (savedTheme === 'system') applyTheme('system');
  });

  showScreen('auth-screen');
};