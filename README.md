# Paseo Kanban

面向 **Paseo 0.8.x** 的原生任务 / 会话看板插件。把分散在多个工作区的会话汇总为卡片，以类似 Multica 的方式推进任务：记录待办、交给 Agent、查看进度、人工审核、确认完成。

![桌面看板](docs/screenshots/desktop.png)

## 已实现

- 全局侧边栏入口，以及单个工作区的看板标签页。
- 自动读取当前主机的全部未归档会话，处理分页；无需逐个导入。
- 五列工作流：**待办 → 执行中 → 需关注 / 待审核 → 已完成**。
- 跨项目搜索标题、说明、标签、路径、提供商和会话 ID；项目 / Agent / 置顶 / 需处理筛选。
- 左侧“项目 → 整理”支持项目和分组拖动排序、上移 / 下移、跨组移动，以及自定义分组新建 / 改名 / 折叠 / 删除。删除分组后项目回到“未分组”；设置自动保存，同一 daemon 的客户端共享，刷新后保留。
- 桌面拖动移动、同列排序；手机与键盘用户可在详情里使用“移动到”按钮。
- 在“待审核”列一键将当前筛选范围内的全部任务标记为完成。
- 置顶、标签、优先级、任务备注、收起与恢复；收起不停止或归档 Paseo 会话。
- 新建任务保存为草稿；既可选择已有工作区，也可输入项目名，在插件配置的基础目录下创建同名项目目录和首个 Paseo 工作区。选择实际可用的 Agent 模型，点击“开始执行”后创建会话并发送任务说明。
- Inbox 支持先收集、后整理：在 Paseo 任意页面按 `Ctrl+Shift+I` 打开全局快速输入弹框，只需任务名称即可保存；随后可在看板 Inbox 面板中补全工作区、模型等信息并创建任务。任务创建成功后对应 Inbox 条目才会移除。
- 新建任务时可拖拽、粘贴或选择图片、文档等附件；附件随任务保存，并在开始执行时一并交给 Agent。工作区通过独立二级面板搜索选择，常用模型可设为默认；有未保存修改时关闭或按 `Esc` 会先确认。未开始执行的任务可在详情中修改工作区并继续粘贴或选择附件。最多 10 个附件，单个不超过 20 MB，总计不超过 50 MB。
- 从未启动过的看板任务可在详情中二次确认后永久删除；删除任务时会同时清理其附件。已进入启动流程或已关联会话的任务不会显示删除入口。
- 新建任务可选择提供商实际支持的运行模式，优先默认 **Full Access**（Claude 对应 **Bypass**）；模式随任务保存并传入 Agent 启动配置。若提供商没有全权限模式，则默认其第一个可用模式；不提供模式列表时沿用 Agent 默认行为。历史任务不自动改变权限。
- 新建任务可选择当前模型实际支持的 **Thinking Mode**，默认优先使用 **High**；选择结果随任务保存并传入 Agent 启动配置。模型不支持 High 时使用其声明的默认值或第一个可用选项。
- 直接打开对应 Paseo 会话或工作区。
- 服务端 JSON 持久化，同一 daemon 的客户端共享任务数据；每 5 秒刷新。
- 遵循 Paseo 主题色和紧凑布局。按 `Ctrl+Shift+K` / `⌘⇧K` 可在任意页面快速打开全局看板，按 `Ctrl+Shift+I` 可直接记录 Inbox 条目；进入全局看板后自动收起 Paseo 主侧栏，仍可按 `Ctrl+.`（macOS 为 `⌘B`）或看板顶部按钮恢复。全屏看板使用带左箭头的“返回 Paseo”退出入口，避免与系统关闭窗口混淆。看板内快捷键：`/` 搜索、`N` 新建、`Esc` 关闭。

## 安装到 Paseo

需要 Paseo **0.8.x**；插件采用 0.8 的客户端 / 服务端双入口格式。

1. 在 Paseo **Settings → Plugins** 中开启 **Enable plugins**。
2. 在运行 daemon 的电脑上安装此目录：

```powershell
& 'C:\Program Files\Paseo\resources\bin\paseo.cmd' plugin install 'J:\ai-ideas\paseo-kanban'
& 'C:\Program Files\Paseo\resources\bin\paseo.cmd' plugin ls
```

若 `paseo` 已在 PATH 中，也可直接运行：

```sh
paseo plugin install /absolute/path/to/paseo-kanban
paseo plugin ls
```

3. 状态显示 `running` 后，在侧边栏打开 **任务看板**。也可按 `Ctrl+K` / `⌘K`，搜索 **打开全局任务看板** 或 **打开工作区看板**。

如需从任务表单直接新建项目，请打开 Paseo **Settings → Plugins → 任务看板**，配置一个绝对的“项目基础目录”。此后在新建任务的工作区选择面板切换到“新建项目”，只输入项目名即可；插件不会覆盖同名的已有目录。

Paseo 提供运行时依赖并编译插件，直接安装本地目录无需先构建网页预览。插件总开关影响该 daemon 的所有插件；本项目不会自动修改它。详见 [Paseo v0.8 官方安装说明](https://paseo.sh/docs/plugins/v0.8#install-and-try-it)。

修改源码后：

```sh
npm run typecheck
paseo plugin reload paseo-kanban
paseo plugin logs paseo-kanban
```

## 工作流规则

| 情况 | 看板行为 |
| --- | --- |
| 新建但未执行的任务 | 待办；不启动 Agent，不消耗模型调用 |
| Agent 正在启动或执行 | 执行中 |
| 等待权限或执行错误 | 需关注；到原会话处理 |
| 当前轮结束 / 导入的空闲会话 | 待审核 |
| 人工确认完成 | 已完成 |
| 已完成的会话收到新提示 | 重新按实际运行状态归类 |
| 仅修改备注、标签或优先级 | 保留本轮人工进度 |
| 从看板收起 | 从默认视图隐藏；可在“已收起”恢复 |

正在执行的会话不能直接标记完成；拖动不会启动或停止 Agent。卡片排序先比较置顶，再比较优先级，然后是拖动顺序和更新时间，因此不同优先级的卡片仍按优先级排列。

任务标题 / 说明属于看板元数据，不重命名原始会话，也不改写原始聊天记录。任务启动时发送一次说明，之后通过原 Paseo 会话继续沟通。已有会话不复制到新工作区，不自动创建 worktree 或合并代码。

## 数据与启动恢复

数据保存在 daemon 机器的 `$PASEO_HOME/paseo-kanban/board.json`；未设置 `PASEO_HOME` 时使用 `~/.paseo/paseo-kanban/board.json`。任务附件保存在同目录的 `attachments/` 中，`board.json` 只记录附件元数据与路径，不内嵌文件正文。当前实现每个 daemon 使用一份看板；请勿将本插件以多个 runtime ID 同时安装，因为它们会共享这些文件。

文件使用串行写入和临时文件原子替换；读取到损坏数据时显示错误，不覆盖原文件。附件删除被中断时，下次读取看板会自动恢复仍被任务引用的目录、清理已经删除任务的目录。备份时请复制整个 `paseo-kanban` 目录。卸载插件保留该目录，重新安装可继续使用。

任务创建带有客户端幂等标识；即使保存成功后的 RPC 响应丢失，在同一新建窗口中重试也会返回已保存的任务，不会重复创建任务或附件。

任务启动前记录启动状态，并给新会话设置唯一任务标签。若响应丢失，再点 **检查并关联会话** 会查找已创建的会话，不自动重复执行。如果仍无法确认，任务保留待确认状态；请先在 Paseo 检查。确认没有创建会话后，可收起该任务并新建任务重试。已归档 / 不可用的关联会话不会变成新的未启动任务。

## 本地交互预览

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173>；浅色主题为 <http://127.0.0.1:5173/?light>。预览复用插件 UI，使用明确标注的示例数据，保存于浏览器 `localStorage`，**不连接或操作真实 Paseo 会话**。它不是实际插件的入口。清除该站点的 `paseo-kanban-preview-v1` 存储项可重置示例。

## 验证

Node.js 22+：

```sh
npm ci
npx playwright install chromium
npm run check
```

- `npm run typecheck`：类型检查，依赖锁定 Paseo SDK 0.8.0。
- `npm test`：核心测试覆盖全局看板与 Inbox 快捷键、Inbox 捕获 / 去重 / 原子转任务、项目目录和工作区创建、分页、真实 RPC 校验、状态转换、数据与附件持久化、任务及 Agent 启动去重、运行模式与 Thinking Mode、项目排序分组，以及真实 SDK 参数转换。
- `npm run test:e2e`：浏览器场景覆盖 Inbox、搜索、任务创建 / 编辑 / 启动、已有工作区选择与新项目工作区创建、附件、默认模型、运行模式与 Thinking Mode、全屏看板、侧栏、批量完成、拖动 / 收起 / 恢复、窄屏保护，以及项目与分组整理。
- `npm run build:preview`：独立网页预览构建。
- `npm run verify:host`：调用已安装 Windows Paseo 的真实插件编译器，只检查 manifest 和双运行时编译，不安装或启用插件。自定义安装路径可设置 `PASEO_RESOURCES` 和 `PASEO_ELECTRON`。

只读 daemon 冒烟验证（把端口替换成 `paseo daemon status --json` 中的实际值）：

```sh
npx tsx scripts/smoke-daemon.ts ws://127.0.0.1:16767/ws
```

只输出会话 / 工作区 / 模型数量，不发送提示、不保存看板、不更改配置。本机验收读取了 60 个会话、29 个工作区和 7 个模型；真实 Agent 启动未执行，以免给现有工作区发出测试任务。浏览器测试使用模拟会话，iOS / Android 目前只完成平台兼容实现，未在真机验收。

## 代码结构

```text
index.client.tsx           Paseo 客户端注册
index.server.ts            Paseo daemon 注册
client/board.tsx           共用的 React Native UI
shared/model.ts            数据模型、状态映射、搜索与排序
shared/contracts.ts        带验证的 RPC 输入 / 输出
server/handlers.ts         daemon 数据路径与 RPC 绑定
server/service.ts          SDK 集成、任务操作、启动恢复
server/store.ts            串行写入与原子持久化
preview/                   隔离的交互预览
tests/                     核心测试与浏览器验证
scripts/                   宿主编译和只读 daemon 检查
```

接口参考：[Paseo v0.8 插件文档](https://paseo.sh/docs/plugins/v0.8/reference)、[TypeScript SDK](https://paseo.sh/docs/sdk/quickstart)。工作流灵感来自 [Multica](https://github.com/multica-ai/multica)，未复制其代码。
