"""Upload data — generate presigned S3 URL and create RA-Uploads record."""

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger, Tracer
from ulid import ULID

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Generate a presigned PUT URL for S3 and create an upload tracking record."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    file_name = body.get("fileName")
    source_type = body.get("sourceType", "custom")
    analyst_id = body.get("analystId", "unknown")

    if not file_name:
        return {"statusCode": 400, "body": json.dumps({"error": "fileName is required"})}

    # Normalize short source names to parser names for consistency
    source_name_map = {
        "shodan": "shodan_json", "nmap": "nmap_xml", "social": "social_csv",
        "logs": "log_text", "documents": "document_textract",
    }
    source_type = source_name_map.get(source_type, source_type)

    valid_sources = {"shodan_json", "nmap_xml", "social_csv", "log_text", "document_textract", "text_passthrough", "custom"}
    if source_type not in valid_sources:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid sourceType: {source_type}"})}

    upload_id = str(ULID())
    s3_key = f"uploads/{source_type}/{upload_id}/{file_name}"
    bucket = os.environ["UPLOADS_BUCKET"]

    # Generate presigned URL (valid for 1 hour)
    presigned_url = s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": s3_key},
        ExpiresIn=3600,
    )

    # Create upload tracking record
    now = int(time.time())
    uploads_table = dynamodb.Table(os.environ["UPLOADS_TABLE"])
    uploads_table.put_item(Item={
        "uploadId": upload_id,
        "analystId": analyst_id,
        "sourceType": source_type,
        "s3Key": s3_key,
        "fileName": file_name,
        "ingestionStatus": "pending",
        "createdAt": now,
        "updatedAt": now,
    })

    logger.info("Upload record created", extra={"uploadId": upload_id, "sourceType": source_type})

    return {
        "statusCode": 200,
        "body": json.dumps({
            "uploadId": upload_id,
            "presignedUrl": presigned_url,
            "s3Key": s3_key,
        }),
    }
