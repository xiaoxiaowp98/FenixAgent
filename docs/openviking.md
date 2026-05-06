# OpenViking 接入说明

## 配置准备

1. 复制 `deploy/openviking/ov.conf.example` 为 `deploy/openviking/ov.conf`
2. 按实际模型服务填写 `embedding.dense` 和 `vlm` 配置
3. 确认宿主机上 `1933` 和 `8020` 端口未被占用
4. 设置 `root_api_key`

## 启动服务

```bash
docker compose up -d openviking
```

## 验活

```bash
curl http://localhost:1933/health
```

返回 `200` 即表示服务可用。

## Console

浏览器访问 `http://localhost:8020` 查看 OpenViking Console。

## Mothership 接入

配置如下环境变量

```bash
RCS_KNOWLEDGE_PROVIDER=openviking
RCS_KNOWLEDGE_BASE_URL=http://localhost:1933
RCS_KNOWLEDGE_API_KEY=<你的 openviking root_api_key>
```

## 常见排查

- 模型配置缺失: 检查 `deploy/openviking/ov.conf` 是否已填写真实 provider、model 和 api_key
- 端口占用: 使用 `lsof -i :1933` 或 `lsof -i :8020` 检查冲突
- 健康检查失败: 先查看 `docker compose logs openviking`，重点确认配置文件是否成功挂载、服务是否正常监听 `/health`
