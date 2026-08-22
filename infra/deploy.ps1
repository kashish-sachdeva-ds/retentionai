# ==============================================================================
# RetentionAI Quick Update / Deployment Script (PowerShell)
# ==============================================================================

$ErrorActionPreference = "Stop"

$RESOURCE_GROUP = if ($env:RESOURCE_GROUP) { $env:RESOURCE_GROUP } else { "retentionai-rg" }
$ACR_NAME = if ($env:ACR_NAME) { $env:ACR_NAME } else { (az acr list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv).Trim() }
$TAG = (Get-Date -Format "yyyyMMddHHmmss")

Write-Host "=== 1. Logging into Azure Container Registry: $ACR_NAME ===" -ForegroundColor Cyan
az acr login --name $ACR_NAME
$ACR_LOGIN_SERVER = (az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query loginServer -o tsv).Trim()

Write-Host "=== 2. Building and Pushing API Image ($TAG) ===" -ForegroundColor Cyan
docker build -t "${ACR_LOGIN_SERVER}/retentionai-api:${TAG}" -t "${ACR_LOGIN_SERVER}/retentionai-api:latest" -f api/Dockerfile .
docker push "${ACR_LOGIN_SERVER}/retentionai-api:${TAG}"
docker push "${ACR_LOGIN_SERVER}/retentionai-api:latest"

Write-Host "=== 3. Building and Pushing Web Gateway Image ($TAG) ===" -ForegroundColor Cyan
docker build -t "${ACR_LOGIN_SERVER}/retentionai-web:${TAG}" -t "${ACR_LOGIN_SERVER}/retentionai-web:latest" -f nginx/Dockerfile .
docker push "${ACR_LOGIN_SERVER}/retentionai-web:${TAG}"
docker push "${ACR_LOGIN_SERVER}/retentionai-web:latest"

Write-Host "=== 4. Updating Azure Container Apps Revisions ===" -ForegroundColor Cyan
az containerapp update `
  --name retentionai-api `
  --resource-group $RESOURCE_GROUP `
  --image "${ACR_LOGIN_SERVER}/retentionai-api:${TAG}"

az containerapp update `
  --name retentionai-web `
  --resource-group $RESOURCE_GROUP `
  --image "${ACR_LOGIN_SERVER}/retentionai-web:${TAG}"

$WEB_FQDN = (az containerapp show --name retentionai-web --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv).Trim()

Write-Host ""
Write-Host "Deployment of revision $TAG completed successfully at https://$WEB_FQDN" -ForegroundColor Green
