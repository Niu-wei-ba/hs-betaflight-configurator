---
name: betaflight-git-sync
description: Project-level git sync workflow for Betaflight Configurator. Use this skill when managing git branches, fetching upstream, rebasing onto upstream/master, resetting local master, checking out stable release tags, or preparing to submit a Pull Request.
---

# Betaflight Configurator 项目专属 Git 工作流与同步指南

本 Skill 规范了 Betaflight Configurator 项目的 Git 分支管理、上游同步及发布版本切换流程。无论是人类开发者还是 AI 编码助手（Agent），在此项目中进行 Git 操作时均须严格遵守以下规范。

## 核心原则

1. **以官方 `master` 为开发基准**：项目的开发主线仍为 `master` 分支，所有的 feature 分支均应当从官方的 `upstream/master` 拉取，而非本地的 `master`。
2. **禁止直接修改本地 `master`**：本地的 `master` 应仅作为官方 `upstream/master` 的镜像，不做任何本地提交。
3. **使用 Rebase 进行同步**：严禁使用 `git merge` 同步上游代码。必须通过 `git fetch upstream` 配合 `git rebase upstream/master` 来保持本地分支的线性整洁。
4. **精确版本使用 Tag**：如果需要编译稳定版或进行问题复现，应当切到对应的 release tag（例如 `tags/2025.12.2`），而不是依赖分支。

---

## 常用操作流程

### 1. 首次克隆与配置远程仓库
克隆个人 Fork 的仓库，并配置官方源为 `upstream`：

```bash
git clone https://github.com/betaflight/betaflight-configurator.git
cd betaflight-configurator

# 将默认的 origin 重命名为 upstream（官方源）
git remote rename origin upstream
git fetch upstream

# （可选）如果有个人 fork 仓库，则添加为 origin
# git remote add origin <你的Fork仓库地址>
```

### 2. 开发新功能 / 抢最新版 (创建功能分支)
所有改动都必须在独立的分支中进行，且必须基于最新的官方 `master`：

```bash
git fetch upstream
# 从官方 master 拉取你自己的语义化工作分支（例如 feat/my-feature 或 fix/bug-xyz，此处以 my-work 作为示例）
git checkout -b my-work upstream/master
```

### 3. 与官方最新代码同步 (Rebase 流程)
如果官方这几天更新了代码，需要将自己未提交/未合并的分支与上游同步：

```bash
# 获取上游最新提交
git fetch upstream

# 切到你的工作分支
git checkout my-work

# 将工作分支 rebase 到官方最新 master 上
git rebase upstream/master
```
> [!WARNING]
> 如果在 rebase 过程中遇到冲突，请逐一解决冲突后运行 `git add <冲突文件>`，再执行 `git rebase --continue`。切勿直接执行 commit。

### 4. 重置本地 master 分支 (不保留任何修改)
如果你只是想跟官方最新版走，且不保留你本地的修改：

```bash
git fetch upstream
git checkout master
git reset --hard upstream/master
```

### 5. 切换到稳定的 Release 版本 (如发版编译)
等官方正式发版或需要稳定可复现的构建时，切到准确的发布版本 Tag：

```bash
# 获取上游所有 tags
git fetch upstream --tags

# 切换到具体 tag
git checkout tags/2025.12.2
```

### 6. 推送改动与提交 Pull Request (PR)
当你完成了功能开发并完成了与上游的同步后：

```bash
# 推送到自己的 origin 仓库（若第一次推送，加 -u 参数）
git push -u origin my-work
```
推送完成后，访问 GitHub 并在个人 Fork 仓库页面上向 `betaflight/betaflight-configurator` 的 `master` 分支提交 Pull Request。

---

## 🤖 对 AI Agent 的特殊指令

当你（Agent）在此项目中执行任务，并且需要进行 Git 变更、提交或分支切换时，**必须**遵循以下开发规范：
1. **自动检查 Remotes**：在拉取或推送前，运行 `git remote -v` 验证 `upstream` 是否指向官方 `betaflight-configurator` 仓库。
2. **切忌直接在本地 master 上提交代码**。如果检测到当前处于 `master` 分支，且需要做出改动，必须先通过 `git checkout -b feat/<your-feature-name> upstream/master` 建立新分支。
3. **保持同步**：每次向用户交付代码变更或建议提交前，应先通过 `git fetch upstream` 和 `git rebase upstream/master` 确保本地工作分支没有与上游落后或冲突。
