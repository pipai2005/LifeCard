/* 端到端接口自测：node test-api.js （需先启动 server.js）
   注意：本脚本会清空现有数据，请勿在正式数据上运行。 */
const BASE = 'http://127.0.0.1:4321';

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

/** 清空全部笔记与自定义分类，保证测试从干净状态开始，也让中断后不留脏数据 */
async function wipeAll() {
  const list = await req('GET', '/api/notes');
  for (const n of (list.data && list.data.notes) || []) {
    await req('DELETE', '/api/notes/' + n.id);
  }
  const cats = await req('GET', '/api/categories');
  const keep = ['工作', '学习', '生活', '灵感', '未分类'];
  for (const c of (cats.data && cats.data.categories) || []) {
    if (!keep.includes(c)) await req('DELETE', '/api/categories?name=' + encodeURIComponent(c));
  }
}

(async () => {
  console.log('\n=== 知识笔记本 · 接口自测 ===\n');
  await wipeAll();

  // 1. 静态资源
  console.log('[静态资源]');
  for (const f of ['/', '/style.css', '/app.js']) {
    const r = await fetch(BASE + f);
    const txt = await r.text();
    check(`GET ${f} → 200`, r.status === 200, r.status);
    check(`GET ${f} 有内容`, txt.length > 100, txt.length);
  }

  // 2. 初始统计
  console.log('\n[统计]');
  let r = await req('GET', '/api/stats');
  check('GET /api/stats → 200', r.status === 200, r.status);
  check('返回默认分类', Array.isArray(r.data.categories) && r.data.categories.length > 0, r.data);

  // 3. 新建笔记
  console.log('\n[新建]');
  r = await req('POST', '/api/notes', {
    title: 'JavaScript 闭包笔记',
    content: '闭包是指函数与其词法作用域的组合。\n典型用途：私有变量、模块模式、函数柯里化。',
    category: '学习',
    tags: 'js, 基础',
  });
  check('POST 创建笔记 → 201', r.status === 201, r.status);
  const id1 = r.data.note && r.data.note.id;
  check('返回笔记 id', !!id1, r.data);

  const r2 = await req('POST', '/api/notes', {
    title: '周会纪要',
    content: '本周重点是接口联调，下周一前完成联调并出测试报告。',
    category: '工作',
    tags: '会议',
    pinned: true,
  });
  check('POST 第二条 → 201', r2.status === 201, r2.status);
  const id2 = r2.data.note.id;

  const r3 = await req('POST', '/api/notes', {
    title: '周末探店清单',
    content: '想去的咖啡馆：A、B、C。',
    category: '生活',
    tags: '美食, 周末',
  });
  const id3 = r3.data.note.id;
  check('POST 第三条 → 201', r3.status === 201, r3.status);

  // 空标题应被拒绝
  r = await req('POST', '/api/notes', { title: '   ', content: 'x' });
  check('空标题被拒绝 → 400', r.status === 400, r.status);

  // 4. 列表 & 搜索
  console.log('\n[查询与搜索]');
  r = await req('GET', '/api/notes');
  check('列表返回 3 条', r.data.total === 3, r.data.total);
  check('置顶笔记排第一', r.data.notes[0].id === id2, r.data.notes.map(n => n.title));
  check('列表带 excerpt 摘要', typeof r.data.notes[0].excerpt === 'string');

  r = await req('GET', '/api/notes?q=闭包');
  check('搜索"闭包"命中 1 条', r.data.total === 1, r.data.total);

  r = await req('GET', '/api/notes?q=闭包 词法作用域');
  check('多关键词 AND 搜索命中', r.data.total === 1, r.data.total);

  r = await req('GET', '/api/notes?q=闭包 咖啡馆');
  check('多关键词无交集 → 0 条', r.data.total === 0, r.data.total);

  r = await req('GET', '/api/notes?q=' + encodeURIComponent('联调'));
  check('搜索正文内容命中', r.data.total === 1, r.data.total);

  r = await req('GET', '/api/notes?q=基础');
  check('搜索标签命中', r.data.total === 1, r.data.total);

  r = await req('GET', '/api/notes?category=' + encodeURIComponent('工作'));
  check('按分类筛选命中 1 条', r.data.total === 1, r.data.total);

  r = await req('GET', '/api/notes?tag=' + encodeURIComponent('美食'));
  check('按标签筛选命中 1 条', r.data.total === 1, r.data.total);

  r = await req('GET', '/api/notes?q=' + encodeURIComponent('绝对不存在的词xyz'));
  check('无匹配返回 0 条', r.data.total === 0, r.data.total);

  r = await req('GET', '/api/notes?sort=title');
  check('按标题排序可用', r.status === 200 && r.data.total === 3);

  // 5. 单条 + 相关推荐
  console.log('\n[单条与相关推荐]');
  r = await req('GET', '/api/notes/' + id1);
  check('GET 单条 → 200', r.status === 200, r.status);
  check('正文完整返回', r.data.note.content.includes('词法作用域'));
  check('返回 related 数组', Array.isArray(r.data.related));

  const rRel = await req('POST', '/api/notes', {
    title: 'JavaScript 原型链笔记',
    content: '原型链是 JS 继承的实现方式。',
    category: '学习',
    tags: 'js',
  });
  const idRel = rRel.data.note.id;
  r = await req('GET', '/api/notes/' + id1);
  check('相关推荐找到同分类同标签笔记',
    r.data.related.some((x) => x.id === idRel),
    r.data.related);

  r = await req('GET', '/api/notes/不存在的id');
  check('不存在的 id → 404', r.status === 404, r.status);

  // 6. 编辑
  console.log('\n[编辑]');
  r = await req('PUT', '/api/notes/' + id3, {
    title: '周末探店清单（已更新）',
    content: '最终选定：B 咖啡馆，周六下午两点。',
    category: '生活',
    tags: '美食, 周末, 已定',
    pinned: false,
  });
  check('PUT 更新 → 200', r.status === 200, r.status);
  check('标题已更新', r.data.note.title === '周末探店清单（已更新）', r.data.note.title);
  check('标签已更新为 3 个', r.data.note.tags.length === 3, r.data.note.tags);

  r = await req('PATCH', '/api/notes/' + id3, { pinned: true });
  check('PATCH 局部更新置顶', r.data.note.pinned === true, r.data.note.pinned);

  r = await req('PUT', '/api/notes/' + id1, { title: '' });
  check('更新为空标题 → 400 且带错误信息', r.status === 400 && !!r.data.error, r);

  r = await req('PUT', '/api/notes/不存在', { title: 'x' });
  check('更新不存在笔记 → 404', r.status === 404, r.status);

  // 标签解析（逗号/空格混合）
  r = await req('PUT', '/api/notes/' + idRel, { tags: 'js, 进阶 原型' });
  check('标签逗号+空格混合解析为 3 个', r.data.note.tags.length === 3, r.data.note.tags);

  // 7. 分类
  console.log('\n[分类管理]');
  r = await req('POST', '/api/categories', { name: '灵感' });
  check('新增已存在分类 → 409', r.status === 409, r.status);

  r = await req('POST', '/api/categories', { name: '读书' });
  check('新增分类 → 200', r.status === 200, r.status);
  check('分类列表包含"读书"', r.data.categories.includes('读书'), r.data.categories);

  r = await req('POST', '/api/categories', { name: '   ' });
  check('空分类名 → 400', r.status === 400, r.status);

  r = await req('GET', '/api/categories');
  check('GET 分类列表', r.status === 200 && Array.isArray(r.data.categories));

  r = await req('DELETE', '/api/categories?name=' + encodeURIComponent('生活'));
  check('删除分类 → 200', r.status === 200, r.status);
  r = await req('GET', '/api/notes/' + id3);
  check('删除分类后笔记保留且归入未分类', r.data.note.category === '未分类', r.data.note.category);

  // 8. 统计
  console.log('\n[统计准确性]');
  r = await req('GET', '/api/stats');
  check('total 与笔记数一致', r.data.total === 4, r.data.total);
  check('pinned 计数正确', r.data.pinned === 2, r.data.pinned);
  check('topTags 有序且含 js', r.data.topTags[0] && r.data.topTags.some(t => t.name === 'js'), r.data.topTags);
  check('byCategory 含未分类', '未分类' in r.data.byCategory, r.data.byCategory);

  // 9. 导出导入
  console.log('\n[导出 / 导入]');
  const exp = await fetch(BASE + '/api/export');
  const exportText = await exp.text();
  check('导出 → 200', exp.status === 200, exp.status);
  check('导出带 Content-Disposition', !!exp.headers.get('content-disposition'));
  const exported = JSON.parse(exportText);
  check('导出含 4 条笔记', exported.notes.length === 4, exported.notes.length);

  r = await req('POST', '/api/import', { notes: [
    { title: '导入的笔记 A', content: '来自备份', category: '学习', tags: '导入' },
    { title: '导入的笔记 B', content: '来自备份 2' },
    { title: '   ' },
  ], categories: ['导入测试'] });
  check('导入返回新增数量 2', r.data.added === 2, r.data);
  r = await req('GET', '/api/stats');
  check('导入后总数 = 6', r.data.total === 6, r.data.total);
  check('导入的分类已合并', r.data.categories.includes('导入测试'), r.data.categories);

  // 10. 删除
  console.log('\n[删除]');
  r = await req('DELETE', '/api/notes/' + id1);
  check('DELETE → 200', r.status === 200, r.status);
  r = await req('GET', '/api/notes/' + id1);
  check('删除后查询 → 404', r.status === 404, r.status);
  r = await req('DELETE', '/api/notes/' + id1);
  check('重复删除 → 404', r.status === 404, r.status);

  // 11. 异常输入
  console.log('\n[健壮性]');
  r = await req('GET', '/api/不存在的接口');
  check('未知接口 → 404', r.status === 404, r.status);

  const bad = await fetch(BASE + '/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ 这不是合法 JSON',
  });
  check('非法 JSON → 400 且不崩溃', bad.status === 400, bad.status);

  const after = await req('GET', '/api/stats');
  check('异常请求后服务仍正常', after.status === 200, after.status);

  // 校验失败后写入队列不能被“毒化”
  const poison = await req('POST', '/api/notes', {
    title: '队列健康检查',
    content: '校验失败之后的写入必须仍然成功',
    category: '工作',
  });
  check('校验失败后仍能正常写入（队列未被毒化）', poison.status === 201, poison.status);
  if (poison.data && poison.data.note) {
    await req('DELETE', '/api/notes/' + poison.data.note.id);
  }

  const trav = await fetch(BASE + '/../server.js');
  const travText = await trav.text();
  check('路径穿越防护生效（不泄露服务端源码）',
    !travText.includes('writeQueue') && !travText.includes('ValidationError'),
    trav.status);

  /* 清理测试数据 */
  console.log('\n[清理]');
  await wipeAll();
  r = await req('GET', '/api/stats');
  check('清理后数据归零', r.data.total === 0, r.data.total);

  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\n[测试崩溃]', e);
  try { await wipeAll(); } catch (_) {}
  process.exit(1);
});
