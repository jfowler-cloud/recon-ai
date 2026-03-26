"""Seed data — CDK custom resource that seeds RA-DataSources from config."""

import json
import os
import urllib.request

import boto3
from aws_lambda_powertools import Logger

logger = Logger(service="recon-ai")

dynamodb = boto3.resource("dynamodb")

DATA_SOURCES = [
    {"sourceId": "shodan", "name": "Shodan Results", "parser": "shodan_json", "description": "Shodan API exports"},
    {"sourceId": "nmap", "name": "Network Scans", "parser": "nmap_xml", "description": "Nmap XML output"},
    {"sourceId": "social", "name": "Social Media", "parser": "social_csv", "description": "Social media feed exports"},
    {"sourceId": "logs", "name": "Log Files", "parser": "log_text", "description": "System/application logs"},
    {"sourceId": "documents", "name": "Documents & Images", "parser": "document_textract", "description": "PDFs, PNGs, JPEGs, TIFFs — extracted via Textract, enriched via Comprehend"},
    {"sourceId": "custom", "name": "Custom Data", "parser": "text_passthrough", "description": "Free-form text uploads"},
]


def handler(event, context):
    """CDK Custom Resource handler — seed data sources on Create/Update."""
    request_type = event.get("RequestType", "Create")
    logger.info("Seed data: %s", request_type)

    if request_type == "Delete":
        return _send_response(event, "SUCCESS", "Delete — no action needed")

    sources_table = dynamodb.Table(os.environ["DATA_SOURCES_TABLE"])

    seeded = 0
    for source in DATA_SOURCES:
        try:
            sources_table.put_item(
                Item=source,
                ConditionExpression="attribute_not_exists(sourceId)",
            )
            seeded += 1
            logger.info("Seeded source: %s", source["sourceId"])
        except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
            logger.info("Source already exists: %s", source["sourceId"])

    return _send_response(event, "SUCCESS", f"Seeded {seeded} sources")


def _send_response(event, status, reason):
    """Send CloudFormation custom resource response."""
    response_body = json.dumps({
        "Status": status,
        "Reason": reason,
        "PhysicalResourceId": event.get("PhysicalResourceId", event.get("LogicalResourceId", "seed-data")),
        "StackId": event.get("StackId", ""),
        "RequestId": event.get("RequestId", ""),
        "LogicalResourceId": event.get("LogicalResourceId", ""),
    })

    response_url = event.get("ResponseURL")
    if response_url:
        try:
            req = urllib.request.Request(
                response_url,
                data=response_body.encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT",
            )
            urllib.request.urlopen(req)
        except Exception as e:
            logger.error("Failed to send CloudFormation response: %s", str(e))

    return {"status": status, "reason": reason}
