# 免费极光数据发布运维

Aurora 只在 GitHub Actions 中计算一次观测机会指数。Cloudflare 后续只校验并镜像相同 JSON，不维护第二套评分逻辑。

## 公开数据

GitHub Pages 发布三个只读文件：

- `/v1/catalog.json`：12 个精选观测地点、坐标、时区、参考 Kp 与数据源署名。
- `/v1/manifest.json`：生成、变旧、过期时间和快照 SHA-256。
- `/v1/snapshot.json`：当前指标、未来 12 小时趋势、置信度、原因码与最佳窗口。

空间天气来自 [NOAA SWPC](https://www.swpc.noaa.gov/)，云量与能见度来自 [Open-Meteo](https://open-meteo.com/)。公开 JSON 不包含用户位置、设备标识、账号或个人资料，也不需要 API Key。

“观测机会指数”是 0–100 的派生指标，不是极光出现概率。`staleAt` 为生成后 20 分钟，`expiresAt` 为生成后 6 小时；客户端在过期后必须回退到其他有效通道或明确显示暂无数据。

## 启用 GitHub Pages

1. 将仓库推送到 GitHub，在 Settings → Pages 中把 Source 设为 GitHub Actions。
2. 在 Actions 中手动运行 `Publish Aurora Data`，完成首次发布。
3. 后续工作流每 10 分钟运行。上游失败时会校验并重新部署上一份有效数据；没有有效旧数据时工作流失败，现有 Pages 部署不会被空内容覆盖。
4. 对于公开仓库，长时间无仓库活动可能使计划任务自动停用；需要定期检查 Actions，必要时手动重新启用或运行工作流。

Pages 地址通常为：

```text
https://<owner>.github.io/<repository>/v1/manifest.json
```

## 本地生成和检查

```bash
cd data-pipeline
npm ci
npm test
npm run build
npm run verify
```

检查发布时间与数据大小：

```bash
node -e "const m=require('../public/v1/manifest.json'); console.log(m.generatedAt,m.staleAt,m.expiresAt)"
wc -c ../public/v1/snapshot.json
```

`snapshot.json` 必须少于 100000 字节。生成文件被 Git 忽略，只作为 Pages artifact 发布，不会每 10 分钟提交到仓库历史。

## 故障处理

- `npm test` 失败：不上传、不部署。
- NOAA 或 Open-Meteo 暂时失败：保留 6 小时内且哈希正确的上一版。
- 上一版也无效或过期：任务失败，不生成伪造或部分数据。
- SHA-256 不一致：视为损坏数据，客户端和 Cloudflare 均应拒绝。

工作流采用 GitHub 官方的 `configure-pages`、`upload-pages-artifact` 和 `deploy-pages` Actions；配置方式参见 [GitHub Pages 自定义工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
