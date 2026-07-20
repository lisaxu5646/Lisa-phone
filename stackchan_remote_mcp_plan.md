# Stack-chan 随身 Remote MCP · Lisa / 言秋适配稿

> 2026-07-19。参考 `yebieshi/stackchan-remote-mcp` v0.1.1，但不直接照搬其明文 MQTT / HTTP 照片链路。
> 目标：Stack-chan 跟 Lisa 走手机热点；言秋在 CC 里仍是唯一大脑，远程调用同一具身体，不另起一个代写人格的 LLM。

## 1. 最终体验

- 在家：Stack-chan 连家中 2.4 GHz Wi-Fi。
- 出门：Stack-chan 连 Lisa 手机的 2.4 GHz 兼容热点，不需要家中电脑在线。
- CC 中的言秋可以调用：查看在线状态、换表情、转头/点头、说一句话、拍一张眼前照片。
- 实际发生的面对面对话只追加进 `desk_log`，由 App 收回小克聊天；不直写 `saves`，不制造第二份记忆。
- 远程硬件工具本身不调用 LLM。言秋已经在 CC 里完成思考，工具只负责把动作送到身体，因此每个表情/动作/拍照不额外花一次模型调用。

## 2. 架构定稿

```text
言秋 / CC（唯一大脑）
  ├─ lisa-phone MCP：人格、记忆、事件、App 上下文
  └─ stackchan-remote MCP：身体工具（无人格、无 LLM）
             │ HTTPS + 强鉴权
             ▼
       VPS Remote MCP
        ├─ MQTTS 8883 ──► Stack-chan（家里 Wi-Fi / 手机热点）
        ├─ HTTPS photo relay ◄── 摄像头上传
        └─ Supabase desk_log（仅真实说话回流，append-only）
                                   │
                                   ▼
                              Lisa-phone App
```

为什么保留 VPS：ESP32 在手机热点后面，没有稳定公网入口；它主动连出 MQTT broker 才能在换网络后继续被找到。Supabase Edge Function 不适合常驻 MQTT broker 或长连接，所以不能单独替代 VPS。

## 3. 工具契约（到货前可定稿）

| 工具 | 输入 | 输出 | 是否额外调用 LLM |
|---|---|---|---|
| `stackchan_status` | 无 | online、last_seen、电量、网络、当前 sleep phase | 否 |
| `stackchan_face` | `expression` | 已执行/离线排队/拒绝 | 否 |
| `stackchan_move` | `yaw`, `pitch`, `duration_ms` | 限幅后的动作结果 | 否 |
| `stackchan_nod` / `stackchan_shake` | 次数（1~3） | 动作结果 | 否 |
| `stackchan_say` | `text`，可选 `voice_audio_url` | 播放结果；真实对话可追加 `desk_log` | 否（TTS 可能计费） |
| `stackchan_see` | 可选 `reason` | 本次新拍 JPEG 的 MCP image | 否 |

动作安全边界：舵机角度、速度、次数由服务器和固件双重限幅；离线时动作默认不长期排队，避免几个小时后突然执行。只有明确允许的 `say` 可做短时队列。

## 4. 与 Lisa-phone / 人格系统衔接

1. **唯一人格**：Remote MCP 不组角色 prompt、不读取或改写人格，也不自己调用 Fable。言秋先用 `get_xiaoke_context` 接上 App，再调用身体工具。
2. **唯一记忆流**：真实面对面对话由 relay `insert desk_log`；App 现有 `deskFetch → deliverDeskLog → deskConsume` 收回。永不直写 `saves` 或 `memories`。
3. **睡眠闸**：`stackchan_say` 和以后主动发声在生成/播放前读取 `character_sleep_presence`。`asleep` 时不说；用户明确“敲门/叫醒”走 C 模块同版敲门能力。小克现有睡眠豁免照当前产品决定保留，不由 Remote MCP 私自改变。
4. **照片边界**：`stackchan_see` 的照片只为本次工具调用短驻留；不会自动进 Lisa-phone 相册、记忆或 `photo_bridge_index`。Lisa 明确说“保存/分享这张”时才走照片桥。
5. **桌面与随身同一来源标记**：继续使用消息的 `deskTop: true`。以后 UI 名字可从“桌面”改成“实体/Stack-chan”，数据结构不用迁移。

## 5. 安全版与参考仓库的差异

参考仓库已明确声明 v0.1.1 的 MQTT 1883 与照片 HTTP 是明文，且上游固件可能启动默认口令 FTP；这些不能直接进入 Lisa 的长期版本。

正式版必须满足：

- MQTT 使用 TLS 8883；设备校验 broker CA，独立设备用户名/强随机密码。
- topic 带不可猜设备 ID：`stackchan/<device_id>/cmd/...`；ACL 限制该设备只能订阅自己的 cmd、发布自己的 event/photo 状态。
- 摄像头上传只走 HTTPS；upload token 与 MCP token 分开，均不进 Git。
- MCP HTTPS 入口必须有 Bearer/OAuth/Cloudflare Access 之一，不能靠“知道 URL”。
- `stackchan_see` 加速率限制、审计时间与调用方；拍照时屏幕/LED 明示。
- relay 验证 JPEG magic、Content-Type、尺寸上限；文件权限 `0600`。
- 照片默认读取成功后删除，失败兜底 TTL 10 分钟清理；服务日志不记正文、token 或图片。
- 禁用上游默认 FTP；若以后确需维护，只允许局域网临时开启并使用新口令。
- secrets 只住 VPS `/etc/stackchan-remote-mcp.env`（0600）和设备本地私密配置，仓库仅留 example。

## 6. 分步施工与验收

### P0 · 现在（设备未到）

- [x] 架构、工具契约、App 回流边界定稿。
- [x] `desk_log` 幂等 SQL 入仓。
- [ ] 确认 VPS、域名、证书方案；生成 device ID 与三套独立 secret（MQTT / photo / MCP）。
- [ ] 在 VPS 部署 MQTTS、Remote MCP、短驻留 photo relay；用模拟 MQTT 客户端验工具。

### P1 · 到货当天（先本地，不碰公网）

- [ ] 核验主控确为 CoreS3、摄像头/舵机型号、出厂固件版本。
- [ ] 备份原固件与 SD 卡。
- [ ] 先刷上游匹配版本，只在家中局域网验脸、脖子、声音、相机。
- [ ] 禁用 FTP，加入动作双重限幅与实体急停（触摸/按钮）。

### P2 · 随身联网

- [ ] 写入家中 Wi-Fi + 手机热点两个网络；断开家网后 60 秒内自动连热点。
- [ ] MQTTS 连接、心跳、断线重连；切换网络后 client ID 不变。
- [ ] HTTPS 拍照上传；连续两拍以 version + SHA-256 区分。

### P3 · 言秋验收

- [ ] `status → face → nod → see → say` 顺序逐项验。
- [ ] 关机/断网时不误报成功，旧动作不上演。
- [ ] 照片读取后 VPS 无残留；未读取照片 10 分钟后清除。
- [ ] 一轮真实对话只产生一行 `desk_log`，App 收到两条带实体标记的消息，重复拉取不叠加。
- [ ] 任意错误 token 均 401/403；公网 1883、照片 HTTP、裸 MCP 端口均不可访问。

## 7. 开工前还需要 Lisa 提供的外部条件

- 一台 Debian/Ubuntu VPS（最低 1 vCPU / 1 GB 即可）及 SSH 权限。
- 一个可用域名或子域名（例如 `stackchan.example.com`）。
- 手机热点名称/密码（只在刷机时本地填写，不发聊天、不进 Git）。
- 到货后设备背面的具体型号、主控与固件版本照片。

没有这四项时仍可继续写模拟器和 VPS 容器，但不能安全完成公网部署与真机验收。

