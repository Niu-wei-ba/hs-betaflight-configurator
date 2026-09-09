# 支持快照 v2

## 行为与兼容性

进入 CLI 之前暂停页面轮询并独立采集，3 秒单请求超时、60 秒整体超时。采集前后核对当前 PID / Rates 索引，采集期间禁止其他 MSP 请求。退出页面或断开飞控会取消待处理请求。成功后深度冻结结果；CLI 上传只附加文本，不重新读取可变 FC 状态。

失败时可以重试，或选择“仅进入 CLI（不提供快照）”，保留 CLI-only 固件的维护入口。没有完整冻结结果时不允许提交支持快照。CLI 提交等待命令发送完毕及输出安静窗口；页面退出后不继续提交。

回放只接受 v2，按完整请求键精确查找。缺失或固件不支持的数据会使相关页面显示不可用提示，隐藏其配置内容，防止默认值被误认成真实配置。页面配置控件及写命令禁用；PID / Rates 子页仍可浏览，Profile 不可切换。动态图表显示的是采集时数据。

后端继续接收和读取 v1，不修改旧记录；新前端拒绝回放 v1 并提示重新采集。部署时必须先发布支持 v2 的 API，再发布前端。本次没有部署或同步其他版本工作区。

## Wire contract

保留 `POST /api/support/snapshots` 和 `GET /api/support/snapshots/:supportId`。

- `schemaVersion: 2`。
- `mspResponses`: `{ code, requestKey, payloadBase64, unsupported }`；`requestKey` 是 `code:base64(requestBytes)`，不支持的响应保留标记且无配置载荷。
- `captureReport`: `{ complete, startedAt, completedAt, profile: { pid, rate }, requests, responseCount, plannedResponseCount }`，Profile 索引从 0 开始。
- `requests`: `{ code, requestKey, required, status }`。采集阶段区分 `success / unsupported / timeout / failed`；只有所有必需请求成功、可选请求成功或明确不支持时才可提交。
- 前后端验证规范 Base64、重复/错误请求键、请求与结果对应关系、必要身份/状态响应长度及 Profile 一致性。不能仅凭 `complete: true` 通过校验。

纯校验模块是前端 `src/js/support/SnapshotContract.js` 与 API 仓库 `scripts/support-snapshot-contract.mjs` 的相同副本；修改协议时须同时更新两份及对应测试夹具，不引入跨仓库运行时路径依赖。

## 自动测试

前端：

```sh
npx vitest run test/js/support_snapshot*.test.js test/js/msp.test.js test/js/msp_cli_queue.test.js test/js/msp/MSPHelper.test.js test/js/msp/battery_profile.test.js test/js/vue_tab_mounter.test.js
npm run lint -- --ignore-pattern 'src/dist/**'
npm run build
```

API 仓库：

```sh
npm test -- test/js/supportSnapshots.test.js
```

lint 排除生成目录，避免把打包文件当源码检查；构建与未排除生成目录的 lint 不应并行运行。

## 2026-09-08 验证记录

- 前端相关回归测试 59 项通过；后端快照接口测试 8 项通过，含 v1 兼容和 v2 上传读取。
- lint 排除生成目录后通过，0 错误；保留未修改的 RatesSubTab.vue 中 hasProfileNames 未使用警告。生产构建通过，保留现有 Three.js 旧接口、资源路径及大 chunk 警告。
- 本地浏览器连接临时 API，使用合成 MSP 数据完成实际表单加载验证：v1 拒绝并提示重新采集；v2 打开正常。
- PID 页显示测试值 Roll 43/81/27、Pitch 45/85/29、Yaw 47/89/0。Profile 2、名称 PID TWO、复制、重置及保存控件禁用。
- Rates 子页可切换浏览，固定 Rate Profile 3、名称 RATE 3；配置控件及保存禁用。
- 缺失 MSP 108 / 105 的测试页面显示“未采集”，配置表单被隐藏。
- 关闭快照后恢复普通“连接”按钮及未连接侧栏。
- 当前串口仅有 Bluetooth-Incoming-Port 与 debug-console，没有发现 USB 飞控。尚未完成真实飞控采集、两套真实 Profile 的参数对照及真实断连重连验收；模拟测试和本地页面验证不能替代该步骤。
