# Aurora Observation Data

面向极光观测应用的免费、只读、来源可追溯的数据快照。GitHub Actions 计划任务配置为每 10 分钟抓取 NOAA 空间天气，为 50 个精选观测地点生成同一份版本化 JSON，并通过 GitHub Pages 发布。Open-Meteo 地面天气最多每 15 分钟刷新一次，固定分为五批十坐标请求。

## 公开端点

- `https://twilight-fanyi.github.io/aurora-observation-data/v1/catalog.json`
- `https://twilight-fanyi.github.io/aurora-observation-data/v1/manifest.json`
- `https://twilight-fanyi.github.io/aurora-observation-data/v1/snapshot.json`

首次 GitHub Pages 部署完成后这些地址开始提供数据。客户端应先读取 `manifest.json`，检查 `staleAt`、`expiresAt` 和 `snapshotSha256`，再使用快照。

`/v1/weather.json` 是生成端使用的内部天气缓存，不属于鸿蒙客户端 API 合约。缓存会校验 50 个地点的数量、顺序、时间和数值范围；Open-Meteo 刷新失败时可复用不超过 3 小时的缓存，超过 3 小时则保留上一份完整发布，避免混合新旧数据。

## 数据内容

- NOAA SWPC：当前与预报 Kp、Bz、太阳风速度、OVATION 极光椭圆；预报覆盖范围汇总为 3 个地点当地日期。
- Open-Meteo：各地点 16 天逐小时云量与能见度，汇总为每日最佳夜空条件。
- 本仓库：保留未来 12 小时整点预报，并生成 3 天极光机会摘要与 16 天夜间天气趋势。

“观测机会指数”是帮助安排观测的派生指标，不是极光出现概率，也不构成安全或出行保证。16 天数据只描述地面夜间天气，不外推 NOAA 覆盖范围之外的极光活动。中国低纬地点通常需要较强地磁活动才有机会看到极光。

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

流水线不接收或保存用户位置、设备标识、账号与个人资料，不需要 API Key。按 50 个地点、15 分钟刷新估算，Open-Meteo 计量约为每天 4,800 次、31 天月份 148,800 次，低于非商业免费层每天 10,000 次与每月 300,000 次的公开额度。Cloudflare 只镜像并校验客户端所需 JSON，不维护第二套评分逻辑。

GitHub Actions 的 cron 是尽力调度，不等同于严格的 10 分钟 SLA；客户端仍应以清单时间戳判断新鲜度并使用本地缓存降级。

## 许可与署名

流水线代码采用 [Apache-2.0](LICENSE) 许可。上游原始数据仍遵循各自条款；使用公开 JSON 时请保留 [NOTICE](NOTICE.md) 中的来源署名。
