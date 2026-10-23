<template>
    <BaseTab tab-name="esc_melody" extra-class="esc-melody-tab">
        <div class="esc-melody-shell melody-selection-shell">
            <header class="esc-melody-header" :inert="modalOpen ? '' : undefined">
                <div class="esc-melody-title-group">
                    <UIcon name="i-lucide-music-2" class="esc-ui-icon title-music-icon" aria-hidden="true" />
                    <h1>电调音乐</h1>
                    <span class="melody-supported-firmware" title="兼容性以具体型号、固件版本和扫描验证结果为准">
                        Bluejay · AM32 · OX32 · BLHeli_32
                    </span>
                </div>
                <nav class="melody-mode-nav" aria-label="电调音乐视图">
                    <button
                        type="button"
                        :aria-pressed="workspaceView === 'library'"
                        @click="workspaceView = 'library'"
                    >
                        选曲
                    </button>
                    <button type="button" :aria-pressed="workspaceView === 'editor'" @click="workspaceView = 'editor'">
                        编曲
                    </button>
                </nav>
                <div class="melody-header-device">
                    <span class="melody-connection-status">
                        <UIcon
                            :name="connected ? 'i-lucide-plug' : 'i-lucide-unplug'"
                            class="esc-ui-icon"
                            aria-hidden="true"
                        />
                        {{ headerConnectionLabel }}
                    </span>
                    <button
                        type="button"
                        class="primary-button melody-header-scan"
                        aria-label="扫描电调"
                        :disabled="!connected || scanning || locked || !!writeRecoveryTargets.length"
                        @click="scanEscs"
                    >
                        <UIcon
                            name="i-lucide-refresh-cw"
                            class="fas fa-sync-alt esc-ui-icon"
                            :class="{ spinning: scanning }"
                            aria-hidden="true"
                        />
                        {{ scanning ? "扫描中" : "扫描电调" }}
                    </button>
                    <button
                        type="button"
                        class="text-button"
                        :aria-expanded="deviceDetailsOpen"
                        aria-controls="melody-device-details"
                        @click="deviceDetailsOpen ? closeDeviceDetails() : openDeviceDetails()"
                    >
                        设备详情
                        <UIcon
                            :name="deviceDetailsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-right'"
                            class="esc-ui-icon"
                            aria-hidden="true"
                        />
                    </button>
                </div>
            </header>

            <div
                v-if="operationMessage"
                class="esc-melody-notice"
                :class="`notice-${operationType}`"
                role="status"
                :inert="modalOpen ? '' : undefined"
            >
                <UIcon
                    :name="operationType === 'error' ? 'i-lucide-triangle-alert' : 'i-lucide-info'"
                    class="fas esc-ui-icon"
                    :class="operationType === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'"
                    aria-hidden="true"
                />
                {{ operationMessage }}
                <button type="button" class="notice-close" aria-label="关闭提示" @click="operationMessage = ''">
                    ×
                </button>
            </div>

            <section
                v-show="deviceDetailsOpen"
                id="melody-device-details"
                class="melody-device-details"
                aria-label="电调设备详情"
                :inert="modalOpen ? '' : undefined"
            >
                <div class="melody-device-heading">
                    <div class="device-title">
                        <h2 tabindex="-1">设备详情</h2>
                        <span class="device-readiness" :class="{ 'has-issues': hasDeviceIssues }">{{
                            deviceReadiness
                        }}</span>
                    </div>
                    <button type="button" class="text-button" @click="closeDeviceDetails">收起详情</button>
                </div>
                <div class="device-layout">
                    <aside class="device-console" aria-label="设备概况与操作">
                        <span class="device-section-label">连接设备</span>
                        <div class="device-overview esc-scan-panel" :class="{ connected, scanning }">
                            <div class="device-connection">
                                <UIcon
                                    :name="connected ? 'i-lucide-plug' : 'i-lucide-unplug'"
                                    class="esc-ui-icon"
                                    aria-hidden="true"
                                />
                                <div>
                                    <strong>{{
                                        escModelSummary.length
                                            ? escModelSummary.join("；")
                                            : connected
                                              ? "已连接飞控"
                                              : "离线编辑"
                                    }}</strong>
                                    <small>{{ connectionSummary }}</small>
                                </div>
                            </div>
                            <div class="device-actions">
                                <button
                                    v-if="selectedEsc"
                                    type="button"
                                    class="regular-button current-melody-item"
                                    :class="{ active: currentMelodySourceActive }"
                                    :disabled="!currentMelodySource"
                                    @click="loadCurrentMelody"
                                >
                                    <UIcon name="i-lucide-history" class="esc-ui-icon" aria-hidden="true" />
                                    当前音乐
                                    <span v-if="!syncAll" class="current-source-badge"
                                        >ESC {{ selectedEsc.channel + 1 }}</span
                                    >
                                    <small>{{ currentMelodySourceSummary }}</small>
                                </button>
                                <button
                                    type="button"
                                    class="regular-button"
                                    :disabled="!connected || !escs.length || locked"
                                    @click="chooseRestoreFile"
                                >
                                    <UIcon name="i-lucide-rotate-ccw" class="esc-ui-icon" aria-hidden="true" /> 恢复
                                    EEPROM
                                </button>
                            </div>
                        </div>
                        <p class="device-operation-status" role="status">{{ operationReadiness }}</p>
                        <details class="device-encoding-help">
                            <summary>编码与固件支持</summary>
                            <section class="target-panel">
                                <div class="panel-heading">
                                    <span>当前声部编码</span
                                    ><span class="validation-badge" :class="{ valid: validation.valid }">{{
                                        validation.valid ? "编码通过" : "编码需调整"
                                    }}</span>
                                </div>
                                <div class="compat-summary">
                                    <strong
                                        >{{ validation.encodedLength }}<small>/{{ targetCapacity }} B</small></strong
                                    ><span>{{
                                        targetFirmware === "blheli32" ? "BLHeli_32 音符容量" : "RTTTL 编码容量"
                                    }}</span>
                                </div>
                                <ul class="validation-list">
                                    <li
                                        v-for="warning in validation.warnings || []"
                                        :key="warning"
                                        class="validation-warning"
                                    >
                                        {{ warning }}
                                    </li>
                                    <li v-for="error in validation.errors" :key="error" class="validation-error">
                                        <UIcon
                                            name="i-lucide-circle-x"
                                            class="fas fa-times-circle esc-ui-icon"
                                            aria-hidden="true"
                                        />{{ error }}
                                    </li>
                                    <li v-if="validation.valid" class="validation-ok">
                                        <UIcon
                                            name="i-lucide-circle-check"
                                            class="fas fa-check-circle esc-ui-icon"
                                            aria-hidden="true"
                                        />音符数量、时长和目标容量均通过
                                    </li>
                                </ul>
                                <details class="compatibility-help">
                                    <summary>支持的固件与容量说明</summary>
                                    <div class="matrix-row">
                                        <span><i class="firmware-dot bluejay"></i>Bluejay</span
                                        ><span class="matrix-cap">读写 · 等待计入旋律容量</span>
                                    </div>
                                    <div class="matrix-row">
                                        <span><i class="firmware-dot am32"></i>AM32</span
                                        ><span class="matrix-cap">读写 · 等待计入旋律容量</span>
                                    </div>
                                    <div class="matrix-row">
                                        <span><i class="firmware-dot ox32"></i>OX32</span
                                        ><span class="matrix-cap">读写 · 128 B · 配置页 CRC</span>
                                    </div>
                                    <div class="matrix-row">
                                        <span><i class="firmware-dot blheli"></i>BLHeli_32</span
                                        ><span class="matrix-cap">读写 · 48 B · FPV32 / AT32F421 / 32.10</span>
                                    </div>
                                </details>
                            </section>
                        </details>
                    </aside>
                    <div class="device-channel-area">
                        <EscChannelPlan
                            separate-capacity
                            :rows="assignmentRows"
                            :mode-label="arrangementLabel"
                            :voice-count="presetTrackTabs.length"
                            :warnings="assignmentWarnings"
                            :editable="!locked && !writeRecoveryTargets.length"
                            @assign="assignVoice"
                        />
                        <details class="device-technical-details" :open="hasDeviceIssues || undefined">
                            <summary>
                                通道诊断
                                <small>{{ hasDeviceIssues ? "有通道需要处理" : "查看芯片、固件与读取信息" }}</small>
                            </summary>
                            <section class="esc-list-panel">
                                <div class="panel-heading">
                                    <span>通道信息</span
                                    ><span class="panel-count">{{
                                        escs.length ? `${escs.length} 路已检查` : "未扫描"
                                    }}</span>
                                </div>
                                <div v-if="!escs.length" class="scan-empty">
                                    <UIcon
                                        name="i-lucide-plug"
                                        class="fas fa-plug esc-ui-icon"
                                        aria-hidden="true"
                                    /><strong>尚未扫描</strong><small>连接飞控后扫描 4-way 电调</small>
                                </div>
                                <nav v-if="escs.length" class="device-diagnostic-tabs" aria-label="选择诊断通道">
                                    <button
                                        v-for="esc in escs"
                                        :key="esc.id"
                                        type="button"
                                        :aria-pressed="inspectedDeviceId === esc.id"
                                        :class="{ 'has-issues': esc.melodyReadError || !esc.canWrite }"
                                        @click="deviceInspectionId = esc.id"
                                    >
                                        ESC {{ esc.channel + 1 }}
                                    </button>
                                </nav>
                                <article
                                    v-for="esc in escs"
                                    :key="esc.id"
                                    v-show="esc.id === inspectedDeviceId"
                                    class="esc-record"
                                    :class="[
                                        `esc-status-${esc.status}`,
                                        { 'esc-record-selected': !syncAll && selectedEscId === esc.id },
                                    ]"
                                >
                                    <button
                                        type="button"
                                        class="esc-record-main esc-record-select"
                                        title="在编曲中查看此通道"
                                        :disabled="!isEscMelodyEditable(esc)"
                                        @click="selectEscChannel(esc)"
                                    >
                                        <span class="esc-channel">{{ esc.channel + 1 }}</span>
                                        <div>
                                            <strong>{{ esc.model }}</strong
                                            ><small
                                                >{{ esc.firmwareLabel }} · {{ esc.version
                                                }}<template v-if="esc.bootloader">
                                                    · {{ esc.bootloader }} {{ esc.bootloaderVersion }}</template
                                                ></small
                                            >
                                        </div>
                                        <UIcon
                                            :name="esc.canWrite ? 'i-lucide-circle-check' : 'i-lucide-lock-keyhole'"
                                            class="esc-status-icon fas esc-ui-icon"
                                            :class="esc.canWrite ? 'fa-check-circle' : 'fa-lock'"
                                            :title="esc.reason || '可读写'"
                                        />
                                    </button>
                                    <div class="esc-record-meta">
                                        <span>{{ esc.layout }}</span
                                        ><span
                                            class="firmware-detection-mark"
                                            :class="`read-${esc.confirmationStatus || 'pending'}`"
                                            >{{ firmwareDetectionLabel(esc) }}</span
                                        >
                                        ><span class="melody-read-mark" :class="`read-${esc.melodyReadStatus}`">{{
                                            melodyReadLabel(esc)
                                        }}</span
                                        ><span
                                            v-if="syncAll && pendingWriteEscIds.has(esc.id)"
                                            class="melody-write-mark"
                                            >将写入</span
                                        ><span v-else-if="esc.melodyDirty" class="melody-dirty-mark">已修改</span
                                        ><span v-if="esc.backedUp" class="backup-mark"
                                            ><UIcon
                                                name="i-lucide-shield-check"
                                                class="fas fa-shield-alt esc-ui-icon"
                                                aria-hidden="true"
                                            />
                                            已备份</span
                                        >
                                    </div>
                                    <button
                                        v-if="
                                            !syncAll &&
                                            esc.canWrite &&
                                            [readStatus.ERROR, readStatus.UNSUPPORTED].includes(esc.melodyReadStatus)
                                        "
                                        type="button"
                                        class="regular-button compact-button replace-melody-button"
                                        @click="replaceUnreadableEsc(esc)"
                                    >
                                        使用当前卷帘替换
                                    </button>
                                    <p
                                        v-if="esc.confirmationReason"
                                        class="esc-record-reason"
                                        :class="{ 'diagnostic-ok': esc.canWrite }"
                                    >
                                        {{ esc.confirmationReason }}
                                    </p>
                                    <p
                                        v-if="esc.reason && !esc.canWrite && esc.reason !== esc.confirmationReason"
                                        class="esc-record-reason"
                                    >
                                        {{ esc.reason }}
                                    </p>
                                    <p v-if="esc.melodyReadError" class="esc-record-reason">
                                        {{ esc.melodyReadError }}
                                    </p>
                                </article>
                            </section>
                        </details>
                    </div>
                </div>
            </section>
            <p v-if="automaticBl32.adapted" class="esc-melody-notice notice-info" role="status">
                已自动适配 BL32：整体移调或调整速度，保留全部音符。试听、预览和写入使用完整适配版，原曲与草稿保留。
            </p>
            <p v-if="automaticBl32.errors.length" class="esc-melody-notice notice-error" role="status">
                {{ automaticBl32.errors.join("；") }}
            </p>
            <main :data-view="workspaceView" class="esc-melody-workspace" :inert="modalOpen ? '' : undefined">
                <aside v-show="workspaceView === 'library'" class="esc-melody-sidebar">
                    <div class="selection-library-heading">
                        <h2>
                            旋律库 <small>{{ presets.length }} 首</small>
                        </h2>
                        <button type="button" class="text-button" @click="newDraft">新建旋律</button>
                    </div>
                    <nav class="selection-library-tabs" aria-label="旋律来源">
                        <button
                            type="button"
                            :aria-pressed="librarySection === 'all'"
                            @click="
                                librarySection = 'all';
                                presetScope = 'all';
                            "
                        >
                            全部
                        </button>
                        <button
                            type="button"
                            :aria-pressed="librarySection === 'favorites'"
                            @click="
                                librarySection = 'favorites';
                                presetScope = 'favorites';
                            "
                        >
                            收藏
                        </button>
                        <button
                            type="button"
                            :aria-pressed="librarySection === 'drafts'"
                            @click="librarySection = 'drafts'"
                        >
                            草稿 <small>{{ drafts.length || "" }}</small>
                        </button>
                    </nav>
                    <section v-show="librarySection !== 'drafts'" class="melody-panel selection-library-panel">
                        <label class="melody-library-search">
                            <UIcon name="i-lucide-search" class="fas fa-search esc-ui-icon" aria-hidden="true" />
                            <input
                                v-model.trim="presetQuery"
                                type="search"
                                placeholder="搜索旋律"
                                aria-label="搜索旋律库"
                            />
                            <button
                                v-if="presetQuery"
                                type="button"
                                aria-label="清空旋律搜索"
                                title="清空"
                                @click="presetQuery = ''"
                            >
                                ×
                            </button>
                        </label>
                        <details class="library-filter-disclosure">
                            <summary>筛选</summary>
                            <div class="library-filters">
                                <label class="visually-hidden" for="melody-library-scope">曲库范围</label
                                ><select id="melody-library-scope" v-model="presetScope">
                                    <option value="all">全部曲目</option>
                                    <option value="favorites">我的收藏</option>
                                    <option value="recent">最近使用</option>
                                </select>
                                <label class="visually-hidden" for="melody-library-voices">声部筛选</label
                                ><select id="melody-library-voices" v-model="presetVoices">
                                    <option value="all">全部声部</option>
                                    <option value="solo">单声部</option>
                                    <option value="multi">多声部</option>
                                </select>
                            </div>
                        </details>
                        <div class="library-table-heading" aria-hidden="true">
                            <span>名称</span><span>声部</span><span>时长</span>
                        </div>
                        <div class="melody-preset-list">
                            <div
                                v-for="preset in filteredPresets"
                                :key="preset.id"
                                class="library-preset-row"
                                :class="{
                                    selected:
                                        activeLibrarySource?.type === 'preset' && activeLibrarySource.id === preset.id,
                                }"
                            >
                                <button
                                    type="button"
                                    class="library-audition"
                                    :aria-label="`试听 ${preset.name}`"
                                    :aria-pressed="auditionPresetId === preset.id && playing"
                                    :disabled="locked"
                                    @click="previewLibraryPreset(preset)"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        class="esc-ui-icon"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <rect
                                            v-if="auditionPresetId === preset.id && playing"
                                            x="7"
                                            y="7"
                                            width="10"
                                            height="10"
                                            rx="2"
                                        />
                                        <path
                                            v-else
                                            d="M8 6.5c0-1.1 1.2-1.7 2.1-1.1l8.1 5.5a1.35 1.35 0 0 1 0 2.2l-8.1 5.5c-.9.6-2.1 0-2.1-1.1Z"
                                        />
                                    </svg>
                                    <span class="visually-hidden">{{
                                        auditionPresetId === preset.id && playing ? "停止" : "试听"
                                    }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="melody-list-item"
                                    :class="{
                                        active:
                                            activeLibrarySource?.type === 'preset' &&
                                            activeLibrarySource.id === preset.id,
                                    }"
                                    :disabled="locked"
                                    :title="`载入 ${preset.name}`"
                                    @click="loadPreset(preset)"
                                >
                                    <span
                                        ><strong>{{ preset.name }}</strong
                                        ><small>{{ preset.description }}</small></span
                                    >
                                </button>
                                <details v-if="presetCompatibility[preset.id]" class="library-compatibility">
                                    <summary>{{ presetCompatibility[preset.id].label }}</summary>
                                    <p v-for="reason in presetCompatibility[preset.id].reasons" :key="reason">
                                        {{ reason }}
                                    </p>
                                </details>
                                <div class="library-row-actions">
                                    <button
                                        type="button"
                                        class="text-button library-favorite"
                                        :aria-label="`收藏 ${preset.name}`"
                                        :aria-pressed="favoriteIds.includes(preset.id)"
                                        @click="toggleFavorite(preset.id)"
                                    >
                                        <UIcon name="i-lucide-star" class="esc-ui-icon" aria-hidden="true" />
                                    </button>
                                </div>
                                <span class="library-voice-count">{{ libraryTrackCount(preset) }} 声部</span>
                                <span class="library-duration">{{ libraryDuration(preset) }}</span>
                            </div>
                            <p v-if="!filteredPresets.length" class="melody-library-empty">没有匹配的旋律</p>
                        </div>
                        <p class="melody-library-source">含 ESC Configurator 公开曲库，按声部保留原始编排。</p>
                    </section>

                    <section v-show="librarySection === 'drafts'" class="melody-panel selection-drafts-panel">
                        <div class="panel-heading">
                            <span>我的草稿</span>
                            <span class="draft-panel-actions">
                                <span class="panel-count">{{ drafts.length }}/{{ draftLimit }}</span>
                                <input
                                    ref="draftImportInput"
                                    class="draft-file-input"
                                    type="file"
                                    accept="application/json,.json"
                                    @change="handleDraftImport"
                                />
                                <button
                                    type="button"
                                    class="icon-button draft-tool-button"
                                    aria-label="导入草稿包"
                                    title="导入草稿包"
                                    :disabled="locked || drafts.length >= draftLimit"
                                    @click="chooseDraftImport"
                                >
                                    <UIcon
                                        name="i-lucide-file-input"
                                        class="fas fa-file-import esc-ui-icon"
                                        aria-hidden="true"
                                    />
                                </button>
                                <button
                                    type="button"
                                    class="icon-button draft-tool-button"
                                    aria-label="导出全部草稿"
                                    title="导出全部草稿"
                                    :disabled="locked || !drafts.length"
                                    @click="exportAllDrafts"
                                >
                                    <UIcon
                                        name="i-lucide-file-output"
                                        class="fas fa-file-export esc-ui-icon"
                                        aria-hidden="true"
                                    />
                                </button>
                                <button
                                    type="button"
                                    class="icon-button draft-create-button"
                                    aria-label="新建草稿"
                                    title="新建草稿"
                                    :disabled="locked || drafts.length >= draftLimit"
                                    @click="newDraft"
                                >
                                    <UIcon name="i-lucide-plus" class="fas fa-plus esc-ui-icon" aria-hidden="true" />
                                </button>
                            </span>
                        </div>
                        <div
                            v-for="draft in drafts"
                            :key="draft.id"
                            class="draft-list-row"
                            :class="{
                                active: currentDraftId === draft.id,
                            }"
                        >
                            <button
                                type="button"
                                class="melody-list-item draft-item"
                                :class="{
                                    active: currentDraftId === draft.id,
                                }"
                                @click="loadDraft(draft)"
                            >
                                <UIcon
                                    name="i-lucide-file-audio"
                                    class="melody-list-icon fas fa-file-audio esc-ui-icon"
                                    aria-hidden="true"
                                />
                                <span>
                                    <strong>{{ draft.name }}</strong>
                                    <small>
                                        {{ formatDraftDate(draft.updatedAt) }}
                                        <span
                                            v-if="currentDraftId === draft.id && draftDirty"
                                            class="draft-unsaved-label"
                                            >· 待自动保存</span
                                        >
                                    </small>
                                </span>
                            </button>
                            <button
                                type="button"
                                class="icon-button draft-menu-button"
                                :aria-label="`管理草稿 ${draft.name}`"
                                :aria-expanded="draftMenuId === draft.id"
                                title="草稿操作"
                                :disabled="locked"
                                @click.stop="toggleDraftMenu(draft.id)"
                            >
                                <UIcon
                                    name="i-lucide-ellipsis-vertical"
                                    class="fas fa-ellipsis-v esc-ui-icon"
                                    aria-hidden="true"
                                />
                            </button>
                            <div v-if="draftMenuId === draft.id" class="draft-item-menu" role="menu">
                                <button type="button" role="menuitem" @click="renameDraft(draft)">
                                    <UIcon
                                        name="i-lucide-pencil"
                                        class="fas fa-pen esc-ui-icon"
                                        aria-hidden="true"
                                    />重命名
                                </button>
                                <button type="button" role="menuitem" @click="duplicateDraft(draft)">
                                    <UIcon
                                        name="i-lucide-copy"
                                        class="fas fa-copy esc-ui-icon"
                                        aria-hidden="true"
                                    />复制
                                </button>
                                <button type="button" role="menuitem" @click="exportDraftRtttl(draft)">
                                    <UIcon
                                        name="i-lucide-file-code"
                                        class="fas fa-file-code esc-ui-icon"
                                        aria-hidden="true"
                                    />导出 RTTTL
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    class="danger"
                                    @click="confirmDeleteDraft(draft, $event)"
                                >
                                    <UIcon
                                        name="i-lucide-trash-2"
                                        class="fas fa-trash-alt esc-ui-icon"
                                        aria-hidden="true"
                                    />删除
                                </button>
                            </div>
                        </div>
                        <div v-if="!drafts.length" class="draft-empty-state">
                            <span>暂无草稿</span>
                            <button type="button" class="text-button" :disabled="locked" @click="newDraft">
                                新建第一个草稿
                            </button>
                        </div>
                        <div class="draft-storage-note">
                            <UIcon name="i-lucide-monitor" class="fas fa-desktop esc-ui-icon" aria-hidden="true" />
                            <span>{{ draftSaveStatus }}</span>
                        </div>
                    </section>
                </aside>

                <section
                    v-show="workspaceView === 'library'"
                    class="melody-selection-preview"
                    aria-label="选中旋律预览"
                >
                    <div class="selection-preview-heading">
                        <div>
                            <h2>{{ presetSessionName || melody.name }}</h2>
                            <p v-if="selectedLibraryDescription">{{ selectedLibraryDescription }}</p>
                        </div>
                        <button
                            v-if="activeLibrarySource?.type === 'preset'"
                            type="button"
                            class="text-button library-favorite"
                            :aria-pressed="favoriteIds.includes(activeLibrarySource.id)"
                            aria-label="收藏当前旋律"
                            @click="toggleFavorite(activeLibrarySource.id)"
                        >
                            <UIcon name="i-lucide-star" class="esc-ui-icon" aria-hidden="true" />
                        </button>
                    </div>
                    <p class="selection-preview-meta">
                        {{ previewVoiceCount }} 声部 · {{ validation.noteCount }} 音符 ·
                        {{ formatDuration(validation.durationMs) }}
                    </p>
                    <div v-if="showPresetTrackTabs" class="selection-voice-tabs" role="group" aria-label="预览声部">
                        <button
                            v-for="track in presetTrackTabs"
                            :key="track.id"
                            type="button"
                            :aria-pressed="activePresetTrackIndex === track.index"
                            @click="selectPresetTrack(track.index)"
                        >
                            声部 {{ track.index + 1 }}
                        </button>
                    </div>
                    <MelodyOverview
                        :notes="effectiveMelody.notes"
                        :bpm="effectiveMelody.bpm"
                        :wait-ms="effectiveMelody.waitMs"
                    />
                    <div class="selection-preview-actions">
                        <button
                            type="button"
                            class="regular-button"
                            :disabled="locked || (!playing && !selectionPreviewPlayable)"
                            @click="toggleSelectionPreview"
                        >
                            <UIcon
                                :name="playing ? 'i-lucide-square' : 'i-lucide-play'"
                                class="esc-ui-icon"
                                aria-hidden="true"
                            />{{ playing ? "停止试听" : showPresetTrackTabs ? "试听合奏" : "试听旋律" }}
                        </button>
                        <button type="button" class="text-button" @click="workspaceView = 'editor'">
                            编辑旋律 <UIcon name="i-lucide-arrow-right" class="esc-ui-icon" aria-hidden="true" />
                        </button>
                    </div>
                    <section class="selection-target-summary">
                        <div class="panel-heading">
                            <strong>{{ arrangementLabel }}</strong
                            ><button type="button" class="text-button" @click="openDeviceDetails">
                                {{ escs.length ? "通道分配" : connected ? "扫描电调" : "设备详情" }}
                                <UIcon name="i-lucide-chevron-right" class="esc-ui-icon" aria-hidden="true" />
                            </button>
                        </div>
                        <div v-if="assignmentRows.length" class="selection-channel-chips">
                            <button
                                v-for="row in assignmentRows"
                                :key="row.id"
                                type="button"
                                :class="{ ready: row.editable && row.status !== '编码需调整' }"
                                :title="`${row.firmware} · ${row.voiceLabel} · ${row.status}`"
                                @click="openDeviceDetails"
                            >
                                <UIcon
                                    :name="
                                        row.editable && row.status !== '编码需调整'
                                            ? 'i-lucide-circle-check'
                                            : 'i-lucide-circle-alert'
                                    "
                                    class="esc-ui-icon"
                                    aria-hidden="true"
                                />ESC {{ row.channel + 1
                                }}<small v-if="showPresetTrackTabs">· {{ row.voiceLabel }}</small>
                            </button>
                        </div>
                        <p v-else class="selection-offline-help">
                            {{
                                connected
                                    ? "扫描电调后检查兼容性并分配通道。"
                                    : "可先离线选曲试听，连接飞控后扫描电调。"
                            }}
                        </p>
                        <div class="selection-encoding" :class="{ valid: validation.valid }">
                            <strong>{{ validation.valid ? "编码通过" : "编码需调整" }}</strong
                            ><span>{{ validation.encodedLength }} / {{ targetCapacity }} B</span
                            ><small v-if="!escs.length">离线预估</small>
                        </div>
                        <p v-for="error in validation.errors" :key="error" class="selection-encoding-error">
                            {{ error }}
                        </p>
                        <p v-for="error in writeValidation.errors" :key="error" class="selection-encoding-error">
                            {{ error }}
                        </p>
                        <p v-for="warning in assignmentWarnings" :key="warning" class="assignment-warning">
                            {{ warning }}
                        </p>
                    </section>
                    <button
                        type="button"
                        class="selection-contribution"
                        aria-label="联系投稿"
                        @click="openContributionDialog"
                    >
                        <span class="contribution-icon" aria-hidden="true">
                            <UIcon name="i-lucide-music-2" class="esc-ui-icon" />
                        </span>
                        <span class="contribution-copy">
                            <strong>分享你的旋律</strong>
                            <small>让更多飞友听见你的开机音乐</small>
                        </span>
                        <span class="contribution-action">
                            联系投稿
                            <UIcon name="i-lucide-arrow-up-right" class="esc-ui-icon" aria-hidden="true" />
                        </span>
                    </button>
                </section>

                <section v-show="workspaceView === 'editor'" class="esc-melody-editor">
                    <div v-if="melodyConflict" class="melody-conflict-notice">
                        <UIcon name="i-lucide-shuffle" class="fas fa-random esc-ui-icon" aria-hidden="true" />
                        <span>检测到多路当前音乐不同，已保留为分路编辑。</span>
                        <button type="button" class="regular-button compact-button" @click="syncConfirmOpen = true">
                            应用当前旋律到全部
                        </button>
                    </div>
                    <div class="editor-toolbar">
                        <div v-if="showPresetTrackTabs" class="editor-channel-navigation preset-track-navigation">
                            <div class="editor-channel-tabs preset-track-tabs" role="tablist" aria-label="预置音乐声部">
                                <button
                                    v-for="track in presetTrackTabs"
                                    :key="track.id"
                                    type="button"
                                    role="tab"
                                    class="editor-channel-tab preset-track-tab"
                                    :class="{ active: activePresetTrackIndex === track.index, dirty: track.dirty }"
                                    :aria-selected="activePresetTrackIndex === track.index"
                                    @click="selectPresetTrack(track.index)"
                                >
                                    <UIcon
                                        name="i-lucide-music-2"
                                        class="fas fa-music esc-ui-icon"
                                        aria-hidden="true"
                                    />
                                    <strong>声部 {{ track.index + 1 }}</strong>
                                    <span v-if="track.dirty" class="channel-tab-dirty" aria-label="已修改"></span>
                                </button>
                            </div>
                            <span class="editor-meta">
                                {{ validation.noteCount }} 音符 · {{ formatDuration(validation.durationMs) }}
                            </span>
                        </div>
                        <div v-else-if="showEscTabs" class="editor-channel-navigation">
                            <div class="editor-channel-tabs" role="tablist" aria-label="电调音乐通道">
                                <button
                                    v-for="esc in displayedEscs"
                                    :key="esc.id"
                                    type="button"
                                    role="tab"
                                    class="editor-channel-tab"
                                    :class="{
                                        active: selectedEscId === esc.id,
                                        dirty: esc.melodyDirty,
                                        unavailable: !isEscMelodyEditable(esc),
                                    }"
                                    :aria-selected="selectedEscId === esc.id"
                                    :disabled="!isEscMelodyEditable(esc)"
                                    :title="esc.melodyReadError || melodyReadLabel(esc)"
                                    @click="selectEscChannel(esc)"
                                >
                                    <span
                                        class="channel-tab-status"
                                        :class="`read-${esc.melodyReadStatus}`"
                                        aria-hidden="true"
                                    ></span>
                                    <strong>ESC {{ esc.channel + 1 }}</strong>
                                    <span v-if="esc.melodyDirty" class="channel-tab-dirty" aria-label="已修改"></span>
                                </button>
                            </div>
                            <span class="editor-meta">
                                {{ validation.noteCount }} 音符 · {{ formatDuration(validation.durationMs) }}
                            </span>
                        </div>
                        <div v-else class="editor-title">
                            <UIcon
                                name="i-lucide-sliders-horizontal"
                                class="fas fa-sliders-h esc-ui-icon"
                                aria-hidden="true"
                            />
                            <strong>{{ melody.name }}</strong>
                            <span v-if="!syncAll && selectedEsc" class="editor-channel">
                                第 {{ selectedEsc.channel + 1 }} 路
                            </span>
                            <span class="editor-meta">
                                {{ validation.noteCount }} 音符 · {{ formatDuration(validation.durationMs) }}
                            </span>
                        </div>
                        <div class="editor-actions">
                            <button
                                type="button"
                                class="icon-button"
                                title="撤销"
                                :disabled="!history.length"
                                @click="undo"
                            >
                                <UIcon name="i-lucide-undo-2" class="fas fa-undo esc-ui-icon" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                class="icon-button"
                                title="重做"
                                :disabled="!future.length"
                                @click="redo"
                            >
                                <UIcon name="i-lucide-redo-2" class="fas fa-redo esc-ui-icon" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                class="regular-button compact-button"
                                title="RTTTL 代码"
                                @click="openCodeDialog"
                            >
                                <UIcon name="i-lucide-code" class="fas fa-code esc-ui-icon" aria-hidden="true" /> 代码
                            </button>
                            <button type="button" class="regular-button compact-button" @click="addNote(false)">
                                <UIcon name="i-lucide-plus" class="fas fa-plus esc-ui-icon" aria-hidden="true" /> 音符
                            </button>
                            <button type="button" class="regular-button compact-button" @click="addNote(true)">
                                <UIcon name="i-lucide-pause" class="fas fa-pause esc-ui-icon" aria-hidden="true" /> 休止
                            </button>
                        </div>
                    </div>

                    <div class="transport-strip" aria-label="试听与编辑工具">
                        <div class="transport-title">
                            <strong>{{ presetSessionName || melody.name }}</strong
                            ><small>电脑试听与实际电机音色可能不同</small>
                        </div>
                        <div class="inspector-preview-actions">
                            <button
                                type="button"
                                class="regular-button"
                                :disabled="locked || !currentMelodyPlayable"
                                :title="selectedEsc ? `试听 ESC ${selectedEsc.channel + 1} 当前卷帘` : '试听当前卷帘'"
                                @click="playMelody"
                            >
                                <UIcon
                                    :name="previewMode === 'single' ? 'i-lucide-square' : 'i-lucide-volume-2'"
                                    class="fas esc-ui-icon"
                                    :class="previewMode === 'single' ? 'fa-stop' : 'fa-volume-up'"
                                    aria-hidden="true"
                                />
                                {{ previewMode === "single" ? "停止当前声部" : "试听当前声部" }}
                            </button>
                            <button
                                type="button"
                                class="regular-button"
                                :disabled="locked || !canPlayAllMelodies"
                                title="同时试听所有可编辑电调的旋律"
                                @click="playAllMelodies"
                            >
                                <UIcon
                                    :name="previewMode === 'all' ? 'i-lucide-square' : 'i-lucide-play'"
                                    class="fas esc-ui-icon"
                                    :class="previewMode === 'all' ? 'fa-stop' : 'fa-play'"
                                    aria-hidden="true"
                                />
                                {{ previewMode === "all" ? "停止合奏" : "试听合奏" }}
                            </button>
                        </div>
                        <label
                            >音量
                            <input v-model.number="previewVolume" aria-label="试听音量" type="range" min="0" max="100"
                        /></label>
                        <button
                            type="button"
                            class="regular-button"
                            :aria-pressed="previewMuted"
                            @click="previewMuted = !previewMuted"
                        >
                            {{ previewMuted ? "取消静音" : "静音" }}
                        </button>
                    </div>
                    <div class="timeline-tools">
                        <label
                            >工具
                            <select v-model="editorTool" aria-label="卷帘工具">
                                <option value="select">选择 / 移动</option>
                                <option value="note">添加音符</option>
                                <option value="rest">添加休止</option>
                            </select></label
                        >
                        <label
                            >吸附
                            <select v-model.number="snapStep" aria-label="吸附间隔">
                                <option :value="0.0625">1/16 拍</option>
                                <option :value="0.125">1/8 拍</option>
                                <option :value="0.25">1/4 拍</option>
                                <option :value="0.5">1/2 拍</option>
                            </select></label
                        >
                        <label
                            >缩放
                            <input v-model.number="zoomPixels" type="range" min="8" max="160" aria-label="卷帘缩放"
                        /></label>
                        <button type="button" class="regular-button" @click="fitTimeline">适应整曲</button>
                        <button type="button" class="regular-button" @click="locateSelectedNote">定位音符</button>
                        <label><input v-model="autoFollow" type="checkbox" />跟随播放</label>
                    </div>
                    <div ref="pianoRollWrap" class="piano-roll-wrap">
                        <div class="piano-roll-content" :style="{ width: `${timelineWidth + 32}px` }">
                            <div class="roll-time-ruler" :style="timelineStyle" aria-hidden="true">
                                <span
                                    v-for="tick in timelineTicks"
                                    :key="tick.beat"
                                    :style="{ left: `${tick.beat * zoomPixels}px` }"
                                    >{{ tick.beat + 1 }} 拍<small>{{ tick.seconds }}s</small></span
                                >
                            </div>
                            <div class="roll-pitch-grid">
                                <div class="piano-roll-labels" :style="pianoRollStyle" aria-hidden="true">
                                    <span v-for="row in noteRows" :key="row">{{
                                        row % 12 === 0 ? noteName(row) : ""
                                    }}</span>
                                </div>
                                <div
                                    class="piano-roll"
                                    :style="[timelineStyle, pianoRollStyle]"
                                    @pointerdown="addNoteAtPointer"
                                >
                                    <div
                                        v-if="previewShowsTimeline && playing"
                                        class="timeline-playhead"
                                        :style="{ left: `${Math.max(0, previewBeat) * zoomPixels}px` }"
                                        aria-hidden="true"
                                    ></div>
                                    <div class="roll-grid" aria-hidden="true">
                                        <i v-for="beat in timelineBeats" :key="beat"></i>
                                    </div>
                                    <div
                                        v-for="note in melody.notes"
                                        :key="note.id"
                                        class="esc-melody-note"
                                        role="button"
                                        :tabindex="selectedNoteId === note.id ? 0 : -1"
                                        :aria-label="`${note.rest ? '休止' : noteName(note.midi)}，起点 ${note.start} 拍，时长 ${note.duration} 拍`"
                                        :title="`${noteName(note.midi)} · ${note.start} 拍 · ${note.duration} 拍`"
                                        @focus="selectedNoteId = note.id"
                                        @keydown="onNoteKeydown($event, note)"
                                        :class="{
                                            selected: selectedNoteId === note.id,
                                            rest: note.rest,
                                            'preview-active': activePreviewNoteIds.includes(note.id),
                                        }"
                                        :style="noteStyle(note)"
                                        @pointerdown.stop="startNoteDrag($event, note)"
                                    >
                                        <span>{{ note.rest ? "休止" : noteName(note.midi) }}</span
                                        ><b>{{ formatBeat(note.duration) }}</b>
                                        <button
                                            type="button"
                                            class="note-delete"
                                            aria-label="删除音符"
                                            @pointerdown.stop
                                            @click.stop="removeNote(note.id)"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="editor-legend">
                        <span><i class="legend-note"></i> 音符</span><span><i class="legend-rest"></i> 休止</span
                        ><span>选择工具后点击空白处添加；方向键移动，Alt + 左右键选择音符，Delete 删除</span>
                    </div>

                    <div class="note-inspector">
                        <div class="note-inspector-main">
                            <div v-if="selectedNote" class="note-inspector-editor">
                                <div class="inspector-heading"><strong>已选音符</strong></div>
                                <div class="inspector-fields">
                                    <label v-if="!selectedNote.rest" class="field-row"
                                        ><span>音高</span
                                        ><select
                                            :value="selectedNote.midi"
                                            @change="updateSelected({ midi: Number($event.target.value) })"
                                        >
                                            <option v-for="midi in pitchOptions" :key="midi" :value="midi">
                                                {{ noteName(midi) }}
                                            </option>
                                        </select></label
                                    >
                                    <label class="field-row"
                                        ><span>时长</span
                                        ><select
                                            :value="selectedNote.duration"
                                            @change="updateSelected({ duration: Number($event.target.value) })"
                                        >
                                            <option v-for="duration in durations" :key="duration" :value="duration">
                                                {{ formatBeat(duration) }}
                                            </option>
                                        </select></label
                                    >
                                    <label class="field-row"
                                        ><span>起点</span
                                        ><input
                                            :value="selectedNote.start"
                                            type="number"
                                            min="0"
                                            step="0.125"
                                            @change="updateSelected({ start: Number($event.target.value) })"
                                    /></label>
                                    <button type="button" class="danger-button" @click="removeNote(selectedNote.id)">
                                        <UIcon
                                            name="i-lucide-trash-2"
                                            class="fas fa-trash esc-ui-icon"
                                            aria-hidden="true"
                                        />
                                        删除
                                    </button>
                                </div>
                            </div>
                        </div>

                        <section class="inline-melody-settings" aria-label="旋律设置">
                            <div class="inspector-heading"><strong>旋律设置</strong></div>
                            <div class="inline-melody-settings-fields">
                                <label class="inline-setting-field">
                                    <span>BPM</span>
                                    <input
                                        v-model.number="melody.bpm"
                                        type="number"
                                        :min="rtttlBpmMin"
                                        :max="rtttlBpmMax"
                                        step="1"
                                        @change="normalizeEditor"
                                    />
                                </label>
                                <label class="inline-setting-field">
                                    <span>主音</span>
                                    <select v-model="melody.key" @change="clearActiveLibrarySource">
                                        <option v-for="key in keys" :key="key" :value="key">{{ key }}</option>
                                    </select>
                                </label>
                                <label class="inline-setting-field inline-setting-wait">
                                    <span>开机等待</span>
                                    <span class="inline-setting-with-unit">
                                        <input
                                            v-model.number="melody.waitMs"
                                            type="number"
                                            min="0"
                                            max="65535"
                                            step="10"
                                            @change="normalizeEditor"
                                        />
                                        <small>ms</small>
                                    </span>
                                </label>
                                <label class="inline-setting-field"
                                    ><span>编排方式</span
                                    ><select
                                        :value="arrangementMode"
                                        aria-label="编排方式"
                                        :disabled="locked"
                                        @change="changeArrangement"
                                    >
                                        <option value="sync">同曲同步</option>
                                        <option value="poly" :disabled="!showPresetTrackTabs">
                                            多声部合奏（载入多声部预设）
                                        </option>
                                        <option value="independent" :disabled="!editableEscs.length">各路独立</option>
                                    </select></label
                                >
                            </div>
                        </section>
                    </div>
                    <details class="note-event-list">
                        <summary>音符列表 · 精确编辑（{{ melody.notes.length }}）</summary>
                        <div class="note-event-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>音符</th>
                                        <th>起点 / 拍</th>
                                        <th>时长 / 拍</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(note, index) in melody.notes" :key="note.id">
                                        <td>
                                            <button type="button" class="text-button" @click="selectNoteFromList(note)">
                                                {{ index + 1 }} · {{ noteName(note.midi) }}
                                            </button>
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                min="0"
                                                :step="snapStep"
                                                :value="note.start"
                                                :aria-label="`音符 ${index + 1} 起点`"
                                                @change="editNoteFromList(note, { start: Number($event.target.value) })"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                min="0.0625"
                                                step="0.0625"
                                                :value="note.duration"
                                                :aria-label="`音符 ${index + 1} 时长`"
                                                @change="
                                                    editNoteFromList(note, { duration: Number($event.target.value) })
                                                "
                                            />
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                class="text-button"
                                                :aria-label="`删除音符 ${index + 1}`"
                                                @click="removeNote(note.id)"
                                            >
                                                删除
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>
            </main>

            <details
                v-if="editRecovery"
                class="edit-recovery-banner compact-edit-recovery"
                :inert="modalOpen ? '' : undefined"
            >
                <summary>已保留上次编辑 · {{ editRecovery.package.drafts.length }} 个声部</summary>
                <button type="button" class="regular-button" :disabled="locked" @click="restoreEditorRecovery">
                    恢复上次编辑
                </button>
                <button type="button" class="regular-button" :disabled="locked" @click="exportEditorRecovery">
                    导出保留编排
                </button>
            </details>
            <footer class="esc-melody-actionbar" :inert="modalOpen ? '' : undefined">
                <div class="actionbar-status">
                    <UIcon
                        name="i-lucide-shield-check"
                        class="fas fa-shield-alt esc-ui-icon"
                        aria-hidden="true"
                    /><span>{{ actionbarStatusText }}</span>
                </div>
                <div class="actionbar-actions">
                    <input
                        ref="restoreFileInput"
                        class="restore-file-input"
                        type="file"
                        accept="application/json,.json"
                        @change="handleRestoreFile"
                    />
                    <p v-if="safetyWriteDisabledReason" class="safety-write-blocker" role="status">
                        <UIcon name="i-lucide-info" class="fas fa-info-circle esc-ui-icon" aria-hidden="true" />
                        <span>安全写入不可用：{{ safetyWriteDisabledReason }}</span>
                    </p>
                    <button
                        type="button"
                        class="regular-button"
                        :disabled="draftSaving || (currentDraftId && !draftDirty)"
                        @click="saveDraft"
                    >
                        <UIcon name="i-lucide-save" class="fas fa-save esc-ui-icon" aria-hidden="true" />
                        {{
                            currentDraftId
                                ? draftSaving
                                    ? "保存中"
                                    : draftDirty
                                      ? "立即保存"
                                      : "已自动保存"
                                : "另存为草稿"
                        }}
                    </button>
                    <button type="button" class="regular-button" @click="openCodeDialog">导入代码</button>
                    <button
                        v-if="writeRecoveryTargets.length"
                        type="button"
                        class="primary-button"
                        :disabled="locked"
                        @click="openSafety"
                    >
                        安全写入 · 待恢复
                    </button>
                    <button
                        v-else
                        type="button"
                        class="primary-button"
                        :disabled="!connected || locked || !pendingWriteEscs.length || !writeValidation.valid"
                        @click="openSafety"
                    >
                        <UIcon name="i-lucide-lock-keyhole" class="fas fa-lock esc-ui-icon" aria-hidden="true" />
                        安全写入
                    </button>
                </div>
            </footer>

            <div
                v-if="draftNameDialogOpen"
                class="safety-overlay draft-name-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="draft-name-title"
                @keydown.esc.prevent="closeDraftNameDialog"
            >
                <form
                    class="safety-dialog draft-name-dialog"
                    @submit.prevent="confirmDraftName"
                    @keydown.tab="trapDialogFocus"
                >
                    <div class="safety-dialog-header">
                        <div>
                            <UIcon
                                name="i-lucide-file-audio"
                                class="fas fa-file-audio esc-ui-icon"
                                aria-hidden="true"
                            />
                            <div>
                                <h2 id="draft-name-title">
                                    {{
                                        draftNameMode === "create"
                                            ? "新建草稿"
                                            : draftNameMode === "rename"
                                              ? "重命名草稿"
                                              : "另存为草稿"
                                    }}
                                </h2>
                                <p>
                                    {{
                                        draftNameMode === "create"
                                            ? "创建一个空白旋律草稿。"
                                            : draftNameMode === "rename"
                                              ? "修改草稿名称。"
                                              : "将当前卷帘保存为新的本机草稿。"
                                    }}
                                </p>
                            </div>
                        </div>
                        <button type="button" class="icon-button" aria-label="关闭" @click="closeDraftNameDialog">
                            ×
                        </button>
                    </div>
                    <div class="draft-name-body">
                        <label for="esc-melody-draft-name">草稿名称</label>
                        <input
                            id="esc-melody-draft-name"
                            ref="draftNameInput"
                            v-model="draftName"
                            type="text"
                            maxlength="32"
                            autocomplete="off"
                            placeholder="输入草稿名称"
                            :aria-invalid="Boolean(draftNameError)"
                            :aria-describedby="draftNameError ? 'draft-name-error' : undefined"
                            @input="draftNameError = ''"
                        />
                        <div class="draft-name-meta">
                            <span id="draft-name-error" class="draft-name-error" role="alert" aria-live="polite">{{
                                draftNameError
                            }}</span>
                            <span>{{ draftName.length }}/32</span>
                        </div>
                    </div>
                    <div class="safety-dialog-footer">
                        <button type="button" class="regular-button" @click="closeDraftNameDialog">取消</button>
                        <button type="submit" class="primary-button" :disabled="!draftName.trim()">
                            <UIcon
                                :name="draftNameMode === 'create' ? 'i-lucide-plus' : 'i-lucide-check'"
                                class="fas esc-ui-icon"
                                :class="draftNameMode === 'create' ? 'fa-plus' : 'fa-check'"
                                aria-hidden="true"
                            />
                            {{
                                draftNameMode === "create"
                                    ? "创建"
                                    : draftNameMode === "rename"
                                      ? "保存名称"
                                      : "保存草稿"
                            }}
                        </button>
                    </div>
                </form>
            </div>

            <div
                v-if="draftDeleteTarget"
                class="safety-overlay draft-delete-overlay"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="draft-delete-title"
                aria-describedby="draft-delete-description"
                @keydown.esc.prevent="closeDeleteDraftDialog"
            >
                <section class="safety-dialog draft-delete-dialog" @keydown.tab="trapDialogFocus">
                    <div class="safety-dialog-header">
                        <div>
                            <UIcon name="i-lucide-trash-2" class="fas fa-trash-alt esc-ui-icon" aria-hidden="true" />
                            <div>
                                <h2 id="draft-delete-title">删除草稿</h2>
                                <p id="draft-delete-description">
                                    “{{ draftDeleteTarget.name }}”删除后无法从本机恢复。
                                </p>
                            </div>
                        </div>
                        <button type="button" class="icon-button" aria-label="关闭" @click="closeDeleteDraftDialog">
                            ×
                        </button>
                    </div>
                    <div class="safety-dialog-footer">
                        <button type="button" class="regular-button" @click="closeDeleteDraftDialog">取消</button>
                        <button type="button" class="danger-button" @click="deleteDraft">
                            <UIcon name="i-lucide-trash-2" class="fas fa-trash-alt esc-ui-icon" aria-hidden="true" />
                            删除
                        </button>
                    </div>
                </section>
            </div>

            <div
                v-if="syncConfirmOpen"
                class="safety-overlay sync-confirm-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sync-confirm-title"
            >
                <section class="safety-dialog sync-confirm-dialog">
                    <div class="safety-dialog-header">
                        <div>
                            <UIcon name="i-lucide-copy" class="fas fa-clone esc-ui-icon" aria-hidden="true" />
                            <div>
                                <h2 id="sync-confirm-title">开启同步旋律</h2>
                                <p>
                                    以 {{ syncSourceLabel }} 为来源，覆盖
                                    {{ writableEscs.length }} 路可写电调的待写内容。
                                </p>
                            </div>
                        </div>
                        <button type="button" class="icon-button" aria-label="关闭" @click="cancelSyncAll">×</button>
                    </div>
                    <div class="sync-confirm-copy">
                        其他通道原有音乐不会立即写入，仍需完成本地备份和安全检查后才会永久修改。
                    </div>
                    <div class="safety-dialog-footer">
                        <button type="button" class="regular-button" @click="cancelSyncAll">取消</button>
                        <button type="button" class="primary-button" @click="confirmSyncAll">
                            <UIcon name="i-lucide-check" class="fas fa-check esc-ui-icon" aria-hidden="true" /> 确认应用
                        </button>
                    </div>
                </section>
            </div>

            <div
                v-if="safetyOpen"
                class="safety-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="safety-title"
            >
                <section class="safety-dialog">
                    <div class="safety-dialog-header">
                        <div>
                            <UIcon
                                :name="writeResult?.ok ? 'i-lucide-circle-check' : 'i-lucide-shield-user'"
                                class="fas esc-ui-icon"
                                :class="writeResult?.ok ? 'fa-check-circle' : 'fa-user-shield'"
                                aria-hidden="true"
                            />
                            <div>
                                <h2 id="safety-title">{{ writeResult?.ok ? "写入完成" : "写入前安全检查" }}</h2>
                                <p class="safety-write-melody">
                                    <span>本次写入音乐</span><strong>{{ safetyWriteMelodySummary }}</strong>
                                </p>
                                <p v-if="writeResult?.ok" role="status">
                                    已完成 {{ writeResult.written.length }} 路电调写入，全部目标均已读回校验。
                                </p>
                                <p v-else>
                                    将逐路写入 {{ pendingWriteEscs.length }} 路电调，完成以下安全检查后才能继续。
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="icon-button"
                            aria-label="关闭"
                            @click="closeSafety"
                            :disabled="writing || backingUp"
                        >
                            ×
                        </button>
                    </div>
                    <EscChannelPlan
                        :rows="safetyChannelRows"
                        :mode-label="arrangementLabel"
                        :voice-count="presetTrackTabs.length"
                        :warnings="writeResult?.ok ? [] : assignmentWarnings"
                    />
                    <template v-if="!writeResult?.ok">
                        <p v-for="warning in writeValidation.warnings" :key="warning" class="assignment-warning">
                            {{ warning }}
                        </p>
                        <label v-if="assignmentWarnings.length" class="safety-check"
                            ><input
                                v-model="assignmentAccepted"
                                aria-label="确认声部分配"
                                type="checkbox"
                                :disabled="writing || backingUp"
                            /><span>我已核对缺失或重复声部及未参与通道，本次按以上分配写入。</span></label
                        >
                        <label v-for="check in safetyCheckItems" :key="check.id" class="safety-check"
                            ><input
                                v-model="safetyChecks[check.id]"
                                type="checkbox"
                                :disabled="writing || backingUp"
                            /><span class="check-box"
                                ><UIcon
                                    name="i-lucide-check"
                                    class="fas fa-check esc-ui-icon"
                                    aria-hidden="true" /></span
                            ><span
                                ><strong>{{ check.title }}</strong
                                ><small>{{ check.description }}</small></span
                            ></label
                        >
                        <div class="safety-backup">
                            <div>
                                <strong>本地 EEPROM 备份（可选）</strong><small>{{ backupSummary }}</small>
                            </div>
                            <button
                                type="button"
                                class="regular-button compact-button"
                                :disabled="
                                    backingUp || writing || !writableEscs.length || !!writeRecoveryTargets.length
                                "
                                @click="backupAll"
                            >
                                <UIcon
                                    name="i-lucide-download"
                                    class="fas fa-download esc-ui-icon"
                                    aria-hidden="true"
                                />{{ backingUp ? "读取并下载中" : "备份到本机" }}
                            </button>
                        </div>
                    </template>
                    <div v-if="writeResult && !writeResult.ok" class="write-failure">
                        <strong
                            ><UIcon
                                name="i-lucide-triangle-alert"
                                class="fas fa-exclamation-triangle esc-ui-icon"
                                aria-hidden="true"
                            />
                            写入已停止</strong
                        ><span>第 {{ (writeResult.failed?.channel || 0) + 1 }} 路写入失败，后续通道未继续。</span
                        ><small>{{ writeResult.error?.message || "4-way 通讯或读回校验失败。" }}</small
                        ><button
                            type="button"
                            class="regular-button compact-button"
                            :disabled="writing || !writeRecoveryTargets.length"
                            @click="recoverWritten"
                        >
                            <UIcon name="i-lucide-undo-2" class="fas fa-undo esc-ui-icon" aria-hidden="true" />
                            恢复受影响通道（{{ writeRecoveryTargets.length }}）
                        </button>
                    </div>
                    <div class="safety-dialog-footer">
                        <button v-if="writeResult?.ok" type="button" class="primary-button" @click="closeSafety">
                            <UIcon name="i-lucide-check" class="fas fa-check esc-ui-icon" aria-hidden="true" />
                            完成
                        </button>
                        <template v-else>
                            <span class="safety-hint"
                                ><UIcon
                                    name="i-lucide-info"
                                    class="fas fa-info-circle esc-ui-icon"
                                    aria-hidden="true"
                                />
                                试听只使用 Web Audio，不会向电机发送 DShot 命令。</span
                            ><button
                                type="button"
                                class="regular-button"
                                @click="closeSafety"
                                :disabled="writing || backingUp"
                            >
                                取消</button
                            ><button
                                type="button"
                                class="primary-button"
                                :disabled="!safetyReady || writing || !!writeRecoveryTargets.length"
                                @click="performWrite"
                            >
                                <UIcon name="i-lucide-zap" class="fas fa-bolt esc-ui-icon" aria-hidden="true" />{{
                                    writing ? "串行操作中" : "开始写入"
                                }}
                            </button>
                        </template>
                    </div>
                </section>
            </div>

            <div
                v-if="restoreOpen"
                class="safety-overlay restore-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="restore-title"
            >
                <section class="safety-dialog restore-dialog">
                    <EscOperationProgress :rows="restoreProgressRows" />
                    <div class="safety-dialog-header">
                        <div>
                            <UIcon name="i-lucide-history" class="fas fa-history esc-ui-icon" aria-hidden="true" />
                            <div>
                                <h2 id="restore-title">从备份恢复 EEPROM</h2>
                                <p>
                                    {{ restoreFileName }} · {{ restoreBackupCreatedAt }} ·
                                    {{ restoreMatches.length }} 路记录
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="icon-button"
                            aria-label="关闭恢复窗口"
                            :disabled="restoring || restoreBackingUp"
                            @click="closeRestoreDialog"
                        >
                            ×
                        </button>
                    </div>

                    <div class="restore-warning">
                        <UIcon
                            name="i-lucide-triangle-alert"
                            class="fas fa-exclamation-triangle esc-ui-icon"
                            aria-hidden="true"
                        />
                        <div>
                            <strong>完整 EEPROM 恢复会覆盖电调全部配置</strong>
                            <span>只允许恢复到原通道且硬件身份完全一致的电调，不支持跨通道映射。</span>
                        </div>
                    </div>

                    <div class="restore-dialog-body">
                        <section class="restore-section">
                            <div class="restore-section-heading">
                                <div>
                                    <strong>通道匹配</strong>
                                    <small>{{ selectedRestoreMatches.length }}/{{ restoreValidCount }} 路已选择</small>
                                </div>
                                <button
                                    type="button"
                                    class="regular-button compact-button"
                                    :disabled="restoring || restoreBackingUp || Boolean(restoreRollbackCount)"
                                    @click="chooseRestoreFile"
                                >
                                    <UIcon
                                        name="i-lucide-file-input"
                                        class="fas fa-file-import esc-ui-icon"
                                        aria-hidden="true"
                                    />
                                    重新导入
                                </button>
                            </div>
                            <div class="restore-match-list">
                                <label
                                    v-for="match in restoreMatches"
                                    :key="match.backupEntry.channel"
                                    class="restore-match-card"
                                    :class="{ valid: match.valid, invalid: !match.valid }"
                                >
                                    <input
                                        v-model="selectedRestoreChannels"
                                        type="checkbox"
                                        :value="match.backupEntry.channel"
                                        :disabled="
                                            !match.valid ||
                                            restoring ||
                                            restoreBackingUp ||
                                            Boolean(restoreRollbackCount)
                                        "
                                    />
                                    <span class="check-box"
                                        ><UIcon
                                            name="i-lucide-check"
                                            class="fas fa-check esc-ui-icon"
                                            aria-hidden="true"
                                    /></span>
                                    <span class="restore-match-main">
                                        <span>
                                            <strong>ESC {{ match.backupEntry.channel + 1 }}</strong>
                                            <small
                                                >{{ match.backupEntry.model }} ·
                                                {{ restoreFirmwareLabel(match.backupEntry.firmwareFamily) }}
                                                {{ match.backupEntry.firmwareVersion }}</small
                                            >
                                        </span>
                                        <span class="restore-match-status">
                                            <UIcon
                                                :name="match.valid ? 'i-lucide-circle-check' : 'i-lucide-ban'"
                                                class="fas esc-ui-icon"
                                                :class="match.valid ? 'fa-check-circle' : 'fa-ban'"
                                            />
                                            {{ match.valid ? "身份匹配" : "不可恢复" }}
                                        </span>
                                        <small v-if="match.valid" class="restore-layout">
                                            {{ formatRestoreAddress(match.backupEntry.settingsOffset) }} ·
                                            {{ match.backupEntry.settingsLength }} B
                                            <template v-if="match.backupEntry.settingsChecksumAddress !== null">
                                                · OX32 校验
                                                {{ formatRestoreAddress(match.backupEntry.settingsChecksumAddress) }}
                                            </template>
                                        </small>
                                        <ul v-else class="restore-match-errors">
                                            <li v-for="error in match.errors" :key="error">{{ error }}</li>
                                        </ul>
                                    </span>
                                </label>
                            </div>
                        </section>

                        <section class="restore-section restore-safety-section">
                            <div class="restore-section-heading">
                                <div>
                                    <strong>恢复前安全检查</strong>
                                    <small>当前状态备份必须重新读取、持久化并下载</small>
                                </div>
                            </div>
                            <label v-for="check in restoreSafetyItems" :key="check.id" class="safety-check">
                                <input
                                    v-model="restoreChecks[check.id]"
                                    type="checkbox"
                                    :disabled="check.id === 'currentBackupReady' || restoring || restoreBackingUp"
                                />
                                <span class="check-box"
                                    ><UIcon name="i-lucide-check" class="fas fa-check esc-ui-icon" aria-hidden="true"
                                /></span>
                                <span
                                    ><strong>{{ check.title }}</strong
                                    ><small>{{ check.description }}</small></span
                                >
                            </label>
                            <div class="safety-backup restore-current-backup">
                                <div>
                                    <strong>备份当前状态</strong>
                                    <small>{{ restoreBackupSummary }}</small>
                                </div>
                                <button
                                    type="button"
                                    class="regular-button compact-button"
                                    :disabled="!selectedRestoreMatches.length || restoreBackingUp || restoring"
                                    @click="backupRestoreTargets"
                                >
                                    <UIcon
                                        name="i-lucide-download"
                                        class="fas fa-download esc-ui-icon"
                                        aria-hidden="true"
                                    />
                                    {{ restoreBackingUp ? "读取并下载中" : "备份当前状态" }}
                                </button>
                            </div>
                        </section>

                        <div v-if="restoring && restoreProgress" class="restore-progress" role="status">
                            <UIcon
                                name="i-lucide-loader-circle"
                                class="fas fa-circle-notch fa-spin esc-ui-icon"
                                aria-hidden="true"
                            />
                            <span>
                                {{ restoreProgress.phase === "recover" ? "正在回滚" : "正在恢复" }}
                                ESC {{ (restoreProgress.channel ?? 0) + 1 }} ·
                                {{ Math.min((restoreProgress.index ?? 0) + 1, restoreProgress.total || 1) }}/{{
                                    restoreProgress.total || 1
                                }}
                            </span>
                        </div>

                        <div
                            v-if="restoreResult"
                            class="restore-result"
                            :class="restoreResult.ok ? 'success' : 'failure'"
                        >
                            <strong>
                                <UIcon
                                    :name="restoreResult.ok ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
                                    class="fas esc-ui-icon"
                                    :class="restoreResult.ok ? 'fa-check-circle' : 'fa-exclamation-triangle'"
                                    aria-hidden="true"
                                />
                                {{
                                    restoreResult.rolledBack
                                        ? "本次恢复已回滚"
                                        : restoreResult.ok
                                          ? "EEPROM 恢复完成"
                                          : "EEPROM 恢复已停止"
                                }}
                            </strong>
                            <span v-if="restoreResult.rolledBack">已恢复到本次操作开始前下载的当前状态。</span>
                            <span v-else-if="restoreResult.ok">
                                已串行恢复并读回校验 {{ restoreResult.restored.length }} 路电调。
                            </span>
                            <span v-else>
                                已恢复 {{ restoreResult.restored.length }} 路；ESC
                                {{ (restoreResult.failed?.channel ?? 0) + 1 }} 失败，后续通道未继续。
                                {{ restoreResult.error?.message || "" }}
                            </span>
                            <button
                                v-if="!restoreResult.rolledBack && restoreRollbackCount"
                                type="button"
                                class="regular-button compact-button"
                                :disabled="restoring"
                                @click="rollbackRestore"
                            >
                                <UIcon name="i-lucide-undo-2" class="fas fa-undo esc-ui-icon" aria-hidden="true" />
                                回滚本次恢复
                            </button>
                        </div>
                    </div>

                    <div class="safety-dialog-footer restore-dialog-footer">
                        <span class="safety-hint">
                            <UIcon name="i-lucide-info" class="fas fa-info-circle esc-ui-icon" aria-hidden="true" />
                            恢复按 ESC 编号串行执行；首路失败后立即停止。
                        </span>
                        <button
                            type="button"
                            class="regular-button"
                            :disabled="restoring || restoreBackingUp"
                            @click="closeRestoreDialog"
                        >
                            关闭
                        </button>
                        <button
                            type="button"
                            class="primary-button"
                            :disabled="!restoreReady || restoring || restoreBackingUp"
                            @click="performRestore"
                        >
                            <UIcon name="i-lucide-history" class="fas fa-history esc-ui-icon" aria-hidden="true" />
                            {{ restoring ? "串行恢复中" : "开始恢复" }}
                        </button>
                    </div>
                </section>
            </div>

            <div
                v-if="codeDialogOpen"
                class="safety-overlay rtttl-code-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="rtttl-code-title"
            >
                <section class="rtttl-code-dialog" :class="{ 'rtttl-code-dialog-multi': multiCodeMode }">
                    <div class="safety-dialog-header">
                        <div>
                            <UIcon name="i-lucide-code" class="fas fa-code esc-ui-icon" aria-hidden="true" />
                            <div>
                                <h2 id="rtttl-code-title">RTTTL 电调音乐代码</h2>
                                <p>
                                    {{
                                        multiCodeMode
                                            ? showPresetTrackTabs
                                                ? `${multiCodeEntries.length} 个声部 · 修改后点击保存`
                                                : `${multiCodeEntries.length} 路独立代码 · 修改后点击保存`
                                            : syncAll && writableEscs.length > 1
                                              ? `1 份代码 · 保存后同步到 ${pendingWriteEscs.length} 路`
                                              : "RTTTL · 修改后点击保存"
                                    }}
                                </p>
                            </div>
                        </div>
                        <div class="rtttl-code-header-actions">
                            <label
                                v-if="editableEscs.length > 1 && !showPresetTrackTabs"
                                class="sync-toggle-control sync-toggle-dialog"
                            >
                                <span class="sync-toggle-label">同步旋律</span>
                                <input
                                    type="checkbox"
                                    aria-label="代码编辑器同步旋律"
                                    :checked="syncAll"
                                    @change="handleSyncModeChange"
                                />
                                <span class="sync-toggle-track" aria-hidden="true"><i></i></span>
                            </label>
                            <button type="button" class="icon-button" aria-label="关闭" @click="closeCodeDialog">
                                ×
                            </button>
                        </div>
                    </div>
                    <div v-if="multiCodeMode" class="rtttl-code-body rtttl-code-body-multi">
                        <div class="rtttl-code-grid">
                            <section
                                v-for="item in multiCodePreviewList"
                                :key="item.entry.id"
                                class="rtttl-code-card"
                                :class="{ 'code-card-error': Boolean(item.preview.error) }"
                            >
                                <header class="rtttl-code-card-header">
                                    <div>
                                        <strong>{{ item.label }}</strong>
                                        <small>{{ item.subtitle }}</small>
                                    </div>
                                    <div class="rtttl-code-card-actions">
                                        <button
                                            type="button"
                                            class="icon-button"
                                            :aria-label="`粘贴 ${item.label} 代码`"
                                            title="粘贴"
                                            @click="pasteMultiRtttlCode(item.entry)"
                                        >
                                            <UIcon
                                                name="i-lucide-clipboard-paste"
                                                class="fas fa-paste esc-ui-icon"
                                                aria-hidden="true"
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            class="icon-button"
                                            :aria-label="`复制 ${item.label} 代码`"
                                            title="复制"
                                            @click="copyMultiRtttlCode(item.entry)"
                                        >
                                            <UIcon
                                                name="i-lucide-copy"
                                                class="fas fa-copy esc-ui-icon"
                                                aria-hidden="true"
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            class="regular-button compact-button code-preview-button"
                                            :disabled="Boolean(item.preview.error) || !item.preview.pitchedNoteCount"
                                            @click="playCodeEntry(item)"
                                        >
                                            <UIcon
                                                :name="
                                                    activeCodePreviewIds.includes(item.entry.id)
                                                        ? 'i-lucide-square'
                                                        : 'i-lucide-play'
                                                "
                                                class="fas esc-ui-icon"
                                                :class="
                                                    activeCodePreviewIds.includes(item.entry.id) ? 'fa-stop' : 'fa-play'
                                                "
                                                aria-hidden="true"
                                            />
                                            {{ activeCodePreviewIds.includes(item.entry.id) ? "停止" : "播放" }}
                                        </button>
                                    </div>
                                </header>
                                <textarea
                                    v-model="item.entry.code"
                                    class="rtttl-code-input"
                                    :aria-label="`${item.label} RTTTL 电调音乐代码`"
                                    spellcheck="false"
                                ></textarea>
                                <div v-if="item.preview.error" class="rtttl-code-error">
                                    <UIcon
                                        name="i-lucide-triangle-alert"
                                        class="fas fa-exclamation-triangle esc-ui-icon"
                                        aria-hidden="true"
                                    />
                                    <span>{{ item.preview.error }} · 修正后才能保存，卷帘未发生变化</span>
                                </div>
                                <div v-else class="rtttl-code-summary">
                                    <span
                                        >{{ item.preview.pitchedNoteCount }} 音符 · {{ item.preview.restCount }} 休止 ·
                                        {{ formatDuration(item.preview.durationMs) }}</span
                                    ><strong>{{ item.preview.encodedLength }}/{{ item.capacity }} B</strong
                                    ><span :class="item.preview.valid ? 'code-valid' : 'code-adjust'">{{
                                        item.preview.valid ? "编码通过" : "编码需调整"
                                    }}</span>
                                </div>
                                <ul v-if="!item.preview.error && item.preview.errors.length" class="rtttl-code-errors">
                                    <li v-for="error in item.preview.errors" :key="error">{{ error }}</li>
                                </ul>
                            </section>
                        </div>
                    </div>
                    <div v-else class="rtttl-code-body">
                        <textarea
                            v-model="rtttlCode"
                            class="rtttl-code-input"
                            aria-label="RTTTL 电调音乐代码"
                            spellcheck="false"
                        ></textarea>
                        <div v-if="codePreview.error" class="rtttl-code-error">
                            <UIcon
                                name="i-lucide-triangle-alert"
                                class="fas fa-exclamation-triangle esc-ui-icon"
                                aria-hidden="true"
                            />
                            <span>{{ codePreview.error }} · 修正后才能保存，卷帘未发生变化</span>
                        </div>
                        <div v-else class="rtttl-code-summary">
                            <span
                                >{{ codePreview.pitchedNoteCount }} 音符 · {{ codePreview.restCount }} 休止 ·
                                {{ formatDuration(codePreview.durationMs) }}</span
                            ><strong>{{ codePreview.encodedLength }}/{{ targetCapacity }} B</strong
                            ><span :class="codePreview.valid ? 'code-valid' : 'code-adjust'">{{
                                codePreview.valid ? "编码通过" : "编码需调整"
                            }}</span>
                        </div>
                        <div
                            v-if="syncAll && !codePreview.error && sharedCodeTargetPreviews.length > 1"
                            class="shared-code-targets"
                        >
                            <span
                                v-for="item in sharedCodeTargetPreviews"
                                :key="item.esc.id"
                                :class="item.preview.valid ? 'target-valid' : 'target-invalid'"
                            >
                                ESC {{ item.esc.channel + 1 }} · {{ item.esc.firmwareLabel }} ·
                                {{ item.preview.encodedLength }}/{{ item.esc.capacity || 128 }} B
                            </span>
                        </div>
                        <ul v-if="!codePreview.error && codePreview.errors.length" class="rtttl-code-errors">
                            <li v-for="error in codePreview.errors" :key="error">{{ error }}</li>
                        </ul>
                    </div>
                    <div v-if="codeDiscardConfirm" class="code-discard-confirm" role="alert">
                        <strong>代码更改尚未保存到旋律。</strong
                        ><button type="button" class="regular-button" @click="codeDiscardConfirm = false">
                            继续编辑</button
                        ><button type="button" class="danger-button" @click="closeCodeDialog({ discard: true })">
                            放弃更改并关闭
                        </button>
                    </div>
                    <div v-if="multiCodeMode" class="safety-dialog-footer rtttl-code-footer rtttl-code-footer-multi">
                        <span class="safety-hint"
                            ><UIcon name="i-lucide-info" class="fas fa-info-circle esc-ui-icon" aria-hidden="true" />
                            同时试听只使用 Web Audio，不会向 ESC 发送命令。</span
                        >
                        <button
                            type="button"
                            class="regular-button"
                            :disabled="!multiCodePlayableCount"
                            @click="playAllCodes"
                        >
                            <UIcon
                                :name="activeCodePreviewIds.length ? 'i-lucide-square' : 'i-lucide-play'"
                                class="fas esc-ui-icon"
                                :class="activeCodePreviewIds.length ? 'fa-stop' : 'fa-play'"
                                aria-hidden="true"
                            />
                            {{ activeCodePreviewIds.length ? "停止全部" : "播放全部" }}
                        </button>
                        <button
                            type="button"
                            class="primary-button"
                            aria-label="保存 RTTTL 代码"
                            :disabled="!codeSaveReady"
                            @click="saveCodeDialog"
                        >
                            <UIcon name="i-lucide-save" class="fas fa-save esc-ui-icon" aria-hidden="true" /> 保存
                        </button>
                    </div>
                    <div v-else class="safety-dialog-footer rtttl-code-footer">
                        <button type="button" class="regular-button compact-button" @click="pasteRtttlCode">
                            <UIcon
                                name="i-lucide-clipboard-paste"
                                class="fas fa-paste esc-ui-icon"
                                aria-hidden="true"
                            />
                            粘贴
                        </button>
                        <button type="button" class="regular-button compact-button" @click="copyRtttlCode">
                            <UIcon name="i-lucide-copy" class="fas fa-copy esc-ui-icon" aria-hidden="true" /> 复制
                        </button>
                        <button
                            type="button"
                            class="regular-button compact-button"
                            :aria-label="previewMode === 'code-single' ? '停止 RTTTL 代码' : '播放 RTTTL 代码'"
                            :disabled="!codePreview.melody || !codePreview.pitchedNoteCount"
                            @click="playSingleCode"
                        >
                            <UIcon
                                :name="previewMode === 'code-single' ? 'i-lucide-square' : 'i-lucide-play'"
                                class="fas esc-ui-icon"
                                :class="previewMode === 'code-single' ? 'fa-stop' : 'fa-play'"
                                aria-hidden="true"
                            />
                            {{ previewMode === "code-single" ? "停止" : "播放" }}
                        </button>
                        <span class="rtttl-code-spacer"></span>
                        <button
                            type="button"
                            class="primary-button"
                            aria-label="保存 RTTTL 代码"
                            :disabled="!codeSaveReady"
                            @click="saveCodeDialog"
                        >
                            <UIcon name="i-lucide-save" class="fas fa-save esc-ui-icon" aria-hidden="true" /> 保存
                        </button>
                    </div>
                </section>
            </div>

            <div
                v-if="contributionDialogOpen"
                class="safety-overlay melody-contribution-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="melody-contribution-title"
                @click.self="closeContributionDialog"
                @keydown.esc.prevent="closeContributionDialog"
            >
                <section class="safety-dialog melody-contribution-dialog" @keydown.tab="trapDialogFocus">
                    <div class="safety-dialog-header">
                        <div>
                            <UIcon name="i-lucide-disc-3" class="fas fa-compact-disc esc-ui-icon" aria-hidden="true" />
                            <div>
                                <h2 id="melody-contribution-title">音乐投稿</h2>
                                <p>扫码加入 QQ 群，联系群主提交你的旋律作品。</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="icon-button"
                            aria-label="关闭音乐投稿"
                            @click="closeContributionDialog"
                        >
                            <UIcon name="i-lucide-x" class="fas fa-times esc-ui-icon" aria-hidden="true" />
                        </button>
                    </div>
                    <div class="melody-contribution-dialog-body">
                        <div class="melody-contribution-qr-frame">
                            <img :src="qqQrUrl" alt="花生 FPV 官方 QQ 群二维码" />
                        </div>
                        <strong>花生 FPV 官方交流群</strong>
                        <QqGroupNumber />
                        <span>扫码加入后，请联系群主投稿；可附上音乐名称、RTTTL 代码或草稿文件。</span>
                    </div>
                    <div class="safety-dialog-footer">
                        <span class="safety-hint">
                            <UIcon name="i-lucide-info" class="fas fa-info-circle esc-ui-icon" aria-hidden="true" />
                            投稿前建议先使用电脑试听确认旋律。
                        </span>
                        <button type="button" class="primary-button" @click="closeContributionDialog">完成</button>
                    </div>
                </section>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { computed, defineComponent, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import QqGroupNumber from "../elements/QqGroupNumber.vue";
import EscChannelPlan from "../esc-melody/EscChannelPlan.vue";
import EscOperationProgress from "../esc-melody/EscOperationProgress.vue";
import MelodyOverview from "../esc-melody/MelodyOverview.vue";
import { autoAdaptBlheli32Tracks } from "../../js/esc_melody/blheli32_adapt";
import { ESC_OPERATION_LABELS } from "../../js/esc_melody/operation_progress";
import GUI from "../../js/gui.js";
import {
    cloneMelody,
    createNote,
    ESC_MELODY_MAX_MIDI,
    ESC_MELODY_MIN_MIDI,
    melodyDurationBeats,
    melodyDurationMs,
    melodiesEqual,
    melodyToRtttl,
    normalizeMelody,
    PRESET_MELODIES,
    rtttlToMelody,
    RTTTL_BPM_MAX,
    RTTTL_BPM_MIN,
    validateMelody,
} from "../../js/esc_melody/melody.js";
import {
    ensureAudioContextRunning,
    previewGainForChannelCount,
    scheduleEscPreviewTone,
} from "../../js/esc_melody/audio_preview.js";
import {
    createMelodyDraft,
    createMelodyDraftPackage,
    deleteMelodyDraft,
    duplicateMelodyDraft,
    ESC_MELODY_DRAFT_FILE_MAX_BYTES,
    ESC_MELODY_DRAFT_LIMIT,
    importMelodyDraftPackage,
    loadMelodyDrafts,
    parseMelodyDraftPackage,
    saveMelodyDraft,
} from "../../js/esc_melody/drafts.js";
import { EscFourWayController } from "../../js/esc_melody/esc_four_way_controller.js";
import {
    ESC_FIRMWARE,
    ESC_FIRMWARE_CONFIRMATION_STATUS,
    ESC_MELODY_READ_STATUS,
    getIdentifiedEscCount,
} from "../../js/esc_melody/esc_capabilities.js";
import {
    createEscBackupPackage,
    downloadEscBackup,
    ESC_EEPROM_BACKUP_FILE_MAX_BYTES,
    getPersistedEscBackupStatus,
    matchEscBackupForRestore,
    parseEscBackupFile,
    saveEscBackup,
    validateEscBackup,
} from "../../js/esc_melody/backups.js";
import BFClipboard from "../../js/Clipboard.js";
import qqQrUrl from "../../images/hs-qq-qr.png";
import {
    loadLibraryState,
    saveLibraryState,
    loadEditRecovery,
    saveEditRecovery,
} from "../../js/esc_melody/library_state.ts";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PIANO_ROLL_ROW_HEIGHT = 16;

export default defineComponent({
    name: "EscMelodyTab",
    components: { BaseTab, QqGroupNumber, EscChannelPlan, EscOperationProgress, MelodyOverview },
    setup() {
        const model = inject("betaflightModel", null);
        const melody = ref(cloneMelody(PRESET_MELODIES[0]));
        const editorBaseline = ref(cloneMelody(melody.value));
        const drafts = ref(loadMelodyDrafts());
        const draftLimit = ESC_MELODY_DRAFT_LIMIT;
        const escs = ref([]);
        const activeLibrarySource = ref({ type: "preset", id: PRESET_MELODIES[0].id });
        const currentDraftId = ref(null);
        const draftMenuId = ref(null);
        const draftImportInput = ref(null);
        const draftDeleteTarget = ref(null);
        const draftSaving = ref(false);
        const lastDraftSavedAt = ref(null);
        const selectedNoteId = ref(melody.value.notes[0]?.id || null);
        const pianoRollWrap = ref(null);
        const zoomPixels = ref(56);
        const editorTool = ref("select");
        const snapStep = ref(0.125);
        const autoFollow = ref(true);
        const workspaceView = ref("library");
        const librarySection = ref("all");
        const deviceDetailsOpen = ref(false);
        const deviceInspectionId = ref(null);
        const previewVolume = ref(70);
        const previewMuted = ref(false);
        const previewOutput = ref(null);
        const previewElapsedMs = ref(0);
        const previewShowsTimeline = ref(false);
        const codeDiscardConfirm = ref(false);
        let codeBaseline = "";
        let previewClock = null;
        let previewRequest = 0;
        const history = ref([]);
        const future = ref([]);
        const scanning = ref(false);
        const selectedEscId = ref(null);
        const presetTrackSession = ref(null);
        const voiceAssignments = reactive({});
        const assignmentAccepted = ref(false);
        const writeProgressRows = ref([]);
        const activePresetTrackIndex = ref(0);
        const melodyConflict = ref(false);
        const syncConfirmOpen = ref(false);
        const connected = computed(() =>
            Boolean(model?.CONFIGURATOR?.connectionValid ?? globalThis.CONFIGURATOR?.connectionValid),
        );
        const identifiedEscCount = computed(() => getIdentifiedEscCount(escs.value));
        const headerConnectionLabel = computed(() => {
            if (!connected.value) return "离线编辑";
            if (scanning.value) return "扫描中";
            if (!escs.value.length) return "已连接 · 待扫描";
            const families = [...new Set(displayedEscs.value.map((esc) => esc.firmwareLabel).filter(Boolean))];
            return `${identifiedEscCount.value} 路 · ${families.join(" / ") || "待识别"}`;
        });
        watch(workspaceView, (view) => {
            if (view === "editor") void nextTick(scrollMelodyIntoView);
        });
        const connectionSummary = computed(() => {
            if (!connected.value) return "连接后可扫描电调能力";
            if (scanning.value) return "正在逐路识别电调";
            return escs.value.length ? `${identifiedEscCount.value} 路电调已识别` : "尚未扫描电调能力";
        });
        const targetFirmware = computed(() => {
            const activeEsc = escs.value.find((esc) => esc.id === selectedEscId.value);
            if (!syncAll.value && activeEsc?.firmwareFamily) return activeEsc.firmwareFamily;
            const writableFamilies = escs.value.filter((esc) => esc.canWrite).map((esc) => esc.firmwareFamily);
            if (writableFamilies.length && writableFamilies.every((family) => family === "bluejay")) return "bluejay";
            if (writableFamilies.length && writableFamilies.every((family) => family === "ox32")) return "ox32";
            if (writableFamilies.length && writableFamilies.every((family) => family === "blheli32")) return "blheli32";
            if (!escs.value.length && melody.value.blheli32) return "blheli32";
            return "am32";
        });
        const targetCapacity = computed(() => (targetFirmware.value === "blheli32" ? 48 : 128));
        const validation = computed(() =>
            validateMelody(effectiveMelody.value, { firmware: targetFirmware.value, capacity: targetCapacity.value }),
        );
        const selectedNote = computed(
            () => melody.value.notes.find((note) => note.id === selectedNoteId.value) || null,
        );
        const timelineBeats = computed(() => Math.max(8, Math.ceil(melodyDurationBeats(melody.value) + 1)));
        const timelineWidth = computed(() => timelineBeats.value * zoomPixels.value);
        const timelineStyle = computed(() => ({
            "--timeline-beats": timelineBeats.value,
            width: `${timelineWidth.value}px`,
            flex: `0 0 ${timelineWidth.value}px`,
        }));
        const timelineTicks = computed(() => {
            const step = Math.max(1, Math.ceil(72 / zoomPixels.value), Math.ceil(timelineBeats.value / 512));
            return Array.from({ length: Math.ceil(timelineBeats.value / step) }, (_, index) => ({
                beat: index * step,
                seconds: ((melody.value.waitMs + (index * step * 60000) / melody.value.bpm) / 1000).toFixed(1),
            }));
        });
        const previewBeat = computed(() => ((previewElapsedMs.value - melody.value.waitMs) * melody.value.bpm) / 60000);
        const presetSessionName = computed(() => presetTrackSession.value?.name || "");
        watch([previewVolume, previewMuted], () => {
            if (previewOutput.value)
                previewOutput.value.gain.value = previewMuted.value ? 0 : previewVolume.value / 100;
        });
        const writableEscs = computed(() => escs.value.filter((esc) => esc.canWrite));
        const failedFirmwareDetectionCount = computed(
            () => escs.value.filter((esc) => esc.confirmationStatus === ESC_FIRMWARE_CONFIRMATION_STATUS.FAILED).length,
        );
        const selectedEsc = computed(() => escs.value.find((esc) => esc.id === selectedEscId.value) || null);
        const displayedEscs = computed(() =>
            escs.value.filter((esc) => esc && !["idle", "unavailable"].includes(esc.status)),
        );
        const escModelSummary = computed(() => {
            const modelGroups = new Map();
            displayedEscs.value.forEach((esc) => {
                const modelName = esc.model || "未知型号";
                const firmwareName = esc.firmwareLabel || "未知固件";
                const key = `${modelName}\u0000${firmwareName}`;
                const group = modelGroups.get(key) || {
                    label: `${modelName} · ${firmwareName}`,
                    count: 0,
                };
                group.count += 1;
                modelGroups.set(key, group);
            });
            return [...modelGroups.values()].map((group) =>
                group.count > 1 ? `${group.label} × ${group.count}` : group.label,
            );
        });
        const editableEscs = computed(() => displayedEscs.value.filter(isEscMelodyEditable));
        const automaticSourceTracks = computed(() => {
            if (presetTrackSession.value)
                return presetTrackSession.value.tracks.map((track, index) =>
                    index === activePresetTrackIndex.value ? melody.value : track.melody,
                );
            if (!syncAll.value && editableEscs.value.length > 1)
                return [...editableEscs.value]
                    .sort((a, b) => a.channel - b.channel)
                    .map((esc) => (esc.id === selectedEscId.value ? melody.value : esc.editorMelody));
            return [melody.value];
        });
        function outputVoiceIndex(esc) {
            if (presetTrackSession.value) return voiceIndexForEsc(esc);
            if (syncAll.value || editableEscs.value.length <= 1) return 0;
            return [...editableEscs.value]
                .sort((a, b) => a.channel - b.channel)
                .findIndex((item) => item.id === esc.id);
        }
        const automaticBl32 = computed(() => {
            if (!presetTrackSession.value && !syncAll.value && editableEscs.value.length > 1) {
                const channels = [...editableEscs.value].sort((a, b) => a.channel - b.channel);
                const results = automaticSourceTracks.value.map((track, index) =>
                    autoAdaptBlheli32Tracks([track], channels[index].firmwareFamily === "blheli32" ? [0] : []),
                );
                return {
                    tracks: results.flatMap((result) => result.tracks),
                    adapted: results.some((result) => result.adapted),
                    errors: results.flatMap((result) => result.errors),
                };
            }
            return autoAdaptBlheli32Tracks(automaticSourceTracks.value, [
                ...new Set(
                    writableEscs.value
                        .filter((esc) => esc.firmwareFamily === "blheli32")
                        .map(outputVoiceIndex)
                        .filter((index) => index !== null && index >= 0),
                ),
            ]);
        });
        const outputTracks = computed(() => automaticBl32.value.tracks);
        const effectiveMelody = computed(() => {
            const index = presetTrackSession.value
                ? activePresetTrackIndex.value
                : selectedEsc.value
                    ? outputVoiceIndex(selectedEsc.value)
                    : 0;
            return outputTracks.value[index] || melody.value;
        });
        function outputMelodyForEsc(esc) {
            return outputTracks.value[outputVoiceIndex(esc)] || esc.editorMelody;
        }
        const showPresetTrackTabs = computed(() => (presetTrackSession.value?.tracks.length || 0) > 1);
        const presetTrackTabs = computed(
            () =>
                presetTrackSession.value?.tracks.map((track, index) => ({
                    id: track.id,
                    index,
                    dirty: !melodiesEqual(track.melody, track.originalMelody),
                })) || [],
        );
        const showEscTabs = computed(
            () => !showPresetTrackTabs.value && !syncAll.value && displayedEscs.value.length > 1,
        );
        const currentMelodySource = computed(() => selectedEsc.value?.originalMelody || null);
        const currentMelodySourceActive = computed(
            () =>
                activeLibrarySource.value?.type === "current" && melodiesEqual(melody.value, currentMelodySource.value),
        );
        const currentMelodySourceSummary = computed(() => {
            if (!currentMelodySource.value) return `${melodyReadLabel(selectedEsc.value)} · 无法恢复`;
            const noteCount = currentMelodySource.value.notes.length;
            return `${noteCount} 音符 · ${formatDuration(melodyDurationMs(currentMelodySource.value))}`;
        });
        const melodyLibraryCount = computed(() => presets.length + (selectedEsc.value ? 1 : 0));
        const currentDraft = computed(() => drafts.value.find((draft) => draft.id === currentDraftId.value) || null);
        const draftDirty = computed(
            () => Boolean(currentDraft.value) && !melodiesEqual(currentDraft.value.melody, melody.value),
        );
        const draftSaveStatus = computed(() => {
            if (!currentDraftId.value) return "草稿仅保存在此浏览器，可导出备份";
            if (draftSaving.value) return "正在保存到此浏览器…";
            if (draftDirty.value) return "有未保存更改，将自动保存";
            if (lastDraftSavedAt.value) {
                return `已自动保存 ${lastDraftSavedAt.value.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                })}`;
            }
            return "已保存在此浏览器";
        });
        const dirtyEscs = computed(() =>
            writableEscs.value.filter(
                (esc) =>
                    esc.editorMelody &&
                    (esc.melodyReplacementReady || !melodiesEqual(outputMelodyForEsc(esc), esc.originalMelody)),
            ),
        );
        const pendingWriteEscs = computed(() =>
            syncAll.value ? writableEscs.value.filter((esc) => esc.editorMelody) : dirtyEscs.value,
        );
        const pendingWriteEscIds = computed(() => new Set(pendingWriteEscs.value.map((esc) => esc.id)));
        const safetyWriteMelodySummary = computed(() => {
            const targets = writeResult.value?.ok ? writeResult.value.written : pendingWriteEscs.value;
            const entries = targets.map((esc) => ({
                channel: esc.channel,
                name: String(esc.editorMelody?.name || "未命名旋律"),
            }));
            const names = new Set(entries.map((entry) => entry.name));
            if (names.size === 1) return entries[0]?.name || "未命名旋律";
            return entries.map((entry) => `ESC ${entry.channel + 1}：${entry.name}`).join("；");
        });
        const syncSourceLabel = computed(() =>
            selectedEsc.value ? `ESC ${selectedEsc.value.channel + 1}` : "当前卷帘",
        );
        const actionbarStatusText = computed(() => {
            if (!connected.value) return "离线状态仅支持编辑与电脑试听";
            if (!escs.value.length) return "扫描电调后才能进入安全写入";
            if (syncAll.value && pendingWriteEscs.value.length) {
                return `同步模式 · ${pendingWriteEscs.value.length} 路将分别写入`;
            }
            if (pendingWriteEscs.value.length) return `${pendingWriteEscs.value.length} 路修改等待安全检查`;
            return "当前没有需要写入的通道";
        });
        const writeValidation = computed(() => {
            const errors = [];
            const warnings = [];
            for (const esc of pendingWriteEscs.value) {
                const result = validateMelody(outputMelodyForEsc(esc), {
                    firmware: esc.firmwareFamily,
                    capacity: esc.capacity || 128,
                });
                errors.push(...result.errors.map((error) => `第 ${esc.channel + 1} 路：${error}`));
                warnings.push(...(result.warnings || []).map((warning) => `第 ${esc.channel + 1} 路：${warning}`));
            }
            return { valid: pendingWriteEscs.value.length > 0 && errors.length === 0, errors, warnings };
        });
        const activeBackup = ref(null);
        const lastBackupFilename = ref("");
        const backupStatus = computed(() => validateEscBackup(activeBackup.value, writableEscs.value));
        const safetyReady = computed(() => {
            return (
                connected.value &&
                Object.values(safetyChecks).every(Boolean) &&
                writeValidation.value.valid &&
                (!assignmentWarnings.value.length || assignmentAccepted.value) &&
                !writeRecoveryTargets.value.length
            );
        });
        const backupSummary = computed(() => {
            if (!writableEscs.value.length) return "扫描后才能生成本地备份";
            if (backupStatus.value.valid) {
                return `${writableEscs.value.length}/${writableEscs.value.length} 路已持久保存并下载 · ${lastBackupFilename.value}`;
            }
            return "未备份也可写入；建议先备份全部可写电调，写入失败时可据此恢复";
        });

        const keys = NOTE_NAMES;
        const readStatus = ESC_MELODY_READ_STATUS;
        const rtttlBpmMin = RTTTL_BPM_MIN;
        const rtttlBpmMax = RTTTL_BPM_MAX;
        const durations = [0.0625, 0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
        const pianoMaxMidi = computed(() =>
            targetFirmware.value === "blheli32" || melody.value.notes.some((note) => note.midi > 98)
                ? ESC_MELODY_MAX_MIDI
                : 98,
        );
        const pitchOptions = computed(() =>
            Array.from(
                { length: pianoMaxMidi.value - ESC_MELODY_MIN_MIDI + 1 },
                (_, index) => ESC_MELODY_MIN_MIDI + index,
            ),
        );
        const noteRows = computed(() => [...pitchOptions.value].reverse());
        const pianoRollStyle = computed(() => ({
            "--note-rows": noteRows.value.length,
            "--piano-roll-height": `${noteRows.value.length * PIANO_ROLL_ROW_HEIGHT}px`,
        }));
        const presets = PRESET_MELODIES.map((preset) => ({ ...preset, notes: cloneMelody(preset).notes }));
        const presetQuery = ref("");
        const libraryState = loadLibraryState(presets);
        const favoriteIds = ref(libraryState.favorites);
        const recentIds = ref(libraryState.recent);
        const presetScope = ref("all");
        const presetVoices = ref("all");
        const auditionPresetId = ref(null);
        const editRecovery = ref(loadEditRecovery());
        const offlineSelection = ref(false);
        const presetCompatibility = computed(() => {
            if (!connected.value || scanning.value || !escs.value.length) return {};
            return Object.fromEntries(
                presets.map((preset) => {
                    const tracks = preset.trackMelodies?.length ? preset.trackMelodies : [preset];
                    // Match loadPreset's shared melody and cyclic multi-voice assignment.
                    const targets = [...(tracks.length > 1 ? editableEscs.value : writableEscs.value)]
                        .sort((left, right) => left.channel - right.channel)
                        .map((esc, index) => ({ esc, trackIndex: index % tracks.length }))
                        .filter(({ esc }) => esc.canWrite);
                    if (!targets.length)
                        return [
                            preset.id,
                            {
                                label: "暂不可写",
                                reasons: ["当前没有可载入并写入此曲目的电调，请查看各路识别与读取结果。"],
                            },
                        ];
                    const automatic = autoAdaptBlheli32Tracks(tracks, [
                        ...new Set(
                            targets
                                .filter(({ esc }) => esc.firmwareFamily === "blheli32")
                                .map(({ trackIndex }) => trackIndex),
                        ),
                    ]);
                    const failures = new Map();
                    const results = new Map();
                    let failedCount = 0;
                    targets.forEach(({ esc, trackIndex }) => {
                        const key = `${trackIndex}:${esc.firmwareFamily}:${esc.capacity || 128}`;
                        if (!results.has(key))
                            results.set(
                                key,
                                validateMelody(automatic.tracks[trackIndex], {
                                    firmware: esc.firmwareFamily,
                                    capacity: esc.capacity || 128,
                                }),
                            );
                        const result = results.get(key);
                        if (result.valid) return;
                        failedCount++;
                        const failure = failures.get(key) || {
                            channels: [],
                            label: `${esc.firmwareLabel || esc.firmwareFamily}${tracks.length > 1 ? ` · 声部 ${trackIndex + 1}` : ""}`,
                            errors: result.errors,
                        };
                        failure.channels.push(esc.channel + 1);
                        failures.set(key, failure);
                    });
                    return [
                        preset.id,
                        failedCount
                            ? {
                                label: failedCount === targets.length ? "不适用" : "部分通道不适用",
                                reasons: [...failures.values()].map(
                                    (failure) =>
                                        `ESC ${failure.channels.join("、")} · ${failure.label}：${failure.errors.join("；")}`,
                                ),
                            }
                            : automatic.adapted
                                ? {
                                    label: "自动适配 BL32",
                                    reasons: ["选择或试听时自动使用完整适配版；原曲保留，不裁剪或删减音符。"],
                                }
                                : null,
                    ];
                }),
            );
        });
        const filteredPresets = computed(() => {
            const query = presetQuery.value.trim().toLocaleLowerCase();
            const voiceCount = (preset) => preset.trackMelodies?.length || 1;
            const scoped = presets.filter(
                (preset) =>
                    (presetScope.value !== "favorites" || favoriteIds.value.includes(preset.id)) &&
                    (presetScope.value !== "recent" || recentIds.value.includes(preset.id)) &&
                    (presetVoices.value !== "solo" || voiceCount(preset) === 1) &&
                    (presetVoices.value !== "multi" || voiceCount(preset) > 1) &&
                    (!query || `${preset.name} ${preset.description}`.toLocaleLowerCase().includes(query)),
            );
            return presetScope.value === "recent"
                ? scoped.sort((a, b) => recentIds.value.indexOf(a.id) - recentIds.value.indexOf(b.id))
                : scoped;
        });
        function persistLibrary() {
            try {
                saveLibraryState({ favorites: favoriteIds.value, recent: recentIds.value });
            } catch {
                showMessage("浏览器未能保存曲库偏好，本次会话仍可使用。", "error");
            }
        }
        function toggleFavorite(id) {
            favoriteIds.value = favoriteIds.value.includes(id)
                ? favoriteIds.value.filter((item) => item !== id)
                : [...favoriteIds.value, id];
            persistLibrary();
        }
        const selectedLibraryDescription = computed(() =>
            activeLibrarySource.value?.type === "preset"
                ? presets.find((preset) => preset.id === activeLibrarySource.value.id)?.description || ""
                : "",
        );
        const previewVoiceCount = computed(() => Math.max(1, presetTrackTabs.value.length));
        /** Returns the source voices without counting assigned ESC copies as extra voices. */
        function libraryTrackCount(preset) {
            return preset.trackMelodies?.length || 1;
        }
        function libraryDuration(preset) {
            const tracks = preset.trackMelodies?.length ? preset.trackMelodies : [preset];
            return formatDuration(Math.max(...tracks.map((track) => melodyDurationMs(track))));
        }
        function openDeviceDetails() {
            deviceDetailsOpen.value = true;
            void nextTick(() => {
                const heading = document.querySelector("#melody-device-details h2");
                heading?.scrollIntoView?.({ block: "start", behavior: "smooth" });
                heading?.focus({ preventScroll: true });
            });
        }
        function closeDeviceDetails() {
            deviceDetailsOpen.value = false;
            void nextTick(() => document.querySelector('[aria-controls="melody-device-details"]')?.focus());
        }
        function focusLibrary() {
            workspaceView.value = "library";
            void nextTick(() => document.querySelector('[aria-label="搜索旋律库"]')?.focus());
        }
        async function previewLibraryPreset(preset) {
            if (locked.value) return;
            if (auditionPresetId.value === preset.id && playing.value) {
                stopPreview();
                return;
            }
            if (!loadPreset(preset)) return;
            const tracks = outputTracks.value;
            const started = await startAudioPreview(
                tracks.map((melody, index) => ({ melody, id: `library-${index}` })),
                { mode: "library" },
            );
            if (started && previewMode.value === "library") auditionPresetId.value = preset.id;
        }
        function stashEditorBeforeSwitch({ force = false } = {}) {
            if (!flushCurrentDraft()) return false;
            const changed =
                JSON.stringify(cloneMelody(melody.value)) !== JSON.stringify(editorBaseline.value) ||
                history.value.length ||
                presetTrackSession.value?.tracks.some((track) => !melodiesEqual(track.melody, track.originalMelody)) ||
                dirtyEscs.value.length;
            if (!force && !changed) return true;
            syncEditorState();
            const melodies = presetTrackSession.value
                ? presetTrackSession.value.tracks.map((track) => track.melody)
                : !syncAll.value && editableEscs.value.length > 1
                    ? [...editableEscs.value].sort((a, b) => a.channel - b.channel).map((esc) => esc.editorMelody)
                    : [melody.value];
            try {
                editRecovery.value = saveEditRecovery(melodies, activePresetTrackIndex.value);
                return true;
            } catch (error) {
                showMessage(error.message || "无法保留编辑，请先保存或导出草稿。", "error");
                return false;
            }
        }
        function restoreEditorRecovery() {
            if (!editRecovery.value || locked.value) return;
            const saved = editRecovery.value;
            if (!stashEditorBeforeSwitch()) return;
            stopPreview();
            clearPresetTrackSession();
            const tracks = saved.package.drafts.map((draft) => ({
                id: draft.id,
                originalMelody: cloneMelody(draft.melody),
                melody: cloneMelody(draft.melody),
                history: [],
                future: [],
            }));
            if (tracks.length > 1) {
                presetTrackSession.value = { presetId: "edit-recovery", name: "保留的多声部编排", tracks };
                activePresetTrackIndex.value = saved.activeIndex;
                syncAll.value = false;
                syncPresetTracksToEscs();
                loadPresetTrack(saved.activeIndex);
            } else {
                syncAll.value = true;
                applyMelody(tracks[0].melody);
                clearActiveLibrarySource();
            }
            currentDraftId.value = null;
            history.value = [cloneMelody(melody.value)];
            workspaceView.value = "editor";
            offlineSelection.value = true;
            showMessage("已恢复保留编排，请重新核对声部分配与容量。", "success");
        }
        function exportEditorRecovery() {
            if (!editRecovery.value) return;
            downloadTextFile(
                "betaflight-preserved-arrangement.json",
                JSON.stringify(editRecovery.value.package, null, 2),
                "application/json",
            );
        }
        const syncAll = ref(true);
        const draftNameDialogOpen = ref(false);
        const draftNameMode = ref("create");
        const draftNameTargetId = ref(null);
        const draftName = ref("");
        const draftNameError = ref("");
        const draftNameInput = ref(null);
        const contributionDialogOpen = ref(false);
        const draftModalOpen = computed(
            () => draftNameDialogOpen.value || Boolean(draftDeleteTarget.value) || contributionDialogOpen.value,
        );
        const safetyOpen = ref(false);
        const codeDialogOpen = ref(false);
        const rtttlCode = ref("");
        const multiCodeEntries = ref([]);
        const safetyChecks = reactive({ unlocked: false, propsRemoved: false, powerStable: false });
        const restoreFileInput = ref(null);
        const restoreOpen = ref(false);
        const restoreFileName = ref("");
        const importedRestoreBackup = ref(null);
        const selectedRestoreChannels = ref([]);
        const restoreChecks = reactive({
            unlocked: false,
            propsRemoved: false,
            powerStable: false,
            currentBackupReady: false,
        });
        const restorePreflightBackup = ref(null);
        const restoreBackupFilename = ref("");
        const restoreBackingUp = ref(false);
        const restoring = ref(false);
        const restoreResult = ref(null);
        const restoreProgress = ref(null);
        const restoreProgressRows = ref([]);
        const operationMessage = ref("");
        const operationType = ref("info");
        const backingUp = ref(false);
        const writing = ref(false);
        const playing = ref(false);
        const activePreviewNoteIds = ref([]);
        const activeCodePreviewIds = ref([]);
        const previewMode = ref(null);
        const locked = computed(
            () => writing.value || restoring.value || restoreBackingUp.value || scanning.value || GUI.connect_lock,
        );
        const safetyWriteDisabledReason = computed(() => {
            if (!connected.value) return "请先连接飞控";
            if (scanning.value) return "正在扫描电调";
            if (restoreResult.value?.ok === false && restoreRollbackCount.value) return "请先完成 EEPROM 故障回滚";
            if (writing.value) return "正在写入电调";
            if (restoring.value || restoreBackingUp.value) return "正在恢复 EEPROM";
            if (GUI.connect_lock) return "串口正被其他操作占用";
            if (!escs.value.length) return "请先扫描电调";
            if (!writableEscs.value.length && failedFirmwareDetectionCount.value) {
                return `${failedFirmwareDetectionCount.value} 路固件或布局验证失败，通道保持锁定；请查看失败原因`;
            }
            const unsupportedAm32 = escs.value.find(
                (esc) =>
                    esc.confirmationStatus === ESC_FIRMWARE_CONFIRMATION_STATUS.UNSUPPORTED &&
                    esc.confirmedFirmwareFamily === ESC_FIRMWARE.AM32,
            );
            if (!writableEscs.value.length && unsupportedAm32) {
                return "AM32 已识别，但 MCU 配置布局未支持";
            }
            if (!writableEscs.value.length) return "未识别到可写入的电调";
            if (!pendingWriteEscs.value.length) {
                return syncAll.value ? "请先选择或编辑一首音乐" : "请先修改至少一路音乐";
            }
            if (!writeValidation.value.valid) {
                return writeValidation.value.errors[0] || "旋律未通过写入校验";
            }
            return "";
        });
        const writeResult = ref(null);
        const writeRecoveryTargets = computed(() =>
            writeResult.value?.ok === false ? (writeResult.value.rollback ?? writeResult.value.written ?? []) : [],
        );
        const arrangementMode = computed(() =>
            showPresetTrackTabs.value ? "poly" : syncAll.value ? "sync" : "independent",
        );
        const arrangementLabel = computed(() =>
            showPresetTrackTabs.value ? "多声部合奏" : syncAll.value ? "同曲同步" : "各路独立",
        );
        const deviceReadiness = computed(() => {
            if (!connected.value) return "未连接";
            if (scanning.value) return "扫描中";
            if (!escs.value.length) return "待扫描";
            if (failedFirmwareDetectionCount.value) {
                return `${writableEscs.value.length} 路已验证 · ${failedFirmwareDetectionCount.value} 路验证失败`;
            }
            return writableEscs.value.length ? `${writableEscs.value.length} 路已验证` : "不支持写入";
        });
        const hasDeviceIssues = computed(() =>
            displayedEscs.value.some(
                (esc) =>
                    esc.confirmationStatus === ESC_FIRMWARE_CONFIRMATION_STATUS.FAILED ||
                    Boolean(esc.melodyReadError) ||
                    Boolean(esc.reason && !esc.canWrite),
            ),
        );
        const inspectedDeviceId = computed(() => {
            if (escs.value.some((esc) => esc.id === deviceInspectionId.value)) return deviceInspectionId.value;
            return (
                escs.value.find((esc) => esc.melodyReadError || !esc.canWrite)?.id ||
                selectedEsc.value?.id ||
                escs.value[0]?.id ||
                null
            );
        });
        const operationReadiness = computed(() => {
            if (writeRecoveryTargets.value.length) return "需要恢复受影响通道";
            if (writing.value) return "串行操作中，请保持连接与供电";
            if (writeResult.value?.ok) return "本次目标已读回校验";
            if (safetyWriteDisabledReason.value) return safetyWriteDisabledReason.value;
            return safetyReady.value ? "检查与备份已完成，可开始写入" : "待安全检查与备份";
        });
        function voiceIndexForEsc(esc) {
            const count = presetTrackSession.value?.tracks.length || 0;
            if (!count) return null;
            const index = [...editableEscs.value]
                .sort((a, b) => a.channel - b.channel)
                .findIndex((item) => item.id === esc.id);
            return index < 0 ? null : (voiceAssignments[esc.id] ?? index % count);
        }
        const assignmentRows = computed(() =>
            [...displayedEscs.value]
                .sort((a, b) => a.channel - b.channel)
                .map((esc) => {
                    const editable = esc.canWrite && isEscMelodyEditable(esc);
                    const voiceIndex = editable ? voiceIndexForEsc(esc) : null;
                    const result = editable
                        ? validateMelody(outputMelodyForEsc(esc), {
                            firmware: esc.firmwareFamily,
                            capacity: esc.capacity || 128,
                        })
                        : null;
                    return {
                        id: esc.id,
                        channel: esc.channel,
                        firmware: esc.firmwareLabel,
                        editable,
                        voiceIndex,
                        voiceLabel: !editable
                            ? "未参与"
                            : voiceIndex !== null
                                ? `声部 ${voiceIndex + 1}`
                                : esc.editorMelody.name,
                        capacity: result ? `${result.encodedLength}/${esc.capacity || 128} B` : "",
                        status: !editable
                            ? esc.canWrite
                                ? "音乐待处理"
                                : firmwareDetectionLabel(esc)
                            : !result.valid
                                ? "编码需调整"
                                : pendingWriteEscIds.value.has(esc.id)
                                    ? "将写入"
                                    : "无修改",
                    };
                }),
        );
        const completedWriteRows = computed(() => {
            const completedIds = new Set((writeResult.value?.written || []).map((esc) => esc.id));
            return assignmentRows.value
                .filter((row) => completedIds.has(row.id))
                .map((row) => ({ ...row, status: "已完成" }));
        });
        const safetyChannelRows = computed(() => {
            const progressByChannel = new Map(writeProgressRows.value.map((row) => [row.channel, row]));
            const rows = writeResult.value?.ok ? completedWriteRows.value : assignmentRows.value;
            return rows.map((row) => {
                const progress = progressByChannel.get(row.channel);
                return progress
                    ? {
                        ...row,
                        state: progress.state,
                        status: writeResult.value?.ok
                            ? row.status
                            : ESC_OPERATION_LABELS[progress.state] || row.status,
                        error: progress.error,
                    }
                    : row;
            });
        });
        const assignmentWarnings = computed(() => {
            const warnings = [];
            const inactive = assignmentRows.value.filter((row) => !row.editable);
            if (inactive.length)
                warnings.push(`${inactive.map((row) => `ESC ${row.channel + 1}`).join("、")} 未参与写入。`);
            if (showPresetTrackTabs.value && assignmentRows.value.length) {
                const used = assignmentRows.value.filter((row) => row.editable).map((row) => row.voiceIndex);
                const missing = presetTrackTabs.value.filter((track) => !used.includes(track.index));
                if (missing.length)
                    warnings.push(`缺少声部 ${missing.map((track) => track.index + 1).join("、")}，无法完整合奏。`);
                const repeated = [...new Set(used.filter((voice, i) => used.indexOf(voice) !== i))];
                if (repeated.length)
                    warnings.push(`声部 ${repeated.map((voice) => voice + 1).join("、")} 将分配到多路电调。`);
            }
            return warnings;
        });
        watch(
            () =>
                JSON.stringify(
                    assignmentRows.value.map(({ id, voiceIndex, editable }) => ({ id, voiceIndex, editable })),
                ),
            () => {
                assignmentAccepted.value = false;
            },
        );
        function assignVoice(id, voice) {
            if (
                locked.value ||
                writeRecoveryTargets.value.length ||
                !Number.isInteger(voice) ||
                !presetTrackSession.value?.tracks[voice]
            )
                return;
            voiceAssignments[id] = voice;
            assignmentAccepted.value = false;
            syncPresetTracksToEscs();
        }
        function closeSafety() {
            if (!writing.value && !backingUp.value) safetyOpen.value = false;
        }
        const modalKey = computed(() =>
            draftNameDialogOpen.value
                ? "draft-name-title"
                : draftDeleteTarget.value
                    ? "draft-delete-title"
                    : contributionDialogOpen.value
                        ? "melody-contribution-title"
                        : codeDialogOpen.value
                            ? "rtttl-code-title"
                            : syncConfirmOpen.value
                                ? "sync-confirm-title"
                                : restoreOpen.value
                                    ? "restore-title"
                                    : safetyOpen.value
                                        ? "safety-title"
                                        : "",
        );
        const modalOpen = computed(() => Boolean(modalKey.value));
        let modalReturnFocus = null;
        let modalReturnView = null;
        watch(modalKey, async (key, previous) => {
            if (key) {
                if (!previous) {
                    modalReturnFocus = document.activeElement;
                    modalReturnView = workspaceView.value;
                }
                await nextTick();
                document
                    .querySelector(
                        `.safety-overlay[aria-labelledby="${key}"] button:not([disabled]), .safety-overlay[aria-labelledby="${key}"] input:not([disabled])`,
                    )
                    ?.focus();
            } else {
                await nextTick();
                if (modalReturnView !== workspaceView.value)
                    document.querySelector('.melody-mode-nav [aria-pressed="true"]')?.focus();
                else modalReturnFocus?.focus?.();
                modalReturnFocus = null;
                modalReturnView = null;
            }
        });
        function handleDialogKeydown(event) {
            if (!modalKey.value || event.defaultPrevented) return;
            const overlay = document.querySelector(`.safety-overlay[aria-labelledby="${modalKey.value}"]`);
            if (event.key === "Tab" && overlay) {
                trapDialogFocus({
                    currentTarget: overlay,
                    shiftKey: event.shiftKey,
                    preventDefault: () => event.preventDefault(),
                });
                return;
            }
            if (event.key !== "Escape" || writing.value || backingUp.value || restoring.value || restoreBackingUp.value)
                return;
            event.preventDefault();
            const close = {
                "draft-name-title": closeDraftNameDialog,
                "draft-delete-title": closeDeleteDraftDialog,
                "melody-contribution-title": closeContributionDialog,
                "rtttl-code-title": closeCodeDialog,
                "safety-title": closeSafety,
                "restore-title": closeRestoreDialog,
                "sync-confirm-title": cancelSyncAll,
            };
            close[modalKey.value]?.();
        }
        const controller = ref(null);
        const audioContext = ref(null);
        const audioNodes = [];
        const previewHighlightTimers = [];
        let previewTimer = null;
        let ownsSerialLock = false;
        let dragState = null;
        let loadingEditor = false;
        let singleCodeSession = null;
        let draftAutoSaveTimer = null;
        let draftDialogReturnFocus = null;
        let draftDeleteReturnFocus = null;
        let contributionDialogReturnFocus = null;

        const restoreMatchResult = computed(() =>
            importedRestoreBackup.value
                ? matchEscBackupForRestore(importedRestoreBackup.value, escs.value)
                : { matches: [], validCount: 0 },
        );
        const restoreMatches = computed(() => restoreMatchResult.value.matches);
        const restoreValidCount = computed(() => restoreMatchResult.value.validCount);
        const selectedRestoreMatches = computed(() => {
            const channels = new Set(selectedRestoreChannels.value);
            return restoreMatches.value
                .filter((match) => match.valid && channels.has(match.backupEntry.channel))
                .sort((left, right) => left.backupEntry.channel - right.backupEntry.channel);
        });
        const restoreRollbackTargets = computed(
            () => restoreResult.value?.rollback || restoreResult.value?.restored || [],
        );
        const restoreRollbackCount = computed(() => restoreRollbackTargets.value.length);
        const restoreBackupCreatedAt = computed(() => {
            const timestamp = importedRestoreBackup.value?.createdAt;
            return timestamp ? new Date(timestamp).toLocaleString() : "";
        });
        const restorePreflightStatus = computed(() =>
            validateEscBackup(
                restorePreflightBackup.value,
                selectedRestoreMatches.value.map((match) => match.esc),
            ),
        );
        const restoreReady = computed(
            () =>
                connected.value &&
                selectedRestoreMatches.value.length > 0 &&
                Object.values(restoreChecks).every(Boolean) &&
                restorePreflightStatus.value.valid,
        );
        const restoreBackupSummary = computed(() => {
            if (!selectedRestoreMatches.value.length) return "至少选择一路身份匹配的电调";
            if (restorePreflightStatus.value.valid) {
                return `${selectedRestoreMatches.value.length} 路当前 EEPROM 已保存并下载 · ${restoreBackupFilename.value}`;
            }
            return `恢复前必须重新备份所选 ${selectedRestoreMatches.value.length} 路电调`;
        });

        const sharedCodeTargetPreviews = computed(() => {
            if (!syncAll.value) return [];
            return pendingWriteEscs.value.map((esc) => ({
                esc,
                preview: parseCodePreview(rtttlCode.value, esc.firmwareFamily, esc.capacity || 128),
            }));
        });
        const codePreview = computed(() => {
            const primary = parseCodePreview(rtttlCode.value, targetFirmware.value, targetCapacity.value);
            if (primary.error || !sharedCodeTargetPreviews.value.length) return primary;
            const errors = sharedCodeTargetPreviews.value.flatMap(({ esc, preview }) =>
                preview.errors.map((error) => `ESC ${esc.channel + 1}：${error}`),
            );
            return {
                ...primary,
                valid: sharedCodeTargetPreviews.value.every(({ preview }) => preview.valid),
                errors,
                encodedLength: Math.max(
                    primary.encodedLength,
                    ...sharedCodeTargetPreviews.value.map(({ preview }) => preview.encodedLength),
                ),
            };
        });
        const multiCodeMode = computed(
            () => multiCodeEntries.value.length > 1 && (showPresetTrackTabs.value || !syncAll.value),
        );
        const multiCodePreviewList = computed(() =>
            multiCodeEntries.value
                .map((entry) => {
                    const esc = entry.escId ? escs.value.find((candidate) => candidate.id === entry.escId) : null;
                    if (entry.escId && !esc) return null;
                    return {
                        entry,
                        esc,
                        label:
                            entry.trackIndex === undefined ? `ESC ${esc.channel + 1}` : `声部 ${entry.trackIndex + 1}`,
                        subtitle:
                            entry.trackIndex === undefined
                                ? `${esc.firmwareLabel} · ${esc.version}`
                                : presetTrackSession.value?.name || "多声部预置",
                        capacity: entry.capacity || esc?.capacity || 128,
                        preview: parseCodePreview(
                            entry.code,
                            entry.firmware || esc?.firmwareFamily || targetFirmware.value,
                            entry.capacity || esc?.capacity || 128,
                        ),
                    };
                })
                .filter(Boolean),
        );
        const multiCodePlayableCount = computed(
            () =>
                multiCodePreviewList.value.filter((item) => !item.preview.error && item.preview.pitchedNoteCount > 0)
                    .length,
        );
        const codeSaveReady = computed(() =>
            multiCodeMode.value
                ? multiCodePreviewList.value.length > 0 &&
                  multiCodePreviewList.value.every((item) => Boolean(item.preview.melody))
                : Boolean(codePreview.value.melody),
        );
        const currentMelodyPlayable = computed(() =>
            melody.value.notes.some((note) => !note.rest && note.midi !== null),
        );
        const allMelodyPreviewEntries = computed(() => {
            if (showPresetTrackTabs.value) {
                return presetTrackSession.value.tracks
                    .map((track, index) => ({ melody: outputTracks.value[index], id: track.id }))
                    .filter((entry) => entry.melody.notes.some((note) => !note.rest && note.midi !== null));
            }
            return editableEscs.value
                .filter((esc) => esc.editorMelody?.notes.some((note) => !note.rest && note.midi !== null))
                .map((esc) => ({ melody: outputMelodyForEsc(esc), id: esc.id, firmware: esc.firmwareFamily }));
        });
        const canPlayAllMelodies = computed(() => allMelodyPreviewEntries.value.length > 1);
        const selectionPreviewPlayable = computed(() =>
            showPresetTrackTabs.value ? allMelodyPreviewEntries.value.length > 0 : currentMelodyPlayable.value,
        );
        function toggleSelectionPreview() {
            if (playing.value) stopPreview();
            else if (showPresetTrackTabs.value)
                void startAudioPreview(allMelodyPreviewEntries.value, { highlight: true, mode: "all" });
            else playMelody();
        }

        const safetyCheckItems = [
            { id: "unlocked", title: "飞控已锁定（未解锁）", description: "确认当前不会发送解锁命令。" },
            { id: "propsRemoved", title: "桨叶已拆除", description: "确认所有电机上的桨叶均已拆除。" },
            { id: "powerStable", title: "ESC 稳定供电", description: "使用限流电源，连接和电压保持稳定。" },
        ];
        const restoreSafetyItems = [
            { id: "unlocked", title: "飞控已锁定（未解锁）", description: "确认当前不会发送解锁命令。" },
            { id: "propsRemoved", title: "桨叶已拆除", description: "所有电机桨叶均已拆除。" },
            { id: "powerStable", title: "ESC 稳定供电", description: "使用限流电源并保持连接、电压稳定。" },
            {
                id: "currentBackupReady",
                title: "当前状态已重新备份并下载",
                description: "所选通道的当前完整 EEPROM 已保存到本地历史并下载 JSON 文件。",
            },
        ];

        function showMessage(message, type = "info") {
            operationMessage.value = message;
            operationType.value = type;
        }

        function cloneLibrarySource(source) {
            return source ? { ...source } : null;
        }

        function setActiveLibrarySource(source) {
            activeLibrarySource.value = cloneLibrarySource(source);
        }

        function clearActiveLibrarySource() {
            activeLibrarySource.value = null;
            syncEditorState();
        }

        function createEmptyEscMelody(esc) {
            return normalizeMelody({
                name: `ESC ${esc.channel + 1}`,
                bpm: 120,
                key: "C",
                waitMs: 0,
                notes: [],
            });
        }

        function isEscMelodyEditable(esc) {
            return Boolean(
                esc?.editorMelody &&
                [
                    ESC_MELODY_READ_STATUS.LOADED,
                    ESC_MELODY_READ_STATUS.EMPTY,
                    ESC_MELODY_READ_STATUS.REPLACEMENT,
                ].includes(esc.melodyReadStatus),
            );
        }

        function initializeEscEditorState(scannedEscs) {
            for (const esc of scannedEscs) {
                let current = null;
                if (esc.melodyReadStatus === ESC_MELODY_READ_STATUS.LOADED) {
                    current = esc.currentMelody;
                } else if (esc.melodyReadStatus === ESC_MELODY_READ_STATUS.EMPTY) {
                    current = createEmptyEscMelody(esc);
                }
                esc.originalMelody = current ? cloneMelody(current) : null;
                esc.editorMelody = current ? cloneMelody(current) : null;
                esc.editorHistory = [];
                esc.editorFuture = [];
                esc.editorSource = current ? { type: "current" } : null;
                esc.editorDraftId = null;
                esc.melodyReplacementReady = false;
                esc.melodyDirty = false;
            }
            return recomputeMelodyMode();
        }

        function recomputeMelodyMode() {
            const melodyCapable = escs.value.filter((esc) =>
                [
                    ESC_MELODY_READ_STATUS.LOADED,
                    ESC_MELODY_READ_STATUS.EMPTY,
                    ESC_MELODY_READ_STATUS.ERROR,
                    ESC_MELODY_READ_STATUS.REPLACEMENT,
                ].includes(esc.melodyReadStatus),
            );
            const editable = escs.value.filter(isEscMelodyEditable);
            const allMelodiesReadable =
                melodyCapable.length > 0 &&
                melodyCapable.every(
                    (esc) =>
                        esc.melodyReadStatus === ESC_MELODY_READ_STATUS.LOADED ||
                        esc.melodyReadStatus === ESC_MELODY_READ_STATUS.EMPTY,
                );
            const sameMelody =
                editable.length > 0 &&
                editable.slice(1).every((esc) => melodiesEqual(esc.editorMelody, editable[0].editorMelody));
            melodyConflict.value =
                editable.length > 0 && melodyCapable.length > 1 && (!allMelodiesReadable || !sameMelody);
            syncAll.value = Boolean(writableEscs.value.length > 0 && allMelodiesReadable && sameMelody);

            const selected = editable.find((esc) => esc.id === selectedEscId.value);
            const first = [...editable].sort((left, right) => left.channel - right.channel)[0];
            if (selected || first) loadEscEditor(selected || first);
            return editable.length;
        }

        function activePresetTrack() {
            return presetTrackSession.value?.tracks[activePresetTrackIndex.value] || null;
        }

        function syncPresetTracksToEscs() {
            const session = presetTrackSession.value;
            if (!session || !editableEscs.value.length) return;
            const targets = [...editableEscs.value].sort((left, right) => left.channel - right.channel);
            for (const [index, esc] of targets.entries()) {
                const track = session.tracks[voiceAssignments[esc.id] ?? index % session.tracks.length];
                esc.editorMelody = cloneMelody(track.melody);
                esc.editorHistory = cloneMelodyHistory(track.history);
                esc.editorFuture = cloneMelodyHistory(track.future);
                esc.editorSource = track.draftId
                    ? { type: "draft", id: track.draftId }
                    : { type: "preset", id: session.presetId };
                esc.editorDraftId = track.draftId || null;
                esc.melodyDirty =
                    Boolean(esc.melodyReplacementReady) || !melodiesEqual(esc.editorMelody, esc.originalMelody);
            }
        }

        function syncActivePresetTrackState() {
            if (loadingEditor) return;
            const track = activePresetTrack();
            if (!track) return;
            track.melody = cloneMelody(melody.value);
            track.history = cloneMelodyHistory(history.value);
            track.future = cloneMelodyHistory(future.value);
            syncPresetTracksToEscs();
        }

        function syncEditorState() {
            if (loadingEditor) return;
            if (presetTrackSession.value) {
                syncActivePresetTrackState();
                return;
            }
            if (!escs.value.length) return;
            const targets = syncAll.value
                ? writableEscs.value.filter(isEscMelodyEditable)
                : [selectedEsc.value].filter(isEscMelodyEditable);
            for (const esc of targets) {
                esc.editorMelody = cloneMelody(melody.value);
                esc.editorHistory = history.value.map(cloneMelody);
                esc.editorFuture = future.value.map(cloneMelody);
                esc.editorSource = cloneLibrarySource(activeLibrarySource.value);
                esc.editorDraftId = currentDraftId.value;
                esc.melodyDirty =
                    Boolean(esc.melodyReplacementReady) || !melodiesEqual(esc.editorMelody, esc.originalMelody);
            }
        }

        function loadPresetTrack(index) {
            const session = presetTrackSession.value;
            const track = session?.tracks[index];
            if (!track) return false;
            stopPreview();
            loadingEditor = true;
            activePresetTrackIndex.value = index;
            melody.value = cloneMelody(track.melody);
            editorBaseline.value = cloneMelody(melody.value);
            history.value = cloneMelodyHistory(track.history);
            future.value = cloneMelodyHistory(track.future);
            setActiveLibrarySource(
                track.draftId ? { type: "draft", id: track.draftId } : { type: "preset", id: session.presetId },
            );
            currentDraftId.value = track.draftId || null;
            if (track.draftId)
                lastDraftSavedAt.value = new Date(
                    drafts.value.find((draft) => draft.id === track.draftId)?.updatedAt || Date.now(),
                );
            selectedNoteId.value = melody.value.notes[0]?.id || null;
            loadingEditor = false;
            void nextTick(scrollMelodyIntoView);
            return true;
        }

        function selectPresetTrack(index) {
            if (index === activePresetTrackIndex.value) return;
            if (!flushCurrentDraft()) return;
            syncActivePresetTrackState();
            loadPresetTrack(index);
        }

        function clearPresetTrackSession() {
            Object.keys(voiceAssignments).forEach((key) => delete voiceAssignments[key]);
            presetTrackSession.value = null;
            activePresetTrackIndex.value = 0;
        }

        function loadEscEditor(esc) {
            if (!isEscMelodyEditable(esc)) return false;
            clearPresetTrackSession();
            stopPreview();
            loadingEditor = true;
            selectedEscId.value = esc.id;
            melody.value = cloneMelody(esc.editorMelody);
            editorBaseline.value = cloneMelody(melody.value);
            history.value = (esc.editorHistory || []).map(cloneMelody);
            future.value = (esc.editorFuture || []).map(cloneMelody);
            setActiveLibrarySource(esc.editorSource);
            currentDraftId.value = esc.editorDraftId || null;
            selectedNoteId.value = melody.value.notes[0]?.id || null;
            loadingEditor = false;
            void nextTick(scrollMelodyIntoView);
            return true;
        }

        function selectEscChannel(esc) {
            if (esc.id === selectedEscId.value) return;
            if (!isEscMelodyEditable(esc)) {
                showMessage(`第 ${esc.channel + 1} 路当前音乐不可用。`, "error");
                return;
            }
            flushCurrentDraft();
            syncEditorState();
            if (syncAll.value) {
                stopPreview();
                selectedEscId.value = esc.id;
                void nextTick(scrollMelodyIntoView);
                return;
            }
            if (!loadEscEditor(esc)) {
                showMessage(`第 ${esc.channel + 1} 路当前音乐无法编辑，请先明确使用当前卷帘替换。`, "error");
            } else if (esc.melodyReadStatus === ESC_MELODY_READ_STATUS.ERROR) {
                showMessage(
                    `第 ${esc.channel + 1} 路原开机音乐损坏（${esc.melodyReadError}），已置为待替换草稿。`,
                    "info",
                );
            }
        }

        function replaceUnreadableEsc(esc) {
            syncEditorState();
            esc.editorMelody = cloneMelody(melody.value);
            esc.editorHistory = [];
            esc.editorFuture = [];
            esc.editorSource = null;
            esc.editorDraftId = null;
            esc.melodyReplacementReady = true;
            esc.melodyDirty = true;
            esc.melodyReadStatus = ESC_MELODY_READ_STATUS.REPLACEMENT;
            syncAll.value = false;
            melodyConflict.value = true;
            loadEscEditor(esc);
            showMessage(`第 ${esc.channel + 1} 路将使用当前卷帘替换无法解析的原音乐。`, "info");
        }

        function changeArrangement(event) {
            const next = event.target.value;
            event.target.value = arrangementMode.value;
            if (locked.value || next === arrangementMode.value) return;
            if (showPresetTrackTabs.value) {
                if (!stashEditorBeforeSwitch({ force: true })) return;
                if (next === "sync") {
                    syncConfirmOpen.value = true;
                    return;
                }
                if (next === "independent" && editableEscs.value.length) {
                    syncEditorState();
                    clearPresetTrackSession();
                    syncAll.value = false;
                    loadEscEditor(selectedEsc.value || editableEscs.value[0]);
                }
            } else handleSyncModeChange({ target: { checked: next === "sync" } });
        }
        function handleSyncModeChange(event) {
            const wantsSync = event.target.checked;
            if (wantsSync === syncAll.value) return;
            if (wantsSync && !syncAll.value) {
                if (codeDialogOpen.value && multiCodeMode.value) {
                    const sourceEntry = multiCodeEntries.value.find((entry) => entry.escId === selectedEscId.value);
                    const sourceEsc = selectedEsc.value;
                    const sourcePreview =
                        sourceEntry && sourceEsc
                            ? parseCodePreview(sourceEntry.code, sourceEsc.firmwareFamily, sourceEsc.capacity || 128)
                            : null;
                    if (!sourcePreview || sourcePreview.error) {
                        event.target.checked = false;
                        showMessage(`请先修正 ${syncSourceLabel.value} 的 RTTTL 代码，再开启同步旋律。`, "error");
                        return;
                    }
                }
                syncConfirmOpen.value = true;
                event.target.checked = false;
                return;
            }
            if (!wantsSync && syncAll.value) {
                syncEditorState();
                syncAll.value = false;
                const active = selectedEsc.value || writableEscs.value.find(isEscMelodyEditable);
                if (active) loadEscEditor(active);
                if (codeDialogOpen.value) initializeMultiCodeEditor();
                showMessage("同步旋律已关闭，各路编辑与撤销互不影响。", "info");
            }
        }

        function confirmSyncAll() {
            syncEditorState();
            const shared = cloneMelody(melody.value);
            clearPresetTrackSession();
            for (const esc of writableEscs.value) {
                esc.editorMelody = cloneMelody(shared);
                esc.editorHistory = [];
                esc.editorFuture = [];
                esc.editorSource = cloneLibrarySource(activeLibrarySource.value);
                esc.editorDraftId = currentDraftId.value;
                if (!esc.originalMelody) {
                    esc.melodyReplacementReady = true;
                    esc.melodyReadStatus = ESC_MELODY_READ_STATUS.REPLACEMENT;
                }
                esc.melodyDirty =
                    Boolean(esc.melodyReplacementReady) || !melodiesEqual(esc.editorMelody, esc.originalMelody);
            }
            syncAll.value = true;
            melodyConflict.value = false;
            syncConfirmOpen.value = false;
            history.value = [];
            future.value = [];
            if (codeDialogOpen.value) initializeSingleCodeEditor();
            showMessage(`${syncSourceLabel.value} 的旋律已同步到 ${writableEscs.value.length} 路可写电调。`, "info");
        }

        function cancelSyncAll() {
            syncConfirmOpen.value = false;
        }

        function melodyReadLabel(esc) {
            const labels = {
                [ESC_MELODY_READ_STATUS.LOADED]: "已读取",
                [ESC_MELODY_READ_STATUS.EMPTY]: "空旋律",
                [ESC_MELODY_READ_STATUS.ERROR]: "无法解析",
                [ESC_MELODY_READ_STATUS.UNSUPPORTED]: "不支持读取",
                [ESC_MELODY_READ_STATUS.REPLACEMENT]: "待替换",
            };
            return labels[esc.melodyReadStatus] || "未读取";
        }

        function firmwareDetectionLabel(esc) {
            const labels = {
                [ESC_FIRMWARE_CONFIRMATION_STATUS.PENDING]: "未识别",
                [ESC_FIRMWARE_CONFIRMATION_STATUS.VERIFYING]: "布局验证中",
                [ESC_FIRMWARE_CONFIRMATION_STATUS.UNSUPPORTED]: "布局未支持",
                [ESC_FIRMWARE_CONFIRMATION_STATUS.FAILED]: "识别失败",
            };
            if (esc?.confirmationStatus === ESC_FIRMWARE_CONFIRMATION_STATUS.VERIFIED) {
                return esc.canWrite ? "已识别可读写" : "已识别 · 受限";
            }
            return labels[esc?.confirmationStatus] || "未识别";
        }

        watch(
            melody,
            () => {
                syncEditorState();
                scheduleDraftAutoSave();
            },
            { deep: true, flush: "sync" },
        );
        watch(
            selectedRestoreChannels,
            () => {
                if (restoring.value || restoreBackingUp.value) return;
                restoreChecks.currentBackupReady = false;
                restorePreflightBackup.value = null;
                restoreBackupFilename.value = "";
            },
            { deep: true },
        );
        watch(connected, (isConnected) => {
            if (!isConnected) {
                resetRestoreState();
                safetyOpen.value = false;
                invalidateLocalEscBackup();
            }
        });

        function snapshot() {
            return cloneMelody(melody.value);
        }

        function pushHistory() {
            history.value.push(snapshot());
            if (history.value.length > 50) history.value.shift();
            future.value = [];
        }

        function applyMelody(next) {
            melody.value = cloneMelody(next);
            selectedNoteId.value = melody.value.notes[0]?.id || null;
            void nextTick(scrollMelodyIntoView);
        }

        function undo() {
            if (!history.value.length) return;
            clearActiveLibrarySource();
            future.value.push(snapshot());
            applyMelody(history.value.pop());
        }

        function redo() {
            if (!future.value.length) return;
            clearActiveLibrarySource();
            history.value.push(snapshot());
            applyMelody(future.value.pop());
        }

        function loadCurrentMelody() {
            if (!currentMelodySource.value || !stashEditorBeforeSwitch()) return;
            clearPresetTrackSession();
            pushHistory();
            currentDraftId.value = null;
            setActiveLibrarySource({ type: "current" });
            applyMelody(currentMelodySource.value);
            editorBaseline.value = cloneMelody(melody.value);
        }

        function loadPreset(preset, { preserveEdits = true, draftIds = [] } = {}) {
            if (preserveEdits && !stashEditorBeforeSwitch()) return false;
            recentIds.value = [preset.id, ...recentIds.value.filter((id) => id !== preset.id)].slice(0, 12);
            persistLibrary();
            offlineSelection.value = !editableEscs.value.length;
            currentDraftId.value = null;
            const source = { type: "preset", id: preset.id };
            const tracks = preset.trackMelodies?.length ? preset.trackMelodies : [preset];

            if (tracks.length > 1) {
                stopPreview();
                syncEditorState();
                Object.keys(voiceAssignments).forEach((key) => delete voiceAssignments[key]);
                presetTrackSession.value = {
                    presetId: preset.id,
                    name: preset.name,
                    tracks: tracks.map((track, index) => {
                        const trackMelody = cloneMelody(track);
                        return {
                            id: `${preset.id}-track-${index + 1}`,
                            draftId: draftIds[index] || null,
                            originalMelody: cloneMelody(trackMelody),
                            melody: trackMelody,
                            history: [],
                            future: [],
                        };
                    }),
                };
                activePresetTrackIndex.value = 0;
                syncAll.value = false;
                melodyConflict.value = false;
                syncPresetTracksToEscs();
                loadPresetTrack(0);
                showMessage(
                    editableEscs.value.length
                        ? `已加载“${preset.name}”的 ${tracks.length} 个声部，并按顺序映射到 ${editableEscs.value.length} 路电调。`
                        : `已加载“${preset.name}”的 ${tracks.length} 个声部，可通过顶部标签逐路查看。`,
                    "info",
                );
                return true;
            }

            clearPresetTrackSession();
            stopPreview();
            // A one-track preset is intentionally synchronized to every ESC.
            // Leaving former voices intact would make the startup sound mix
            // the selected melody with stale independent tracks.
            const shared = cloneMelody(tracks[0]);
            for (const esc of writableEscs.value) {
                esc.editorMelody = cloneMelody(shared);
                esc.editorHistory = [];
                esc.editorFuture = [];
                esc.editorSource = cloneLibrarySource(source);
                esc.editorDraftId = null;
                if (!esc.originalMelody) {
                    esc.melodyReplacementReady = true;
                    esc.melodyReadStatus = ESC_MELODY_READ_STATUS.REPLACEMENT;
                }
                esc.melodyDirty =
                    Boolean(esc.melodyReplacementReady) || !melodiesEqual(esc.editorMelody, esc.originalMelody);
            }
            syncAll.value = writableEscs.value.length > 0;
            melodyConflict.value = false;
            history.value = [];
            future.value = [];
            setActiveLibrarySource(source);
            applyMelody(shared);
            editorBaseline.value = cloneMelody(melody.value);
            if (writableEscs.value.length) {
                showMessage(
                    `已加载“${preset.name}”，将以相同旋律覆盖 ${writableEscs.value.length} 路可写电调。`,
                    "info",
                );
            }
            return true;
        }

        function loadDraft(draft, { preserveEdits = true } = {}) {
            if (currentDraftId.value === draft.id && !draftDirty.value) return;
            if (preserveEdits && !stashEditorBeforeSwitch()) return;
            offlineSelection.value = !editableEscs.value.length;
            clearPresetTrackSession();
            currentDraftId.value = draft.id;
            setActiveLibrarySource({ type: "draft", id: draft.id });
            history.value = [];
            future.value = [];
            applyMelody(draft.melody);
            editorBaseline.value = cloneMelody(melody.value);
            lastDraftSavedAt.value = draft.updatedAt ? new Date(draft.updatedAt) : null;
            draftMenuId.value = null;
        }

        function openDraftNameDialog(mode, { target = null, initialName = "", trigger = null } = {}) {
            draftNameMode.value = mode;
            draftNameTargetId.value = target?.id || null;
            draftName.value = initialName;
            draftNameError.value = "";
            draftDialogReturnFocus = trigger || document.activeElement;
            draftNameDialogOpen.value = true;
            draftMenuId.value = null;
            void nextTick(() => {
                draftNameInput.value?.focus();
                if (mode === "rename") draftNameInput.value?.select();
            });
        }

        function newDraft(event) {
            if (locked.value) return;
            if (drafts.value.length >= draftLimit) {
                showMessage(`草稿数量已达到 ${draftLimit} 条上限，请先删除不需要的草稿。`, "error");
                return;
            }
            openDraftNameDialog("create", { trigger: event?.currentTarget });
        }

        function renameDraft(draft, event) {
            if (locked.value) return;
            openDraftNameDialog("rename", { target: draft, initialName: draft.name, trigger: event?.currentTarget });
        }

        function saveAsDraft(event) {
            if (drafts.value.length >= draftLimit) {
                showMessage(`草稿数量已达到 ${draftLimit} 条上限，请先删除不需要的草稿。`, "error");
                return;
            }
            openDraftNameDialog("saveAs", {
                initialName: melody.value.name === "Untitled" ? "" : melody.value.name,
                trigger: event?.currentTarget,
            });
        }

        function closeDraftNameDialog() {
            draftNameDialogOpen.value = false;
            draftNameTargetId.value = null;
            draftName.value = "";
            draftNameError.value = "";
            const returnFocus = draftDialogReturnFocus;
            draftDialogReturnFocus = null;
            void nextTick(() => returnFocus?.focus?.());
        }

        function validatedDraftName() {
            const name = draftName.value.trim();
            if (!name) {
                draftNameError.value = "请输入草稿名称。";
                return "";
            }
            const duplicate = drafts.value.some(
                (draft) =>
                    draft.id !== draftNameTargetId.value &&
                    draft.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
            );
            if (duplicate) {
                draftNameError.value = "已有同名草稿，请使用其他名称。";
                return "";
            }
            return name;
        }

        function confirmDraftName() {
            const name = validatedDraftName();
            if (!name) return;

            try {
                if (draftNameMode.value === "rename") {
                    const target = drafts.value.find((draft) => draft.id === draftNameTargetId.value);
                    if (!target) {
                        closeDraftNameDialog();
                        showMessage("草稿不存在或已被移除。", "error");
                        return;
                    }
                    const nextMelody =
                        currentDraftId.value === target.id
                            ? cloneMelody({ ...melody.value, name })
                            : cloneMelody({ ...target.melody, name });
                    saveMelodyDraft({ id: target.id, name, melody: nextMelody });
                    if (currentDraftId.value === target.id) melody.value.name = name;
                    drafts.value = loadMelodyDrafts();
                    lastDraftSavedAt.value = new Date();
                    closeDraftNameDialog();
                    showMessage(`草稿已重命名为“${name}”。`, "success");
                    return;
                }

                const source =
                    draftNameMode.value === "create"
                        ? { name, bpm: 120, key: "C", waitMs: 0, notes: [] }
                        : { ...cloneMelody(melody.value), name };
                if (!stashEditorBeforeSwitch()) return;
                clearPresetTrackSession();
                const draft = createMelodyDraft({ name, melody: source });
                drafts.value = loadMelodyDrafts();
                currentDraftId.value = draft.id;
                setActiveLibrarySource({ type: "draft", id: draft.id });
                if (draftNameMode.value === "create") {
                    workspaceView.value = "editor";
                    history.value = [];
                    future.value = [];
                }
                applyMelody(draft.melody);
                syncEditorState();
                lastDraftSavedAt.value = new Date(draft.updatedAt);
                closeDraftNameDialog();
                showMessage(
                    draftNameMode.value === "create" ? `已新建草稿“${draft.name}”。` : `已保存草稿“${draft.name}”。`,
                    "success",
                );
            } catch (error) {
                draftNameError.value = error?.message || "无法保存草稿。";
            }
        }

        function persistCurrentDraft({ notify = false } = {}) {
            if (!currentDraftId.value || !draftDirty.value) return true;
            draftSaving.value = true;
            try {
                const saved = saveMelodyDraft({
                    id: currentDraftId.value,
                    name: currentDraft.value.name,
                    melody: melody.value,
                });
                currentDraftId.value = saved.id;
                drafts.value = loadMelodyDrafts();
                lastDraftSavedAt.value = new Date(saved.updatedAt);
                syncEditorState();
                if (notify) showMessage("草稿已保存到此浏览器。", "success");
                return true;
            } catch (error) {
                showMessage(error?.message || "草稿保存失败。", "error");
                return false;
            } finally {
                draftSaving.value = false;
            }
        }

        function scheduleDraftAutoSave() {
            if (draftAutoSaveTimer) clearTimeout(draftAutoSaveTimer);
            if (!currentDraftId.value || !draftDirty.value) return;
            draftAutoSaveTimer = setTimeout(() => {
                draftAutoSaveTimer = null;
                persistCurrentDraft();
            }, 400);
        }

        function flushCurrentDraft() {
            if (draftAutoSaveTimer) {
                clearTimeout(draftAutoSaveTimer);
                draftAutoSaveTimer = null;
            }
            return persistCurrentDraft();
        }

        function saveDraft(event) {
            if (!currentDraftId.value) {
                saveAsDraft(event);
                return;
            }
            flushCurrentDraft();
        }

        function toggleDraftMenu(id) {
            draftMenuId.value = draftMenuId.value === id ? null : id;
        }

        function duplicateDraft(draft) {
            draftMenuId.value = null;
            try {
                const copy = duplicateMelodyDraft(draft);
                drafts.value = loadMelodyDrafts();
                showMessage(`已复制为“${copy.name}”。`, "success");
            } catch (error) {
                showMessage(error?.message || "无法复制草稿。", "error");
            }
        }

        function confirmDeleteDraft(draft, event) {
            draftMenuId.value = null;
            draftDeleteReturnFocus = event?.currentTarget || document.activeElement;
            draftDeleteTarget.value = draft;
            void nextTick(() => document.querySelector(".draft-delete-dialog .danger-button")?.focus());
        }

        function closeDeleteDraftDialog() {
            draftDeleteTarget.value = null;
            const returnFocus = draftDeleteReturnFocus;
            draftDeleteReturnFocus = null;
            void nextTick(() => returnFocus?.focus?.());
        }

        function trapDialogFocus(event) {
            const focusable = [
                ...event.currentTarget.querySelectorAll(
                    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
            ];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        function openContributionDialog(event) {
            contributionDialogReturnFocus = event?.currentTarget || document.activeElement;
            contributionDialogOpen.value = true;
            void nextTick(() => document.querySelector(".melody-contribution-dialog .icon-button")?.focus());
        }

        function closeContributionDialog() {
            contributionDialogOpen.value = false;
            const returnFocus = contributionDialogReturnFocus;
            contributionDialogReturnFocus = null;
            void nextTick(() => returnFocus?.focus?.());
        }

        function deleteDraft() {
            const target = draftDeleteTarget.value;
            if (!target) return;
            if (currentDraftId.value === target.id) {
                if (draftAutoSaveTimer) clearTimeout(draftAutoSaveTimer);
                draftAutoSaveTimer = null;
                currentDraftId.value = null;
                activeLibrarySource.value = null;
                syncEditorState();
            }
            deleteMelodyDraft(target.id);
            drafts.value = loadMelodyDrafts();
            closeDeleteDraftDialog();
            showMessage(`已删除草稿“${target.name}”。`, "success");
        }

        function exportDraftRtttl(draft) {
            draftMenuId.value = null;
            downloadTextFile(`${safeFilename(draft.name)}.rtttl.txt`, melodyToRtttl(draft.melody), "text/plain");
            showMessage(`已导出“${draft.name}”的 RTTTL 代码。`, "success");
        }

        function exportAllDrafts() {
            const packageValue = createMelodyDraftPackage(drafts.value);
            const date = new Date().toISOString().slice(0, 10);
            downloadTextFile(
                `betaflight-esc-melody-drafts-${date}.json`,
                JSON.stringify(packageValue, null, 2),
                "application/json",
            );
            showMessage(`已导出 ${drafts.value.length} 条草稿。`, "success");
        }

        function chooseDraftImport() {
            draftImportInput.value?.click();
        }

        async function handleDraftImport(event) {
            const input = event.currentTarget;
            const file = input.files?.[0];
            input.value = "";
            if (!file) return;
            if (file.size > ESC_MELODY_DRAFT_FILE_MAX_BYTES) {
                showMessage("草稿文件超过 1 MiB 限制。", "error");
                return;
            }
            try {
                const packageValue = parseMelodyDraftPackage(await readTextFile(file));
                const imported = importMelodyDraftPackage(packageValue);
                drafts.value = loadMelodyDrafts();
                showMessage(`已导入 ${imported.length} 条草稿，同名草稿已自动编号。`, "success");
            } catch (error) {
                showMessage(error?.message || "无法导入草稿文件。", "error");
            }
        }

        function normalizeEditor() {
            clearActiveLibrarySource();
            pushHistory();
            melody.value = normalizeMelody(melody.value);
        }

        function addNote(rest) {
            clearActiveLibrarySource();
            pushHistory();
            const start = melodyDurationBeats(melody.value);
            const note = createNote({ midi: 60, start, duration: 1, rest });
            melody.value.notes.push(note);
            selectedNoteId.value = note.id;
        }

        function fitTimeline() {
            zoomPixels.value = Math.max(
                8,
                Math.min(160, ((pianoRollWrap.value?.clientWidth || 640) - 32) / timelineBeats.value),
            );
        }
        function locateSelectedNote() {
            if (!selectedNote.value || !pianoRollWrap.value) return;
            const wrap = pianoRollWrap.value;
            wrap.scrollLeft = Math.max(0, selectedNote.value.start * zoomPixels.value - wrap.clientWidth / 3);
            wrap.scrollTop = Math.max(
                0,
                (pianoMaxMidi.value - (selectedNote.value.midi ?? 60) + 0.5) * PIANO_ROLL_ROW_HEIGHT -
                    wrap.clientHeight / 2,
            );
        }
        function selectNoteFromList(note) {
            selectedNoteId.value = note.id;
            locateSelectedNote();
            void nextTick(() => document.querySelector('.esc-melody-note[tabindex="0"]')?.focus());
        }
        function editNoteFromList(note, patch) {
            selectedNoteId.value = note.id;
            updateSelected(patch);
        }
        function onNoteKeydown(event, note) {
            if (locked.value) return;
            const ordered = [...melody.value.notes].sort((a, b) => a.start - b.start);
            selectedNoteId.value = note.id;
            if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
                event.preventDefault();
                const index = ordered.findIndex((item) => item.id === note.id);
                selectNoteFromList(
                    ordered[Math.max(0, Math.min(ordered.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))],
                );
                return;
            }
            const patches = {
                ArrowLeft: { start: Math.max(0, note.start - snapStep.value) },
                ArrowRight: { start: note.start + snapStep.value },
                ArrowUp: { midi: Math.min(pianoMaxMidi.value, (note.midi ?? 60) + 1) },
                ArrowDown: { midi: Math.max(ESC_MELODY_MIN_MIDI, (note.midi ?? 60) - 1) },
            };
            if (patches[event.key]) {
                event.preventDefault();
                updateSelected(patches[event.key]);
                locateSelectedNote();
            } else if (["Delete", "Backspace"].includes(event.key)) {
                event.preventDefault();
                removeNote(note.id);
                void nextTick(() => document.querySelector('.esc-melody-note[tabindex="0"]')?.focus());
            } else if (["Enter", " "].includes(event.key)) event.preventDefault();
        }
        function addNoteAtPointer(event) {
            if (editorTool.value === "select" || locked.value) return;
            if (event.target !== event.currentTarget && !event.target.classList.contains("roll-grid")) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const start = Math.max(
                0,
                Math.floor((((event.clientX - rect.left) / rect.width) * timelineBeats.value) / snapStep.value) *
                    snapStep.value,
            );
            const row = Math.max(
                0,
                Math.min(
                    noteRows.value.length - 1,
                    Math.floor(((event.clientY - rect.top) / rect.height) * noteRows.value.length),
                ),
            );
            clearActiveLibrarySource();
            pushHistory();
            const note = createNote({
                midi: noteRows.value[row],
                start,
                duration: 1,
                rest: editorTool.value === "rest",
            });
            melody.value.notes.push(note);
            melody.value = normalizeMelody(melody.value);
            selectedNoteId.value = note.id;
        }

        function startNoteDrag(event, note) {
            if (locked.value) return;
            selectedNoteId.value = note.id;
            event.currentTarget.focus();
            const rect = event.currentTarget.parentElement.getBoundingClientRect();
            dragState = {
                changed: false,
                noteId: note.id,
                startX: event.clientX,
                startY: event.clientY,
                rect,
                initial: { ...note },
            };
            window.addEventListener("pointermove", onNoteDrag);
            window.addEventListener("pointerup", stopNoteDrag, { once: true });
        }

        function onNoteDrag(event) {
            if (!dragState) return;
            const note = melody.value.notes.find((item) => item.id === dragState.noteId);
            if (!note) return;
            const deltaBeat = ((event.clientX - dragState.startX) / dragState.rect.width) * timelineBeats.value;
            const deltaRow = Math.round(
                ((event.clientY - dragState.startY) / dragState.rect.height) * noteRows.value.length,
            );
            const start = Math.max(
                0,
                Math.round((dragState.initial.start + deltaBeat) / snapStep.value) * snapStep.value,
            );
            if (!dragState.changed && (start !== note.start || deltaRow !== 0)) {
                clearActiveLibrarySource();
                pushHistory();
                dragState.changed = true;
            }
            note.start = start;
            if (!note.rest) {
                note.midi = Math.max(
                    ESC_MELODY_MIN_MIDI,
                    Math.min(pianoMaxMidi.value, dragState.initial.midi - deltaRow),
                );
            }
        }

        function stopNoteDrag() {
            dragState = null;
            window.removeEventListener("pointermove", onNoteDrag);
        }

        function updateSelected(patch) {
            if (!selectedNote.value) return;
            clearActiveLibrarySource();
            pushHistory();
            Object.assign(selectedNote.value, patch);
            melody.value = normalizeMelody(melody.value);
        }

        function removeNote(id) {
            clearActiveLibrarySource();
            pushHistory();
            melody.value.notes = melody.value.notes.filter((note) => note.id !== id);
            selectedNoteId.value = melody.value.notes[0]?.id || null;
        }

        function noteName(midi) {
            if (midi === null || midi === undefined) return "休止";
            return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
        }

        function noteStyle(note) {
            const top = ((pianoMaxMidi.value - (note.midi ?? 60) + 0.5) / noteRows.value.length) * 100;
            return {
                left: `${(note.start / timelineBeats.value) * 100}%`,
                width: `${(note.duration / timelineBeats.value) * 100}%`,
                top: `${Math.max(1, Math.min(99, top))}%`,
            };
        }

        function scrollMelodyIntoView() {
            const wrap = pianoRollWrap.value;
            const pitches = melody.value.notes
                .filter((note) => !note.rest && note.midi !== null)
                .map((note) => note.midi);
            if (!wrap?.clientHeight || !pitches.length) return;
            const highest = Math.max(...pitches);
            const lowest = Math.min(...pitches);
            const centreMidi = (highest + lowest) / 2;
            const centreOffset = (pianoMaxMidi.value - centreMidi + 0.5) * PIANO_ROLL_ROW_HEIGHT;
            const maxScroll = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
            wrap.scrollTop = Math.max(0, Math.min(maxScroll, centreOffset - wrap.clientHeight / 2));
        }

        function formatBeat(value) {
            return `${value} 拍`;
        }

        function formatDuration(value) {
            const seconds = Math.round(value / 1000);
            return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        }

        function formatDraftDate(value) {
            if (!value) return "本机草稿";
            return new Date(value).toLocaleDateString();
        }

        function parseCodePreview(code, firmware, capacity) {
            try {
                const imported = rtttlToMelody(code);
                const result = validateMelody(imported, { firmware, capacity });
                return {
                    ...result,
                    error: "",
                    pitchedNoteCount: result.melody.notes.filter((note) => !note.rest).length,
                    restCount: result.melody.notes.filter((note) => note.rest).length,
                };
            } catch (error) {
                return {
                    error: formatRtttlError(error),
                    errors: [],
                    melody: null,
                    pitchedNoteCount: 0,
                    restCount: 0,
                };
            }
        }

        function cloneMelodyHistory(items = []) {
            return items.map(cloneMelody);
        }

        function createCodeSession(melodyValue, historyValue, futureValue, sourceValue, draftId) {
            return {
                baselineCode: melodyToRtttl(melodyValue),
                baselineMelody: cloneMelody(melodyValue),
                baselineHistory: cloneMelodyHistory(historyValue),
                baselineFuture: cloneMelodyHistory(futureValue),
                baselineSource: cloneLibrarySource(sourceValue),
                baselineDraftId: draftId || null,
            };
        }

        function initializeMultiCodeEditor() {
            singleCodeSession = null;
            rtttlCode.value = "";
            if (showPresetTrackTabs.value) {
                multiCodeEntries.value = presetTrackSession.value.tracks.map((track, trackIndex) => {
                    const mappedEsc = [...editableEscs.value].sort((left, right) => left.channel - right.channel)[
                        trackIndex
                    ];
                    return {
                        id: track.id,
                        trackIndex,
                        code: melodyToRtttl(track.melody),
                        firmware: mappedEsc?.firmwareFamily || targetFirmware.value,
                        capacity: mappedEsc?.capacity || 128,
                        session: createCodeSession(
                            track.melody,
                            track.history,
                            track.future,
                            { type: "preset", id: presetTrackSession.value.presetId },
                            null,
                        ),
                    };
                });
            } else {
                multiCodeEntries.value = editableEscs.value.map((esc) => ({
                    id: esc.id,
                    escId: esc.id,
                    code: melodyToRtttl(esc.editorMelody),
                    session: createCodeSession(
                        esc.editorMelody,
                        esc.editorHistory,
                        esc.editorFuture,
                        esc.editorSource,
                        esc.editorDraftId,
                    ),
                }));
            }
        }

        function initializeSingleCodeEditor() {
            multiCodeEntries.value = [];
            singleCodeSession = createCodeSession(
                melody.value,
                history.value,
                future.value,
                activeLibrarySource.value,
                currentDraftId.value,
            );
            rtttlCode.value = melodyToRtttl(melody.value);
        }

        function openCodeDialog() {
            stopPreview();
            syncEditorState();
            if (showPresetTrackTabs.value || (!syncAll.value && editableEscs.value.length > 1)) {
                initializeMultiCodeEditor();
            } else initializeSingleCodeEditor();
            codeDiscardConfirm.value = false;
            codeBaseline = JSON.stringify([rtttlCode.value, multiCodeEntries.value.map((entry) => entry.code)]);
            codeDialogOpen.value = true;
        }

        function closeCodeDialog({ discard = false } = {}) {
            if (
                !discard &&
                JSON.stringify([rtttlCode.value, multiCodeEntries.value.map((entry) => entry.code)]) !== codeBaseline
            ) {
                codeDiscardConfirm.value = true;
                return;
            }
            codeDiscardConfirm.value = false;
            stopPreview();
            codeDialogOpen.value = false;
            multiCodeEntries.value = [];
            singleCodeSession = null;
        }

        function copyCode(code) {
            const onError = () => showMessage("无法复制 RTTTL 代码，请手动复制。", "error");
            try {
                BFClipboard.writeText(code, () => showMessage("RTTTL 代码已复制。", "success"), onError);
            } catch {
                onError();
            }
        }

        function pasteCode(assign) {
            const onError = () => showMessage("无法读取剪贴板，请直接粘贴代码。", "error");
            try {
                BFClipboard.readText((text) => {
                    assign(text);
                }, onError);
            } catch {
                onError();
            }
        }

        function copyRtttlCode() {
            copyCode(rtttlCode.value);
        }

        function pasteRtttlCode() {
            pasteCode((text) => {
                rtttlCode.value = text;
            });
        }

        function copyMultiRtttlCode(entry) {
            copyCode(entry.code);
        }

        function pasteMultiRtttlCode(entry) {
            pasteCode((text) => {
                entry.code = text;
            });
        }

        function codeMelodiesEqual(left, right) {
            if (!left || !right) return left === right;
            return cloneMelody(left).name === cloneMelody(right).name && melodiesEqual(left, right);
        }

        function saveSingleCode() {
            const imported = codePreview.value.melody;
            const session = singleCodeSession;
            if (!imported || !session) return false;
            if (rtttlCode.value === session.baselineCode) return true;
            if (codeMelodiesEqual(imported, session.baselineMelody)) return true;

            history.value = [...cloneMelodyHistory(session.baselineHistory), cloneMelody(session.baselineMelody)];
            future.value = [];
            activeLibrarySource.value = null;
            currentDraftId.value = session.baselineDraftId;
            applyMelody(imported);
            return true;
        }

        function savePresetTrackCodes(items) {
            let changed = false;
            for (const item of items) {
                const track = presetTrackSession.value?.tracks[item.entry.trackIndex];
                const session = item.entry.session;
                if (!track || !session || !item.preview.melody) return false;
                if (item.entry.code === session.baselineCode) continue;
                if (codeMelodiesEqual(item.preview.melody, session.baselineMelody)) continue;

                track.history = [...cloneMelodyHistory(session.baselineHistory), cloneMelody(session.baselineMelody)];
                track.future = [];
                track.melody = cloneMelody(item.preview.melody);
                changed = true;
            }
            if (changed) {
                syncPresetTracksToEscs();
                mirrorPresetTrackToRoll(activePresetTrack());
            }
            return true;
        }

        function saveEscChannelCodes(items) {
            let changed = false;
            for (const item of items) {
                const esc = item.esc;
                const session = item.entry.session;
                if (!esc || !session || !item.preview.melody) return false;
                if (item.entry.code === session.baselineCode) continue;
                if (codeMelodiesEqual(item.preview.melody, session.baselineMelody)) continue;

                esc.editorHistory = [
                    ...cloneMelodyHistory(session.baselineHistory),
                    cloneMelody(session.baselineMelody),
                ];
                esc.editorFuture = [];
                esc.editorSource = null;
                esc.editorDraftId = session.baselineDraftId;
                esc.editorMelody = cloneMelody(item.preview.melody);
                esc.melodyDirty =
                    Boolean(esc.melodyReplacementReady) || !melodiesEqual(esc.editorMelody, esc.originalMelody);
                changed = true;
            }
            if (changed && selectedEsc.value) mirrorEscEditorToRoll(selectedEsc.value);
            return true;
        }

        function saveCodeDialog() {
            if (!codeSaveReady.value) return;
            stopPreview();
            let saved;
            if (multiCodeMode.value) {
                const items = multiCodePreviewList.value;
                saved =
                    items[0]?.entry.trackIndex !== undefined ? savePresetTrackCodes(items) : saveEscChannelCodes(items);
            } else {
                saved = saveSingleCode();
            }
            if (saved) closeCodeDialog({ discard: true });
        }

        function mirrorPresetTrackToRoll(track) {
            if (!track) return;
            loadingEditor = true;
            melody.value = cloneMelody(track.melody);
            history.value = cloneMelodyHistory(track.history);
            future.value = cloneMelodyHistory(track.future);
            activeLibrarySource.value = null;
            currentDraftId.value = null;
            selectedNoteId.value = melody.value.notes[0]?.id || null;
            loadingEditor = false;
            void nextTick(scrollMelodyIntoView);
        }

        function mirrorEscEditorToRoll(esc) {
            loadingEditor = true;
            melody.value = cloneMelody(esc.editorMelody);
            history.value = cloneMelodyHistory(esc.editorHistory);
            future.value = cloneMelodyHistory(esc.editorFuture);
            activeLibrarySource.value = cloneLibrarySource(esc.editorSource);
            currentDraftId.value = esc.editorDraftId || null;
            selectedNoteId.value = melody.value.notes[0]?.id || null;
            loadingEditor = false;
            syncEditorState();
            void nextTick(scrollMelodyIntoView);
        }

        function formatRtttlError(error) {
            const message = error?.message || "";
            if (message === "RTTTL string is empty") return "代码不能为空。";
            if (message === "RTTTL requires name, defaults and notes") return "代码需要旋律名、默认参数和音符序列。";
            return `代码格式错误：${message}`;
        }

        function playMelody() {
            if (previewMode.value === "single") {
                stopPreview();
                return;
            }
            startAudioPreview([{ melody: effectiveMelody.value, id: null }], { highlight: true, mode: "single" });
        }

        function playAllMelodies() {
            if (previewMode.value === "all") {
                stopPreview();
                return;
            }
            if (!canPlayAllMelodies.value) return;
            startAudioPreview(allMelodyPreviewEntries.value, { highlight: true, mode: "all" });
        }

        function playCodeEntry(item) {
            if (activeCodePreviewIds.value.includes(item.entry.id)) {
                stopPreview();
                return;
            }
            if (!item.preview.melody || item.preview.error) return;
            startAudioPreview([{ melody: item.preview.melody, id: item.entry.id }], { mode: "code-single" });
        }

        function playSingleCode() {
            if (previewMode.value === "code-single") {
                stopPreview();
                return;
            }
            if (!codePreview.value.melody || !codePreview.value.pitchedNoteCount) return;
            startAudioPreview([{ melody: codePreview.value.melody, id: "single-code" }], { mode: "code-single" });
        }

        function playAllCodes() {
            if (activeCodePreviewIds.value.length) {
                stopPreview();
                return;
            }
            const playable = multiCodePreviewList.value
                .filter((item) => !item.preview.error && item.preview.pitchedNoteCount > 0)
                .map((item) => ({ melody: item.preview.melody, id: item.entry.id }));
            if (!playable.length) return;
            startAudioPreview(playable, { mode: "code-all" });
        }

        async function startAudioPreview(entries, { highlight = false, mode = "single" } = {}) {
            stopPreview();
            const request = previewRequest;
            const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!AudioContext) {
                showMessage("当前浏览器不支持 Web Audio 试听。", "error");
                return;
            }
            audioContext.value ||= new AudioContext();
            try {
                const context = await ensureAudioContextRunning(audioContext.value);
                if (request !== previewRequest) return false;
                previewOutput.value = context.createGain();
                previewOutput.value.gain.value = previewMuted.value ? 0 : previewVolume.value / 100;
                previewOutput.value.connect(context.destination);
                const startAt = context.currentTime + 0.04;
                const channelGain = previewGainForChannelCount(entries.length);
                let maxDuration = 0;
                for (const entry of entries) {
                    let previewMelody = normalizeMelody(entry.melody);
                    if ((entry.firmware || targetFirmware.value) === "blheli32") {
                        const target = validateMelody(previewMelody, { firmware: "blheli32" });
                        if (target.valid) {
                            const sourceTones = previewMelody.notes.filter((note) => !note.rest);
                            previewMelody = normalizeMelody(target.encoded.playbackMelody);
                            let toneIndex = 0;
                            for (const note of previewMelody.notes) {
                                if (!note.rest) note.id = sourceTones[toneIndex++]?.id || note.id;
                            }
                        }
                    }
                    const beatSeconds = 60 / previewMelody.bpm;
                    const waitSeconds = previewMelody.waitMs / 1000;
                    maxDuration = Math.max(maxDuration, melodyDurationMs(previewMelody));
                    for (const note of previewMelody.notes) {
                        if (note.rest || note.midi === null) continue;
                        const tone = scheduleEscPreviewTone(context, {
                            midi: note.midi,
                            start: startAt + waitSeconds + note.start * beatSeconds,
                            duration: note.duration * beatSeconds,
                            gain: channelGain,
                            destination: previewOutput.value,
                        });
                        audioNodes.push(tone.oscillator);
                        if (highlight) {
                            schedulePreviewHighlight(
                                note.id,
                                (tone.start - context.currentTime) * 1000,
                                (tone.end - tone.start) * 1000,
                            );
                        }
                    }
                }
                activeCodePreviewIds.value = entries.map((entry) => entry.id).filter(Boolean);
                previewMode.value = mode;
                playing.value = true;
                previewShowsTimeline.value = highlight;
                const clockStart = Date.now() + 40;
                previewClock = window.setInterval(() => {
                    previewElapsedMs.value = Math.max(0, Date.now() - clockStart);
                    const wrap = pianoRollWrap.value;
                    if (highlight && autoFollow.value && wrap) {
                        const x = Math.max(0, previewBeat.value) * zoomPixels.value;
                        if (x < wrap.scrollLeft || x > wrap.scrollLeft + wrap.clientWidth - 80)
                            wrap.scrollLeft = Math.max(0, x - wrap.clientWidth / 3);
                    }
                }, 40);
                previewTimer = window.setTimeout(() => {
                    if (playing.value) stopPreview();
                }, maxDuration + 160);
                return true;
            } catch (error) {
                if (request !== previewRequest) return false;
                stopPreview();
                showMessage(error?.message || "无法启动浏览器音频输出。", "error");
            }
        }

        function schedulePreviewHighlight(noteId, startDelayMs, durationMs) {
            previewHighlightTimers.push(
                window.setTimeout(
                    () => {
                        activePreviewNoteIds.value = [...new Set([...activePreviewNoteIds.value, noteId])];
                    },
                    Math.max(0, startDelayMs),
                ),
                window.setTimeout(
                    () => {
                        activePreviewNoteIds.value = activePreviewNoteIds.value.filter((id) => id !== noteId);
                    },
                    Math.max(0, startDelayMs + durationMs),
                ),
            );
        }

        function stopPreview() {
            auditionPresetId.value = null;
            previewRequest += 1;
            clearInterval(previewClock);
            previewClock = null;
            previewElapsedMs.value = 0;
            previewShowsTimeline.value = false;
            previewOutput.value?.disconnect?.();
            previewOutput.value = null;
            if (previewTimer !== null) {
                window.clearTimeout(previewTimer);
                previewTimer = null;
            }
            for (const timer of previewHighlightTimers.splice(0)) {
                window.clearTimeout(timer);
            }
            activePreviewNoteIds.value = [];
            activeCodePreviewIds.value = [];
            previewMode.value = null;
            for (const oscillator of audioNodes.splice(0)) {
                try {
                    oscillator.stop();
                } catch {
                    /* already stopped */
                }
            }
            playing.value = false;
        }

        function acquireSerialLock() {
            if (GUI.connect_lock) throw new Error("另一项串口操作正在进行，请稍后重试。");
            GUI.connect_lock = true;
            ownsSerialLock = true;
        }

        function releaseSerialLock() {
            if (!ownsSerialLock) return;
            GUI.connect_lock = false;
            ownsSerialLock = false;
        }

        function invalidateLocalEscBackup() {
            for (const esc of writableEscs.value) esc.backedUp = false;
            activeBackup.value = null;
            lastBackupFilename.value = "";
        }

        function resetRestoreSafety() {
            Object.keys(restoreChecks).forEach((key) => {
                restoreChecks[key] = false;
            });
            resetRestoreCurrentBackup();
        }

        function resetRestoreCurrentBackup() {
            restoreChecks.currentBackupReady = false;
            restorePreflightBackup.value = null;
            restoreBackupFilename.value = "";
        }

        function resetRestoreState({ close = true } = {}) {
            if (close) restoreOpen.value = false;
            restoreFileName.value = "";
            importedRestoreBackup.value = null;
            selectedRestoreChannels.value = [];
            restoreResult.value = null;
            restoreProgress.value = null;
            restoreProgressRows.value = [];
            resetRestoreSafety();
            if (restoreFileInput.value) restoreFileInput.value.value = "";
        }

        function chooseRestoreFile() {
            if (restoreResult.value?.ok === false && restoreRollbackCount.value) {
                restoreOpen.value = true;
                return;
            }
            if (!connected.value || !escs.value.length || locked.value) return;
            restoreFileInput.value?.click();
        }

        function closeRestoreDialog() {
            if (restoring.value || restoreBackingUp.value) return;
            if (restoreResult.value?.ok === false && restoreRollbackCount.value) {
                restoreOpen.value = false;
                return;
            }
            resetRestoreState();
        }

        async function handleRestoreFile(event) {
            const file = event.target?.files?.[0];
            if (!file) return;
            try {
                if (file.size > ESC_EEPROM_BACKUP_FILE_MAX_BYTES) {
                    throw new Error("EEPROM 备份文件超过 1 MiB，已拒绝导入。");
                }
                const contents = await readTextFile(file);
                const parsed = parseEscBackupFile(contents, { fileSize: file.size });
                const result = matchEscBackupForRestore(parsed, escs.value);
                importedRestoreBackup.value = parsed;
                restoreFileName.value = file.name || "EEPROM 备份.json";
                selectedRestoreChannels.value = result.matches
                    .filter((match) => match.valid)
                    .map((match) => match.backupEntry.channel);
                restoreResult.value = null;
                restoreProgress.value = null;
                resetRestoreSafety();
                restoreOpen.value = true;
                if (!result.validCount) {
                    showMessage("备份文件已导入，但没有与当前扫描结果严格匹配的可恢复通道。", "error");
                } else {
                    showMessage(`备份文件已校验，${result.validCount} 路电调可恢复。`, "info");
                }
            } catch (error) {
                resetRestoreState();
                showMessage(error?.message || "EEPROM 备份文件导入失败。", "error");
            } finally {
                if (event.target) event.target.value = "";
            }
        }

        async function backupRestoreTargets() {
            const targets = selectedRestoreMatches.value.map((match) => match.esc);
            if (!controller.value || !targets.length) return;
            restoreBackingUp.value = true;
            restoreResult.value = null;
            resetRestoreCurrentBackup();
            try {
                acquireSerialLock();
                await controller.value.backupEscs(targets);
                const backup = createEscBackupPackage(targets);
                saveEscBackup(backup);
                const filename = downloadEscBackup(backup);
                const persisted = getPersistedEscBackupStatus(backup.id, targets);
                if (!persisted.valid) throw new Error(persisted.errors[0]);
                restorePreflightBackup.value = persisted.backup;
                restoreBackupFilename.value = filename;
                restoreChecks.currentBackupReady = true;
                showMessage(`恢复前当前状态已保存并下载：${filename}`, "success");
            } catch (error) {
                resetRestoreCurrentBackup();
                showMessage(error?.message || "当前状态备份失败，EEPROM 恢复已禁用。", "error");
            } finally {
                releaseSerialLock();
                restoreBackingUp.value = false;
            }
        }

        function resetRestoredEscEditor(esc) {
            let current = null;
            if (esc.melodyReadStatus === ESC_MELODY_READ_STATUS.LOADED) {
                current = esc.currentMelody;
            } else if (esc.melodyReadStatus === ESC_MELODY_READ_STATUS.EMPTY) {
                current = createEmptyEscMelody(esc);
            }
            esc.originalMelody = current ? cloneMelody(current) : null;
            esc.editorMelody = current ? cloneMelody(current) : null;
            esc.editorHistory = [];
            esc.editorFuture = [];
            esc.editorSource = current ? { type: "current" } : null;
            esc.editorDraftId = null;
            esc.melodyReplacementReady = false;
            esc.melodyDirty = false;
        }

        function refreshEditorsAfterRestore(restoredEscs) {
            const restoredIds = new Set((restoredEscs || []).map((esc) => esc.id));
            for (const esc of escs.value) {
                if (restoredIds.has(esc.id)) resetRestoredEscEditor(esc);
            }
            recomputeMelodyMode();
        }

        function handleControllerProgress(progress) {
            if (
                restoring.value &&
                [
                    "restore",
                    "restoreVerify",
                    "restored",
                    "restoreFailed",
                    "recover",
                    "recoverVerify",
                    "recovered",
                    "recoverFailed",
                ].includes(progress?.phase)
            ) {
                const row = restoreProgressRows.value.find((item) => item.channel === progress.channel);
                if (row) {
                    row.state = progress.phase;
                    row.error = progress.error || "";
                }
            }
            if (
                [
                    "write",
                    "verify",
                    "written",
                    "failed",
                    "recover",
                    "recoverVerify",
                    "recovered",
                    "recoverFailed",
                ].includes(progress?.phase)
            ) {
                const row = writing.value
                    ? writeProgressRows.value.find((item) => item.channel === progress.channel)
                    : null;
                if (row) {
                    row.state = progress.phase;
                    row.error = progress.error || "";
                }
            }
            if (progress?.phase === "restore" || progress?.phase === "recover") {
                restoreProgress.value = progress;
            }
        }

        async function performRestore() {
            if (!controller.value || !restoreReady.value) return;
            const selected = [...selectedRestoreMatches.value];
            const targets = selected.map((match) => ({ esc: match.esc, backupEntry: match.backupEntry }));
            const currentTargets = selected.map((match) => match.esc);
            const persisted = getPersistedEscBackupStatus(restorePreflightBackup.value?.id, currentTargets);
            if (!persisted.valid) {
                resetRestoreSafety();
                showMessage(`恢复前当前状态备份校验失败：${persisted.errors[0]} 请重新备份。`, "error");
                return;
            }
            syncEditorState();
            restoring.value = true;
            restoreResult.value = null;
            restoreProgressRows.value = currentTargets.map((esc) => ({ channel: esc.channel, state: "pending" }));
            restoreProgress.value = { phase: "restore", index: 0, total: targets.length };
            try {
                acquireSerialLock();
                restoreResult.value = await controller.value.restoreBackup(targets);
                for (const row of restoreProgressRows.value) {
                    if (restoreResult.value.restored.some((esc) => esc.channel === row.channel)) row.state = "restored";
                    else if (restoreResult.value.failed?.channel === row.channel) {
                        row.state = "restoreFailed";
                        row.error = restoreResult.value.error?.message;
                    } else row.state = "skipped";
                }
                refreshEditorsAfterRestore(restoreResult.value.restored);
                invalidateLocalEscBackup();
                resetRestoreSafety();
                if (restoreResult.value.ok) {
                    showMessage(`已恢复并校验 ${restoreResult.value.restored.length} 路完整 EEPROM。`, "success");
                } else {
                    showMessage(restoreResult.value.error?.message || "EEPROM 恢复失败，后续通道已停止。", "error");
                }
            } catch (error) {
                invalidateLocalEscBackup();
                resetRestoreSafety();
                restoreResult.value = { ok: false, restored: [], rollback: [], failed: null, error };
                showMessage(error?.message || "EEPROM 恢复失败，串口已恢复普通 MSP。", "error");
            } finally {
                releaseSerialLock();
                restoring.value = false;
            }
        }

        async function rollbackRestore() {
            const targets = restoreRollbackTargets.value;
            if (!targets.length || !controller.value) return;
            restoring.value = true;
            restoreProgress.value = { phase: "recover", index: 0, total: targets.length };
            try {
                acquireSerialLock();
                const recovered = await controller.value.recoverEscs(targets);
                refreshEditorsAfterRestore(recovered);
                invalidateLocalEscBackup();
                restoreResult.value = { ok: true, restored: recovered, rollback: [], rolledBack: true };
                showMessage("已回滚到本次 EEPROM 恢复开始前的当前状态。", "success");
            } catch (error) {
                showMessage(error?.message || "回滚失败，请保持供电并重试。", "error");
            } finally {
                releaseSerialLock();
                restoring.value = false;
            }
        }

        async function scanEscs() {
            if (!connected.value || scanning.value || locked.value) return;
            if (
                writeRecoveryTargets.value.length ||
                (restoreResult.value?.ok === false && restoreRollbackCount.value)
            ) {
                showMessage("请先恢复受影响通道，原始备份必须保留。", "error");
                return;
            }
            writeProgressRows.value = [];
            if (!stashEditorBeforeSwitch({ force: offlineSelection.value })) return;
            stopPreview();
            scanning.value = true;
            writeResult.value = null;
            safetyOpen.value = false;
            activeBackup.value = null;
            lastBackupFilename.value = "";
            escs.value = [];
            selectedEscId.value = null;
            multiCodeEntries.value = [];
            codeDialogOpen.value = false;
            melodyConflict.value = false;
            syncConfirmOpen.value = false;
            resetRestoreState();
            controller.value ||= new EscFourWayController({
                onProgress: handleControllerProgress,
                probeAlive: true,
                passthroughExitDelay: 600,
            });
            try {
                acquireSerialLock();
                escs.value = await controller.value.scan();
                initializeEscEditorState(escs.value);
                if (identifiedEscCount.value) {
                    showMessage(
                        `扫描完成：识别到 ${identifiedEscCount.value} 路电调，${writableEscs.value.length} 路支持写入；已读取支持布局的当前音乐。`,
                        "success",
                    );
                } else {
                    showMessage(
                        `扫描完成：未识别到电调，已检查 ${escs.value.length} 路通道。请确认电调已稳定供电。`,
                        "info",
                    );
                }
            } catch (error) {
                if (error.escs?.length) {
                    escs.value = error.escs;
                    initializeEscEditorState(escs.value);
                }
                showMessage(error?.message || "4-way 扫描失败，串口已恢复普通 MSP。", "error");
            } finally {
                releaseSerialLock();
                scanning.value = false;
            }
        }

        function openSafety() {
            if (restoreResult.value?.ok === false && restoreRollbackCount.value) {
                restoreOpen.value = true;
                return;
            }
            if (writeRecoveryTargets.value.length) {
                safetyOpen.value = true;
                return;
            }
            writeResult.value = null;
            writeProgressRows.value = [];
            if (!escs.value.length) {
                showMessage("请先扫描电调后再安全写入。", "error");
                return;
            }
            syncEditorState();
            if (!pendingWriteEscs.value.length) {
                showMessage("当前没有已修改的电调音乐，无需写入。", "info");
                return;
            }
            if (!writeValidation.value.valid) {
                showMessage(writeValidation.value.errors[0] || "待写旋律未通过校验。", "error");
                return;
            }
            safetyOpen.value = true;
        }

        async function backupAll() {
            if (!controller.value) return;
            backingUp.value = true;
            activeBackup.value = null;
            lastBackupFilename.value = "";
            try {
                acquireSerialLock();
                await controller.value.backupEscs(writableEscs.value);
                const backup = createEscBackupPackage(writableEscs.value);
                saveEscBackup(backup);
                const filename = downloadEscBackup(backup);
                const persisted = getPersistedEscBackupStatus(backup.id, writableEscs.value);
                if (!persisted.valid) throw new Error(persisted.errors[0]);
                activeBackup.value = persisted.backup;
                lastBackupFilename.value = filename;
                showMessage(`原始 EEPROM 已保存到本地历史并下载：${filename}`, "success");
            } catch (error) {
                activeBackup.value = null;
                lastBackupFilename.value = "";
                showMessage(error?.message || "本地备份失败，仍可继续写入。", "error");
            } finally {
                releaseSerialLock();
                backingUp.value = false;
            }
        }

        async function performWrite() {
            if (!controller.value || writing.value || writeResult.value?.ok || writeRecoveryTargets.value.length)
                return;
            syncEditorState();
            const targets = [...pendingWriteEscs.value];
            if (!targets.length || !writeValidation.value.valid) {
                showMessage(writeValidation.value.errors[0] || "当前没有可写入的修改。", "error");
                return;
            }
            if (!safetyReady.value) return;
            writing.value = true;
            writeProgressRows.value = targets.map((esc) => ({ channel: esc.channel, state: "pending" }));
            try {
                acquireSerialLock();
                const output = new Map(targets.map((esc) => [esc.id, cloneMelody(outputMelodyForEsc(esc))]));
                const writtenVoices = presetTrackSession.value
                    ? {
                        session: presetTrackSession.value,
                        tracks: outputTracks.value.map(cloneMelody),
                        byEsc: new Map(targets.map((esc) => [esc.id, voiceIndexForEsc(esc)])),
                    }
                    : null;
                writeResult.value = await controller.value.writeMelody(targets, (esc) => output.get(esc.id));
                for (const row of writeProgressRows.value) {
                    if (writeResult.value.written.some((esc) => esc.channel === row.channel)) row.state = "written";
                    else if (writeResult.value.failed?.channel === row.channel) {
                        row.state = "failed";
                        row.error = writeResult.value.error?.message;
                    } else row.state = "skipped";
                }
                if (writeResult.value.ok) {
                    for (const esc of writeResult.value.written) {
                        if (esc.firmwareFamily !== "blheli32" || !esc.currentMelody)
                            esc.currentMelody = cloneMelody(output.get(esc.id));
                        if (writtenVoices && esc.firmwareFamily === "blheli32") {
                            writtenVoices.tracks[writtenVoices.byEsc.get(esc.id)] = cloneMelody(esc.currentMelody);
                        }
                        esc.editorMelody = cloneMelody(esc.currentMelody);
                        esc.originalMelody = cloneMelody(esc.editorMelody);
                        esc.editorSource = { type: "current" };
                        esc.editorDraftId = null;
                        esc.melodyReplacementReady = false;
                        esc.melodyDirty = false;
                        esc.melodyReadStatus = ESC_MELODY_READ_STATUS.LOADED;
                    }
                    if (writtenVoices && presetTrackSession.value === writtenVoices.session) {
                        writtenVoices.session.tracks.forEach((track, index) => {
                            track.melody = cloneMelody(writtenVoices.tracks[index]);
                            track.originalMelody = cloneMelody(track.melody);
                            track.history = [];
                            track.future = [];
                            track.draftId = null;
                        });
                        loadingEditor = true;
                        try {
                            melody.value = cloneMelody(activePresetTrack().melody);
                            editorBaseline.value = cloneMelody(melody.value);
                            history.value = [];
                            future.value = [];
                        } finally {
                            loadingEditor = false;
                        }
                        syncPresetTracksToEscs();
                    }
                    if (writeResult.value.written.some((esc) => esc.id === selectedEscId.value)) {
                        currentDraftId.value = null;
                        setActiveLibrarySource({ type: "current" });
                        if (!writtenVoices && selectedEsc.value?.firmwareFamily === "blheli32") {
                            loadingEditor = true;
                            melody.value = cloneMelody(selectedEsc.value.editorMelody);
                            editorBaseline.value = cloneMelody(melody.value);
                            loadingEditor = false;
                        }
                    }
                    for (const esc of writableEscs.value) esc.backedUp = false;
                    activeBackup.value = null;
                    lastBackupFilename.value = "";
                    showMessage(`已串行写入并校验 ${writeResult.value.written.length} 路电调。`, "success");
                    // Keep verified channel results visible until the user closes the task.
                } else {
                    showMessage(writeResult.value.error?.message || "写入失败，已停止后续通道。", "error");
                }
            } catch (error) {
                const touched = targets.filter((esc) => esc.writeTouched);
                writeResult.value = {
                    ok: false,
                    error,
                    written: targets.filter((esc) => esc.verified),
                    rollback: touched,
                    failed: targets.find((esc) => esc.writeTouched && !esc.verified),
                };
                for (const row of writeProgressRows.value)
                    if (row.state === "pending") row.state = "skipped";
                    else if (!["written", "recovered"].includes(row.state)) {
                        row.state = "failed";
                        row.error = error.message;
                    }
                showMessage(error?.message || "写入失败，串口已恢复普通 MSP。", "error");
            } finally {
                releaseSerialLock();
                writing.value = false;
            }
        }

        async function recoverWritten() {
            const targets = [...writeRecoveryTargets.value];
            if (!targets.length || !controller.value) return;
            writing.value = true;
            try {
                acquireSerialLock();
                const recovered = await controller.value.recoverEscs(targets);
                for (const row of writeProgressRows.value)
                    if (recovered.some((esc) => esc.channel === row.channel)) {
                        row.state = "recovered";
                        row.error = "";
                    }
                refreshEditorsAfterRestore(recovered);
                invalidateLocalEscBackup();
                showMessage(`已恢复并校验 ${targets.length} 路受影响电调的原始 EEPROM。`, "success");
                writeResult.value = null;
            } catch (error) {
                showMessage(error?.message || "恢复失败，请保持供电并重试。", "error");
            } finally {
                releaseSerialLock();
                writing.value = false;
            }
        }

        function handleBeforeUnload(event) {
            const unsafeToLeave =
                writing.value ||
                restoring.value ||
                writeRecoveryTargets.value.length > 0 ||
                (restoreResult.value?.ok === false && restoreRollbackCount.value > 0) ||
                escs.value.some((esc) => esc.writeTouched || esc.restoreTouched);
            if (unsafeToLeave || !stashEditorBeforeSwitch()) {
                event.preventDefault();
                event.returnValue = "";
            }
        }

        onMounted(() => {
            window.addEventListener("beforeunload", handleBeforeUnload);
            document.addEventListener("keydown", handleDialogKeydown);
            GUI.content_ready();
            void nextTick(scrollMelodyIntoView);
        });
        onBeforeUnmount(() => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("keydown", handleDialogKeydown);
            stashEditorBeforeSwitch();
            stopPreview();
            stopNoteDrag();
            releaseSerialLock();
            void controller.value?.exit?.().catch(() => {});
        });

        return {
            automaticBl32,
            effectiveMelody,
            stopPreview,
            melody,
            targetCapacity,
            drafts,
            draftLimit,
            draftDirty,
            draftSaving,
            draftSaveStatus,
            draftModalOpen,
            draftMenuId,
            draftImportInput,
            draftDeleteTarget,
            draftNameDialogOpen,
            draftNameMode,
            draftName,
            draftNameError,
            draftNameInput,
            contributionDialogOpen,
            qqQrUrl,
            escs,
            presets,
            presetQuery,
            filteredPresets,
            presetCompatibility,
            keys,
            rtttlBpmMin,
            rtttlBpmMax,
            durations,
            pitchOptions,
            noteRows,
            pianoRollStyle,
            syncAll,
            readStatus,
            selectedEscId,
            selectedEsc,
            displayedEscs,
            escModelSummary,
            editableEscs,
            showPresetTrackTabs,
            presetTrackTabs,
            activePresetTrackIndex,
            showEscTabs,
            melodyConflict,
            syncConfirmOpen,
            activeLibrarySource,
            currentMelodySource,
            currentMelodySourceActive,
            currentMelodySourceSummary,
            melodyLibraryCount,
            currentDraftId,
            selectedNoteId,
            pianoRollWrap,
            selectedNote,
            history,
            future,
            connected,
            connectionSummary,
            identifiedEscCount,
            validation,
            targetFirmware,
            codePreview,
            codeSaveReady,
            sharedCodeTargetPreviews,
            multiCodeMode,
            multiCodeEntries,
            multiCodePreviewList,
            multiCodePlayableCount,
            timelineBeats,
            timelineStyle,
            safetyOpen,
            codeDialogOpen,
            rtttlCode,
            restoreFileInput,
            restoreOpen,
            restoreFileName,
            restoreBackupCreatedAt,
            restoreMatches,
            restoreValidCount,
            selectedRestoreChannels,
            selectedRestoreMatches,
            restoreChecks,
            restoreSafetyItems,
            restoreBackupSummary,
            restoreBackingUp,
            restoring,
            restoreProgressRows,
            restoreProgress,
            restoreResult,
            restoreRollbackCount,
            restoreReady,
            safetyChecks,
            safetyCheckItems,
            safetyReady,
            backupSummary,
            writableEscs,
            dirtyEscs,
            pendingWriteEscs,
            pendingWriteEscIds,
            safetyWriteMelodySummary,
            writeValidation,
            syncSourceLabel,
            actionbarStatusText,
            safetyWriteDisabledReason,
            operationMessage,
            operationType,
            scanning,
            backingUp,
            writing,
            playing,
            activePreviewNoteIds,
            activeCodePreviewIds,
            previewMode,
            currentMelodyPlayable,
            canPlayAllMelodies,
            locked,
            favoriteIds,
            recentIds,
            presetScope,
            presetVoices,
            auditionPresetId,
            editRecovery,
            toggleFavorite,
            focusLibrary,
            previewLibraryPreset,
            restoreEditorRecovery,
            exportEditorRecovery,
            modalOpen,
            codeDiscardConfirm,
            workspaceView,
            librarySection,
            deviceDetailsOpen,
            deviceInspectionId,
            inspectedDeviceId,
            openDeviceDetails,
            closeDeviceDetails,
            headerConnectionLabel,
            selectionPreviewPlayable,
            toggleSelectionPreview,
            selectedLibraryDescription,
            previewVoiceCount,
            libraryTrackCount,
            libraryDuration,
            zoomPixels,
            editorTool,
            snapStep,
            autoFollow,
            previewVolume,
            previewMuted,
            previewShowsTimeline,
            previewBeat,
            timelineWidth,
            timelineTicks,
            presetSessionName,
            fitTimeline,
            locateSelectedNote,
            onNoteKeydown,
            selectNoteFromList,
            editNoteFromList,
            arrangementMode,
            changeArrangement,
            arrangementLabel,
            assignmentRows,
            completedWriteRows,
            safetyChannelRows,
            assignmentWarnings,
            assignmentAccepted,
            assignVoice,
            deviceReadiness,
            hasDeviceIssues,
            operationReadiness,
            writeProgressRows,
            closeSafety,
            writeResult,
            writeRecoveryTargets,
            loadCurrentMelody,
            loadPreset,
            loadDraft,
            newDraft,
            renameDraft,
            toggleDraftMenu,
            duplicateDraft,
            confirmDeleteDraft,
            closeDeleteDraftDialog,
            deleteDraft,
            trapDialogFocus,
            openContributionDialog,
            closeContributionDialog,
            exportDraftRtttl,
            exportAllDrafts,
            chooseDraftImport,
            handleDraftImport,
            closeDraftNameDialog,
            confirmDraftName,
            clearActiveLibrarySource,
            isEscMelodyEditable,
            selectEscChannel,
            selectPresetTrack,
            replaceUnreadableEsc,
            handleSyncModeChange,
            confirmSyncAll,
            cancelSyncAll,
            melodyReadLabel,
            saveDraft,
            normalizeEditor,
            addNote,
            addNoteAtPointer,
            startNoteDrag,
            undo,
            redo,
            updateSelected,
            removeNote,
            noteName,
            noteStyle,
            formatBeat,
            formatDuration,
            formatDraftDate,
            openCodeDialog,
            closeCodeDialog,
            saveCodeDialog,
            copyRtttlCode,
            pasteRtttlCode,
            copyMultiRtttlCode,
            pasteMultiRtttlCode,
            playMelody,
            playAllMelodies,
            playCodeEntry,
            playSingleCode,
            playAllCodes,
            openSafety,
            scanEscs,
            chooseRestoreFile,
            closeRestoreDialog,
            handleRestoreFile,
            backupRestoreTargets,
            performRestore,
            rollbackRestore,
            restoreFirmwareLabel,
            formatRestoreAddress,
            failedFirmwareDetectionCount,
            firmwareDetectionLabel,
            backupAll,
            performWrite,
            recoverWritten,
        };
    },
});

function readTextFile(file) {
    if (typeof file?.text === "function") return file.text();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result || "")));
        reader.addEventListener("error", () => reject(reader.error || new Error("无法读取 EEPROM 备份文件。")));
        reader.readAsText(file);
    });
}

function safeFilename(value) {
    return (
        String(value || "esc-melody")
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
            .slice(0, 64) || "esc-melody"
    );
}

function downloadTextFile(filename, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], { type: `${type};charset=utf-8` }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

function restoreFirmwareLabel(firmwareFamily) {
    const labels = {
        bluejay: "Bluejay",
        am32: "AM32",
        ox32: "OX32",
        blheli32: "BLHeli_32",
        unknown: "未知固件",
    };
    return labels[firmwareFamily] || firmwareFamily || "未知固件";
}

function formatRestoreAddress(address) {
    return Number.isInteger(address) ? `0x${address.toString(16).toUpperCase()}` : "--";
}
</script>
