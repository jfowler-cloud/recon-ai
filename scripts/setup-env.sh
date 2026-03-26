#!/usr/bin/env bash
# Populate apps/web/.env from CloudFormation stack outputs.
set -euo pipefail

PROFILE="${AWS_PROFILE:-cdk-deploy-prod}"
REGION="${AWS_REGION:-us-east-1}"

echo "Fetching CloudFormation outputs (profile=$PROFILE, region=$REGION)..."

get_output() {
  local stack="$1" key="$2"
  aws cloudformation describe-stacks \
    --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" \
    --output text \
    --profile "$PROFILE" \
    --region "$REGION" 2>/dev/null || echo ""
}

# Auth
USER_POOL_ID=$(get_output "RA-Auth" "UserPoolId")
USER_POOL_CLIENT_ID=$(get_output "RA-Auth" "UserPoolClientId")
IDENTITY_POOL_ID=$(get_output "RA-Auth" "IdentityPoolId")

# Database / Storage
UPLOADS_BUCKET=$(get_output "RA-Database" "UploadsBucketName")
VECTORS_BUCKET=$(get_output "RA-Database" "VectorsBucketName")

# Phase 1: Data ingestion
UPLOAD_DATA_FN=$(get_output "RA-Functions" "UploadDataFnName")
PARSE_UPLOAD_FN=$(get_output "RA-Functions" "ParseUploadFnName")
GET_CONFIG_FN=$(get_output "RA-Functions" "GetConfigFnName")
UPDATE_CONFIG_FN=$(get_output "RA-Functions" "UpdateConfigFnName")
TRIGGER_INGESTION_FN=$(get_output "RA-Functions" "TriggerIngestionFnName")

# Phase 2: Ticketing
CREATE_TICKET_FN=$(get_output "RA-Functions" "CreateTicketFnName")
UPDATE_TICKET_FN=$(get_output "RA-Functions" "UpdateTicketFnName")
LIST_TICKETS_FN=$(get_output "RA-Functions" "ListTicketsFnName")
GET_DASHBOARD_FN=$(get_output "RA-Functions" "GetDashboardFnName")
QUEUE_FOR_REDTEAM_FN=$(get_output "RA-Functions" "QueueForRedteamFnName")

# Phase 3: Red team workflow
CREATE_TARGET_FN=$(get_output "RA-Functions" "CreateTargetFnName")
UPDATE_TARGET_FN=$(get_output "RA-Functions" "UpdateTargetFnName")
MANAGE_TOOLS_FN=$(get_output "RA-Functions" "ManageToolsFnName")
RECORD_TOOL_ACTION_FN=$(get_output "RA-Functions" "RecordToolActionFnName")
UPDATE_CONTEXT_FN=$(get_output "RA-Functions" "UpdateContextFnName")

# Phase 4: Chat
CHAT_HANDLER_FN=$(get_output "RA-Functions" "ChatHandlerFnName")
GET_SESSION_FN=$(get_output "RA-Functions" "GetSessionFnName")
LIST_SESSIONS_FN=$(get_output "RA-Functions" "ListSessionsFnName")

ENV_FILE="$(dirname "$0")/../apps/web/.env"

cat > "$ENV_FILE" << EOF
VITE_AWS_REGION=$REGION
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
VITE_IDENTITY_POOL_ID=$IDENTITY_POOL_ID
VITE_UPLOADS_BUCKET=$UPLOADS_BUCKET
VITE_VECTORS_BUCKET=$VECTORS_BUCKET
VITE_UPLOAD_DATA_FN=$UPLOAD_DATA_FN
VITE_PARSE_UPLOAD_FN=$PARSE_UPLOAD_FN
VITE_GET_CONFIG_FN=$GET_CONFIG_FN
VITE_UPDATE_CONFIG_FN=$UPDATE_CONFIG_FN
VITE_TRIGGER_INGESTION_FN=$TRIGGER_INGESTION_FN
VITE_CREATE_TICKET_FN=$CREATE_TICKET_FN
VITE_UPDATE_TICKET_FN=$UPDATE_TICKET_FN
VITE_LIST_TICKETS_FN=$LIST_TICKETS_FN
VITE_GET_DASHBOARD_FN=$GET_DASHBOARD_FN
VITE_QUEUE_FOR_REDTEAM_FN=$QUEUE_FOR_REDTEAM_FN
VITE_CREATE_TARGET_FN=$CREATE_TARGET_FN
VITE_UPDATE_TARGET_FN=$UPDATE_TARGET_FN
VITE_MANAGE_TOOLS_FN=$MANAGE_TOOLS_FN
VITE_RECORD_TOOL_ACTION_FN=$RECORD_TOOL_ACTION_FN
VITE_UPDATE_CONTEXT_FN=$UPDATE_CONTEXT_FN
VITE_CHAT_HANDLER_FN=$CHAT_HANDLER_FN
VITE_GET_SESSION_FN=$GET_SESSION_FN
VITE_LIST_SESSIONS_FN=$LIST_SESSIONS_FN
EOF

echo "Wrote $ENV_FILE"
cat "$ENV_FILE"
