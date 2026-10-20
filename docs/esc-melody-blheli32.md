# BLHeli_32 电调音乐支持

当前支持的已核验配置：**FPV32 / AT32F421 / BLHeli_32 32.10 / 布局0x30 / 引导标记0x6E**。
其他BLHeli_32目标或版本不会仅凭ARM签名开放读写；AM32和OX32仍走各自识别流程。

## 已接入

- 扫描、识别、整块配置解码和当前音乐读取。
- 48字节原生音符编码，音域C4–B7；等待和休止符计入同一容量。
- 串行写入、解码后完整配置读回校验、失败回滚及本地备份恢复。
- 只修改逻辑偏移0x1C与0x90–0xBF，保留型号、MCU、名称及其他配置字节。
- 对当前引导版本发送256字节编码配置，不发送分页擦除命令。
- 草稿保存、导出和导入保留原生音长/间隔元数据；编辑后重新编码。
- 冷初始化失败时采用有界ARM恢复流程；已正常初始化的通道不额外Reset。

## 音乐限制

BLHeli_32没有Bluejay的任意BPM头，使用离散音长档位。
编码会选择可表达的档位；单个音符超过max(1ms,5%)偏差时拒绝编码，
允许的偏差超过1ms时会显示提示，电脑试听采用实际目标编码后的时序。
超过48个编码事件、超出音域、重叠音符或不能表达的时值不会截断或静默修复。

Music Off是模式0xFF；备份保存的是完整192字节明文配置。
读取和写入传输采用256字节编码块，两次相同配置的密文可以不同，校验比较解码结果。
逻辑音乐偏移不代表可以直接局部写入Flash，当前实现不推测物理Flash地址。

## 验证记录（2026-10-20）

- 10个相关测试文件，229项通过。
- 覆盖实物捕获密文、独立随机前缀重建、非音乐字节保留、丢失ACK、
  回滚失败后恢复、导入备份、未知固件锁定、48字节容量、B7和原生草稿往返。
- ESLint无错误；项目已有2项无关unused-variable警告。
- 两个新增TypeScript模块的strict检查通过；Vite生产构建通过。
- 浏览器已核验电调音乐页面和BLHeli_32支持说明。
- 捕获数据和先前四路只读实测验证了读取/解码；本轮未实际写入电调。
  新代码的实机写入、读回及断电重启播放验收仍待完成。当前未检测到原USB串口。

复现软件检查：

```sh
npx vitest run test/js/blheli32Config.test.ts test/js/blheli32Melody.test.ts test/js/blheli32Controller.test.ts test/js/escMelody.test.js test/js/escWriteSafety.test.ts test/js/fourWayErase.test.ts test/js/escWorkbench.test.ts test/js/bluejayIdentity.test.ts test/js/serialHotReload.test.ts test/tabs/EscMelodyTab.test.js
npm run lint
npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --lib DOM,ES2022 --skipLibCheck src/js/esc_melody/blheli32_config.ts src/js/esc_melody/blheli32_melody.ts
npm run build
```

算法和官方二进制证据见src/js/esc_melody/blheli32_config.sources.md；
捕获测试向量来源见test/fixtures/esc_melody/blheli32-FPV32-32.10-provenance.md。
