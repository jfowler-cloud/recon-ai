"""Update context — save leadership context to RA-LeadershipContext, trigger prioritization."""

import json
import os
import time
from decimal import Decimal

import boto3
from aws_lambda_powertools import Logger, Tracer
from ulid import ULID

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")
sfn_client = boto3.client("stepfunctions")


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Save leadership goals/KPIs/weights and trigger re-prioritization."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    goals = body.get("goals", [])
    kpis = body.get("kpis", [])
    priority_weights = body.get("priorityWeights", {})
    planning_window = body.get("planningWindow", "")

    # Validation
    if not goals and not kpis:
        return {"statusCode": 400, "body": json.dumps({"error": "At least one of goals or kpis is required"})}

    # Validate priority weights sum to ~1.0
    if priority_weights:
        required_keys = {"alignment", "impact", "effort", "urgency"}
        if set(priority_weights.keys()) != required_keys:
            return {"statusCode": 400, "body": json.dumps({"error": f"priorityWeights must contain: {sorted(required_keys)}"})}
        weight_sum = sum(priority_weights.values())
        if abs(weight_sum - 1.0) > 0.05:
            return {"statusCode": 400, "body": json.dumps({"error": f"priorityWeights must sum to ~1.0, got {weight_sum:.2f}"})}

    context_id = str(ULID())
    now = int(time.time())

    # Convert floats to Decimal for DynamoDB
    weights_raw = priority_weights or {"alignment": 0.40, "impact": 0.30, "effort": 0.20, "urgency": 0.10}
    weights_decimal = {k: Decimal(str(v)) for k, v in weights_raw.items()}

    context_item = {
        "contextId": context_id,
        "goals": goals,
        "kpis": kpis,
        "priorityWeights": weights_decimal,
        "planningWindow": planning_window,
        "createdAt": now,
        "updatedAt": now,
    }

    table = dynamodb.Table(os.environ["LEADERSHIP_CONTEXT_TABLE"])

    # Save the versioned context
    table.put_item(Item=context_item)

    # Update CONFIG pointer to active context
    table.put_item(Item={
        "contextId": "CONFIG",
        "activeContextId": context_id,
        "updatedAt": now,
    })

    # Start prioritization workflow
    workflow_arn = os.environ.get("PRIORITIZATION_WORKFLOW_ARN", "")
    if workflow_arn:
        try:
            sfn_client.start_execution(
                stateMachineArn=workflow_arn,
                name=f"prioritize-{context_id}",
                input=json.dumps({"contextId": context_id, "triggeredBy": "context_update"}),
            )
            logger.info("Started prioritization workflow", extra={"contextId": context_id})
        except Exception:
            logger.exception("Failed to start prioritization workflow", extra={"contextId": context_id})

    logger.info("Leadership context saved", extra={"contextId": context_id})

    # Return with float weights for JSON serialization
    response_item = {**context_item, "priorityWeights": weights_raw}

    return {
        "statusCode": 200,
        "body": json.dumps({"context": response_item}),
    }
