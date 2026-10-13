# 普通 Blackbox 被动分析与 AI 结论

当前实现见 [V0.6 说明](./v06.md)。以下保留早期实现记录；当前协议、输入上限和统计定义以 V0.6 说明为准。

分支：`codex/passive-blackbox-analysis`。本批对应技术方案 V0.2A 的可运行只读切片，不代表完整调参功能。

## 入口

在选项中启用专家模式，打开「普通日志分析」。不连接飞控即可导入 `.bbl/.bfl` 或含 BBL 格式的 `.txt`，选择文件内的单次飞行。本地 Worker 完成分析后，若已配置 AI，则自动发送结构化证据包并生成 AI 结论；页面优先展示结论，日志质量与三轴频谱位于默认折叠的高级详情。原始文件仅进入本地 Worker，不上传。

文件上限暂为 64 MiB；解码通道和帧数另受内存预算约束。通过文件签名判断格式，不按扩展名猜测。诊断缩放适配只覆盖明确的 Betaflight 4.5.x、2025.12.x、2026.6.x 版本文本；未知字段缩放关闭对应频谱分析。

## 已实现

- 单文件多 log 索引、明确选择、普通 I/P/S/G/H 与已知事件帧解码。
- 复用现有 GPL 字节/分组编码解码基础；独立严格流对 EOF/不合法 varint 拒绝，不通过默认编码猜测继续。
- 数字和分数形式的 P interval；P ratio 不覆盖已知间隔；降采样后的 loopIteration 预测。
- 坏帧后丢弃 P 历史、只从有效 I 帧恢复，并记录连续段断点。
- 实测时间周期、头部交叉验证、MAD 抖动、非均匀/缺帧分段；FFT 不跨断点。
- periodic Hann、50% overlap、单边 PSD/CSD、`conj(X)*Y`、带正则 H1 与未正则 coherence。
- 窗口数/独立 block/输入 RMS/输入谱/相干性/正则项比值共同生成连续可信频段。
- 三轴增益、相位、coherence 和 gyro PSD 可视化；未知频带不生成默认带宽。
- SHA-256 来源绑定、取消/旧消息隔离、便携 JSON 报告（排除图表 TypedArray）。
- 中文/英文界面与原因码。

## 明确未开放

真实动作检测、工作点/飞行状态分类、D-term/RPM 专项分析、标定质量评分、PID 候选、快照及写入恢复尚未实现。AI 仅输出参考诊断结论。

所有结果均为 `diagnosis_only`，`applyAllowed=false`，`recommendation.changes=[]`。当前模块不导入 FC/MSP 或设备写入 API。未经工作点分类的全日志频谱、未知抗混叠链路和未标定噪声不能用于改参。裕度、有效开环及简单 P 倍率稳定性预测均未加入。

`bandwidthHz=null` 是当前缺失态；没有建立可信低频参考与 crossing 检测之前，不回退到任何目标带宽。图表 phase 为包裹相位，跨 ±180° 断开；不冒充已完成的延迟或相位裕度指标。

## 数据契约

- Parser 输出 `schemaVersion`、固件/原始头部、TypedArray 通道、日志索引、连续边界、事件、损坏区域数量和字段能力。
- Timing 输出实测采样率、头部采样率、偏差、抖动、有效连续 spans 与 reason codes。
- Analyzer 输出独立三轴的能力/原因、谱支持统计、噪声来源和未知风险。图表数组与 Feature 分开。
- 报告记录完整文件 SHA-256、文件名、大小、log index、算法版本以及结构化缺失/拒绝原因。

策略阈值均为首轮工程候选：时间局部偏差容许 `max(2 us, 2%)`，全局 MAD ≤1%，至少 6 个 Welch 窗口/3 个不重叠 block、输入 RMS ≥0.5 deg/s、coherence ≥0.6。它们尚未通过机型数据集标定。

## 验证

使用 Node 24：

```sh
node node_modules/vitest/vitest.mjs run test/passive-tune test/js/sidebar_items.test.js test/js/vue_tab_mounter.test.js
node node_modules/vite/bin/vite.js build
```

数学测试采用独立直接 DFT 验证 PSD/CSD 归一化、互谱共轭与边界 bins；已知正弦验证功率积分，已知延迟验证相位符号。拒绝测试覆盖无激励、单窗口、采样倍率错误、时间断点、非均匀时间、未知版本/缩放/编码、坏帧、多日志、取消与旧任务隔离。

2026-10-09 用公开真实日志完成额外验证：[FPVPIDlab fixture](https://github.com/eddycek/fpvpidlab/blob/main/test-fixtures/bbl/blackbox_2026-03-29T16-17-37-126Z.bbl)。文件大小 4,663,296 bytes，Betaflight 4.5.2，解析 109,814 帧，实测与 header 均 1,000 Hz，0 个损坏区域，193 个谱窗口。Roll/Pitch/Yaw 分别得到有限低频支持/无连续支持/有限低频支持。该结果是单份日志的运行证据，不能视为所有版本或所有机型的识别精度认证。

浏览器已验证页面入口、真实文件导入、分析完成、图表展开与 JSON 导出；导出 hash 与输入原始文件一致。原日志仅临时下载，不提交进仓库。

## 接续顺序

1. 增加锁定版本的真实日志 corpus 与格式覆盖（包括 GPS、事件、回绕和旧格式差异）。
2. 原始动作识别、状态/reject mask、油门工作点与跨轴耦合分组。
3. D-term/RPM/饱和能力与统计区间，独立数据集标定质量。
4. 证据定位、规则建议预览及影子评审；仍保持写入关闭。
5. 单独开发和验证设备身份/配置绑定、快照、事务与恢复，再决定 Apply 开放范围。

## 代码来源

现有 `src/js/blackbox/datastream.js`、`decoders.js` 为 GPL Blackbox Viewer 移植；`fft.js` 标注 BSD-2-Clause。新 parser 的 predictor 与 logging schedule 按现有编码和 [Blackbox Explorer parser](https://github.com/betaflight/blackbox-log-viewer/blob/master/src/flightlog_parser.js) 的格式语义实现，保留 GPL-3.0-or-later 标识。数学核不复用现有 Chirp gain/filter 推荐器。后续发布继续遵守仓库现有许可与来源记录要求。

## AI provider 配置

「AI 配置与解读」支持 OpenAI 兼容的 `/models` 和 `/chat/completions` 接口，默认 Base URL 为 `https://8stoken.com/v1`。Key 不提供代码默认值。Base URL、Key 和选中的模型按用户要求保存在当前 origin 的 `localStorage["passiveTune.ai.v1"]`，页面 Key 输入框使用密码显示；保存会拉取模型，页面重新打开也会刷新。切换模型立即保存；清除配置会移除这项存储并取消当前请求。localStorage 不是加密凭据库，同源页面脚本可以读取它。

用户点击「分析并生成 AI 结论」后，本地分析完成时自动发送经过筛选的确定性证据包；也可显式重新生成结论。发送内容，不发送原始 BBL、文件名、GPS、事件、raw headers、采样数组或 API Key 到聊天正文。结果按结构化结论卡片展示，记录所选与响应模型、时间、算法版本和日志 hash；重新分析/选择文件、切换模型、修改已保存配置会清除旧回答。Key 仅通过 Authorization 发送给配置的 provider（8sToken 经过本站 relay），不加入日志、报告或构建产物。AI 只解释证据，未开放具体 PID 候选或设备写入。

2026-10-09 实测 `https://8stoken.com/v1/models` 可返回模型，但未提供浏览器 CORS，OPTIONS 返回 404。因此 Vite 开发和预览服务安装同源 `/__passive-ai/` relay。relay 仅接受 8sToken 的 `/v1/models` 与 `/v1/chat/completions`；拒绝其他主机、跨站 Origin、重定向，限制输入/输出和超时，不保存 Key。其他 provider 采用直接请求，须由 provider 允许浏览器 CORS。

静态部署不会携带 Vite 中间件。8sToken 上线时须额外启动 Node 24 relay 并从前端同源反代；本轮未部署生产服务：

```sh
PASSIVE_AI_ORIGIN=https://your-frontend.example PASSIVE_AI_PORT=4182 node scripts/passive-ai/server.js
```

同源 Nginx 配置示例（保留原站点配置，路径不能改写）：

```nginx
location /__passive-ai/ {
    proxy_pass http://127.0.0.1:4182;
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 95s;
    client_max_body_size 128k;
}
```

服务监听 loopback；不可把 relay 作为独立开放代理暴露。AI 配置不随原分析 JSON 导出。本轮新增 provider/存储/取消隔离/relay 12 项测试。

浏览器验证：保存配置后取得 14 个模型，切换至 `claude-haiku-4-5-20251001`，刷新页面后 Key 与所选模型恢复且列表自动获取；导入公开真实日志后调用 chat completions，返回模型与所选模型一致。AI 解读作为参考单独展示，不作为确定性指标。

## LLM 证据包与最终 AI 结论

输入契约为 `passive-ai-evidence-1.0`，实际 JSON 可在页面展开「查看发给 AI 的数据」检查。输入大小不超过32 KiB，数值缺失保持 null：

| 数据组 | 发送内容与含义 |
| --- | --- |
| 来源 | 完整文件 SHA-256、单次飞行索引、可识别的 Betaflight 版本、分析算法版本 |
| 日志质量 | 实测/头部采样率、偏差、时间抖动、断点、损坏区域、连续样本覆盖率 |
| 三轴跟踪 | 支持频段、Welch窗口/独立block、指令RMS、完整支持点的增益极值、峰值；每轴最多48个代表性派生频点，保留极值 |
| gyro信号 | 按频段的信号RMS、频段无法覆盖的缺失原因；明确包含动作响应，风险未评估 |
| 部分配置 | 仅对白名单日志头数值解析：三轴PID、D min、部分gyro/D-term/RPM/动态陷波频率；不发送原始头部或任意文本 |
| 能力边界 | 阶跃/回弹/动作及油门分段/饱和/RPM专项/抗混叠/温度/完整配置等缺失项；不能据此确定整机PID质量或给出具体改值 |
| 字段定义与原因 | 明确有效频段不是控制带宽，窗口不是评分；诊断阈值仍为未标定工程候选 |

输出契约为 `passive-ai-conclusion-1.0`：总体结论、完整三轴判断、结论依据编号、每轴限制、2至4项下一步建议、至少3项无法判断事项及 `pidDecision=not_determined`。状态只表示数据支持程度：`limited_evidence`/`insufficient_evidence`，不表示飞控合格/不合格。响应需通过字段、完整性、状态与证据引用检查；截断、缺失轴、虚构引用或多出写入字段时显示生成失败，可重试，不展示为已完成结论。该检查不构成AI文字事实正确性的认证。

「导出 AI 结论」生成 `passive-ai-report-1.0`，同时包含实际输入包、结构化回答、请求/响应模型与生成时间；不导出Key或AI连接配置。导出时检查文件hash、飞行索引、算法与证据版本绑定。更换文件/单次飞行、重新分析会取消旧解释；模型列表加载尚未完成时排队等待，自动生成每轮仅触发一次，取消不会恢复旧任务。

2026-10-12 真实浏览器验证：点击「分析并生成 AI 结论」后自动返回 `claude-opus-5-5` 的结构化回答，三轴完整、引用有效、PID决定未确定。下载的报告输入包与本地重新计算的输入包逐字段一致，SHA-256 与原公开日志一致；输入包6,116 bytes，横滚/俯仰/偏航分别含3/0/6个派生频点。此验证是端到端功能证据，不构成模型分析准确性认证。
