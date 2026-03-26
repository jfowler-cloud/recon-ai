#!/usr/bin/env bash
###############################################################################
# Seed Meridian Defense Systems demo data into the deployed recon-ai backend.
#
# Uploads test data files to S3 and invokes Lambda functions to trigger
# ingestion for each data source. Used for E2E testing and demo purposes.
#
# Usage:
#   ./scripts/seed-demo-data.sh
#   AWS_PROFILE=cdk-deploy-dev ./scripts/seed-demo-data.sh
###############################################################################
set -euo pipefail

PROFILE="${AWS_PROFILE:-cdk-deploy-prod}"
REGION="${AWS_REGION:-us-east-1}"
AWS="aws --profile $PROFILE --region $REGION"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../test-data"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PASS=0
FAIL=0
UPLOAD_IDS=()

echo "============================================================"
echo "  Recon AI — Meridian Defense Systems Demo Data Seeder"
echo "============================================================"
echo "  Profile:  $PROFILE"
echo "  Region:   $REGION"
echo "  Data dir: $DATA_DIR"
echo ""

###############################################################################
# Helper functions
###############################################################################
pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAIL] $1 — $2"; FAIL=$((FAIL + 1)); }

get_output() {
  local stack="$1" key="$2"
  $AWS cloudformation describe-stacks \
    --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" \
    --output text 2>/dev/null || echo ""
}

upload_file() {
  local file="$1"
  local source_type="$2"
  local file_name
  file_name=$(basename "$file")

  echo ""
  echo "--- Uploading: $file_name (sourceType=$source_type) ---"

  # Step 1: Call upload_data Lambda to get presigned URL and upload record
  local payload
  payload=$(jq -n \
    --arg fn "$file_name" \
    --arg st "$source_type" \
    --arg aid "demo-seed-script" \
    '{fileName: $fn, sourceType: $st, analystId: $aid}')

  $AWS lambda invoke \
    --function-name ra-upload_data \
    --cli-binary-format raw-in-base64-out \
    --payload "$payload" \
    "$TMPDIR/upload_${file_name}.json" > "$TMPDIR/upload_${file_name}_meta.json" 2>&1

  local body
  body=$(cat "$TMPDIR/upload_${file_name}.json")
  local http_code
  http_code=$(echo "$body" | jq -r '.statusCode' 2>/dev/null || echo "null")
  local inner
  inner=$(echo "$body" | jq -r '.body' 2>/dev/null)
  local upload_id
  upload_id=$(echo "$inner" | jq -r '.uploadId' 2>/dev/null || echo "")
  local s3_key
  s3_key=$(echo "$inner" | jq -r '.s3Key' 2>/dev/null || echo "")

  if [[ "$http_code" != "200" || -z "$upload_id" || "$upload_id" == "null" ]]; then
    fail "upload_data for $file_name" "httpCode=$http_code body=$(head -c 300 <<< "$body")"
    return 1
  fi

  pass "upload_data returned uploadId=$upload_id"
  UPLOAD_IDS+=("$upload_id:$file_name:$source_type:$s3_key")

  # Step 2: Upload file directly to S3
  local s3_result
  s3_result=$($AWS s3 cp "$file" "s3://$UPLOADS_BUCKET/$s3_key" 2>&1)

  if [[ $? -eq 0 ]]; then
    pass "S3 upload: s3://$UPLOADS_BUCKET/$s3_key"
  else
    fail "S3 upload for $file_name" "$s3_result"
    return 1
  fi

  return 0
}

invoke_parse() {
  local upload_id="$1"
  local s3_key="$2"
  local source_type="$3"
  local file_name="$4"

  echo ""
  echo "--- Parsing: $file_name (uploadId=$upload_id) ---"

  # Step 1: Detect
  local detect_payload
  detect_payload=$(jq -n \
    --arg uid "$upload_id" \
    --arg key "$s3_key" \
    --arg st "$source_type" \
    '{mode: "detect", uploadId: $uid, s3Key: $key, sourceType: $st}')

  $AWS lambda invoke \
    --function-name ra-parse_upload \
    --cli-binary-format raw-in-base64-out \
    --payload "$detect_payload" \
    "$TMPDIR/detect_${file_name}.json" > "$TMPDIR/detect_${file_name}_meta.json" 2>&1

  local detect_body
  detect_body=$(cat "$TMPDIR/detect_${file_name}.json")
  local detected_type
  detected_type=$(echo "$detect_body" | jq -r '.detectedType' 2>/dev/null || echo "null")

  if [[ "$detected_type" == "null" || -z "$detected_type" ]]; then
    fail "detect for $file_name" "detectedType=$detected_type"
    return 1
  fi
  pass "detect: type=$detected_type"

  # Step 2: Parse
  local parse_payload
  parse_payload=$(jq -n \
    --arg uid "$upload_id" \
    --arg key "$s3_key" \
    --arg st "$detected_type" \
    '{mode: "parse", uploadId: $uid, s3Key: $key, sourceType: $st}')

  $AWS lambda invoke \
    --function-name ra-parse_upload \
    --cli-binary-format raw-in-base64-out \
    --payload "$parse_payload" \
    "$TMPDIR/parse_${file_name}.json" > "$TMPDIR/parse_${file_name}_meta.json" 2>&1

  local func_err
  func_err=$(jq -r '.FunctionError // empty' "$TMPDIR/parse_${file_name}_meta.json" 2>/dev/null || echo "")
  local parse_body
  parse_body=$(cat "$TMPDIR/parse_${file_name}.json")
  local doc_count
  doc_count=$(echo "$parse_body" | jq '.documents | length' 2>/dev/null || echo "0")

  if [[ -n "$func_err" ]]; then
    fail "parse for $file_name" "FunctionError=$func_err body=$(head -c 500 <<< "$parse_body")"
    return 1
  fi

  if [[ "$doc_count" -lt 1 ]]; then
    fail "parse for $file_name" "0 documents extracted"
    return 1
  fi
  pass "parse: $doc_count documents extracted"

  # Step 3: Embed
  echo "  Embedding $doc_count documents (this may take a moment)..."
  local embed_payload
  embed_payload=$(jq -c '{mode: "embed", uploadId: .uploadId, documents: .documents}' "$TMPDIR/parse_${file_name}.json")

  # Embeddings can be large — increase timeout
  $AWS lambda invoke \
    --function-name ra-parse_upload \
    --cli-binary-format raw-in-base64-out \
    --payload "$embed_payload" \
    "$TMPDIR/embed_${file_name}.json" > "$TMPDIR/embed_${file_name}_meta.json" 2>&1

  local embed_err
  embed_err=$(jq -r '.FunctionError // empty' "$TMPDIR/embed_${file_name}_meta.json" 2>/dev/null || echo "")
  local embed_body
  embed_body=$(cat "$TMPDIR/embed_${file_name}.json")
  local embed_count
  embed_count=$(echo "$embed_body" | jq '.documentCount' 2>/dev/null || echo "0")

  if [[ -n "$embed_err" ]]; then
    fail "embed for $file_name" "FunctionError=$embed_err body=$(head -c 500 <<< "$embed_body")"
    return 1
  fi
  pass "embed: $embed_count documents embedded"

  # Step 4: Finalize
  local finalize_payload
  finalize_payload=$(jq -n \
    --arg uid "$upload_id" \
    --argjson count "$embed_count" \
    '{mode: "finalize", uploadId: $uid, documentCount: $count}')

  $AWS lambda invoke \
    --function-name ra-parse_upload \
    --cli-binary-format raw-in-base64-out \
    --payload "$finalize_payload" \
    "$TMPDIR/finalize_${file_name}.json" > "$TMPDIR/finalize_${file_name}_meta.json" 2>&1

  local final_body
  final_body=$(cat "$TMPDIR/finalize_${file_name}.json")
  local final_status
  final_status=$(echo "$final_body" | jq -r '.status' 2>/dev/null || echo "null")

  if [[ "$final_status" == "completed" ]]; then
    pass "finalize: status=completed (uploadId=$upload_id)"
  else
    fail "finalize for $file_name" "status=$final_status"
    return 1
  fi

  return 0
}

###############################################################################
echo "=== Step 1: Resolving infrastructure outputs ==="
###############################################################################
UPLOADS_BUCKET=$(get_output "RA-Database" "UploadsBucketName")
if [[ -z "$UPLOADS_BUCKET" ]]; then
  echo "ERROR: Could not resolve RA-Database.UploadsBucketName. Is the stack deployed?"
  exit 1
fi
echo "  Uploads bucket: $UPLOADS_BUCKET"

###############################################################################
echo ""
echo "=== Step 2: Verifying test data files ==="
###############################################################################
FILES=(
  "$DATA_DIR/shodan-meridian.jsonl:shodan"
  "$DATA_DIR/nmap-meridian.xml:nmap"
  "$DATA_DIR/social-media-meridian.csv:social"
  "$DATA_DIR/firewall-meridian.log:logs"
  "$DATA_DIR/ids-alerts-meridian.jsonl:custom"
)

for entry in "${FILES[@]}"; do
  file="${entry%%:*}"
  if [[ ! -f "$file" ]]; then
    echo "ERROR: Missing test data file: $file"
    exit 1
  fi
  size=$(wc -c < "$file" | tr -d ' ')
  echo "  Found: $(basename "$file") ($size bytes)"
done

###############################################################################
echo ""
echo "=== Step 3: Uploading test data files ==="
###############################################################################
for entry in "${FILES[@]}"; do
  file="${entry%%:*}"
  source_type="${entry##*:}"
  upload_file "$file" "$source_type" || true
done

###############################################################################
echo ""
echo "=== Step 4: Running ingestion pipeline for each upload ==="
###############################################################################
for entry in "${UPLOAD_IDS[@]}"; do
  IFS=':' read -r upload_id file_name source_type s3_key <<< "$entry"
  invoke_parse "$upload_id" "$s3_key" "$source_type" "$file_name" || true
done

###############################################################################
echo ""
echo "=== Step 5: Verification ==="
###############################################################################

# Check RA-Uploads table for our records
echo ""
echo "--- Checking RA-Uploads records ---"
for entry in "${UPLOAD_IDS[@]}"; do
  IFS=':' read -r upload_id file_name source_type s3_key <<< "$entry"

  $AWS dynamodb get-item \
    --table-name RA-Uploads \
    --key "{\"uploadId\":{\"S\":\"$upload_id\"}}" \
    --output json > "$TMPDIR/verify_${file_name}.json" 2>&1

  local_status=$(jq -r '.Item.ingestionStatus.S // "not_found"' "$TMPDIR/verify_${file_name}.json" 2>/dev/null)
  local_count=$(jq -r '.Item.documentCount.N // "0"' "$TMPDIR/verify_${file_name}.json" 2>/dev/null)

  if [[ "$local_status" == "completed" ]]; then
    pass "RA-Uploads $file_name: status=$local_status, docs=$local_count"
  else
    fail "RA-Uploads $file_name" "status=$local_status (expected completed)"
  fi
done

# Check RA-Documents table count
echo ""
echo "--- Checking RA-Documents total ---"
$AWS dynamodb scan \
  --table-name RA-Documents \
  --select COUNT \
  --output json > "$TMPDIR/doc_count.json" 2>&1

TOTAL_DOCS=$(jq -r '.Count' "$TMPDIR/doc_count.json" 2>/dev/null || echo "0")
echo "  Total documents in RA-Documents: $TOTAL_DOCS"

if [[ "$TOTAL_DOCS" -ge 50 ]]; then
  pass "RA-Documents has $TOTAL_DOCS documents (>=50 expected for full dataset)"
else
  fail "RA-Documents count" "expected >=50, got $TOTAL_DOCS"
fi

###############################################################################
echo ""
echo "============================================================"
echo "  Seed Results: $PASS passed, $FAIL failed"
echo "============================================================"
echo ""
echo "  Dataset: Meridian Defense Systems (meridian-defense.com)"
echo "  Files uploaded: ${#UPLOAD_IDS[@]}"
echo "  Total documents: $TOTAL_DOCS"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "  WARNING: Some steps failed. Check output above for details."
  exit 1
fi

echo "  Demo data seeded successfully! You can now:"
echo "    - Log in as an OSINT analyst and ask about vulnerabilities"
echo "    - Query 'What is the most critical vulnerability?'"
echo "    - Ask 'Show me all exposed database ports'"
echo "    - Explore 'What does the social media footprint tell us?'"
echo "    - Investigate 'Are there signs of active exploitation?'"
echo ""
exit 0
