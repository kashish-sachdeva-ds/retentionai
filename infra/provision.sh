#!/usr/bin/env bash
# ==============================================================================
# RetentionAI Azure Infrastructure Provisioning Script
# Target Services: Azure Container Apps (ACA), Azure Cache for Redis, ACR
# ==============================================================================

set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-retentionai-rg}"
LOCATION="${LOCATION:-eastus}"
RANDOM_SUFFIX="${RANDOM_SUFFIX:-$((RANDOM % 9000 + 1000))}"
ACR_NAME="${ACR_NAME:-retentionaiac$RANDOM_SUFFIX}"
REDIS_NAME="${REDIS_NAME:-retentionai-redis-$RANDOM_SUFFIX}"
CONTAINERAPPS_ENV="${CONTAINERAPPS_ENV:-retentionai-env}"
ADMIN_KEY="${ADMIN_KEY:-$(openssl rand -hex 16)}"

echo "=== 1. Creating Resource Group: ${RESOURCE_GROUP} (${LOCATION}) ==="
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}"

echo "=== 2. Creating Azure Container Registry: ${ACR_NAME} ==="
az acr create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${ACR_NAME}" \
  --sku Basic \
  --admin-enabled true

ACR_LOGIN_SERVER=$(az acr show --name "${ACR_NAME}" --resource-group "${RESOURCE_GROUP}" --query loginServer -o tsv)
ACR_PASSWORD=$(az acr credential show --name "${ACR_NAME}" --resource-group "${RESOURCE_GROUP}" --query "passwords[0].value" -o tsv)

echo "=== 3. Creating Azure Cache for Redis: ${REDIS_NAME} (Basic C0) ==="
az redis create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${REDIS_NAME}" \
  --location "${LOCATION}" \
  --sku Basic \
  --vm-size C0 \
  --enable-non-ssl-port false

REDIS_HOST=$(az redis show --name "${REDIS_NAME}" --resource-group "${RESOURCE_GROUP}" --query hostName -o tsv)
REDIS_PRIMARY_KEY=$(az redis list-keys --name "${REDIS_NAME}" --resource-group "${RESOURCE_GROUP}" --query primaryKey -o tsv)
REDIS_SSL_URL="rediss://:${REDIS_PRIMARY_KEY}@${REDIS_HOST}:6380/0"

echo "=== 4. Creating Azure Container Apps Managed Environment ==="
az containerapp env create \
  --name "${CONTAINERAPPS_ENV}" \
  --resource-group "${RESOURCE_GROUP}" \
  --location "${LOCATION}"

echo "=== 5. Building & Pushing Initial Container Images ==="
az acr login --name "${ACR_NAME}"

docker build -t "${ACR_LOGIN_SERVER}/retentionai-api:latest" -f api/Dockerfile .
docker push "${ACR_LOGIN_SERVER}/retentionai-api:latest"

docker build -t "${ACR_LOGIN_SERVER}/retentionai-web:latest" -f nginx/Dockerfile .
docker push "${ACR_LOGIN_SERVER}/retentionai-web:latest"

echo "=== 6. Deploying API Container App (Internal/Private Ingress) ==="
az containerapp create \
  --name retentionai-api \
  --resource-group "${RESOURCE_GROUP}" \
  --environment "${CONTAINERAPPS_ENV}" \
  --image "${ACR_LOGIN_SERVER}/retentionai-api:latest" \
  --target-port 8000 \
  --ingress internal \
  --registry-server "${ACR_LOGIN_SERVER}" \
  --registry-username "${ACR_NAME}" \
  --registry-password "${ACR_PASSWORD}" \
  --cpu 1.0 --memory 2.0Gi \
  --min-replicas 1 --max-replicas 3 \
  --env-vars \
    REDIS_URL="${REDIS_SSL_URL}" \
    ADMIN_KEY="${ADMIN_KEY}" \
    ALLOW_SYNTHETIC_DATA="0" \
    FORCE_RETRAIN="0"

echo "=== 7. Deploying Web Gateway Container App (Public External Ingress) ==="
az containerapp create \
  --name retentionai-web \
  --resource-group "${RESOURCE_GROUP}" \
  --environment "${CONTAINERAPPS_ENV}" \
  --image "${ACR_LOGIN_SERVER}/retentionai-web:latest" \
  --target-port 80 \
  --ingress external \
  --registry-server "${ACR_LOGIN_SERVER}" \
  --registry-username "${ACR_NAME}" \
  --registry-password "${ACR_PASSWORD}" \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 1 --max-replicas 2

WEB_FQDN=$(az containerapp show --name retentionai-web --resource-group "${RESOURCE_GROUP}" --query properties.configuration.ingress.fqdn -o tsv)

echo ""
echo "=============================================================================="
echo " RetentionAI Successfully Provisioned on Azure!"
echo " Public Application URL : https://${WEB_FQDN}"
echo " Health Endpoint        : https://${WEB_FQDN}/api/v1/health"
echo " Model Card Endpoint    : https://${WEB_FQDN}/api/v1/model-card"
echo " Administrative Key     : ${ADMIN_KEY}"
echo "=============================================================================="
