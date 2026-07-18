# named tunnel 安装单（回家清单第 4 条 · 照抄即用）

> 目的：把 fable-bridge 的 quick tunnel（域名每次随机）换成**固定域名**，
> 之后 BRIDGE_SECRET 搬进 llm-proxy 保险柜（CCBRIDGE 路由），手机端配置一次永久生效。
> 全程约 10 分钟。⚠️ 本文件不含任何密钥；secret 只住 Supabase secrets 和本机配置文件。

## 前提
- Cloudflare 账号（已有，quick tunnel 就是用它跑的）
- 一个托管在 Cloudflare 的域名（免费版即可；没有的话先在 dash 里加一个，
  或用 Cloudflare Registrar 买个便宜的 .xyz/.top，一年十几块人民币）

## 第 1 步：登录授权（本机一次性）
```bash
cloudflared tunnel login
```
浏览器弹出 → 选中你的域名授权。证书落在 `~/.cloudflared/cert.pem`。

## 第 2 步：建隧道（起名 fable）
```bash
cloudflared tunnel create fable
```
记下输出里的 Tunnel ID（UUID 样子），凭据文件自动落在 `~/.cloudflared/<TUNNEL_ID>.json`。

## 第 3 步：写配置文件
`~/.cloudflared/config.yml`（新建）：
```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/lisa/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: fable.<你的域名>
    service: http://localhost:8787   # ← 改成 fable-bridge.mjs 实际监听的端口
  - service: http_status:404
```

## 第 4 步：把子域名指到隧道
```bash
cloudflared tunnel route dns fable fable.<你的域名>
```

## 第 5 步：跑起来验证
```bash
cloudflared tunnel run fable
# 另开终端：
curl -s https://fable.<你的域名>/health   # bridge 有 health 路由就打它，没有就打根路径看 401/403（说明门禁在）
```

## 第 6 步：开机自启（替代手动跑）
```bash
sudo cloudflared service install
```
装成 LaunchDaemon，Mac 重启自动拉起。（这一步和回家清单第 2 条 launchd 看门狗互补：
cloudflared 归系统管，桌面 app 归看门狗管。）

## 第 7 步：善后
1. **BRIDGE_SECRET 入柜**：`supabase secrets set BRIDGE_SECRET=<原值>`，
   然后 llm-proxy 的 CCBRIDGE 路由从 env 读（函数里已留好读取口，重贴时确认）。
2. 手机端所有指向旧 quick-tunnel 随机域名的配置 → 换成 `https://fable.<你的域名>`，此后**永不再换**。
3. 确认 fable-bridge.mjs 本身仍校验 BRIDGE_SECRET（固定域名暴露面更稳定，门禁必须在）。
4. 旧 quick tunnel 进程杀掉。

## 回滚
出问题时 `cloudflared tunnel run` 的 quick 模式随时可退回（`cloudflared tunnel --url http://localhost:8787`），
拿临时随机域名顶着，不影响本机 bridge 本体。
