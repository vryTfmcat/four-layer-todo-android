# Four Layer Todo

[English](README.md)

Four Layer Todo is a local-first task workspace for Obsidian. It keeps active
work on a whiteboard while moving less immediate items through a workbench,
task pools, and long-term objects. The plugin does not send task content to a
network service.

## 中文说明

中文名为“四层待办”。这是四层待办工具的首个本地插件版本。插件会在
Obsidian 主工作区打开完整页面，不使用狭窄侧栏。

## 演示视频

[播放带中文字幕的四层待办演示](发布素材/演示视频/Four-Layer-Todo-Demo-Subtitled.mp4)

## 功能

- 白板与背面缓存工作台。
- 收集箱、待办列表、缓存列表。
- 任务卡片三点菜单，以及“先跳转、再选择具体位置”的移动流程。
- 可自由添加任务池，并在任务池中手动添加任务。
- Task List Kanban 风格任务存储器。
- 长期对象与关联任务查看。
- AI 按钮仅保留接口位置，不发送任何数据。
- Markdown 文件和目录是任务内容与层级的唯一来源。
- Canvas 只保存白板布局；`data.json` 只保存设置与迁移版本。

## 构建

```bash
npm install
npm run build
```

## 安装到当前库

```bash
npm run install:local
```

安装后在 Obsidian 的社区插件设置中启用“四层待办”，点击左侧功能区图标，或运行命令“打开四层待办”。

## Markdown / Canvas 单一真源

在 Obsidian 的“四层待办”插件设置中填写待办根目录。默认目录是 `待办`。新版不再提供 Markdown 同步开关：插件始终从该目录读取，并只修改操作目标对应的文件。

首次启动 0.1.11 前，请先等待 Obsidian Sync 完全同步，并在其他设备停用旧版插件或一并升级。一次性迁移会规范化受管理任务的 frontmatter；如果 Sync 传回重复 ID，新版只会隔离并列出冲突，绝不会自行猜测或删除。

- 只有带 `fourLayerTodo: true` 的 Markdown 才进入插件；同目录普通笔记保持不变。
- 文件名是标题，正文是详情。frontmatter 只保存稳定 ID、优先级、完成状态、排序键、长期对象 ID 和关联笔记路径。
- 目录是任务层级的唯一依据。手工移动或重命名文件会刷新界面；Vault 事件只触发读取，绝不会用内存快照把文件移回。
- `任务存储器/` 下的一级子文件夹就是任务池；每个任务池用 `_任务池.md` 保存提示、颜色和排序。
- `白板/任务白板.canvas` 只保存文件节点、坐标、颜色、连线和文字便签。Canvas 缺失、损坏或写入失败都不会改变任务目录。
- `data.json` 只保存待办根目录、语言、透明界面和迁移版本，不保存任务正文或工作区快照。
- 活跃重复 ID 不进入可写任务索引，但每个冲突文件会在其所属列表中显示为“ID 冲突·只读”卡片，只能打开原 Markdown。设置的“文件索引状态”会列出全部冲突路径；归档历史重复不参与冲突检查。
- 设置页的“加载任务”按钮可手动从待办根目录重建索引并刷新插件页面。该操作只读，不写入、移动、复制或删除文件。
- 任务菜单的“删除”会将对应 Markdown 移入 Obsidian 垃圾篓；归档会移动到按日期命名的归档目录。

同步文件夹的结构如下：

```text
待办/
├── 白板/
├── 缓存工作台/
│   ├── 收集箱/
│   ├── 待办列表/
│   └── 缓存列表/
├── 任务存储器/
│   └── 对应任务池/
├── 归档/
│   └── YYYY-MM-DD/
└── 长期对象/
```
