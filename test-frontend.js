/* 静态一致性检查：JS 里 $('xxx') 引用的 id 必须存在于 index.html；CSS 类名也做基本交叉验证 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');

let bad = 0;
const fail = (m) => { console.log('  FAIL  ' + m); bad++; };
const ok = (m) => console.log('  PASS  ' + m);

console.log('\n=== 前端静态一致性检查 ===\n');

/* 1. JS 引用的所有 id 都必须在 HTML 中存在 */
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const jsIds = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
const missingIds = [...jsIds].filter((id) => !htmlIds.has(id));
if (missingIds.length) fail('JS 引用了不存在的 id: ' + missingIds.join(', '));
else ok(`JS 引用的 ${jsIds.size} 个 id 在 HTML 中全部存在`);

/* 2. HTML 里的 id 不应重复 */
const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const dupes = allIds.filter((v, i) => allIds.indexOf(v) !== i);
if (dupes.length) fail('HTML 存在重复 id: ' + [...new Set(dupes)].join(', '));
else ok(`HTML 中 ${allIds.length} 个 id 无重复`);

/* 3. HTML 引用的静态资源存在 */
for (const src of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])) {
  if (/^(https?:|data:|#)/.test(src)) continue;
  const p = path.join(dir, src);
  if (fs.existsSync(p)) ok(`资源存在: ${src}`);
  else fail(`资源缺失: ${src}`);
}

/* 4. JS 里用到的 CSS 类，至少要在 CSS 或 HTML 里有定义
   注意：class="..." 可能是模板字符串，含 ${...} 插值，需先剔除插值再解析 */
const stripInterp = (s) => s.replace(/\$\{[^}]*\}/g, ' ');
const jsClasses = new Set();
for (const m of js.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) {
  jsClasses.add(m[1]);
}
for (const m of js.matchAll(/class="([^"]+)"/g)) {
  stripInterp(m[1]).split(/\s+/).filter(Boolean).forEach((c) => jsClasses.add(c));
}
// classList.toggle('x', cond) / className = 'a b'
for (const m of js.matchAll(/className\s*=\s*'([^']+)'/g)) {
  m[1].split(/\s+/).filter(Boolean).forEach((c) => jsClasses.add(c));
}
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const htmlClasses = new Set(
  [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean))
);
const undefClasses = [...jsClasses].filter((c) => !cssClasses.has(c) && !htmlClasses.has(c));
if (undefClasses.length) fail('JS 使用了未定义的类: ' + undefClasses.join(', '));
else ok(`JS 使用的 ${jsClasses.size} 个类名均有样式或结构定义`);

/* 5. 主题变量完整性：light 与 dark 必须定义同一套变量 */
const varBlock = (name) => {
  const m = css.match(new RegExp(`html\\[data-theme="${name}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) return null;
  return new Set([...m[1].matchAll(/(--[\w-]+)\s*:/g)].map((x) => x[1]));
};
const light = varBlock('light');
const dark = varBlock('dark');
if (!light || !dark) fail('未找到 light/dark 主题变量块');
else {
  const onlyLight = [...light].filter((v) => !dark.has(v));
  const onlyDark = [...dark].filter((v) => !light.has(v));
  if (onlyLight.length || onlyDark.length) {
    fail(`主题变量不一致 — 仅 light: [${onlyLight}] 仅 dark: [${onlyDark}]`);
  } else {
    ok(`白天/黑夜模式各定义 ${light.size} 个变量，完全对齐`);
  }
}

/* 6. 关键功能元素齐全 */
console.log('\n[功能元素]');
const need = {
  '新增按钮': 'newBtn',
  '搜索框': 'searchInput',
  '主题切换': 'themeBtn',
  '分类容器': 'categoryList',
  '标签云': 'tagCloud',
  '笔记列表': 'list',
  '编辑抽屉': 'drawer',
  '保存按钮': 'saveBtn',
  '删除按钮': 'deleteBtn',
  '阅读弹窗': 'viewMask',
  '导出按钮': 'exportBtn',
  '导入按钮': 'importBtn',
};
for (const [label, id] of Object.entries(need)) {
  if (htmlIds.has(id)) ok(`${label} (#${id})`);
  else fail(`${label} 缺失 (#${id})`);
}

/* 7. 快捷键说明 */
console.log('\n[交互]');
const shortcuts = ['k', 's', 'n'];
for (const k of shortcuts) {
  if (js.includes(`e.key.toLowerCase() === '${k}'`)) ok(`已绑定快捷键 Ctrl/Cmd+${k.toUpperCase()}`);
  else fail(`缺少快捷键 Ctrl/Cmd+${k.toUpperCase()}`);
}
if (js.includes('localStorage')) ok('主题偏好持久化到 localStorage');
else fail('主题偏好未持久化');
if (js.includes('prefers-color-scheme')) ok('首次访问跟随系统主题设置');
else fail('缺少系统主题跟随');

console.log(`\n=== 结果: ${bad === 0 ? '全部通过' : bad + ' 项失败'} ===\n`);
process.exit(bad ? 1 : 0);
