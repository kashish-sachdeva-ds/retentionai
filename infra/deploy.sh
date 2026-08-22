#!/usr/bin/env bash
# ==============================================================================
# RetentionAI Quick Update / Deployment Script for Azure Container Apps
# ==============================================================================

set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-retentionai-rg}"
ACR_NAME="${ACR_NAME:-$(az acr list --resource-group "${RESOURCE_GROUP}" --query "[0].name" -o tsv)}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}"

echo "=== 1. Logging into Azure Container Registry: ${ACR_NAME} ==="
az acr login --name "${ACR_NAME}"
ACR_LOGIN_SERVER=$(az acr show --name "${ACR_NAME}" --resource-group "${RESOURCE_GROUP}" --query loginServer -o tsv)

echo "=== 2. Building and Pushing API Image (${TAG}) ==="
docker build -t "${ACR_LOGIN_SERVER}/retentionai-api:${TAG}" -t "${ACR_LOGIN_SERVER}/retentionai-api:latest" -f api/Dockerfile .
docker push "${ACR_LOGIN_SERVER}/retentionai-api:${TAG}"
docker push "${ACR_LOGIN_SERVER}/retentionai-api:latest"

echo "=== 3. Building and Pushing Web Gateway Image (${TAG}) ==="
docker build -t "${ACR_LOGIN_SERVER}/retentionai-web:${TAG}" -t "${ACR_LOGIN_SERVER}/retentionai-web:latest" -f nginx/Dockerfile .
docker push "${ACR_LOGIN_SERVER}/retentionai-web:${TAG}"
docker push "${ACR_LOGIN_SERVER}/retentionai-web:latest"

echo "=== 4. Updating Azure Container Apps Revisions ==="
az containerapp update \
  --name retentionai-api \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${ACR_LOGIN_SERVER}/retentionai-api:${TAG}"

az containerapp update \
  --name retentionai-web \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${ACR_LOGIN_SERVER}/retentionai-web:${TAG}"

WEB_FQDN=$(az containerapp show --name retentionai-web --resource-group "${RESOURCE_GROUP}" --query properties.configuration.ingress.fqdn -o tsv)

echo "=== 5. Verifying Deployment Health ==="
timeout 60 bash -c "until curl -sf https://${WEB_FQDN}/api/v1/health; do sleep 3; done"

echo ""
echo "Deployment of revision ${TAG} completed successfully at https://${WEB_FQDN}"
