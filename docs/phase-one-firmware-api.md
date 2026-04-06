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
    { "target": "SPEEDYBEEF405V3", "group": "supported" },
    { "target": "MATEKF722", "group": "supported" },
    { "target": "IFLIGHT_BLITZ_F722", "group": "supported" }
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
    "target": "SPEEDYBEEF405V3",
    "releases": [{ "release": "2025.12.2", "type": "Stable", "label": "Stable" }]
}
```

### `GET /api/builds/{release}/{target}`

返回某个版本和 target 的详情。

响应示例：

```json
{
    "target": "SPEEDYBEEF405V3",
    "release": "2025.12.2",
    "releaseType": "Stable",
    "releaseUrl": "https://bf.hs-fpv.com/releases/2025.12.2",
    "date": "2026-02-08",
    "mcu": "STM32F405",
    "manufacturer": "SPBE",
    "cloudBuild": false,
    "configuration": ["defaults nosave"]
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
    "target": "SPEEDYBEEF405V3",
    "release": "2025.12.2",
    "options": ["CORE_BUILD"]
}
```

命中热资源示例：

```json
{
    "key": "bfspeedybeef405v3202512200000000",
    "file": "SPEEDYBEEF405V3_2025.12.2.hex",
    "url": "https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex"
}
```

### `GET /api/builds/{key}/status`

查询异步任务状态。

响应示例：

```json
{
    "status": "success",
    "configuration": ["defaults nosave", "feature OSD", "set name = HS-FPV"]
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
    "radioProtocols": [{ "name": "CRSF", "value": "USE_SERIALRX_CRSF", "default": true }],
    "telemetryProtocols": [{ "name": "SmartPort", "value": "USE_TELEMETRY_SMARTPORT", "default": false }],
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
    "motorProtocols": [{ "name": "DShot300", "value": "USE_DSHOT300", "default": true }]
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
        "message": "mirror: add firmware metadata"
    }
]
```

## 一期镜像分发标准接口

这些接口是后续前端改造应优先迁移到的新接口。

### `GET /api/firmware/versions`

返回镜像站可用版本列表。

```json
[{ "version": "2025.12.2", "channel": "stable" }]
```

### `GET /api/firmware/targets?version=2025.12.2`

返回对应版本可用 target 列表。

```json
{
    "version": "2025.12.2",
    "targets": [
        { "target": "SPEEDYBEEF405V3", "cached": true, "channel": "stable" },
        { "target": "MATEKF722", "cached": true, "channel": "stable" }
    ]
}
```

### `GET /api/firmware/url?version=2025.12.2&target=SPEEDYBEEF405V3`

返回下载地址或任务状态。

命中示例：

```json
{
    "hit": true,
    "source": "cos",
    "file": "SPEEDYBEEF405V3_2025.12.2.hex",
    "url": "https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex"
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
    "taskId": "bf_speedybeef405v3_2026010a1",
    "status": "success",
    "url": "https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/firmware/rc/2026.1.0-alpha.1/SPEEDYBEEF405V3/firmware.hex"
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
- 官方 target 校验脚本在 [validate-firmware-manifest.mjs](/Users/lihao/Documents/betaflight-configurator/scripts/validate-firmware-manifest.mjs)
- 生成脚本在 [generate-firmware-metadata.mjs](/Users/lihao/Documents/betaflight-configurator/scripts/generate-firmware-metadata.mjs)
- 固件产物镜像脚本在 [mirror-firmware-artifacts.mjs](/Users/lihao/Documents/betaflight-configurator/scripts/mirror-firmware-artifacts.mjs)
- 工作流在 [firmware-metadata-sync.yml](/Users/lihao/Documents/betaflight-configurator/.github/workflows/firmware-metadata-sync.yml)
- 独立 firmware API 会优先读取 `artifacts/firmware-metadata/manifest.json`，不存在时回退到源 manifest

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
- `FIRMWARE_METADATA_BASE_URL`
- `FIRMWARE_ARTIFACT_BASE_URL`

生产形态建议：

- `FIRMWARE_METADATA_BASE_URL`: 指向 COS/CDN 中的 metadata bundle 前缀，例如 `https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/mirror-metadata`
- `FIRMWARE_ARTIFACT_BASE_URL`: 指向固件对象 COS/CDN 根路径，例如 `https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com`

如果设置了 `FIRMWARE_METADATA_BASE_URL`，服务启动时会先下载：

```text
manifest.json
index/versions.json
index/targets.json
index/hot.json
targets/{target}.json
builds/{release}/{target}.json
```

下载后仍写入 `FIRMWARE_METADATA_DIR`，运行时继续从本地缓存读取，避免每个用户请求都回源 COS。

如果设置了 `FIRMWARE_ARTIFACT_BASE_URL`，下载地址会从 metadata 中的 `artifact.objectKey` 拼出。例如：

```text
FIRMWARE_ARTIFACT_BASE_URL=https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com
artifact.objectKey=/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex
返回 URL=https://bfc-firmware-1322839452.cos.ap-guangzhou.myqcloud.com/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex
```

## GitHub Actions 与 COS 上传

workflow: [firmware-metadata-sync.yml](/Users/lihao/Documents/betaflight-configurator/.github/workflows/firmware-metadata-sync.yml)

触发方式：

- 每天北京时间 02:00 自动运行并尝试上传 COS
- 支持手动运行，`upload_to_cos` 默认开启
- 支持手动开启 `sync_firmware_artifacts`，用于生成或拉取 manifest 声明的真实固件 `.hex`

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
mirror-metadata/targets/SPEEDYBEEF405V3.json
mirror-metadata/targets/MATEKF722.json
mirror-metadata/builds/2025.12.2/SPEEDYBEEF405V3.json
mirror-metadata/builds/2025.12.2/MATEKF722.json
```

真实固件来源不是手工上传。按一期计划，GitHub Actions 的固件产物镜像有三种来源：

- `betaflight-cloud-build`: 默认来源，请求官方 Betaflight Cloud Build，适合当前 2025.12.x 这类 GitHub release 不再附带 `.hex` assets 的版本
- `github-release-asset`: 直接拉取官方 GitHub release asset，适合 4.5.0/4.5.1 这类仍带 `.hex` assets 的版本
- `url`: 从显式 URL 下载，适合你已经有稳定上游产物地址的场景

manifest target 可以声明：

```json
{
    "target": "SPEEDYBEEF405V3",
    "source": {
        "type": "betaflight-cloud-build"
    },
    "artifact": {
        "fileName": "SPEEDYBEEF405V3_2025.12.2.hex",
        "objectKey": "/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex"
    }
}
```

注意：manifest 里的 `target` 必须是官方 `betaflight/config` 里的 target ID。开启 `sync_firmware_artifacts` 前会运行 `npm run firmware:manifest:validate`，校验 target 是否存在、`mcu/manufacturer` 是否匹配官方 `config.h`，以及 `artifact.objectKey` 是否包含官方 target 段。

## 当前阶段的实施顺序

1. 用独立 firmware API 实现本文件中的兼容接口。
2. 让前端通过 `VITE_BUILD_API_BASE_URL` 连接本地或生产 firmware API。
3. 使用 GitHub Actions 生成 metadata 并上传 COS，同时通过官方 Betaflight Cloud Build 镜像真实固件对象。
4. 最后补冷门回源和任务调度。

## 本地联调说明

当前仓库的本地联调使用独立 firmware API：

- 启动 API：[serve-firmware-api.mjs](/Users/lihao/Documents/betaflight-configurator/scripts/serve-firmware-api.mjs)
- 读取本地 metadata：`artifacts/firmware-metadata`
- 读取本地固件文件：`artifacts/firmware-files`
- 生产环境 metadata 来源：`FIRMWARE_METADATA_BASE_URL`
- 生产环境固件对象来源：`FIRMWARE_ARTIFACT_BASE_URL`

这条联调链路用于跑通：

- target 列表
- release 列表
- 在线固件加载
- 一期 `firmware/*` 新接口的基础返回结构
