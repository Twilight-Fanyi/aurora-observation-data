# Aurora Observation Data

面向极光观测应用的免费、只读、来源可追溯的数据快照。仓库每 10 分钟从公开上游抓取空间天气与地面天气，为 12 个精选观测地点生成同一份版本化 JSON，并通过 GitHub Pages 发布。

## 公开端点

- `https://twilight-fanyi.github.io/aurora-observation-data/v1/catalog.json`
- `https://twilight-fanyi.github.io/aurora-observation-data/v1/manifest.json`
- `https://twilight-fanyi.github.io/aurora-observation-data/v1/snapshot.json`

首次 GitHub Pages 部署完成后这些地址开始提供数据。客户端应先读取 `manifest.json`，检查 `staleAt`、`expiresAt` 和 `snapshotSha256`，再使用快照。

## 数据内容

- NOAA SWPC：当前与预报 Kp、Bz、太阳风速度、OVATION 极光椭圆。
- Open-Meteo：各地点逐小时云量与能见度。
- 本仓库：太阳高度角、黑暗度、置信度、最佳观测窗口和 0–100 观测机会指数。

“观测机会指数”是帮助安排观测的派生指标，不是极光出现概率，也不构成安全或出行保证。中国低纬地点通常需要较强地磁活动才有机会看到极光。

## 本地运行

需要 Node.js 18.20 或更高版本：

```bash
cd data-pipeline
npm ci
npm test
npm run build
npm run verify
```

生成文件位于 `public/v1/`，不会提交到 Git 历史，只作为 GitHub Pages artifact 发布。JSON Schema 位于 `data-pipeline/schema/`。

更完整的部署、回退和故障说明见 [运维文档](docs/operations/free-data-pipeline.md)。

## 隐私与成本

流水线不接收或保存用户位置、设备标识、账号与个人资料，不需要 API Key。公开仓库使用 GitHub Actions 与 GitHub Pages；如果以后增加 Cloudflare，它只镜像并校验同一份 JSON，不维护第二套评分逻辑。

## 许可与署名

流水线代码采用 [Apache-2.0](LICENSE) 许可。上游原始数据仍遵循各自条款；使用公开 JSON 时请保留 [NOTICE](NOTICE.md) 中的来源署名。
