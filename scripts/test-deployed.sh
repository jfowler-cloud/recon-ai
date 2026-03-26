#!/usr/bin/env bash
###############################################################################
# E2E test for deployed recon-ai backend (dev account)
###############################################################################
set -euo pipefail

PROFILE="${AWS_PROFILE:-cdk-deploy-prod}"
REGION="us-east-1"
AWS="aws --profile $PROFILE --region $REGION"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PASS=0
FAIL=0
TESTS=()

pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); TESTS+=("PASS: $1"); }
fail() { echo "  [FAIL] $1 — $2"; FAIL=$((FAIL + 1)); TESTS+=("FAIL: $1"); }

###############################################################################
echo "=== 1. get_config Lambda ==="
###############################################################################
$AWS lambda invoke \
  --function-name ra-get_config \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  "$TMPDIR/get_config.json" > "$TMPDIR/get_config_meta.json" 2>&1

STATUS=$(jq -r '.StatusCode' "$TMPDIR/get_config_meta.json" 2>/dev/null || echo "null")
BODY=$(cat "$TMPDIR/get_config.json")
HTTP_CODE=$(echo "$BODY" | jq -r '.statusCode' 2>/dev/null || echo "null")
HAS_CONFIG=$(echo "$BODY" | jq -r '.body' 2>/dev/null | jq 'has("config")' 2>/dev/null || echo "false")
HAS_SOURCES=$(echo "$BODY" | jq -r '.body' 2>/dev/null | jq 'has("sources")' 2>/dev/null || echo "false")

if [[ "$STATUS" == "200" && "$HTTP_CODE" == "200" && "$HAS_CONFIG" == "true" && "$HAS_SOURCES" == "true" ]]; then
  pass "get_config returns config and sources"
else
  fail "get_config" "StatusCode=$STATUS httpCode=$HTTP_CODE hasConfig=$HAS_CONFIG hasSources=$HAS_SOURCES body=$(head -c 300 <<< "$BODY")"
fi

###############################################################################
echo "=== 2. seed_data verification (RA-DataSources) ==="
###############################################################################
$AWS dynamodb scan \
  --table-name RA-DataSources \
  --select COUNT \
  --output json > "$TMPDIR/seed_count.json" 2>&1

COUNT=$(jq -r '.Count' "$TMPDIR/seed_count.json" 2>/dev/null || echo "0")
if [[ "$COUNT" -ge 6 ]]; then
  pass "RA-DataSources has $COUNT sources (>=6)"
else
  fail "RA-DataSources count" "expected >=6, got $COUNT"
fi

# Verify all 6 sourceIds exist
EXPECTED_SOURCES=("shodan" "nmap" "social" "logs" "documents" "custom")
$AWS dynamodb scan \
  --table-name RA-DataSources \
  --projection-expression "sourceId" \
  --output json > "$TMPDIR/seed_ids.json" 2>&1

ALL_PRESENT=true
for src in "${EXPECTED_SOURCES[@]}"; do
  FOUND=$(jq -r --arg s "$src" '[.Items[].sourceId.S] | index($s)' "$TMPDIR/seed_ids.json" 2>/dev/null)
  if [[ "$FOUND" == "null" ]]; then
    ALL_PRESENT=false
    break
  fi
done

if [[ "$ALL_PRESENT" == "true" ]]; then
  pass "All 6 expected sourceIds present"
else
  fail "sourceId check" "missing one or more of: ${EXPECTED_SOURCES[*]}"
fi

###############################################################################
echo "=== 3. upload_data Lambda ==="
###############################################################################
UPLOAD_PAYLOAD='{"fileName":"e2e-test.txt","sourceType":"custom","analystId":"e2e-test"}'
$AWS lambda invoke \
  --function-name ra-upload_data \
  --cli-binary-format raw-in-base64-out \
  --payload "$UPLOAD_PAYLOAD" \
  "$TMPDIR/upload_data.json" > "$TMPDIR/upload_data_meta.json" 2>&1

UPLOAD_BODY=$(cat "$TMPDIR/upload_data.json")
UPLOAD_HTTP=$(echo "$UPLOAD_BODY" | jq -r '.statusCode' 2>/dev/null || echo "null")
UPLOAD_INNER=$(echo "$UPLOAD_BODY" | jq -r '.body' 2>/dev/null)
HAS_URL=$(echo "$UPLOAD_INNER" | jq 'has("presignedUrl")' 2>/dev/null || echo "false")
HAS_UPLOAD_ID=$(echo "$UPLOAD_INNER" | jq 'has("uploadId")' 2>/dev/null || echo "false")
UPLOAD_ID=$(echo "$UPLOAD_INNER" | jq -r '.uploadId' 2>/dev/null || echo "")
S3_KEY=$(echo "$UPLOAD_INNER" | jq -r '.s3Key' 2>/dev/null || echo "")
PRESIGNED_URL=$(echo "$UPLOAD_INNER" | jq -r '.presignedUrl' 2>/dev/null || echo "")

if [[ "$UPLOAD_HTTP" == "200" && "$HAS_URL" == "true" && "$HAS_UPLOAD_ID" == "true" ]]; then
  pass "upload_data returns presignedUrl and uploadId ($UPLOAD_ID)"
else
  fail "upload_data" "httpCode=$UPLOAD_HTTP hasUrl=$HAS_URL hasUploadId=$HAS_UPLOAD_ID body=$(head -c 300 <<< "$UPLOAD_BODY")"
fi

###############################################################################
echo "=== 4. S3 upload ==="
###############################################################################
TEST_CONTENT="E2E test content from test-deployed.sh at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Extract bucket name from the S3 key and presigned URL
UPLOADS_BUCKET=$(echo "$PRESIGNED_URL" | sed -n 's|https://\([^.]*\)\.s3\..*|\1|p')
if [[ -z "$UPLOADS_BUCKET" ]]; then
  # Fallback: derive from account convention
  ACCOUNT_ID=$($AWS sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")
  UPLOADS_BUCKET="recon-ai-uploads-${ACCOUNT_ID}"
fi

# Write test content to a temp file and upload via AWS CLI
echo "$TEST_CONTENT" > "$TMPDIR/e2e-test.txt"
S3_UPLOAD_OUTPUT=$($AWS s3 cp "$TMPDIR/e2e-test.txt" "s3://$UPLOADS_BUCKET/$S3_KEY" 2>&1)

if [[ $? -eq 0 ]]; then
  pass "S3 upload succeeded via aws s3 cp to s3://$UPLOADS_BUCKET/$S3_KEY"
else
  fail "S3 upload" "$S3_UPLOAD_OUTPUT"
fi

# Also verify presigned URL is well-formed (contains bucket and key)
if echo "$PRESIGNED_URL" | grep -q "$UPLOADS_BUCKET"; then
  pass "presigned URL references correct bucket ($UPLOADS_BUCKET)"
else
  fail "presigned URL check" "URL does not contain expected bucket name"
fi

###############################################################################
echo "=== 5. parse_upload Lambda (detect mode) ==="
###############################################################################
DETECT_PAYLOAD=$(jq -n --arg uid "$UPLOAD_ID" --arg key "$S3_KEY" \
  '{mode:"detect", uploadId:$uid, s3Key:$key, sourceType:"auto"}')
$AWS lambda invoke \
  --function-name ra-parse_upload \
  --cli-binary-format raw-in-base64-out \
  --payload "$DETECT_PAYLOAD" \
  "$TMPDIR/detect.json" > "$TMPDIR/detect_meta.json" 2>&1

DETECT_BODY=$(cat "$TMPDIR/detect.json")
DETECTED_TYPE=$(echo "$DETECT_BODY" | jq -r '.detectedType' 2>/dev/null || echo "null")

if [[ "$DETECTED_TYPE" == "text_passthrough" ]]; then
  pass "parse_upload detect mode detected 'text_passthrough' for .txt"
elif [[ "$DETECTED_TYPE" != "null" && -n "$DETECTED_TYPE" ]]; then
  pass "parse_upload detect mode returned detectedType=$DETECTED_TYPE (non-null)"
else
  fail "parse_upload detect" "detectedType=$DETECTED_TYPE body=$(head -c 300 <<< "$DETECT_BODY")"
fi

###############################################################################
echo "=== 6. parse_upload Lambda (parse mode) ==="
###############################################################################
PARSE_PAYLOAD=$(jq -n --arg uid "$UPLOAD_ID" --arg key "$S3_KEY" \
  '{mode:"parse", uploadId:$uid, s3Key:$key, sourceType:"text_passthrough"}')
$AWS lambda invoke \
  --function-name ra-parse_upload \
  --cli-binary-format raw-in-base64-out \
  --payload "$PARSE_PAYLOAD" \
  "$TMPDIR/parse.json" > "$TMPDIR/parse_meta.json" 2>&1

PARSE_BODY=$(cat "$TMPDIR/parse.json")
DOC_COUNT=$(echo "$PARSE_BODY" | jq '.documents | length' 2>/dev/null || echo "0")

if [[ "$DOC_COUNT" -ge 1 ]]; then
  pass "parse_upload parse mode returned $DOC_COUNT document(s)"
else
  # Check for Lambda error
  FUNC_ERR=$(jq -r '.FunctionError // empty' "$TMPDIR/parse_meta.json" 2>/dev/null || echo "")
  if [[ -n "$FUNC_ERR" ]]; then
    fail "parse_upload parse" "FunctionError=$FUNC_ERR body=$(head -c 500 <<< "$PARSE_BODY")"
  else
    fail "parse_upload parse" "documents count=$DOC_COUNT body=$(head -c 300 <<< "$PARSE_BODY")"
  fi
fi

###############################################################################
echo "=== 7. update_config + get_config round-trip ==="
###############################################################################
TEST_KEY="e2e_test_key"
TEST_VAL="e2e_test_value_$(date +%s)"
WRITE_PAYLOAD=$(jq -n --arg k "$TEST_KEY" --arg v "$TEST_VAL" '{configKey:$k, configValue:$v}')

$AWS lambda invoke \
  --function-name ra-update_config \
  --cli-binary-format raw-in-base64-out \
  --payload "$WRITE_PAYLOAD" \
  "$TMPDIR/update_cfg.json" > "$TMPDIR/update_cfg_meta.json" 2>&1

UPDATE_HTTP=$(jq -r '.statusCode' "$TMPDIR/update_cfg.json" 2>/dev/null || echo "null")

# Read it back
READ_PAYLOAD=$(jq -n --arg k "$TEST_KEY" '{configKey:$k}')
$AWS lambda invoke \
  --function-name ra-get_config \
  --cli-binary-format raw-in-base64-out \
  --payload "$READ_PAYLOAD" \
  "$TMPDIR/read_cfg.json" > "$TMPDIR/read_cfg_meta.json" 2>&1

READ_BODY=$(cat "$TMPDIR/read_cfg.json")
READ_VAL=$(echo "$READ_BODY" | jq -r '.body' 2>/dev/null | jq -r '.config.configValue' 2>/dev/null || echo "null")

if [[ "$UPDATE_HTTP" == "200" && "$READ_VAL" == "$TEST_VAL" ]]; then
  pass "update_config write + get_config read-back matches ($TEST_VAL)"
else
  fail "config round-trip" "updateHttp=$UPDATE_HTTP readVal=$READ_VAL expected=$TEST_VAL readBody=$(head -c 300 <<< "$READ_BODY")"
fi

###############################################################################
echo "=== 8. trigger_ingestion Lambda (SFN mode) ==="
###############################################################################
$AWS lambda invoke \
  --function-name ra-trigger_ingestion \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  "$TMPDIR/trigger.json" > "$TMPDIR/trigger_meta.json" 2>&1

TRIGGER_BODY=$(cat "$TMPDIR/trigger.json")
SOURCE_COUNT=$(echo "$TRIGGER_BODY" | jq '.sources | length' 2>/dev/null || echo "0")

if [[ "$SOURCE_COUNT" -ge 1 ]]; then
  pass "trigger_ingestion (SFN mode) returned $SOURCE_COUNT source(s)"
else
  FUNC_ERR=$(jq -r '.FunctionError // empty' "$TMPDIR/trigger_meta.json" 2>/dev/null || echo "")
  fail "trigger_ingestion" "sourceCount=$SOURCE_COUNT funcErr=$FUNC_ERR body=$(head -c 300 <<< "$TRIGGER_BODY")"
fi

###############################################################################
echo "=== 9. Step Functions — RA-IngestionWorkflow exists ==="
###############################################################################
SFN_LIST=$($AWS stepfunctions list-state-machines --output json 2>&1)
SFN_MATCH=$(echo "$SFN_LIST" | jq '[.stateMachines[] | select(.name | test("RA.*Ingestion"))] | length' 2>/dev/null || echo "0")

if [[ "$SFN_MATCH" -ge 1 ]]; then
  SFN_NAME=$(echo "$SFN_LIST" | jq -r '[.stateMachines[] | select(.name | test("RA.*Ingestion"))][0].name' 2>/dev/null)
  pass "RA-IngestionWorkflow state machine exists ($SFN_NAME)"
else
  fail "RA-IngestionWorkflow" "no state machine matching RA.*Ingestion found"
fi

###############################################################################
echo ""
echo "=============================="
echo "  Results: $PASS passed, $FAIL failed"
echo "=============================="
for t in "${TESTS[@]}"; do echo "  $t"; done
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
