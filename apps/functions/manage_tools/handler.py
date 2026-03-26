"""Manage tools — CRUD for the red team tool registry (RA-Tools).

Each tool entry describes a security testing tool with its capabilities,
risk profile, and success characteristics. This data is vectorized so the
chat agent can recommend tools, and the prioritization agent can factor
tool risk/success into target ranking.
"""

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
bedrock_client = boto3.client(
    "bedrock-runtime",
    config=boto3.session.Config(retries={"mode": "adaptive", "max_attempts": 3}),
)


def _build_tool_embedding_text(item: dict) -> str:
    """Build a rich text representation of a tool for embedding.

    Includes name, description, category, risk/success profiles, pros/cons
    so semantic search can match on any of these dimensions.
    """
    risk = item.get("riskProfile", {})
    success = item.get("successProfile", {})

    risk_summary = (
        f"Risk profile: service disruption={risk.get('serviceDisruption', 'unknown')}, "
        f"system damage={risk.get('systemDamage', 'unknown')}, "
        f"detection likelihood={risk.get('detectionLikelihood', 'unknown')}, "
        f"requires auth={risk.get('requiresAuth', False)}, "
        f"reversible={risk.get('reversible', True)}, "
        f"noisy={risk.get('noisy', False)}"
    )

    success_summary = (
        f"Success profile: estimated success rate={success.get('estimatedSuccessRate', 0)}%, "
        f"avg execution time={success.get('avgExecutionTime', 'unknown')}, "
        f"required access={success.get('requiredAccess', 'network')}, "
        f"output type={success.get('outputType', 'shell')}"
    )

    pros = []
    cons = []

    # Derive pros from risk/success profiles
    sr = success.get("estimatedSuccessRate", 0)
    if sr >= 70:
        pros.append(f"High success rate ({sr}%)")
    elif sr >= 40:
        pros.append(f"Moderate success rate ({sr}%)")
    else:
        cons.append(f"Low success rate ({sr}%)")

    if risk.get("reversible", True):
        pros.append("Effects are reversible")
    else:
        cons.append("Effects are NOT reversible — potential permanent damage")

    if not risk.get("noisy", False):
        pros.append("Stealthy — low network noise")
    else:
        cons.append("Noisy — generates high traffic/logs, likely to trigger IDS")

    dl = risk.get("detectionLikelihood", "unknown")
    if dl == "low":
        pros.append("Low detection likelihood by SOC/IDS")
    elif dl == "high":
        cons.append("High detection likelihood — SOC will likely notice")

    sd = risk.get("serviceDisruption", "unknown")
    if sd in ("high", "critical"):
        cons.append(f"Service disruption risk is {sd} — could take down services")
    elif sd == "none":
        pros.append("No service disruption risk")

    damage = risk.get("systemDamage", "unknown")
    if damage in ("high", "critical"):
        cons.append(f"System damage risk is {damage} — could nuke infrastructure")
    elif damage == "none":
        pros.append("No system damage risk")

    if not risk.get("requiresAuth", False):
        pros.append("Does not require pre-existing credentials")
    else:
        cons.append("Requires authenticated access first")

    target_types = ", ".join(item.get("targetTypes", [])) or "general"
    protocols = ", ".join(item.get("protocols", [])) or "any"
    cves = ", ".join(item.get("cveTargets", [])) or "none"

    pros_text = "; ".join(pros) if pros else "None identified"
    cons_text = "; ".join(cons) if cons else "None identified"

    return (
        f"Tool: {item.get('name', '')}\n"
        f"Description: {item.get('description', '')}\n"
        f"Category: {item.get('category', '')}\n"
        f"Framework: {item.get('framework', '')}\n"
        f"Target types: {target_types}\n"
        f"Protocols: {protocols}\n"
        f"CVEs targeted: {cves}\n"
        f"{risk_summary}\n"
        f"{success_summary}\n"
        f"Pros: {pros_text}\n"
        f"Cons: {cons_text}\n"
        f"Notes: {item.get('notes', '')}"
    )


def _generate_embedding(text: str) -> list[float]:
    """Generate a Titan v2 embedding vector."""
    model_id = os.environ.get("EMBEDDING_MODEL_ID", "amazon.titan-embed-text-v2:0")
    response = bedrock_client.invoke_model(
        modelId=model_id,
        body=json.dumps({"inputText": text[:8000]}),
    )
    return json.loads(response["body"].read()).get("embedding", [])


def _vectorize_tool(item: dict) -> None:
    """Generate embedding for a tool and store in S3 vectors bucket."""
    vectors_bucket = os.environ.get("VECTORS_BUCKET")
    if not vectors_bucket:
        logger.warning("VECTORS_BUCKET not set, skipping tool vectorization")
        return

    text = _build_tool_embedding_text(item)
    try:
        embedding = _generate_embedding(text)
    except Exception as exc:
        logger.warning("Failed to generate embedding for tool %s: %s", item.get("toolId"), exc)
        return

    vector_record = {
        "toolId": item.get("toolId"),
        "name": item.get("name", ""),
        "category": item.get("category", ""),
        "sourceType": "tool_registry",
        "importance": "high",
        "text": text,
        "embedding": embedding,
        "riskProfile": item.get("riskProfile", {}),
        "successProfile": item.get("successProfile", {}),
        "targetTypes": item.get("targetTypes", []),
        "protocols": item.get("protocols", []),
        "cveTargets": item.get("cveTargets", []),
        "status": item.get("status", "active"),
    }

    s3_key = f"embeddings/tools/{item['toolId']}.json"
    try:
        s3_client.put_object(
            Bucket=vectors_bucket,
            Key=s3_key,
            Body=json.dumps([vector_record]),
            ContentType="application/json",
        )
        logger.info("Tool vectorized", extra={"toolId": item["toolId"], "s3Key": s3_key})
    except Exception as exc:
        logger.warning("Failed to store tool vector for %s: %s", item.get("toolId"), exc)


@tracer.capture_lambda_handler
@logger.inject_lambda_context
def handler(event, context):
    """Route by action: list, get, create, update."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event
    action = body.get("action", "list")

    if action == "list":
        return _list_tools()
    elif action == "get":
        return _get_tool(body)
    elif action == "create":
        return _create_tool(body)
    elif action == "update":
        return _update_tool(body)
    else:
        return {"statusCode": 400, "body": json.dumps({"error": f"Unknown action: {action}"})}


def _list_tools():
    """List all registered tools."""
    table = dynamodb.Table(os.environ["TOOLS_TABLE"])
    items = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while response.get("LastEvaluatedKey"):
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))

    return {"statusCode": 200, "body": json.dumps({"tools": items}, default=str)}


def _get_tool(body: dict):
    """Get a single tool by toolId."""
    tool_id = body.get("toolId")
    if not tool_id:
        return {"statusCode": 400, "body": json.dumps({"error": "toolId is required"})}

    table = dynamodb.Table(os.environ["TOOLS_TABLE"])
    resp = table.get_item(Key={"toolId": tool_id})
    item = resp.get("Item")
    if not item:
        return {"statusCode": 404, "body": json.dumps({"error": f"Tool {tool_id} not found"})}

    return {"statusCode": 200, "body": json.dumps({"tool": item}, default=str)}


def _create_tool(body: dict):
    """Register a new tool in the registry."""
    name = body.get("name")
    if not name:
        return {"statusCode": 400, "body": json.dumps({"error": "name is required"})}

    tool_id = str(ULID())
    now = int(time.time())

    # Risk profile
    risk_profile = body.get("riskProfile", {})
    valid_risk_levels = {"none", "low", "medium", "high", "critical"}
    service_disruption = risk_profile.get("serviceDisruption", "unknown")
    system_damage = risk_profile.get("systemDamage", "unknown")
    detection_likelihood = risk_profile.get("detectionLikelihood", "unknown")

    item = {
        "toolId": tool_id,
        "name": name,
        "description": body.get("description", ""),
        "category": body.get("category", "exploitation"),
        "version": body.get("version", ""),
        "framework": body.get("framework", ""),  # metasploit, cobalt-strike, custom, etc.
        "targetTypes": body.get("targetTypes", []),  # web, network, database, wireless, social-engineering
        "protocols": body.get("protocols", []),  # tcp, udp, http, smb, rdp, ssh
        "cveTargets": body.get("cveTargets", []),  # specific CVEs this tool exploits
        "riskProfile": {
            "serviceDisruption": service_disruption,  # none/low/medium/high/critical — does it crash the service?
            "systemDamage": system_damage,  # none/low/medium/high/critical — can it destroy the system?
            "detectionLikelihood": detection_likelihood,  # low/medium/high — how likely IDS/SOC detects it
            "requiresAuth": risk_profile.get("requiresAuth", False),  # needs credentials first?
            "reversible": risk_profile.get("reversible", True),  # can effects be undone?
            "noisy": risk_profile.get("noisy", False),  # generates lots of traffic/logs?
        },
        "successProfile": {
            "estimatedSuccessRate": body.get("successProfile", {}).get("estimatedSuccessRate", 0),  # 0-100
            "avgExecutionTime": body.get("successProfile", {}).get("avgExecutionTime", "unknown"),  # "30s", "5m", etc.
            "requiredAccess": body.get("successProfile", {}).get("requiredAccess", "network"),  # network, local, physical
            "outputType": body.get("successProfile", {}).get("outputType", "shell"),  # shell, data, credential, dos
        },
        "commands": body.get("commands", []),  # example command templates
        "notes": body.get("notes", ""),
        "addedBy": body.get("addedBy", "unknown"),
        "status": "active",
        "createdAt": now,
        "updatedAt": now,
    }

    table = dynamodb.Table(os.environ["TOOLS_TABLE"])
    table.put_item(Item=item)

    _vectorize_tool(item)

    logger.info("Tool registered", extra={"toolId": tool_id, "tool_name": name})
    return {"statusCode": 200, "body": json.dumps({"tool": item}, default=str)}


def _update_tool(body: dict):
    """Update an existing tool."""
    tool_id = body.get("toolId")
    if not tool_id:
        return {"statusCode": 400, "body": json.dumps({"error": "toolId is required"})}

    table = dynamodb.Table(os.environ["TOOLS_TABLE"])
    resp = table.get_item(Key={"toolId": tool_id})
    existing = resp.get("Item")
    if not existing:
        return {"statusCode": 404, "body": json.dumps({"error": f"Tool {tool_id} not found"})}

    # Merge updates
    updatable = ["name", "description", "category", "version", "framework", "targetTypes",
                 "protocols", "cveTargets", "riskProfile", "successProfile", "commands", "notes", "status"]
    updates = {}
    for field in updatable:
        if field in body:
            updates[field] = body[field]

    if not updates:
        return {"statusCode": 400, "body": json.dumps({"error": "No updatable fields provided"})}

    updates["updatedAt"] = int(time.time())

    expr_parts = []
    expr_names = {}
    expr_values = {}
    for i, (k, v) in enumerate(updates.items()):
        expr_parts.append(f"#f{i} = :v{i}")
        expr_names[f"#f{i}"] = k
        expr_values[f":v{i}"] = v

    table.update_item(
        Key={"toolId": tool_id},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )

    logger.info("Tool updated", extra={"toolId": tool_id})
    merged = {**existing, **updates}

    _vectorize_tool(merged)

    return {"statusCode": 200, "body": json.dumps({"tool": merged}, default=str)}
