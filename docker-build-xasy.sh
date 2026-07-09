#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# FenixAgent xasy 镜像构建 & 推送（覆盖式，单标签）
# Usage: ./docker-build-xasy.sh [--no-push]
# ============================================================

REGISTRY="docker-hub.pazhoulab-huangpu.com"
NAMESPACE="pzlab"
IMAGE_NAME="fenixagent"
TAG="xasy"
USERNAME="pzlab"
PASSWORD="Pzlab@123"

IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"
PUSH=true

# ── 参数 ──
case "${1:-}" in
  --no-push) PUSH=false ;;
  "")        ;;
  *)         echo "用法: $0 [--no-push]"; exit 1 ;;
esac

# ── 前置检查 ──
if ! docker info &>/dev/null; then
  echo "❌ Docker 未运行"
  exit 1
fi

echo "============================================"
echo " 镜像: ${IMAGE}"
echo " 平台: linux/amd64"
echo " 推送: $([ "${PUSH}" = true ] && echo '是' || echo '否')"
echo "============================================"
echo ""

# ── 登录 ──
if [[ "${PUSH}" = true ]]; then
  echo "[1/3] 登录 ${REGISTRY} ..."
  echo "${PASSWORD}" | docker login "${REGISTRY}" --username "${USERNAME}" --password-stdin 2>&1 | tail -1
fi

# ── 构建 ──
echo "[2/3] 构建 linux/amd64 ..."
docker build --platform linux/amd64 -t "${IMAGE}" -f Dockerfile .
echo ""

# ── 推送 ──
if [[ "${PUSH}" = true ]]; then
  echo "[3/3] 推送 ${IMAGE} ..."
  docker push "${IMAGE}"
  echo ""
  echo "✓ ${IMAGE}"
else
  echo "[3/3] 跳过推送"
  echo "✓ ${IMAGE} (本地)"
fi
