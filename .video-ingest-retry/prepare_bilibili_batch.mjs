import { mkdir, readFile, writeFile } from "node:fs/promises";

const plans = {
    BV17D4y1r7jL: {
        categories: "setup,ports,configuration,power,failsafe,receiver,osd",
        tags: "Betaflight,初始设置,端口,电池,失控保护,PID",
        summary: "讲解首次连接 Betaflight Configurator 后的基础检查、固件更新、端口配置、传感器校准和常用页面设置。",
        preconditions: ["已断开螺旋桨并接好图传天线。", "已确认飞控、接收机、GPS 或图传的实际接线端口。"],
        steps: ["连接飞控并确认串口及驱动状态。", "按视频说明选择飞控目标并更新固件。", "校准加速度计，检查三维模型动作与实机方向一致。", "在端口页面按接线启用接收机、GPS 或 MSP，保存并重启。", "完成电池电压校准、失控保护和基础 PID 页面检查。"],
        parameters: ["视频建议初次飞行前不要盲目改动 PID 与滤波参数。", "解锁角度、Air Mode、OSD、GPS 与失控保护应按机型和实际用途设置。"],
        warnings: ["USB 供电可能会启动部分图传，未接天线时不要长时间上电。", "串口功能必须对应实际焊接的 UART，避免重复启用串行接收机。"],
        terms: ["UART：飞控硬件串口。", "MSP：用于飞控与外设通信的协议。", "Air Mode：低油门时仍保持姿态控制的功能。"],
    },
    BV1rPwyzLEEg: {
        categories: "pid-tuning",
        tags: "Betaflight,PID,调参流程,试飞,电机温度",
        summary: "介绍 Betaflight PID 调参前的准备、试飞观察和按飞行现象逐项调整的基本流程。",
        preconditions: ["飞机基础装配、接收机和电机方向已确认。", "准备安全试飞场地，并能在落地后检查电机温度。"],
        steps: ["从默认参数开始完成短时试飞。", "记录跟手、回弹、震荡和刹停等现象。", "一次只调整一类 PID 参数后再次试飞。", "结合飞行表现和电机温度确定是否继续调整。"],
        parameters: ["视频强调 PID 没有脱离机型、桨叶和飞行风格的固定通用值。", "具体数值以视频中的实际试飞判断为准。"],
        warnings: ["每次只改少量参数，避免无法判断变化来源。", "出现异常震荡或电机过热时应停止继续加大参数。"],
        terms: ["PID：姿态控制的比例、积分、微分调节。", "回弹：动作结束后的反向或二次摆动。"],
    },
    BV1tf421o7hH: {
        categories: "vtx,osd,presets",
        tags: "模拟图传,OSD,预设,Betaflight,视频发送",
        summary: "说明模拟图传系统的基础组成，以及在 Betaflight 中使用预设配置 OSD 和模拟图传相关设置的思路。",
        preconditions: ["已确认视频发送端、摄像头和飞控之间的接线。", "已断桨并使用合适天线后再上电检查图传。"],
        steps: ["确认模拟图传系统的供电与信号链路。", "进入预设页面选择与实际硬件相符的配置。", "应用预设后检查 OSD 显示和图传通信状态。", "保存并重启，再通过眼镜或显示端确认效果。"],
        parameters: ["预设必须匹配实际视频发送端和接线方式。", "视频未明确说明的功率、频道和协议参数不应照搬。"],
        warnings: ["图传上电前必须连接天线。", "不匹配的预设可能改变不应启用的端口或外设设置。"],
        terms: ["OSD：叠加在图传画面上的飞控信息。", "VTX：视频发送端。", "预设：Betaflight 提供的一组配置变更。"],
    },
    BV1iZoVBgEJv: {
        categories: "pid-tuning",
        tags: "PID,PID曲线,Betaflight,飞行表现,电机温度",
        summary: "围绕 PID 曲线和飞行表现，分享识别参数偏高或偏低的方法及试飞后的检查重点。",
        preconditions: ["已能稳定完成短时试飞。", "可在安全状态下检查电机温度和飞行响应。"],
        steps: ["观察飞行中的响应、刹停和姿态保持。", "根据现象判断需要关注的 PID 方向。", "每次调整后重复相同的试飞动作。", "在参数变化后检查电机温度与异常声音。"],
        parameters: ["视频以曲线和实飞感受说明 PID 关系，不提供通用固定参数。", "不同机架、桨叶和动力配置需要重新验证。"],
        warnings: ["不要仅根据曲线或他人参数跳过试飞。", "电机明显发烫或飞行震荡时应及时降低风险并复查。"],
        terms: ["PID 曲线：反映控制器各项输出变化的曲线。", "D 值：与阻尼和刹停表现相关的 PID 项。"],
    },
    BV1gk4y1u7yv: {
        categories: "gps,sensors,ports,configuration",
        tags: "罗盘,GPS,传感器,UART,Betaflight",
        summary: "介绍在 Betaflight 飞控上增加罗盘硬件时的接线、端口配置、传感器启用与校准检查。",
        preconditions: ["已确认 GPS 和罗盘模块的供电、TX/RX 与总线接线。", "知道模块接入飞控的 UART 或 I2C 接口。"],
        steps: ["按模块线序连接 GPS、罗盘与飞控。", "在端口页面选择对应 UART 的 GPS 功能。", "在配置页面启用相关传感器和协议。", "校准并检查传感器方向与数据状态。"],
        parameters: ["波特率和协议需与模块实际输出一致；不确定时按视频的自动设置方式检查。", "视频未确认的模块兼容性和具体协议不可自行假定。"],
        warnings: ["TX/RX 接线和端口选择错误会导致 GPS 或罗盘无法识别。", "校准应在远离磁性干扰源的环境中进行。"],
        terms: ["罗盘：提供航向信息的磁力计。", "GPS：卫星定位模块。", "I2C：常用于传感器连接的总线。"],
    },
    BV17gopBPEkj: {
        categories: "pid-tuning,blackbox",
        tags: "PID,室内试飞,黑盒子,电机温度,Betaflight",
        summary: "展示室内条件下的 PID 调参实操思路，包括试飞动作、参数变化观察和黑盒子分析的边界。",
        preconditions: ["室内场地具备足够安全距离，飞机和电池状态正常。", "已完成基础检查，并了解黑盒子记录的使用条件。"],
        steps: ["从稳定的基础参数开始做短时试飞。", "使用一致动作比较跟手、回弹和震荡。", "按视频顺序逐项调整并复飞验证。", "必要时结合黑盒子数据复查振动与滤波问题。"],
        parameters: ["视频把参数调整建立在实际飞行表现上，不建议照抄演示数值。", "黑盒子用于辅助判断，不能替代基础机械检查。"],
        warnings: ["室内试飞需要更严格的安全边界。", "电机温度异常、持续震荡或异常声音出现时立即停止。"],
        terms: ["黑盒子：飞控日志记录功能。", "滤波：用于抑制传感器和机械噪声的设置。"],
    },
    BV1Fuw2zDEy3: {
        categories: "pid-tuning",
        tags: "PID,P值,I值,D值,Betaflight",
        summary: "讲解 PID 三项的基础作用和以实飞反馈为核心的调整顺序。",
        preconditions: ["已能安全悬停和完成基础姿态动作。", "有条件在每次试飞后检查电机温度。"],
        steps: ["先建立对当前响应和跟手程度的判断。", "根据视频方法调整 P 值并重新试飞。", "再通过姿态保持表现检查 I 值。", "通过刹停、回弹和温度表现检查 D 值。"],
        parameters: ["视频强调从整体手感出发逐步细调。", "数值应随机型和实际飞行表现验证。"],
        warnings: ["参数过高可能带来震荡或电机升温。", "不要在未验证前一次性大幅改动多个项目。"],
        terms: ["P 值：影响响应和跟手感。", "I 值：影响持续姿态修正。", "D 值：影响阻尼和刹停表现。"],
    },
    BV16K41127Bn: {
        categories: "setup,configuration",
        tags: "Betaflight,固件升级,Configurator,初始调参",
        summary: "讲解升级 Betaflight 固件和 Configurator 后进行基础调参前检查的流程。",
        preconditions: ["已确认飞控目标名称并备份需要保留的配置。", "使用可靠 USB 线，并在图传已接天线的状态下上电。"],
        steps: ["确认飞控目标和所需 Betaflight 版本。", "在 Configurator 中下载或选择固件并按视频操作烧录。", "重新连接飞控，检查基础页面和传感器状态。", "在开始 PID 调整前保持默认参数并完成试飞验证。"],
        parameters: ["固件目标必须与飞控硬件一致。", "视频未明确说明的版本和自定义选项不应自行补充。"],
        warnings: ["刷错目标或跳过备份可能导致无法恢复原配置。", "升级后应重新核对端口、接收机与传感器设置。"],
        terms: ["Configurator：Betaflight 地面站。", "固件目标：与飞控硬件匹配的编译目标。"],
    },
    BV1Mnw7zSEnF: {
        categories: "pid-tuning",
        tags: "PID,Betaflight,调参基础,飞行手感",
        summary: "PID 教学第一部分，介绍调参的目标、基础概念和通过实飞建立判断标准的方法。",
        preconditions: ["飞机机械状态正常，默认参数可以安全试飞。", "准备固定的测试动作和电机温度检查。"],
        steps: ["理解 PID 调整以飞行表现为依据。", "从默认或已知稳定参数开始试飞。", "记录响应、姿态保持和刹停等现象。", "为后续逐项调整建立可重复的测试方式。"],
        parameters: ["视频不把单一数值视为所有飞机的答案。", "不同动力、桨叶和机架需要独立验证。"],
        warnings: ["不要把经验参数直接用于未经检查的新机。", "先排除机械振动和装配问题，再判断 PID。"],
        terms: ["默认参数：固件提供的初始控制参数。", "机械振动：可能影响飞控控制与滤波判断的物理振动。"],
    },
    BV1NKg4z8EqL: {
        categories: "pid-tuning",
        tags: "PID,模拟器,P值,I值,D值,Dmax,前馈",
        summary: "PID 个人经验分享第四部分，通过模拟器演示参数变化对应的飞行表现，并强调最终应由真机验证。",
        preconditions: ["已理解基础 PID 项含义。", "真机试飞时能够检查电机温度与异常震荡。"],
        steps: ["用视频中的动作观察响应和回弹。", "先建立适合的整体响应，再检查姿态保持与刹停。", "结合电机温度逐步逼近可接受范围。", "将模拟器中的判断带回真机做小幅验证。"],
        parameters: ["视频明确说明模拟器不能完整体现真实飞行中的 PID 效果。", "D max 和前馈应结合实际飞行感受与温度检查调整。"],
        warnings: ["不能把模拟器的参数直接当作真机最终参数。", "电机烫手、明显震荡或异常声音是停止加大参数的信号。"],
        terms: ["D max：D 项的动态上限设置。", "前馈：根据操纵输入预先增加控制响应的设置。"],
    },
    BV1Tx31zpEnM: {
        categories: "pid-tuning,osd",
        tags: "PID,OSD,遥控器,Betaflight",
        summary: "说明通过 OSD 调参页面进入 PID 设置、查看主要项目并保存退出的操作方法。",
        preconditions: ["OSD 已能在图传画面中显示。", "遥控器通道和摇杆方向已确认，操作时遵守断桨安全要求。"],
        steps: ["按视频的摇杆组合进入 OSD PID 调参页面。", "在菜单中查看 P、I、D、前馈和相关项目。", "按视频说明完成所需调整。", "返回菜单并选择保存退出，使设置生效。"],
        parameters: ["视频强调设置后必须执行保存退出。", "具体 PID 数值需要配合后续实飞教学判断。"],
        warnings: ["带桨在室内上电和调参有风险，应按视频安全提醒操作。", "不要误选菜单项目或未保存就断电。"],
        terms: ["OSD 菜单：通过图传画面显示的飞控菜单。", "前馈：与操纵输入响应相关的 PID 设置。"],
    },
    BV1SV3XzCEPG: {
        categories: "pid-tuning",
        tags: "PID,P值,I值,D值,Betaflight",
        summary: "用简短示例说明 P、I、D 三项在响应、姿态修正和阻尼中的基本作用。",
        preconditions: ["已了解 PID 调整应通过安全试飞验证。"],
        steps: ["理解 P 值与响应和跟手程度的关系。", "理解 I 值用于持续姿态修正。", "理解 D 值与阻尼及刹停力度的关系。", "在后续实飞中按现象逐步验证这些判断。"],
        parameters: ["视频未提供通用固定 PID 数值。", "参数调整需要结合飞机实际表现。"],
        warnings: ["仅理解概念不能替代试飞和温度检查。", "避免同时大幅修改多项 PID。"],
        terms: ["P 值：比例控制项。", "I 值：积分控制项。", "D 值：微分控制项。"],
    },
};

const replacements = [
    [/\bBetafly\b/gi, "Betaflight"],
    [/\bpad\b/gi, "PID"],
    [/\bPAID\b/g, "PID"],
    [/\bair mod\b/gi, "Air Mode"],
    [/\bOSD\b/gi, "OSD"],
    [/\bURT\b/gi, "UART"],
    [/\bPI D\b/gi, "PID"],
];

function calibrate(lines) {
    return lines.map((line) => {
        let text = String(line).trim();
        for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
        return { text };
    }).filter((line) => line.text);
}

function markdown(title, bvid, plan) {
    const list = (items) => items.map((item) => "- " + item).join("\n");
    return [
        "# " + title,
        "",
        "## 本教程讲什么",
        plan.summary,
        "",
        "## 适用场景与前置条件",
        list(plan.preconditions),
        "",
        "## 操作步骤",
        plan.steps.map((item, index) => (index + 1) + ". " + item).join("\n"),
        "",
        "## Betaflight 参数与界面说明",
        list(plan.parameters),
        "",
        "## 常见错误与注意事项",
        list(plan.warnings),
        "",
        "## 术语表",
        list(plan.terms),
        "",
        "## 视频章节",
        "### 操作与验证",
        "目标：按视频顺序完成设置或试飞验证。",
        "",
        "步骤：结合视频内容执行上述操作步骤。",
        "",
        "注意事项：没有可靠官方时间轴，本教程不提供猜测的章节时间。",
        "",
        "## 来源",
        "原视频：https://www.bilibili.com/video/" + bvid + "/",
    ].join("\n");
}

await mkdir(".video-ingest-retry/prepared", { recursive: true });
const manifest = [];
for (const [bvid, plan] of Object.entries(plans)) {
    const raw = JSON.parse(await readFile(".video-ingest-retry/mcp-raw/" + bvid + ".json", "utf8"));
    const metadataResponse = await fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid);
    const metadataPayload = await metadataResponse.json();
    if (!metadataResponse.ok || metadataPayload.code !== 0 || !metadataPayload.data) {
        throw new Error("Could not fetch Bilibili metadata for " + bvid);
    }
    const title = String(metadataPayload.data.title).trim();
    await writeFile(".video-ingest-retry/prepared/" + bvid + ".calibrated.json", JSON.stringify({
        language: "zh-CN",
        version: 1,
        lines: calibrate(raw.content),
    }, null, 2) + "\n");
    await writeFile(".video-ingest-retry/prepared/" + bvid + ".md", markdown(title, bvid, plan) + "\n");
    await writeFile(".video-ingest-retry/prepared/" + bvid + ".metadata.json", JSON.stringify(metadataPayload.data, null, 2) + "\n");
    manifest.push({ bvid, categories: plan.categories, tags: plan.tags, title });
}
await writeFile(".video-ingest-retry/prepared/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest.map((item) => ({ bvid: item.bvid, title: item.title })), null, 2));
