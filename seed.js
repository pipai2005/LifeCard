/* 可选：预置一批示例笔记，方便首次上手感受效果
   用法： node seed.js   （需先启动 server.js）  */
const BASE = 'http://127.0.0.1:4321';

const samples = [
  {
    title: 'JavaScript 闭包',
    category: '学习',
    tags: 'js, 基础',
    pinned: true,
    content: [
      '闭包（Closure）是指函数与其词法作用域的组合。',
      '',
      '核心特征：',
      '· 内部函数可以访问外部函数的变量',
      '· 外部函数执行完毕后，其作用域不会被回收',
      '',
      '典型用途：',
      '1. 创建私有变量',
      '2. 模块模式封装',
      '3. 函数柯里化与偏函数',
    ].join('\n'),
  },
  {
    title: '本周工作重点',
    category: '工作',
    tags: '会议, 待办',
    content: [
      '周一：梳理需求文档，确认边界条件',
      '周三：完成接口联调，输出测试报告',
      '周五：复盘 + 下周排期',
      '',
      '风险：第三方接口文档仍有缺失，需主动跟进。',
    ].join('\n'),
  },
  {
    title: '读书笔记 · 《深度工作》',
    category: '学习',
    tags: '读书, 效率',
    content: [
      '核心观点：高质量产出 = 时间 × 专注度。',
      '',
      '可执行的做法：',
      '· 每天留出 2 小时无干扰时段，关闭所有通知',
      '· 用「仪式感」进入状态：固定时间、固定地点、固定开场动作',
      '· 把浮浅事务集中批量处理，而不是随到随办',
    ].join('\n'),
  },
  {
    title: '关于习惯养成的一点想法',
    category: '灵感',
    tags: '习惯, 思考',
    content: [
      '与其设定"每天读书一小时"这种目标，不如设定"每天读一页"。',
      '',
      '原因：目标越小，启动阻力越低；而一旦开始，往往会超额完成。',
      '关键不是完成度，而是不断线。',
    ].join('\n'),
  },
  {
    title: '周末采购清单',
    category: '生活',
    tags: '生活, 清单',
    content: '牛奶、鸡蛋、全麦面包、西红柿、鸡胸肉、燕麦、咖啡豆。',
  },
];

(async () => {
  console.log('\n正在写入示例笔记…\n');
  let n = 0;
  for (const s of samples) {
    const res = await fetch(BASE + '/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    if (res.ok) {
      n++;
      console.log('  ✓ ' + s.title);
    } else {
      console.log('  ✗ ' + s.title + ' — ' + (await res.text()));
    }
  }
  console.log(`\n完成，共写入 ${n} 条示例笔记。打开 http://127.0.0.1:4321 查看。\n`);
})().catch((e) => {
  console.error('\n写入失败：' + e.message);
  console.error('请确认服务已启动（node server.js）。\n');
  process.exit(1);
});
