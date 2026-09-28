# 📒 知识笔记本

一个本地运行的个人知识管理小工具。零依赖、零配置、数据全在自己电脑上。

## 快速开始

**Windows**：双击 `start.bat`

**macOS / Linux**：
```bash
chmod +x start.sh
./start.sh
```

**或者手动启动**（任意系统）：
```bash
node server.js
```

启动后终端会打印访问地址，脚本会**自动帮你打开浏览器**；若没有自动打开，手动访问 **http://127.0.0.1:4321** 即可。

> 需要 Node.js 14 或更高版本（[下载地址](https://nodejs.org/)）。除此以外没有任何依赖，不用 `npm install`。
>
> 启动脚本会依次尝试：PATH 里的 `node` → 常见安装目录（`Program Files\nodejs`、`%LOCALAPPDATA%\Programs\nodejs`、nvm、scoop 等）。所以即使 node 没加进 PATH，通常也能启动起来。

## 修 bug / 二次开发前必读

**`start.bat` 必须保持纯 ASCII 且使用 CRLF 换行。** 这不是洁癖，是硬性约束：

cmd.exe 读取 `.bat` 文件时用的是控制台的 OEM 代码页（中文 Windows 上是 GBK）。
文件里一旦出现中文，字节就被错误解码；而 cmd 是按**字节偏移**记录读取位置的，
解码错位会让解析器失去同步，于是它开始把某些行的**残片当成命令去执行**，报出
`'odejs.org' 不是内部或外部命令` 这类看起来毫无头绪的错误。

同理，**不要**在文件开头写 `chcp 65001`：中途切换代码页同样会打乱字节偏移。
（现在 `chcp 65001` 被放在所有会被解析的内容之后、调用 node 之前，只用来让 Node
输出的中文正常显示。）

改完 `start.bat` 后建议跑一下自检：

```bash
node -e "const b=require('fs').readFileSync('start.bat');let n=0;for(const x of b)if(x>127)n++;const s=b.toString('binary');console.log('非ASCII字节:',n,'| CRLF:',(s.match(/\r\n/g)||[]).length,'| LF:',(s.match(/\n/g)||[]).length)"
```

期望输出：非 ASCII 字节为 `0`，且 CRLF 数等于 LF 数。

## 环境变量

| 变量 | 作用 |
|---|---|
| `PORT` | 换端口，例如 `set PORT=8080 && node server.js` |
| `NO_OPEN=1` | 启动时不自动打开浏览器（脚本化测试时有用） |

## 功能

| 功能 | 说明 |
|---|---|
| **新增** | 点「新建笔记」或按 `Ctrl/Cmd + N` |
| **搜索** | 顶部搜索框，实时匹配标题 / 正文 / 分类 / 标签；空格分隔多个关键词是「且」的关系，命中处会高亮 |
| **编辑** | 点开笔记 → 「编辑」，字段包括标题、正文、分类、标签、置顶 |
| **分类** | 侧栏「分类」右侧 `＋` 新建；删除分类时笔记会保留，归入「未分类」 |
| **标签** | 输入时用逗号或空格分隔；侧栏显示常用标签，点击即可筛选 |
| **置顶** | 重要笔记置顶后固定排在列表最前 |
| **阅读视图** | 点卡片打开阅读弹窗，排版更舒展 |
| **相关笔记** | 编辑某条笔记时，自动推荐同分类 / 共享标签 / 标题相近的笔记 |
| **主题** | 右上角按钮切换白天 / 黑夜模式，首次访问跟随系统设置 |
| **导入导出** | 侧栏底部可导出全部数据为 JSON，也可导入合并 |

## 快捷键

| 按键 | 作用 |
|---|---|
| `Ctrl/Cmd + N` | 新建笔记 |
| `Ctrl/Cmd + K` | 聚焦搜索框 |
| `Ctrl/Cmd + S` | 编辑中保存 |
| `Esc` | 关闭弹窗 / 抽屉 |

## 数据存储

所有内容保存在 `data/notes.json` —— 一个可读的 JSON 文件。

- 想备份：直接复制这个文件，或用「导出」按钮
- 想换电脑：把整个文件夹拷过去即可
- 想手动改：用任意文本编辑器打开，格式很直观

写入采用「先写临时文件再重命名」的方式，中途断电也不会写坏原文件；如果文件被外部改坏了，服务启动时会自动备份损坏文件并重建。

## 个性化

改端口：
```bash
PORT=8080 node server.js        # macOS / Linux
set PORT=8080 && node server.js  # Windows CMD
```

改默认分类：编辑 `server.js` 里 `ensureData()` 中的 `categories` 数组（仅对全新数据生效），或直接在界面上增删。

改配色：所有颜色都是 `public/style.css` 顶部的 CSS 变量，`html[data-theme="light"]` 和 `html[data-theme="dark"]` 两块分别对应白天和黑夜。

## 文件结构

```
knowledge-base/
├── server.js          # 后端服务（Node 内置模块，零依赖）
├── start.bat          # Windows 一键启动（必须保持纯 ASCII + CRLF）
├── start.sh           # macOS / Linux 一键启动
├── seed.js            # 写入示例笔记，方便上手
├── test-api.js        # 接口自测（63 项）
├── test-frontend.js   # 前端静态一致性检查
├── README.md
├── data/
│   └── notes.json     # 你的全部数据
└── public/
    ├── index.html     # 界面结构
    ├── style.css      # 样式 + 主题变量
    └── app.js         # 前端逻辑
```

## 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/notes?q=&category=&tag=&sort=` | 查询笔记列表 |
| `POST` | `/api/notes` | 新建笔记 |
| `GET` | `/api/notes/:id` | 获取单条笔记（含相关推荐） |
| `PUT` | `/api/notes/:id` | 更新笔记 |
| `DELETE` | `/api/notes/:id` | 删除笔记 |
| `GET` | `/api/stats` | 统计信息（总数、分类分布、热门标签） |
| `GET` / `POST` / `DELETE` | `/api/categories` | 分类管理 |
| `GET` | `/api/export` | 导出全部数据 |
| `POST` | `/api/import` | 导入数据 |

## 测试

项目自带两套自测脚本，改动代码后建议跑一遍：

```bash
node server.js        # 另开一个终端保持服务运行
node test-api.js      # 63 项接口测试（会清空数据，勿在正式数据上运行）
node test-frontend.js # 前端静态一致性检查（不依赖服务）
```

`test-api.js` 覆盖增删改查、搜索、筛选、分类、统计、导入导出和异常输入，
并在结束时自动清空测试数据。`test-frontend.js` 校验 JS 引用的 DOM id 是否存在、
主题变量是否对齐、关键功能元素与快捷键是否齐全。

## 说明

服务只监听 `127.0.0.1`，同一局域网内的其他设备无法访问，适合当作纯本地工具使用。
