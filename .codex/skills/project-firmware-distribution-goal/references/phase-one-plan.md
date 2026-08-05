# 一期固件分发系统开发目标

## 总定位

一期目标不是做“全量固件镜像库”，而是做“BFC 可用的国内加速固件分发系统”。

核心策略：
- GitHub Actions 负责海外侧拉取、预构建、上传
- COS + CDN 负责国内分发
- 冷门资源按需回源
- 回源成功后回填缓存

## 整体架构

建议拆成四层：

### 1. 用户访问层

直接给用户使用：
- BFC 网页版
- 版本列表接口
- 固件下载接口
- 刷机入口页

建议使用国内可访问域名，例如 `bf.hs-fpv.com`。

### 2. 预构建层

放在 GitHub Actions：
- 每日定时同步官方源码或 release 信息
- 预构建热门版本和热门 target
- 生成 metadata 索引
- 上传产物到 COS

约束：
- 适合自动化拉取、构建、上传
- 不适合无限扩张为全量重型构建平台
- 预构建范围必须受热门集控制

### 3. 存储分发层

放在腾讯云：
- COS 存储固件
- CDN 做国内下载加速
- 生命周期规则管理冷热文件
- 可选开启 COS Global Acceleration 优化上传链路

### 4. 冷门回源层

这是业务逻辑层：
- COS 未命中时触发回源
- 回源成功后上传 COS
- 后续请求直接命中缓存

一期优先做“回源官方并缓存”，不强制上完整在线构建系统。

## 资源分层策略

### 热门资源

长期缓存到 COS：
- 最新稳定版
- 最近一个 RC 或测试版
- 主流 target
- 站内下载量最高的一批组合

由 GitHub Actions 每日定时刷新。

### 温资源

不预构建，但允许缓存：
- 偶尔有人刷的 target
- 老版本中仍有一定使用量的组合

第一次请求时回源，成功后写入 COS，并保留一段时间。

### 冷资源

不主动存储：
- 冷门 target
- 很老的版本
- 极少有人请求的组合

仅在用户请求时触发回源。

## 核心流程

### 流程 1：每日预构建同步

1. GitHub Actions 通过 `cron` 定时触发。
2. 拉取上游信息：
   - 官方 release
   - target 白名单
   - 热门版本清单
3. 对热门版本和热门 target 执行预构建或预同步。
4. 生成 `metadata.json`。
5. 上传到 COS，例如：
   - `/firmware/stable/{version}/{target}/firmware.hex`
   - `/firmware/stable/{version}/{target}/firmware.bin`
   - `/firmware/stable/{version}/{target}/meta.json`
   - `/index/versions.json`
   - `/index/targets.json`
   - `/index/hot.json`
6. 触发 CDN 刷新或等待缓存自然更新。

### 流程 2：用户下载热门固件

1. 用户打开 BFC 网页版。
2. 前端请求：
   - `/api/firmware/versions`
   - `/api/firmware/targets?version=...`
3. 用户选择版本和 target。
4. 前端请求下载地址：
   - `/api/firmware/url?version=...&target=...`
5. 后端检查 COS 对象是否存在。
6. 如果存在：
   - 返回 COS/CDN 地址
   - 前端直接下载并刷机

目标：
- 不走 GitHub
- 不走海外构建
- 提供稳定下载体验

### 流程 3：COS 未命中时的冷门回源

1. 用户请求某个固件。
2. 后端检查 COS，不存在。
3. 后端检查任务表或构建锁：
   - 已在处理则复用任务
   - 没有则新建任务
4. 执行回源策略：
   - 第一优先级：官方已有标准产物时直接拉取
   - 第二优先级：必要时走海外构建入口
5. 回源成功后上传到 COS，例如：
   - `/firmware/cache/{version}/{target}/{profileHash}/firmware.hex`
6. 返回下载地址给前端。
7. 记录本次命中和热度统计。

## 目录结构建议

```text
/index/
  versions.json
  targets.json
  hot.json

/firmware/stable/{version}/{target}/
  firmware.hex
  firmware.bin
  meta.json

/firmware/rc/{version}/{target}/
  firmware.hex
  firmware.bin
  meta.json

/firmware/cache/{version}/{target}/{profileHash}/
  firmware.hex
  firmware.bin
  meta.json
```

目录语义：
- `stable`：长期保留
- `rc`：中期保留
- `cache`：按生命周期自动淘汰

## API 设计建议

### 1. 获取版本列表

`GET /api/firmware/versions`

返回示例：

```json
[
  { "version": "2025.12.0", "channel": "stable" },
  { "version": "2025.12.1-rc1", "channel": "rc" }
]
```

### 2. 获取目标板列表

`GET /api/firmware/targets?version=2025.12.0`

### 3. 获取下载地址

`GET /api/firmware/url?version=2025.12.0&target=STM32F405`

命中示例：

```json
{
  "hit": true,
  "source": "cos",
  "url": "https://..."
}
```

未命中示例：

```json
{
  "hit": false,
  "source": "building",
  "taskId": "bf_2025120_f405_xxx",
  "status": "pending"
}
```

### 4. 查询任务状态

`GET /api/firmware/task/{taskId}`

## GitHub Actions 的职责边界

适合做：
- 定时同步
- 热门版本预构建
- 产物上传 COS
- metadata 生成
- 每日清单更新

一期不建议承担：
- 所有用户实时构建
- 长时间排队任务调度
- 在线状态轮询主后端

## COS / CDN 配置建议

### COS

- 作为主存储桶
- 分目录存储 `stable`、`rc`、`cache`
- `cache/` 单独配生命周期规则
- 热门资源保留在标准存储
- 冷缓存可转低频或按天删除

### CDN

- 作为下载域名的国内分发层
- 固件文件长缓存
- API 不长缓存
- 配限频、防刷和流量封顶

### COS Global Acceleration

可选开启，主要用于上传链路优化。

注意：
- 全球加速域名可用于上传和下载
- 普通 CDN 下载更适合用户分发，不适合作上传加速替代

## 生命周期策略

### stable

- 长期保留
- 不自动删除
- 一般不建议过早归档

### rc

- 保留 60 到 120 天
- 过期后删除或转低频

### cache

- 30 天未访问可转低频
- 60 到 90 天可删除

注意：
- 归档类存储需要解冻，不适合直接服务下载链路
- 下载型资源更适合“标准存储 / 低频存储 / 删除重建”三段式策略

## 日志与统计

从一期开始至少记录：
- `version`
- `target`
- 是否命中 COS
- 是否触发回源
- 回源成功或失败
- 用户下载次数
- 最近 7 天热度

这些数据用于逐步把热门集从经验判断升级为真实访问排行。

## 上线顺序

### 第一阶段：热资源直出

先完成：
- GitHub Actions 定时同步
- 热门固件上传 COS
- BFC 前端读取自有 metadata
- 用户下载走 COS/CDN

目标：优先覆盖 70% 到 90% 常见请求。

### 第二阶段：冷门回源

补齐：
- COS 未命中检测
- 回源拉取
- 上传 COS
- 任务状态接口

### 第三阶段：高级能力

后续再做：
- 动态构建
- 构建任务去重
- 海外构建服务
- 更复杂的 profile 缓存

## 最终主链路

```text
用户打开 BFC 网页
-> 请求版本/target 索引
-> 选择固件
-> 请求下载地址
-> 后端检查 COS
   -> 命中：返回 CDN 地址
   -> 未命中：触发冷门回源
      -> 回源成功后上传 COS
      -> 返回下载地址
-> 用户下载并刷机
```

后台定时链路：

```text
GitHub Actions 定时执行
-> 拉上游版本信息
-> 预构建热门版本和 target
-> 生成 metadata
-> 上传 COS
-> 更新索引
```

## 方案评价

优点：
- 不要求全量存储
- 不依赖国内服务器直接访问 GitHub
- 常见请求可走国内分发
- 冷门请求有兜底
- 后续可平滑升级为海外构建服务 + COS 缓存架构

代价：
- 冷门请求首次响应较慢
- GitHub Actions 不适合承接大规模实时构建
- 热门集需要尽快从日志统计中校准
