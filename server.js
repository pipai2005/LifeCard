/**
 * 知识管理小工具 - 本地服务
 * 零依赖：仅使用 Node.js 内置模块，双击 start.bat / 运行 node server.js 即可
 *
 * 数据存储：data/notes.json （纯 JSON 文件，方便备份和迁移）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT) || 4321;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'notes.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

/** --open：启动后自动打开浏览器（供 start.bat 双击启动时使用）
 *  NO_OPEN=1：临时禁用自动打开，便于脚本化测试或手动管理浏览器 */
const OPEN_BROWSER =
  process.argv.includes('--open') && process.env.NO_OPEN !== '1';

/* ------------------------------------------------------------------ */
/* 数据层                                                              */
/* ------------------------------------------------------------------ */

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeDB({
      version: 1,
      notes: [],
      categories: ['工作', '学习', '生活', '灵感'],
    });
  }
}

function readDB() {
  ensureData();
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(db.notes)) db.notes = [];
    if (!Array.isArray(db.categories)) db.categories = [];
    return db;
  } catch (e) {
    console.error('[warn] notes.json 解析失败，已备份并重建:', e.message);
    try {
      fs.copyFileSync(DB_FILE, DB_FILE + '.broken-' + Date.now());
    } catch (_) {}
    const fresh = { version: 1, notes: [], categories: ['工作', '学习', '生活', '灵感'] };
    writeDB(fresh);
    return fresh;
  }
}

function writeDB(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // 先写临时文件再重命名，避免写一半崩溃导致数据丢失
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

/** 业务校验失败时抛出，统一映射为 400 而不是 500 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

let writeQueue = Promise.resolve();
function withDB(mutator) {
  // 串行化写入，避免并发请求互相覆盖
  const task = writeQueue.then(() => {
    const db = readDB();
    const result = mutator(db);
    writeDB(db);
    return result;
  });
  // 关键：队列自身要吞掉异常，否则一次失败会让后续所有写入都被拒绝
  writeQueue = task.catch(() => {});
  return task;
}

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function normalizeTags(input) {
  if (Array.isArray(input)) {
    return input.map((t) => String(t).trim()).filter(Boolean);
  }
  return String(input || '')
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* HTTP 工具                                                           */
/* ------------------------------------------------------------------ */

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        // 必须在异步回调里 reject，不能 throw（throw 会变成未捕获异常并终止进程）
        reject(new ValidationError('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function serveStatic(res, filePath) {
  const safe = path
    .normalize(filePath)
    .replace(/^(\.\.[\/\\])+/, '')
    .replace(/^[\/\\]+/, '');
  const full = path.join(PUBLIC_DIR, safe);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/* 业务逻辑                                                            */
/* ------------------------------------------------------------------ */

function matchesQuery(note, q) {
  if (!q) return true;
  const kw = q.toLowerCase();
  const haystack = [
    note.title,
    note.content,
    note.category,
    (note.tags || []).join(' '),
  ]
    .join('\n')
    .toLowerCase();
  // 空格分隔的多个关键词，全部命中才算匹配（AND）
  return kw.split(/\s+/).filter(Boolean).every((k) => haystack.includes(k));
}

function toSummary(note) {
  const text = String(note.content || '').replace(/\s+/g, ' ').trim();
  return {
    ...note,
    excerpt: text.length > 120 ? text.slice(0, 120) + '…' : text,
  };
}

/** 计算与当前笔记相关的推荐（同分类或共享标签） */
function relate(db, note, limit = 5) {
  const tags = new Set(note.tags || []);
  return db.notes
    .filter((n) => n.id !== note.id)
    .map((n) => {
      let score = 0;
      if (n.category && n.category === note.category) score += 2;
      score += (n.tags || []).filter((t) => tags.has(t)).length * 3;
      // 标题字符重叠的粗略相似度
      if (note.title && n.title) {
        const a = new Set(note.title.split(''));
        const overlap = n.title.split('').filter((c) => a.has(c)).length;
        score += Math.min(overlap / Math.max(note.title.length, 1), 1) * 1.5;
      }
      return { note: n, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ id: x.note.id, title: x.note.title, category: x.note.category }));
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

async function handleAPI(req, res, pathname, query) {
  const method = req.method.toUpperCase();

  /* --- 统计 --- */
  if (pathname === '/api/stats' && method === 'GET') {
    const db = readDB();
    const byCategory = {};
    for (const n of db.notes) {
      const c = n.category || '未分类';
      byCategory[c] = (byCategory[c] || 0) + 1;
    }
    const tagCount = {};
    for (const n of db.notes) {
      for (const t of n.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
    }
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }));
    return sendJSON(res, 200, {
      total: db.notes.length,
      categories: db.categories,
      byCategory,
      topTags,
      pinned: db.notes.filter((n) => n.pinned).length,
    });
  }

  /* --- 分类管理 --- */
  if (pathname === '/api/categories') {
    if (method === 'GET') {
      return sendJSON(res, 200, { categories: readDB().categories });
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return sendJSON(res, 400, { error: '分类名不能为空' });
      const db = readDB();
      if (db.categories.includes(name)) {
        return sendJSON(res, 409, { error: '该分类已存在' });
      }
      const result = await withDB((d) => {
        d.categories.push(name);
        return d.categories;
      });
      return sendJSON(res, 200, { categories: result });
    }
    if (method === 'DELETE') {
      const name = String(query.name || '').trim();
      const result = await withDB((d) => {
        d.categories = d.categories.filter((c) => c !== name);
        // 该分类下的笔记归入“未分类”
        d.notes.forEach((n) => {
          if (n.category === name) n.category = '未分类';
        });
        return d.categories;
      });
      return sendJSON(res, 200, { categories: result });
    }
  }

  /* --- 笔记集合 --- */
  if (pathname === '/api/notes') {
    if (method === 'GET') {
      const db = readDB();
      const q = (query.q || '').trim();
      const category = (query.category || '').trim();
      const tag = (query.tag || '').trim();
      const sort = query.sort || 'updated';

      let list = db.notes.filter((n) => matchesQuery(n, q));
      if (category) list = list.filter((n) => (n.category || '未分类') === category);
      if (tag) list = list.filter((n) => (n.tags || []).includes(tag));

      const cmp = {
        updated: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
        created: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        title: (a, b) => String(a.title).localeCompare(String(b.title), 'zh-CN'),
      }[sort] || cmp_updated;

      function cmp_updated(a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      }

      list.sort((a, b) => {
        // 置顶优先
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return cmp(a, b);
      });

      return sendJSON(res, 200, { notes: list.map(toSummary), total: list.length });
    }

    if (method === 'POST') {
      const body = await readBody(req);
      const title = String(body.title || '').trim();
      const content = String(body.content || '');
      if (!title) return sendJSON(res, 400, { error: '标题不能为空' });
      const now = new Date().toISOString();
      const note = {
        id: uid(),
        title,
        content,
        category: String(body.category || '未分类').trim() || '未分类',
        tags: normalizeTags(body.tags),
        pinned: !!body.pinned,
        createdAt: now,
        updatedAt: now,
      };
      await withDB((d) => {
        d.notes.unshift(note);
        return note;
      });
      return sendJSON(res, 201, { note });
    }
  }

  /* --- 单条笔记 --- */
  const m = pathname.match(/^\/api\/notes\/([^\/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);

    if (method === 'GET') {
      const db = readDB();
      const note = db.notes.find((n) => n.id === id);
      if (!note) return sendJSON(res, 404, { error: '笔记不存在' });
      return sendJSON(res, 200, { note, related: relate(db, note) });
    }

    if (method === 'PUT' || method === 'PATCH') {
      const body = await readBody(req);
      const found = readDB().notes.find((n) => n.id === id);
      if (!found) return sendJSON(res, 404, { error: '笔记不存在' });

      const updated = await withDB((d) => {
        const n = d.notes.find((x) => x.id === id);
        if (body.title !== undefined) {
          const t = String(body.title).trim();
          if (!t) throw new ValidationError('标题不能为空');
          n.title = t;
        }
        if (body.content !== undefined) n.content = String(body.content);
        if (body.category !== undefined) n.category = String(body.category).trim() || '未分类';
        if (body.tags !== undefined) n.tags = normalizeTags(body.tags);
        if (body.pinned !== undefined) n.pinned = !!body.pinned;
        n.updatedAt = new Date().toISOString();
        return n;
      });
      return sendJSON(res, 200, { note: updated });
    }

    if (method === 'DELETE') {
      const db = readDB();
      if (!db.notes.some((n) => n.id === id)) {
        return sendJSON(res, 404, { error: '笔记不存在' });
      }
      await withDB((d) => {
        d.notes = d.notes.filter((n) => n.id !== id);
        return true;
      });
      return sendJSON(res, 200, { ok: true });
    }
  }

  /* --- 导出 / 导入 --- */
  if (pathname === '/api/export' && method === 'GET') {
    const db = readDB();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="notes-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    });
    return res.end(JSON.stringify(db, null, 2));
  }

  if (pathname === '/api/import' && method === 'POST') {
    const body = await readBody(req);
    const incoming = Array.isArray(body.notes) ? body.notes : [];
    let added = 0;
    await withDB((d) => {
      const ids = new Set(d.notes.map((n) => n.id));
      for (const raw of incoming) {
        const title = String(raw.title || '').trim();
        if (!title) continue;
        const now = new Date().toISOString();
        const note = {
          id: ids.has(raw.id) || !raw.id ? uid() : raw.id,
          title,
          content: String(raw.content || ''),
          category: String(raw.category || '未分类').trim() || '未分类',
          tags: normalizeTags(raw.tags),
          pinned: !!raw.pinned,
          createdAt: raw.createdAt || now,
          updatedAt: raw.updatedAt || now,
        };
        ids.add(note.id);
        d.notes.push(note);
        added++;
      }
      if (Array.isArray(body.categories)) {
        for (const c of body.categories) {
          const name = String(c).trim();
          if (name && !d.categories.includes(name)) d.categories.push(name);
        }
      }
      return added;
    });
    return sendJSON(res, 200, { ok: true, added });
  }

  return sendJSON(res, 404, { error: '接口不存在' });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  // 本地工具：允许本机页面跨端口访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (pathname.startsWith('/api/')) {
      return await handleAPI(req, res, pathname, parsed.query);
    }
    if (pathname === '/' || pathname === '') {
      return serveStatic(res, 'index.html');
    }
    return serveStatic(res, pathname);
  } catch (err) {
    const status = err.statusCode || (err instanceof SyntaxError ? 400 : 500);
    if (status >= 500) console.error('[error]', err);
    else console.warn('[warn]', err.message);
    if (!res.headersSent) sendJSON(res, status, { error: err.message || '服务器内部错误' });
    else res.end();
  }
});

/* 兜底：本地工具不该因为单次请求异常而整体退出 */
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

/* 用系统默认浏览器打开地址 */
function openBrowser(url) {
  const { spawn } = require('child_process');
  let cmd;
  let args;
  if (process.platform === 'win32') {
    // start 的第一个参数是窗口标题，必须留空，否则会被当成标题吃掉
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch (_) {
    /* 打不开浏览器不影响服务本身，忽略即可 */
  }
}

server.listen(PORT, '127.0.0.1', () => {
  ensureData();
  const banner = [
    '',
    '  ┌───────────────────────────────────────────┐',
    '  │   知识管理小工具  ·  已启动                │',
    '  └───────────────────────────────────────────┘',
    '',
    `    访问地址:  http://127.0.0.1:${PORT}`,
    `    数据文件:  ${DB_FILE}`,
    '',
    '    按 Ctrl + C 停止服务',
    '',
  ].join('\n');
  console.log(banner);
  if (OPEN_BROWSER) openBrowser(`http://127.0.0.1:${PORT}`);
});

/* 端口被占用时给出人话，而不是抛一堆堆栈 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  [启动失败] 端口 ${PORT} 已被占用。`);
    console.error('');
    console.error('  可能已经有一个知识笔记本在运行了 —— 请直接打开：');
    console.error(`      http://127.0.0.1:${PORT}`);
    console.error('');
    console.error('  如果想同时运行两个，可以换个端口启动：');
    console.error(`      set PORT=4322 && node server.js      (Windows CMD)`);
    console.error(`      PORT=4322 node server.js             (macOS / Linux)`);
    console.error('');
  } else {
    console.error('');
    console.error('  [启动失败] ' + err.message);
    console.error('');
  }
  process.exit(1);
});
