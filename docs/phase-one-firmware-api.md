# Phase One Firmware API

本文件定义一期固件分发系统的接口基线。

目标有两点：
- 对现有 BFC 前端保持兼容，避免一开始大改刷机逻辑
- 为后续接入 GitHub Actions、COS、CDN 和冷门回源预留统一契约

## 设计原则

- 现有前端优先兼容 `BuildApi` 既有接口
- 新增的 `firmware/*` 接口作为一期面向镜像分发的标准接口
- 热资源请求优先返回 COS/CDN 可下载地址
- 冷门资源允许返回异步任务状态，而不是强制实时构建

## 兼容现有前端的接口

这些接口已经被 [BuildApi.js](/Users/lihao/Documents/betaflight-configurator/src/js/BuildApi.js) 和 [firmware_flasher.js](/Users/lihao/Documents/betaflight-configurator/src/js/tabs/firmware_flasher.js) 使用，后端必须优先满足。

### `GET /api/targets`

返回目标板列表。

响应示例：

```json
[
  { "target": "HSF405", "group": "supported" },
  { "target": "HSF722", "group": "supported" },
  { "target": "LEGACYF411", "group": "legacy" }
]
```

字段说明：
- `target`: 目标板名称
- `group`: 分组，当前前端会用 `supported`、`unsupported`、`legacy`

### `GET /api/targets/{target}`

返回某个 target 的可选版本列表。

响应示例：

```json
{
  "target": "HSF405",
  "releases": [
    { "release": "2025.12.2", "type": "Stable", "label": "Stable" },
    { "release": "2025.12.3-rc.1", "type": "ReleaseCandidate", "label": "RC" },
    { "release": "2026.1.0-alpha.1", "type": "Unstable", "label": "Dev" }
  ]
}
```

### `GET /api/builds/{release}/{target}`

返回某个版本和 target 的详情。

响应示例：

```json
{
  "target": "HSF405",
  "release": "2025.12.2",
  "releaseType": "Stable",
  "releaseUrl": "https://bf.hs-fpv.com/releases/2025.12.2",
  "date": "2026-04-06",
  "mcu": "STM32F405",
  "manufacturer": "HS-FPV",
  "cloudBuild": false,
  "configuration": [
    "defaults nosave",
    "feature OSD",
    "set name = HS-FPV"
  ]
}
```

字段说明：
- `cloudBuild`: `false` 表示可直接下载缓存产物，`true` 表示仍需走构建/异步任务路径
- `configuration`: 可选，作为默认 CLI 配置注入

### `POST /api/builds`

兼容当前前端的“加载在线固件”动作。

对于一期镜像系统，这个接口不一定真的触发构建，也可以：
- 命中热资源时直接返回缓存文件地址
- 冷门资源时创建异步任务并返回任务 key

请求示例：

```json
{
  "target": "HSF405",
  "release": "2025.12.2",
  "options": ["CORE_BUILD"]
}
```

命中热资源示例：

```json
{
  "key": "mockhsf4052025122000000000000000",
  "file": "HSF405_2025.12.2.hex",
  "url": "/mock-api/firmware/HSF405_2025.12.2.hex"
}
```

### `GET /api/builds/{key}/status`

查询异步任务状态。

响应示例：

```json
{
  "status": "success",
  "configuration": [
    "defaults nosave",
    "feature OSD",
    "set name = HS-FPV"
  ]
}
```

状态约定：
- `queued`
- `success`
- `failed`

### `GET /api/builds/{key}/json`

用于读取某个 build key 对应的构建选项。

响应示例：

```json
{
  "Request": {
    "Options": ["USE_SERIALRX_CRSF", "USE_OSD_MSP_DISPLAYPORT"]
  }
}
```

### `GET /api/options/{release}`

返回该版本的构建选项。

响应示例：

```json
{
  "radioProtocols": [
    { "name": "CRSF", "value": "USE_SERIALRX_CRSF", "default": true }
  ],
  "telemetryProtocols": [
    { "name": "SmartPort", "value": "USE_TELEMETRY_SMARTPORT", "default": false }
  ],
  "generalOptions": [
    { "name": "Blackbox", "value": "USE_BLACKBOX", "default": true },
    {
      "name": "OSD MSP DisplayPort",
      "group": "OSD",
      "groupedName": "MSP DisplayPort",
      "value": "USE_OSD_MSP_DISPLAYPORT",
      "default": true
    }
  ],
  "motorProtocols": [
    { "name": "DShot300", "value": "USE_DSHOT300", "default": true }
  ]
}
```

### `GET /api/options/{release}/{key}`

语义与 `GET /api/options/{release}` 相同，但可按 build key 返回更精确的默认选项。

### `GET /api/releases/{release}/commits`

仅专家模式下的开发版构建使用。

响应示例：

```json
[
  {
    "sha": "a1b2c3d4",
    "message": "mock: add firmware mirror metadata"
  }
]
```

## 一期镜像分发标准接口

这些接口是后续前端改造应优先迁移到的新接口。

### `GET /api/firmware/versions`

返回镜像站可用版本列表。

```json
[
  { "version": "2025.12.2", "channel": "stable" },
  { "version": "2025.12.3-rc.1", "channel": "rc" }
]
```

### `GET /api/firmware/targets?version=2025.12.2`

返回对应版本可用 target 列表。

```json
{
  "version": "2025.12.2",
  "targets": [
    { "target": "HSF405", "cached": true, "channel": "stable" },
    { "target": "HSF722", "cached": true, "channel": "stable" }
  ]
}
```

### `GET /api/firmware/url?version=2025.12.2&target=HSF405`

返回下载地址或任务状态。

命中示例：

```json
{
  "hit": true,
  "source": "cos",
  "file": "HSF405_2025.12.2.hex",
  "url": "/mock-api/firmware/HSF405_2025.12.2.hex"
}
```

未命中示例：

```json
{
  "hit": false,
  "source": "building",
  "taskId": "bf_hsf405_2026010a1",
  "status": "pending"
}
```

### `GET /api/firmware/task/{taskId}`

查询冷门回源或异步构建任务状态。

```json
{
  "taskId": "bf_hsf405_2026010a1",
  "status": "success",
  "url": "/mock-api/firmware/HSF405_2026.1.0-alpha.1.hex"
}
```

## 数据流对应关系

一期建议这样映射：

- `GET /api/targets` 与 `GET /api/targets/{target}`：来自每日同步生成的 metadata
- `GET /api/builds/{release}/{target}`：来自 target 详情索引
- `POST /api/builds`：统一入口，内部可路由到热资源直出或冷门回源
- `GET /api/firmware/*`：逐步替代旧式 build 接口，直接表达镜像分发语义

当前仓库已经补上第一版生成链路：
- 源清单在 [phase-one-manifest.json](/Users/lihao/Documents/betaflight-configurator/resources/firmware-mirror/phase-one-manifest.json)
- schema 在 [firmware-mirror-manifest_schema-1.0.json](/Users/lihao/Documents/betaflight-configurator/resources/jsonschema/firmware-mirror-manifest_schema-1.0.json)
- 生成脚本在 [generate-firmware-metadata.mjs](/Users/lihao/Documents/betaflight-configurator/scripts/generate-firmware-metadata.mjs)
- 工作流在 [firmware-metadata-sync.yml](/Users/lihao/Documents/betaflight-configurator/.github/workflows/firmware-metadata-sync.yml)
- 本地 mock API 会优先读取 `artifacts/firmware-metadata/manifest.json`，不存在时回退到源 manifest

生成结果目录结构：

```text
artifacts/firmware-metadata/
  manifest.json
  index/versions.json
  index/targets.json
  index/hot.json
  targets/{target}.json
  builds/{release}/{target}.json
```

建议后端映射关系：
- `GET /api/targets` -> `index/targets.json`
- `GET /api/targets/{target}` -> `targets/{target}.json`
- `GET /api/builds/{release}/{target}` -> `builds/{release}/{target}.json`
- `GET /api/firmware/versions` -> `index/versions.json`

当前仓库还提供了一个最小独立后端服务：
- 启动命令：`yarn firmware:api`
- 入口文件： [serve-firmware-api.mjs](/Users/lihao/Documents/betaflight-configurator/scripts/serve-firmware-api.mjs)
- 共享适配层： [firmware-api-adapter.mjs](/Users/lihao/Documents/betaflight-configurator/scripts/firmware-api-adapter.mjs)

常用环境变量：
- `PORT` / `HOST`
- `FIRMWARE_METADATA_DIR`
- `FIRMWARE_MANIFEST_PATH`
- `FIRMWARE_ASSET_DIR`
- `FIRMWARE_ASSET_PREFIX`

## GitHub Actions 与 COS 上传

workflow: [firmware-metadata-sync.yml](/Users/lihao/Documents/betaflight-configurator/.github/workflows/firmware-metadata-sync.yml)

触发方式：
- 每天北京时间 02:00 自动运行并尝试上传 COS
- 支持手动运行，`upload_to_cos` 默认开启

需要配置的 GitHub Secrets：
- `TENCENT_COS_BUCKET`
- `TENCENT_COS_REGION`
- `TENCENT_COS_SECRET_ID`
- `TENCENT_COS_SECRET_KEY`

需要配置的 GitHub Variable：
- `FIRMWARE_COS_PREFIX`

如果 `FIRMWARE_COS_PREFIX=mirror-metadata`，成功后 COS 中应出现：

```text
mirror-metadata/manifest.json
mirror-metadata/index/versions.json
mirror-metadata/index/targets.json
mirror-metadata/index/hot.json
mirror-metadata/targets/HSF405.json
mirror-metadata/targets/HSF722.json
mirror-metadata/targets/LEGACYF411.json
mirror-metadata/builds/2025.12.2/HSF405.json
mirror-metadata/builds/2025.12.2/HSF722.json
mirror-metadata/builds/2025.12.3-rc.1/HSF405.json
mirror-metadata/builds/2025.12.3-rc.1/HSF722.json
mirror-metadata/builds/2025.9.8/LEGACYF411.json
```

## 当前阶段的实施顺序

1. 先用 mock 服务实现本文件中的兼容接口。
2. 让前端本地可联调、可加载在线固件。
3. 再把数据源从 mock 替换成 GitHub Actions 生成的 metadata 和 COS 对象。
4. 最后补冷门回源和任务调度。

## 本地联调说明

当前仓库已内置一套 Vite mock API：
- `/api/*` 由 [mock-api/vite-plugin.js](/Users/lihao/Documents/betaflight-configurator/mock-api/vite-plugin.js) 注入
- 示例数据位于 [mock-api/data.js](/Users/lihao/Documents/betaflight-configurator/mock-api/data.js)
- 示例固件位于 [mock-api/assets/firmware](/Users/lihao/Documents/betaflight-configurator/mock-api/assets/firmware)

这层 mock 的作用是先跑通：
- target 列表
- release 列表
- 在线固件加载
- 一期 `firmware/*` 新接口的基础返回结构
