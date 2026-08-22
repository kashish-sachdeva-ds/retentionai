# ==============================================================================
# RetentionAI Azure Infrastructure Provisioning Script (PowerShell)
# Target Services: Azure Container Apps (ACA), Azure Cache for Redis, ACR
# ==============================================================================

$ErrorActionPreference = "Stop"

$RESOURCE_GROUP = if ($env:RESOURCE_GROUP) { $env:RESOURCE_GROUP } else { "retentionai-rg" }
$LOCATION = if ($env:LOCATION) { $env:LOCATION } else { "eastus" }
$RANDOM_SUFFIX = Get-Random -Minimum 1000 -Maximum 9999
$ACR_NAME = if ($env:ACR_NAME) { $env:ACR_NAME } else { "retentionaiacr$RANDOM_SUFFIX" }
$REDIS_NAME = if ($env:REDIS_NAME) { $env:REDIS_NAME } else { "retentionai-redis-$RANDOM_SUFFIX" }
$CONTAINERAPPS_ENV = if ($env:CONTAINERAPPS_ENV) { $env:CONTAINERAPPS_ENV } else { "retentionai-env" }
$ADMIN_KEY = if ($env:ADMIN_KEY) { $env:ADMIN_KEY } else { [System.Guid]::NewGuid().ToString("N") }

Write-Host "=== 1. Creating Resource Group: $RESOURCE_GROUP ($LOCATION) ===" -ForegroundColor Cyan
az group create --name $RESOURCE_GROUP --location $LOCATION

Write-Host "=== 2. Creating Azure Container Registry: $ACR_NAME ===" -ForegroundColor Cyan
az acr create `
  --resource-group $RESOURCE_GROUP `
  --name $ACR_NAME `
  --sku Basic `
  --admin-enabled true

$ACR_LOGIN_SERVER = (az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query loginServer -o tsv).Trim()
$ACR_PASSWORD = (az acr credential show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query "passwords[0].value" -o tsv).Trim()

Write-Host "=== 3. Creating Azure Cache for Redis: $REDIS_NAME (Basic C0) ===" -ForegroundColor Cyan
az redis create `
  --resource-group $RESOURCE_GROUP `
  --name $REDIS_NAME `
  --location $LOCATION `
  --sku Basic `
  --vm-size C0 `
  --enable-non-ssl-port false

$REDIS_HOST = (az redis show --name $REDIS_NAME --resource-group $RESOURCE_GROUP --query hostName -o tsv).Trim()
$REDIS_PRIMARY_KEY = (az redis list-keys --name $REDIS_NAME --resource-group $RESOURCE_GROUP --query primaryKey -o tsv).Trim()
$REDIS_SSL_URL = "rediss://:${REDIS_PRIMARY_KEY}@${REDIS_HOST}:6380/0"

Write-Host "=== 4. Creating Azure Container Apps Managed Environment ===" -ForegroundColor Cyan
az containerapp env create `
  --name $CONTAINERAPPS_ENV `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION

Write-Host "=== 5. Building & Pushing Initial Container Images ===" -ForegroundColor Cyan
az acr login --name $ACR_NAME

docker build -t "${ACR_LOGIN_SERVER}/retentionai-api:latest" -f api/Dockerfile .
docker push "${ACR_LOGIN_SERVER}/retentionai-api:latest"

docker build -t "${ACR_LOGIN_SERVER}/retentionai-web:latest" -f nginx/Dockerfile .
docker push "${ACR_LOGIN_SERVER}/retentionai-web:latest"

Write-Host "=== 6. Deploying API Container App (Internal/Private Ingress) ===" -ForegroundColor Cyan
az containerapp create `
  --name retentionai-api `
  --resource-group $RESOURCE_GROUP `
  --environment $CONTAINERAPPS_ENV `
  --image "${ACR_LOGIN_SERVER}/retentionai-api:latest" `
  --target-port 8000 `
  --ingress internal `
  --registry-server $ACR_LOGIN_SERVER `
  --registry-username $ACR_NAME `
  --registry-password $ACR_PASSWORD `
  --cpu 1.0 --memory 2.0Gi `
  --min-replicas 1 --max-replicas 3 `
  --env-vars `
    "REDIS_URL=$REDIS_SSL_URL" `
    "ADMIN_KEY=$ADMIN_KEY" `
    "ALLOW_SYNTHETIC_DATA=0" `
    "FORCE_RETRAIN=0"

Write-Host "=== 7. Deploying Web Gateway Container App (Public External Ingress) ===" -ForegroundColor Cyan
az containerapp create `
  --name retentionai-web `
  --resource-group $RESOURCE_GROUP `
  --environment $CONTAINERAPPS_ENV `
  --image "${ACR_LOGIN_SERVER}/retentionai-web:latest" `
  --target-port 80 `
  --ingress external `
  --registry-server $ACR_LOGIN_SERVER `
  --registry-username $ACR_NAME `
  --registry-password $ACR_PASSWORD `
  --cpu 0.5 --memory 1.0Gi `
  --min-replicas 1 --max-replicas 2

$WEB_FQDN = (az containerapp show --name retentionai-web --resource-group $RESOURCE_GROUP --query properties.configuration.ingress.fqdn -o tsv).Trim()

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " RetentionAI Successfully Provisioned on Azure!" -ForegroundColor Green
Write-Host " Public Application URL : https://$WEB_FQDN" -ForegroundColor Green
Write-Host " Health Endpoint        : https://$WEB_FQDN/api/v1/health" -ForegroundColor Green
Write-Host " Model Card Endpoint    : https://$WEB_FQDN/api/v1/model-card" -ForegroundColor Green
Write-Host " Administrative Key     : $ADMIN_KEY" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
