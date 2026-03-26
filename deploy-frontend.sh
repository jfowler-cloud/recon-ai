#!/usr/bin/env bash
# Build frontend and deploy to S3 + CloudFront
set -euo pipefail

PROFILE="${AWS_PROFILE:-cdk-deploy-prod}"
REGION="${AWS_REGION:-us-east-1}"

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "RA-Database" \
  --query "Stacks[0].Outputs[?OutputKey=='HostingBucketName'].OutputValue" \
  --output text --profile "$PROFILE" --region "$REGION")

DIST_DOMAIN=$(aws cloudformation describe-stacks \
  --stack-name "RA-Database" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" \
  --output text --profile "$PROFILE" --region "$REGION")

if [ -z "$BUCKET" ] || [ "$BUCKET" = "None" ]; then
  echo "Error: HostingBucketName output not found in RA-Database stack"
  exit 1
fi
if [ -z "$DIST_DOMAIN" ] || [ "$DIST_DOMAIN" = "None" ]; then
  echo "Error: DistributionDomain output not found in RA-Database stack"
  exit 1
fi

echo "Building frontend..."
cd "$(dirname "$0")/apps/web"
npm run build

echo "Deploying to S3: $BUCKET"
aws s3 sync dist/ "s3://$BUCKET/" --delete --profile "$PROFILE" --region "$REGION"

echo "Invalidating CloudFront cache..."
CF_DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='$DIST_DOMAIN'].Id" \
  --output text --profile "$PROFILE")

if [ -n "$CF_DIST_ID" ]; then
  aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" --paths "/*" --profile "$PROFILE"
  echo "CloudFront invalidation created for $CF_DIST_ID"
fi

echo "Deploy complete!"
