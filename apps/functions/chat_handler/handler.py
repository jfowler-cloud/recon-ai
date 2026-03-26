"""Chat handler — receives a message, routes to persona-specific agent Lambda, stores response."""

import json
import os
import random
import string
import time

import boto3
from aws_lambda_powertools import Logger, Tracer

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")

dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")

PERSONA_FUNCTIONS = {
    "osint": os.environ.get("OSINT_AGENT_FN_NAME", "ra-osint_chat_agent"),
    "redteam": os.environ.get("REDTEAM_AGENT_FN_NAME", "ra-redteam_chat_agent"),
    "leadership": os.environ.get("LEADERSHIP_AGENT_FN_NAME", "ra-leadership_chat_agent"),
}


def generate_ulid() -> str:
    """Generate a ULID-like ID."""
    ts = hex(int(time.time() * 1000))[2:]
    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    return f"{ts}{rand}"


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Handle a chat message: route to persona agent, store user + assistant messages."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event

    user_id = body.get("userId", "")
    session_id = body.get("sessionId") or generate_ulid()
    message = body.get("message", "").strip()
    persona = body.get("persona", "osint")

    if not message:
        return {"statusCode": 400, "body": json.dumps({"error": "message is required"})}

    if not user_id:
        return {"statusCode": 400, "body": json.dumps({"error": "userId is required"})}

    if persona not in PERSONA_FUNCTIONS:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid persona: {persona}. Must be one of: osint, redteam, leadership"})}

    sessions_table = dynamodb.Table(os.environ["CHAT_SESSIONS_TABLE"])
    messages_table = dynamodb.Table(os.environ["CHAT_MESSAGES_TABLE"])

    ttl_days = int(os.environ.get("TTL_SESSIONS_DAYS", "90"))
    now = int(time.time())
    ttl = now + (ttl_days * 86400)

    # Ensure session exists
    sessions_table.update_item(
        Key={"userId": user_id, "sessionId": session_id},
        UpdateExpression="SET title = if_not_exists(title, :t), createdAt = if_not_exists(createdAt, :c), updatedAt = :u, expiresAt = :e, persona = if_not_exists(persona, :p)",
        ExpressionAttributeValues={
            ":t": message[:50],
            ":c": now,
            ":u": now,
            ":e": ttl,
            ":p": persona,
        },
    )

    # Store user message
    user_msg_id = generate_ulid()
    messages_table.put_item(Item={
        "sessionId": session_id,
        "messageId": user_msg_id,
        "role": "user",
        "content": message,
        "createdAt": now,
        "expiresAt": ttl,
    })

    # Invoke persona-specific agent Lambda
    response_text = ""
    output_data = None
    try:
        agent_fn_name = PERSONA_FUNCTIONS[persona]
        logger.info("Invoking agent Lambda", extra={"persona": persona, "function": agent_fn_name})

        agent_response = lambda_client.invoke(
            FunctionName=agent_fn_name,
            InvocationType="RequestResponse",
            Payload=json.dumps({"message": message}),
        )

        payload = json.loads(agent_response["Payload"].read())
        if isinstance(payload.get("body"), str):
            agent_body = json.loads(payload["body"])
        else:
            agent_body = payload

        response_text = agent_body.get("content", "")
        output_data = agent_body.get("outputData")

    except Exception:
        logger.exception("Agent invocation error")
        response_text = "I encountered an error processing your request. Please try again."

    # Store assistant message
    assistant_msg_id = generate_ulid()
    assistant_item = {
        "sessionId": session_id,
        "messageId": assistant_msg_id,
        "role": "assistant",
        "content": response_text,
        "createdAt": int(time.time()),
        "expiresAt": ttl,
    }
    if output_data:
        assistant_item["outputData"] = output_data
    messages_table.put_item(Item=assistant_item)

    # Update session timestamp
    sessions_table.update_item(
        Key={"userId": user_id, "sessionId": session_id},
        UpdateExpression="SET updatedAt = :u",
        ExpressionAttributeValues={":u": int(time.time())},
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "sessionId": session_id,
            "messageId": assistant_msg_id,
            "content": response_text,
            "outputData": output_data,
        }),
    }
