/* ==========================================================================
   知识笔记本 — 前端逻辑
   纯原生 JS，无任何框架依赖
   ========================================================================== */

const API = '';

/* ---------------- 全局状态 ---------------- */
const state = {
  notes: [],
  categories: [],
  stats: { total: 0, byCategory: {}, topTags: [], pinned: 0 },
  filter: { type: 'all', value: '' }, // all | pinned | category | tag
  query: '',
  sort: 'updated',
  editingId: null,
  viewingId: null,
  dirty: false,
};

/* ---------------- DOM 缓存 ---------------- */
const $ = (id) => document.getElementById(id);
const el = {
  sidebar: $('sidebar'),
  backdrop: $('backdrop'),
  menuBtn: $('menuBtn'),
  sidebarClose: $('sidebarClose'),
  newBtn: $('newBtn'),
  categoryList: $('categoryList'),
  tagCloud: $('tagCloud'),
  addCategoryBtn: $('addCategoryBtn'),
  countAll: $('countAll'),
  countPinned: $('countPinned'),
  exportBtn: $('exportBtn'),
  importBtn: $('importBtn'),
  importFile: $('importFile'),

  searchInput: $('searchInput'),
  clearSearch: $('clearSearch'),
  sortSelect: $('sortSelect'),
  themeBtn: $('themeBtn'),
  listTitle: $('listTitle'),
  listMeta: $('listMeta'),
  list: $('list'),
  empty: $('empty'),

  drawer: $('drawer'),
  drawerMask: $('drawerMask'),
  drawerTitle: $('drawerTitle'),
  drawerClose: $('drawerClose'),
  fTitle: $('fTitle'),
  fCategory: $('fCategory'),
  fTags: $('fTags'),
  fContent: $('fContent'),
  fPinned: $('fPinned'),
  charCount: $('charCount'),
  relatedBox: $('relatedBox'),
  relatedList: $('relatedList'),
  deleteBtn: $('deleteBtn'),
  cancelBtn: $('cancelBtn'),
  saveBtn: $('saveBtn'),

  viewMask: $('viewMask'),
  viewTitle: $('viewTitle'),
  viewMeta: $('viewMeta'),
  viewBody: $('viewBody'),
  viewClose: $('viewClose'),
  viewEdit: $('viewEdit'),
  viewPin: $('viewPin'),
  viewDelete: $('viewDelete'),

  toast: $('toast'),
};

/* ---------------- 工具函数 ---------------- */
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/** 在纯文本中高亮搜索关键词（输出已转义的 HTML） */
function highlight(text, query) {
  const safe = escapeHTML(text || '');
  if (!query) return safe;
  const kws = query.split(/\s+/).filter(Boolean)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  if (!kws.length) return safe;
  return safe.replace(new RegExp(`(${kws.join('|')})`, 'gi'), '<mark>$1</mark>');
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400 && d.getDate() === now.getDate()) {
    return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const y = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}-`;
  return `${y}${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let toastTimer = null;
function toast(msg, isError = false) {
  el.toast.textContent = msg;
  el.toast.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.className = 'toast'), 2200);
}

/* ---------------- 主题 ---------------- */
const THEME_KEY = 'kb-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  el.themeBtn.title = theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式';
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
  if (!saved) {
    saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  applyTheme(saved);
}

el.themeBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

/* ---------------- 数据加载 ---------------- */
async function loadStats() {
  try {
    state.stats = await api('/api/stats');
    state.categories = state.stats.categories || [];
    renderSidebar();
  } catch (e) {
    toast(e.message, true);
  }
}

async function loadNotes() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.filter.type === 'category') params.set('category', state.filter.value);
  if (state.filter.type === 'tag') params.set('tag', state.filter.value);
  params.set('sort', state.sort);

  try {
    const data = await api('/api/notes?' + params.toString());
    let notes = data.notes || [];
    if (state.filter.type === 'pinned') notes = notes.filter((n) => n.pinned);
    state.notes = notes;
    renderList();
  } catch (e) {
    toast(e.message, true);
  }
}

async function refresh() {
  await Promise.all([loadStats(), loadNotes()]);
}

/* ---------------- 侧边栏渲染 ---------------- */
function renderSidebar() {
  const { stats } = state;

  el.countAll.textContent = stats.total || 0;
  el.countPinned.textContent = stats.pinned || 0;

  // 分类列表
  const cats = state.categories.slice();
  const byCat = stats.byCategory || {};
  // 保证数据里出现过的分类也能显示
  Object.keys(byCat).forEach((c) => { if (!cats.includes(c)) cats.push(c); });

  el.categoryList.innerHTML = cats
    .map((c) => {
      const active = state.filter.type === 'category' && state.filter.value === c;
      return `
        <a class="nav-item${active ? ' active' : ''}" data-filter="category" data-value="${escapeHTML(c)}" href="#">
          <span class="nav-ico">📁</span>
          <span class="nav-text">${escapeHTML(c)}</span>
          <span class="nav-count">${byCat[c] || 0}</span>
          <button class="cat-del" data-cat="${escapeHTML(c)}" title="删除分类">✕</button>
        </a>`;
    })
    .join('');

  // 标签云
  const tags = stats.topTags || [];
  el.tagCloud.innerHTML = tags.length
    ? tags
        .map((t) => {
          const active = state.filter.type === 'tag' && state.filter.value === t.name;
          return `<span class="tag-chip${active ? ' active' : ''}" data-tag="${escapeHTML(t.name)}">#${escapeHTML(t.name)} <b>${t.count}</b></span>`;
        })
        .join('')
    : '<span class="tag-empty">暂无标签</span>';

  // 「全部 / 置顶」高亮
  document.querySelectorAll('.nav-item[data-filter="all"], .nav-item[data-filter="pinned"]')
    .forEach((n) => {
      n.classList.toggle('active', state.filter.type === n.dataset.filter);
    });
}

/* ---------------- 列表渲染 ---------------- */
function filterTitle() {
  const f = state.filter;
  if (state.query) return `搜索「${state.query}」`;
  if (f.type === 'pinned') return '置顶笔记';
  if (f.type === 'category') return f.value;
  if (f.type === 'tag') return `#${f.value}`;
  return '所有笔记';
}

function renderList() {
  const notes = state.notes;
  el.listTitle.textContent = filterTitle();
  el.listMeta.textContent = `${notes.length} 条`;

  if (!notes.length) {
    el.list.innerHTML = '';
    el.empty.hidden = false;
    const isSearch = !!state.query || state.filter.type !== 'all';
    el.empty.querySelector('.empty-title').textContent = isSearch ? '没有找到匹配的内容' : '还没有内容';
    el.empty.querySelector('.empty-sub').textContent = isSearch
      ? '换个关键词，或清空筛选条件试试'
      : '点击「新建笔记」开始记录你的第一个想法';
    return;
  }
  el.empty.hidden = true;

  el.list.innerHTML = notes
    .map((n) => {
      const excerpt = n.excerpt && n.excerpt.trim();
      return `
      <article class="card" data-id="${n.id}">
        <div class="card-top">
          <div class="card-title">${highlight(n.title, state.query)}</div>
          ${n.pinned ? '<span class="pin-flag" title="已置顶">📌</span>' : ''}
        </div>
        <div class="card-excerpt${excerpt ? '' : ' is-empty'}">${
          excerpt ? highlight(excerpt, state.query) : '（无正文）'
        }</div>
        <div class="card-foot">
          ${n.category ? `<span class="cat-badge">${escapeHTML(n.category)}</span>` : ''}
          <div class="card-tags">
            ${(n.tags || []).slice(0, 3).map((t) => `<span class="card-tag">#${escapeHTML(t)}</span>`).join('')}
          </div>
          <span class="card-date">${fmtDate(n.updatedAt)}</span>
        </div>
      </article>`;
    })
    .join('');
}

/* ---------------- 抽屉（编辑） ---------------- */
function fillCategorySelect(current) {
  const cats = state.categories.slice();
  if (current && !cats.includes(current)) cats.push(current);
  if (!cats.includes('未分类')) cats.push('未分类');
  el.fCategory.innerHTML = cats
    .map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`)
    .join('');
  el.fCategory.value = current || '未分类';
  if (!el.fCategory.value) el.fCategory.value = '未分类';
}

function updateCharCount() {
  el.charCount.textContent = `${el.fContent.value.length} 字`;
}

function markDirty() { state.dirty = true; }

async function openDrawer(note) {
  state.editingId = note ? note.id : null;
  state.dirty = false;
  el.drawerTitle.textContent = note ? '编辑笔记' : '新建笔记';
  el.deleteBtn.hidden = !note;
  el.relatedBox.hidden = true;
  el.relatedList.innerHTML = '';

  if (note) {
    // 拉取完整内容 + 相关推荐
    try {
      const data = await api('/api/notes/' + encodeURIComponent(note.id));
      const full = data.note;
      el.fTitle.value = full.title || '';
      el.fContent.value = full.content || '';
      el.fTags.value = (full.tags || []).join(', ');
      el.fPinned.checked = !!full.pinned;
      fillCategorySelect(full.category);
      if (data.related && data.related.length) {
        el.relatedBox.hidden = false;
        el.relatedList.innerHTML = data.related
          .map((r) => `<div class="rel-item" data-id="${r.id}">📄 ${escapeHTML(r.title)}</div>`)
          .join('');
      }
    } catch (e) {
      toast(e.message, true);
      return;
    }
  } else {
    el.fTitle.value = '';
    el.fContent.value = '';
    el.fTags.value = '';
    el.fPinned.checked = false;
    fillCategorySelect('未分类');
  }

  updateCharCount();
  el.drawer.classList.add('show');
  el.drawerMask.classList.add('show');
  setTimeout(() => el.fTitle.focus(), 240);
}

function closeDrawer(force = false) {
  if (!force && state.dirty) {
    if (!confirm('有未保存的修改，确定要关闭吗？')) return;
  }
  el.drawer.classList.remove('show');
  el.drawerMask.classList.remove('show');
  state.editingId = null;
  state.dirty = false;
}

async function saveNote() {
  const title = el.fTitle.value.trim();
  if (!title) {
    toast('请先填写标题', true);
    el.fTitle.focus();
    return;
  }
  const payload = {
    title,
    content: el.fContent.value,
    category: el.fCategory.value,
    tags: el.fTags.value,
    pinned: el.fPinned.checked,
  };

  el.saveBtn.disabled = true;
  try {
    if (state.editingId) {
      await api('/api/notes/' + encodeURIComponent(state.editingId), {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      toast('已保存');
    } else {
      await api('/api/notes', { method: 'POST', body: JSON.stringify(payload) });
      toast('已新建');
    }
    state.dirty = false;
    closeDrawer(true);
    await refresh();
  } catch (e) {
    toast(e.message, true);
  } finally {
    el.saveBtn.disabled = false;
  }
}

async function deleteNote(id) {
  const note = state.notes.find((n) => n.id === id);
  const name = note ? `「${note.title}」` : '这条笔记';
  if (!confirm(`确定删除 ${name} 吗？此操作不可撤销。`)) return;
  try {
    await api('/api/notes/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('已删除');
    closeDrawer(true);
    closeView();
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------------- 阅读弹窗 ---------------- */
async function openView(id) {
  try {
    const data = await api('/api/notes/' + encodeURIComponent(id));
    const n = data.note;
    state.viewingId = id;
    el.viewTitle.textContent = n.title;
    el.viewMeta.innerHTML = `
      ${n.category ? `<span class="cat-badge">${escapeHTML(n.category)}</span>` : ''}
      ${(n.tags || []).map((t) => `<span class="card-tag">#${escapeHTML(t)}</span>`).join('')}
      <span>更新于 ${fmtDate(n.updatedAt)}</span>
      ${n.pinned ? '<span>📌 已置顶</span>' : ''}
    `;
    el.viewBody.textContent = n.content || '（无正文）';
    el.viewPin.textContent = n.pinned ? '取消置顶' : '置顶';
    el.viewMask.classList.add('show');
  } catch (e) {
    toast(e.message, true);
  }
}

function closeView() {
  el.viewMask.classList.remove('show');
  state.viewingId = null;
}

/* ---------------- 分类操作 ---------------- */
async function addCategory() {
  const name = prompt('输入新分类名称：');
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const data = await api('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: trimmed }),
    });
    state.categories = data.categories;
    toast('分类已创建');
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteCategory(name) {
  if (!confirm(`删除分类「${name}」？该分类下的笔记会归入「未分类」，笔记本身不会丢失。`)) return;
  try {
    await api('/api/categories?name=' + encodeURIComponent(name), { method: 'DELETE' });
    if (state.filter.type === 'category' && state.filter.value === name) {
      state.filter = { type: 'all', value: '' };
    }
    toast('分类已删除');
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------------- 导入 / 导出 ---------------- */
function exportNotes() {
  window.location.href = '/api/export';
}

async function importNotes(file) {
  try {
    const text = await file.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { throw new Error('不是合法的 JSON 文件'); }
    const notes = Array.isArray(parsed) ? parsed : parsed.notes;
    if (!Array.isArray(notes)) throw new Error('文件里没有找到 notes 数组');
    const data = await api('/api/import', {
      method: 'POST',
      body: JSON.stringify({ notes, categories: parsed.categories || [] }),
    });
    toast(`已导入 ${data.added} 条笔记`);
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------------- 事件绑定 ---------------- */
function bindEvents() {
  /* 侧栏开关（移动端） */
  el.menuBtn.addEventListener('click', () => {
    el.sidebar.classList.add('show');
    el.backdrop.classList.add('show');
  });
  const closeSidebar = () => {
    el.sidebar.classList.remove('show');
    el.backdrop.classList.remove('show');
  };
  el.sidebarClose.addEventListener('click', closeSidebar);
  el.backdrop.addEventListener('click', closeSidebar);

  /* 新建 */
  el.newBtn.addEventListener('click', () => { closeSidebar(); openDrawer(null); });

  /* 侧栏导航
     注意：分类项是 loadStats() 之后异步渲染的，绑定时还不存在，
     所以必须用事件委托，不能直接给 .nav-item 绑事件 */
  document.querySelector('.nav').addEventListener('click', (e) => {
    // 删除分类按钮优先处理，且不再触发筛选
    const delBtn = e.target.closest('.cat-del');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      deleteCategory(delBtn.dataset.cat);
      return;
    }

    const item = e.target.closest('.nav-item');
    if (!item || !item.dataset.filter) return;
    e.preventDefault();
    state.filter = { type: item.dataset.filter, value: item.dataset.value || '' };
    closeSidebar();
    refresh();
  });

  /* 标签点击 */
  el.tagCloud.addEventListener('click', (e) => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    const same = state.filter.type === 'tag' && state.filter.value === tag;
    state.filter = same ? { type: 'all', value: '' } : { type: 'tag', value: tag };
    refresh();
  });

  el.addCategoryBtn.addEventListener('click', addCategory);

  /* 搜索（防抖） */
  let searchTimer = null;
  el.searchInput.addEventListener('input', () => {
    const v = el.searchInput.value;
    el.searchInput.parentElement.classList.toggle('has-value', !!v);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = v.trim();
      loadNotes();
    }, 200);
  });
  el.clearSearch.addEventListener('click', () => {
    el.searchInput.value = '';
    el.searchInput.parentElement.classList.remove('has-value');
    state.query = '';
    loadNotes();
    el.searchInput.focus();
  });

  /* 排序 */
  el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    loadNotes();
  });

  /* 列表：点击卡片阅读 */
  el.list.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openView(card.dataset.id);
  });

  /* 抽屉 */
  el.drawerClose.addEventListener('click', () => closeDrawer());
  el.cancelBtn.addEventListener('click', () => closeDrawer());
  el.drawerMask.addEventListener('click', () => closeDrawer());
  el.saveBtn.addEventListener('click', saveNote);
  el.deleteBtn.addEventListener('click', () => deleteNote(state.editingId));

  ['fTitle', 'fContent', 'fTags'].forEach((k) => {
    el[k].addEventListener('input', markDirty);
  });
  el.fCategory.addEventListener('change', markDirty);
  el.fPinned.addEventListener('change', markDirty);
  el.fContent.addEventListener('input', updateCharCount);

  /* 相关笔记跳转 */
  el.relatedList.addEventListener('click', (e) => {
    const item = e.target.closest('.rel-item');
    if (!item) return;
    closeDrawer(true);
    openView(item.dataset.id);
  });

  /* 阅读弹窗 */
  el.viewClose.addEventListener('click', closeView);
  el.viewMask.addEventListener('click', (e) => { if (e.target === el.viewMask) closeView(); });
  el.viewEdit.addEventListener('click', () => {
    const id = state.viewingId;
    const summary = state.notes.find((n) => n.id === id) || { id };
    closeView();
    openDrawer(summary);
  });
  el.viewPin.addEventListener('click', async () => {
    const id = state.viewingId;
    const note = state.notes.find((n) => n.id === id);
    try {
      await api('/api/notes/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !(note && note.pinned) }),
      });
      toast(note && note.pinned ? '已取消置顶' : '已置顶');
      await refresh();
      const nd = await api('/api/notes/' + encodeURIComponent(id));
      el.viewPin.textContent = nd.note.pinned ? '取消置顶' : '置顶';
    } catch (e) {
      toast(e.message, true);
    }
  });
  el.viewDelete.addEventListener('click', () => deleteNote(state.viewingId));

  /* 导入导出 */
  el.exportBtn.addEventListener('click', exportNotes);
  el.importBtn.addEventListener('click', () => el.importFile.click());
  el.importFile.addEventListener('change', () => {
    const f = el.importFile.files && el.importFile.files[0];
    if (f) importNotes(f);
    el.importFile.value = '';
  });

  /* 快捷键 */
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      closeDrawer(true);
      closeView();
      el.searchInput.focus();
      el.searchInput.select();
      return;
    }
    if (mod && e.key.toLowerCase() === 's' && el.drawer.classList.contains('show')) {
      e.preventDefault();
      saveNote();
      return;
    }
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openDrawer(null);
      return;
    }
    if (e.key === 'Escape') {
      if (el.drawer.classList.contains('show')) closeDrawer();
      else if (el.viewMask.classList.contains('show')) closeView();
      else closeSidebar();
    }
  });

  /* 刷新页面时提示未保存内容 */
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* ---------------- 启动 ---------------- */
initTheme();
bindEvents();
refresh();
