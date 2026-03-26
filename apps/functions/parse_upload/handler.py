"""Parse upload — multi-mode Lambda for the RA-IngestionWorkflow.

Modes (set via event['mode']):
  - detect: Detect data type from S3 object
  - parse: Parse/extract text using source-type adapters
  - embed: Generate embeddings via Titan v2
  - finalize: Update upload status to completed
"""

import json
import os
import time

import boto3
from aws_lambda_powertools import Logger, Tracer

from adapters import get_adapter

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Route to the appropriate mode handler."""
    mode = event.get("mode", "detect")
    logger.info("parse_upload invoked", extra={"mode": mode, "uploadId": event.get("uploadId")})

    if mode == "detect":
        return _detect(event)
    elif mode == "parse":
        return _parse(event)
    elif mode == "embed":
        return _embed(event)
    elif mode == "finalize":
        return _finalize(event)
    else:
        raise ValueError(f"Unknown mode: {mode}")


def _detect(event: dict) -> dict:
    """Detect data type from S3 object metadata and file extension.

    When triggered by EventBridge, uploadId contains the full S3 key path.
    Parse the actual uploadId from the path structure: uploads/{sourceType}/{uploadId}/{fileName}
    """
    s3_key = event["s3Key"]
    upload_id = event["uploadId"]
    source_type = event.get("sourceType", "auto")

    # Parse uploadId from S3 key if it contains "/" (EventBridge trigger passes full S3 key)
    # Path format: uploads/{sourceType}/{uploadId}/{fileName}
    if "/" in upload_id:
        parts = s3_key.split("/")
        if len(parts) >= 4 and parts[0] == "uploads":
            upload_id = parts[2]
            if source_type == "auto" and parts[1] != "auto":
                source_type = parts[1]
            logger.info("Parsed uploadId from S3 key", extra={"uploadId": upload_id, "pathSourceType": parts[1]})
        else:
            logger.warning("S3 key has unexpected structure, using full key as uploadId", extra={"s3Key": s3_key})

    # Update status to processing
    uploads_table = dynamodb.Table(os.environ["UPLOADS_TABLE"])
    uploads_table.update_item(
        Key={"uploadId": upload_id},
        UpdateExpression="SET ingestionStatus = :s, updatedAt = :t",
        ExpressionAttributeValues={":s": "processing", ":t": int(time.time())},
    )

    # Auto-detect from file extension if sourceType is 'auto'
    if source_type == "auto":
        ext = s3_key.rsplit(".", 1)[-1].lower() if "." in s3_key else ""
        type_map = {
            "json": "shodan_json",
            "xml": "nmap_xml",
            "csv": "social_csv",
            "log": "log_text",
            "txt": "text_passthrough",
            # Documents & images → Textract extraction + optional Comprehend enrichment
            "pdf": "document_textract",
            "png": "document_textract",
            "jpg": "document_textract",
            "jpeg": "document_textract",
            "tiff": "document_textract",
            "tif": "document_textract",
        }
        source_type = type_map.get(ext, "text_passthrough")

    return {
        "uploadId": upload_id,
        "s3Key": s3_key,
        "sourceType": source_type,
        "detectedType": source_type,
    }


def _parse(event: dict) -> dict:
    """Parse the uploaded file using the appropriate adapter."""
    upload_id = event["uploadId"]
    s3_key = event["s3Key"]
    source_type = event.get("sourceType", "text_passthrough")

    bucket = os.environ["UPLOADS_BUCKET"]
    obj = s3_client.get_object(Bucket=bucket, Key=s3_key)
    content = obj["Body"].read()

    logger.info("Selecting adapter", extra={"sourceType": source_type, "uploadId": upload_id})
    adapter = get_adapter(source_type)
    documents = adapter(content, upload_id, s3_key)

    if not isinstance(documents, list):
        logger.error("Adapter returned non-list", extra={"sourceType": source_type, "type": str(type(documents))})
        documents = []

    logger.info("Parsed documents", extra={"uploadId": upload_id, "count": len(documents)})

    return {
        "uploadId": upload_id,
        "s3Key": s3_key,
        "sourceType": source_type,
        "documents": documents,
    }


def _embed(event: dict) -> dict:
    """Generate embeddings for parsed documents and store in S3 + DynamoDB."""
    upload_id = event["uploadId"]
    documents = event.get("documents", [])

    if not documents:
        return {"uploadId": upload_id, "documentCount": 0}

    bedrock = boto3.client("bedrock-runtime")
    model_id = os.environ.get("EMBEDDING_MODEL_ID", "amazon.titan-embed-text-v2:0")
    vectors_bucket = os.environ["VECTORS_BUCKET"]
    documents_table = dynamodb.Table(os.environ["DOCUMENTS_TABLE"])

    from ulid import ULID

    embeddings = []
    ttl_days = int(os.environ.get("TTL_DOCUMENTS_DAYS", "365"))
    expires_at = int(time.time()) + (ttl_days * 86400)

    for doc in documents:
        text = doc.get("text", "")
        if len(text) > 8000:
            logger.info("Truncating document text", extra={"originalLen": len(text), "uploadId": upload_id})
            text = text[:8000]
        if not text.strip():
            continue

        doc_id = str(ULID())

        # Generate embedding with retry-safe error handling
        try:
            response = bedrock.invoke_model(
                modelId=model_id,
                body=json.dumps({"inputText": text}),
            )
            embedding = json.loads(response["body"].read()).get("embedding", [])
        except Exception as e:
            logger.error("Bedrock embedding failed, skipping document", extra={"error": str(e), "uploadId": upload_id, "docId": doc_id})
            continue

        # Store document in DynamoDB
        documents_table.put_item(Item={
            "uploadId": upload_id,
            "documentId": doc_id,
            "text": text,
            "metadata": doc.get("metadata", {}),
            "sourceType": doc.get("sourceType", "custom"),
            "importance": doc.get("importance", "standard"),
            "expiresAt": expires_at,
        })

        embeddings.append({
            "uploadId": upload_id,
            "documentId": doc_id,
            "embedding": embedding,
            "importance": doc.get("importance", "standard"),
        })

    # Store embeddings batch in S3
    if embeddings:
        batch_id = str(ULID())
        s3_client.put_object(
            Bucket=vectors_bucket,
            Key=f"embeddings/{upload_id}/{batch_id}.json",
            Body=json.dumps(embeddings),
            ContentType="application/json",
        )

    logger.info("Embedded documents", extra={"uploadId": upload_id, "count": len(embeddings)})

    return {"uploadId": upload_id, "documentCount": len(embeddings)}


def _finalize(event: dict) -> dict:
    """Update upload status to completed."""
    upload_id = event["uploadId"]
    document_count = event.get("documentCount", 0)

    uploads_table = dynamodb.Table(os.environ["UPLOADS_TABLE"])
    uploads_table.update_item(
        Key={"uploadId": upload_id},
        UpdateExpression="SET ingestionStatus = :s, documentCount = :c, updatedAt = :t",
        ExpressionAttributeValues={
            ":s": "completed",
            ":c": document_count,
            ":t": int(time.time()),
        },
    )

    logger.info("Upload finalized", extra={"uploadId": upload_id, "documentCount": document_count})

    return {"uploadId": upload_id, "status": "completed", "documentCount": document_count}
