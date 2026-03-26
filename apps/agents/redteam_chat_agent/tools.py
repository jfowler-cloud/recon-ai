"""Red team chat agent tools — targets, tool history, tool registry search, leadership goals."""

import json

from boto3.dynamodb.conditions import Key
from strands import tool

from shared.config import AppConfig
from shared.db import get_dynamodb, scan_table
from shared.embeddings import generate_embedding, search_similar

_config = AppConfig()
_s3 = None


def _get_s3():
    """Get a shared S3 client."""
    global _s3
    if _s3 is None:
        import boto3
        _s3 = boto3.client("s3")
    return _s3


@tool
def get_priority_targets(status: str | None = None, limit: int = 10) -> dict:
    """Get prioritized targets sorted by score.

    Args:
        status: Optional filter by status (e.g., "queued", "active", "completed").
        limit: Maximum number of targets to return (default 10).

    Returns:
        Dictionary with prioritized target list.
    """
    targets = scan_table(_config.targets_table)

    if status:
        targets = [t for t in targets if t.get("status") == status]

    # Sort by priorityScore descending
    targets.sort(key=lambda t: float(t.get("priorityScore", 0)), reverse=True)
    targets = targets[:limit]

    results = []
    for t in targets:
        results.append({
            "targetId": t.get("targetId"),
            "name": t.get("name", ""),
            "description": t.get("description", ""),
            "status": t.get("status", ""),
            "priorityScore": float(t.get("priorityScore", 0)),
            "severity": t.get("severity", ""),
            "effort": t.get("effort", ""),
            "tags": t.get("tags", []),
        })

    return {"targets": results, "total": len(results)}


@tool
def get_tool_history(ticket_id: str | None = None, limit: int = 20) -> dict:
    """Get recent tool actions from RA-ToolActions.

    Args:
        ticket_id: Optional ticket ID to filter actions for.
        limit: Maximum number of actions to return (default 20).

    Returns:
        Dictionary with tool action history.
    """
    if ticket_id:
        actions = []
        table = get_dynamodb().Table(_config.tool_actions_table)
        response = table.query(
            KeyConditionExpression=Key("ticketId").eq(ticket_id),
            ScanIndexForward=False,
        )
        actions = response.get("Items", [])
    else:
        actions = scan_table(_config.tool_actions_table)
        actions.sort(key=lambda a: a.get("createdAt", 0), reverse=True)

    actions = actions[:limit]

    results = []
    for a in actions:
        results.append({
            "ticketId": a.get("ticketId"),
            "actionId": a.get("actionId"),
            "toolName": a.get("toolName", ""),
            "executionType": a.get("executionType", "manual"),
            "status": a.get("status", ""),
            "output": a.get("output", "")[:500],
            "createdAt": a.get("createdAt", 0),
        })

    return {"actions": results, "total": len(results)}


@tool
def get_leadership_goals() -> dict:
    """Get current leadership goals and context from RA-LeadershipContext.

    Returns:
        Dictionary with leadership goals and strategic context.
    """
    contexts = scan_table(_config.leadership_context_table)

    goals = []
    for ctx in contexts:
        goals.append({
            "contextId": ctx.get("contextId"),
            "type": ctx.get("type", ""),
            "title": ctx.get("title", ""),
            "description": ctx.get("description", ""),
            "priority": ctx.get("priority", ""),
            "status": ctx.get("status", ""),
            "updatedAt": ctx.get("updatedAt", 0),
        })

    # Sort by priority (high first) then by updatedAt
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    goals.sort(key=lambda g: (priority_order.get(g.get("priority", ""), 99), -g.get("updatedAt", 0)))

    return {"goals": goals, "total": len(goals)}


@tool
def search_tools(query: str, category: str | None = None, limit: int = 5) -> dict:
    """Semantic search over the red team tool registry.

    Finds tools by description, capabilities, risk profile, target types, or CVEs.
    Returns matching tools with full risk/success analysis including pros and cons.

    Args:
        query: Natural language search query (e.g., "stealthy network scanner", "exploit CVE-2024-1234",
               "low-risk web application tool").
        category: Optional filter by tool category (exploitation, reconnaissance, persistence, etc.).
        limit: Maximum number of results to return (default 5).

    Returns:
        Dictionary with matching tools, their risk profiles, success rates, and relevance scores.
    """
    vectors_bucket = _config.vectors_bucket
    if not vectors_bucket:
        return {"results": [], "message": "Vectors bucket not configured."}

    # Load tool vectors from S3
    s3 = _get_s3()
    tool_vectors = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=vectors_bucket, Prefix="embeddings/tools/"):
        for obj in page.get("Contents", []):
            try:
                resp = s3.get_object(Bucket=vectors_bucket, Key=obj["Key"])
                batch = json.loads(resp["Body"].read())
                if isinstance(batch, list):
                    tool_vectors.extend(batch)
            except Exception:
                continue

    if not tool_vectors:
        return {"results": [], "message": "No tools vectorized yet. Register tools via manage_tools first."}

    # Filter by category if specified
    if category:
        tool_vectors = [v for v in tool_vectors if v.get("category") == category]

    # Filter out inactive tools
    tool_vectors = [v for v in tool_vectors if v.get("status", "active") == "active"]

    query_embedding = generate_embedding(query, _config.embedding_model_id)
    results = search_similar(query_embedding, tool_vectors, top_k=limit)

    enriched = []
    for r in results:
        risk = r.get("riskProfile", {})
        success = r.get("successProfile", {})

        # Derive pros and cons
        pros = []
        cons = []

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
            cons.append("Noisy — generates high traffic/logs")

        if risk.get("detectionLikelihood") == "low":
            pros.append("Low detection likelihood")
        elif risk.get("detectionLikelihood") == "high":
            cons.append("High detection likelihood — SOC will likely notice")

        if risk.get("serviceDisruption") in ("high", "critical"):
            cons.append(f"Could disrupt/take down services ({risk['serviceDisruption']})")
        elif risk.get("serviceDisruption") == "none":
            pros.append("No service disruption risk")

        if risk.get("systemDamage") in ("high", "critical"):
            cons.append(f"Could damage/destroy systems ({risk['systemDamage']})")
        elif risk.get("systemDamage") == "none":
            pros.append("No system damage risk")

        enriched.append({
            "toolId": r.get("toolId"),
            "name": r.get("name", ""),
            "category": r.get("category", ""),
            "relevanceScore": round(r["score"], 4),
            "targetTypes": r.get("targetTypes", []),
            "protocols": r.get("protocols", []),
            "cveTargets": r.get("cveTargets", []),
            "riskProfile": risk,
            "successProfile": success,
            "pros": pros,
            "cons": cons,
        })

    return {"results": enriched, "total": len(enriched)}


@tool
def get_tool_registry(category: str | None = None, status: str = "active") -> dict:
    """Get all registered tools from the tool registry (non-semantic, structured query).

    Args:
        category: Optional category filter (exploitation, reconnaissance, persistence, etc.).
        status: Filter by status (default "active").

    Returns:
        Dictionary with all matching tools and their full profiles.
    """
    tools_table = _config.tools_table
    all_tools = scan_table(tools_table)

    filtered = []
    for t in all_tools:
        if status and t.get("status") != status:
            continue
        if category and t.get("category") != category:
            continue
        filtered.append({
            "toolId": t.get("toolId"),
            "name": t.get("name", ""),
            "description": t.get("description", ""),
            "category": t.get("category", ""),
            "framework": t.get("framework", ""),
            "targetTypes": t.get("targetTypes", []),
            "protocols": t.get("protocols", []),
            "cveTargets": t.get("cveTargets", []),
            "riskProfile": t.get("riskProfile", {}),
            "successProfile": t.get("successProfile", {}),
            "status": t.get("status", ""),
        })

    return {"tools": filtered, "total": len(filtered)}
