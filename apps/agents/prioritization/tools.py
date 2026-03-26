"""Strands @tool functions for the Prioritization agent."""
import concurrent.futures
import logging
import time
import uuid

from strands import tool
from shared.config import AppConfig
from shared.db import get_dynamodb, query_table, scan_table

logger = logging.getLogger(__name__)

config = AppConfig()

ACTIVE_STATUSES = ["queued", "enriched", "active", "in_progress"]


def _clamp_score(target_id: str, raw_score) -> int:
    """Clamp priority score to 0-100 range, logging a warning if clamping occurs."""
    clamped = min(100, max(0, int(raw_score)))
    if clamped != int(raw_score):
        logger.warning("Priority score clamped for target %s: raw=%s, clamped=%s", target_id, raw_score, clamped)
    return clamped


@tool
def get_all_active_targets() -> list[dict]:
    """Query StatusIndex for each active status and merge results. Avoids a full table scan."""
    from boto3.dynamodb.conditions import Key

    all_targets = []
    seen = set()
    for status in ACTIVE_STATUSES:
        items = query_table(
            config.targets_table,
            Key("status").eq(status),
            IndexName="StatusIndex",
        )
        for target in items:
            target_id = target.get("targetId")
            if target_id and target_id not in seen:
                seen.add(target_id)
                all_targets.append(target)
    return all_targets


@tool
def get_leadership_context() -> dict:
    """Fetch the active leadership context including goals, KPIs, and priority weights."""
    ddb = get_dynamodb()
    table = ddb.Table(config.leadership_context_table)
    config_item = table.get_item(Key={"contextId": "CONFIG"}).get("Item")
    if not config_item:
        return {
            "goals": [],
            "kpis": [],
            "priorityWeights": {"alignment": 0.40, "impact": 0.30, "effort": 0.20, "urgency": 0.10},
            "planningWindow": "",
        }
    active_id = config_item.get("activeContextId")
    if not active_id:
        return {
            "goals": [],
            "kpis": [],
            "priorityWeights": {"alignment": 0.40, "impact": 0.30, "effort": 0.20, "urgency": 0.10},
            "planningWindow": "",
        }
    context = table.get_item(Key={"contextId": active_id}).get("Item")
    if not context:
        return {
            "goals": [],
            "kpis": [],
            "priorityWeights": {"alignment": 0.40, "impact": 0.30, "effort": 0.20, "urgency": 0.10},
            "planningWindow": "",
        }
    return context


@tool
def update_target_scores(updates: list[dict]) -> str:
    """
    Batch update priority scores on targets. Uses parallel UpdateItem calls via ThreadPoolExecutor
    (BatchWriteItem only supports PutItem/DeleteItem, not attribute-level updates).

    Each update dict: {targetId, priorityScore, alignmentScore, urgencyScore, goalAlignment, alignmentTags}
    """
    ddb = get_dynamodb()
    table = ddb.Table(config.targets_table)
    now = int(time.time())

    def _update(item: dict):
        table.update_item(
            Key={"targetId": item["targetId"]},
            UpdateExpression=(
                "SET priorityScore=:ps, alignmentScore=:als, urgencyScore=:us, "
                "goalAlignment=:ga, alignmentTags=:tags, lastScoredAt=:now, updatedAt=:now"
            ),
            ExpressionAttributeValues={
                ":ps": _clamp_score(item["targetId"], item["priorityScore"]),
                ":als": item.get("alignmentScore", 0),
                ":us": item.get("urgencyScore", 0),
                ":ga": item.get("goalAlignment", []),
                ":tags": item.get("alignmentTags", []),
                ":now": now,
            },
        )

    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = {executor.submit(_update, u): u for u in updates}
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as exc:
                logger.warning("Failed to update target %s: %s", futures[future].get("targetId"), exc)

    return f"Updated scores for {len(updates)} targets"


@tool
def submit_ranking_results(
    run_id: str,
    context_id: str,
    ranked_targets: list[dict],
    triggered_by: str,
    duration_ms: int,
) -> str:
    """Save audit record to RA-ScoringHistory with 90-day TTL."""
    ddb = get_dynamodb()
    table = ddb.Table(config.scoring_history_table)
    now = int(time.time())
    expires_at = now + 90 * 24 * 3600  # 90 days

    table.put_item(Item={
        "runId": run_id or str(uuid.uuid4()),
        "contextId": context_id,
        "targetsScored": len(ranked_targets),
        "topTargets": ranked_targets[:10],
        "triggeredBy": triggered_by,
        "durationMs": duration_ms,
        "createdAt": now,
        "expiresAt": expires_at,
    })
    return f"Ranking run saved: {len(ranked_targets)} targets scored, triggered_by={triggered_by}"


@tool
def get_available_tools() -> list[dict]:
    """Fetch all active tools from RA-Tools with their risk and success profiles.

    Returns a list of tools with risk analysis (service disruption, system damage,
    detection likelihood, reversibility) and success profiles (success rate, execution
    time, required access). Use this to factor tool availability and risk into
    target prioritization scoring.
    """
    all_tools = scan_table(config.tools_table)
    active_tools = [t for t in all_tools if t.get("status") == "active"]

    results = []
    for t in active_tools:
        risk = t.get("riskProfile", {})
        success = t.get("successProfile", {})
        results.append({
            "toolId": t.get("toolId"),
            "name": t.get("name", ""),
            "description": t.get("description", ""),
            "category": t.get("category", ""),
            "targetTypes": t.get("targetTypes", []),
            "protocols": t.get("protocols", []),
            "cveTargets": t.get("cveTargets", []),
            "riskProfile": {
                "serviceDisruption": risk.get("serviceDisruption", "unknown"),
                "systemDamage": risk.get("systemDamage", "unknown"),
                "detectionLikelihood": risk.get("detectionLikelihood", "unknown"),
                "requiresAuth": risk.get("requiresAuth", False),
                "reversible": risk.get("reversible", True),
                "noisy": risk.get("noisy", False),
            },
            "successProfile": {
                "estimatedSuccessRate": success.get("estimatedSuccessRate", 0),
                "avgExecutionTime": success.get("avgExecutionTime", "unknown"),
                "requiredAccess": success.get("requiredAccess", "network"),
                "outputType": success.get("outputType", "shell"),
            },
        })

    return results
