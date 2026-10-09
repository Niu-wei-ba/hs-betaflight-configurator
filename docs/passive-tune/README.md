# 普通 Blackbox 被动分析：第一批实现

分支：`codex/passive-blackbox-analysis`。本批对应技术方案 V0.2A 的可运行只读切片，不代表完整调参功能。

## 入口

在选项中启用专家模式，打开「普通日志分析」。不连接飞控即可导入 `.bbl/.bfl` 或含 BBL 格式的 `.txt`，选择文件内的单次飞行，分析三轴频谱并导出 JSON。文件仅进入本地 Worker，不上传。

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

真实动作检测、工作点/飞行状态分类、D-term/RPM 专项分析、标定质量评分、PID 候选、AI、快照及写入恢复尚未实现。

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
