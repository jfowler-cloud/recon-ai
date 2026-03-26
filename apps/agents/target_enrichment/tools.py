"""Strands @tool functions for the Target Enrichment agent."""
import time
import boto3
from strands import tool
from shared.config import AppConfig
from shared.db import get_dynamodb

config = AppConfig()

EFFORT_SCORE_MAP = {"small": 25, "medium": 50, "large": 75, "xl": 100}


@tool
def get_leadership_context() -> dict:
    """Fetch the active leadership context (goals, KPIs) to tag alignment at enrichment time."""
    ddb = get_dynamodb()
    table = ddb.Table(config.leadership_context_table)
    config_item = table.get_item(Key={"contextId": "CONFIG"}).get("Item")
    if not config_item:
        return {"goals": [], "kpis": [], "planningWindow": ""}
    active_id = config_item.get("activeContextId")
    if not active_id:
        return {"goals": [], "kpis": [], "planningWindow": ""}
    context = table.get_item(Key={"contextId": active_id}).get("Item")
    if not context:
        return {"goals": [], "kpis": [], "planningWindow": ""}
    return {
        "goals": context.get("goals", []),
        "kpis": context.get("kpis", []),
        "planningWindow": context.get("planningWindow", ""),
    }


@tool
def save_enriched_target(
    target_id: str,
    name: str,
    description: str,
    category: str,
    vulnerabilities: list[str],
    effort: str,
    severity_score: int,
    goal_alignment: list[str],
    alignment_tags: list[str],
) -> str:
    """
    Save AI-enriched target fields to DynamoDB.
    Uses a condition expression to prevent double-enrichment on Step Functions retries.
    """
    ddb = get_dynamodb()
    table = ddb.Table(config.targets_table)
    effort_score = EFFORT_SCORE_MAP.get(effort, 50)
    now = int(time.time())

    try:
        table.update_item(
            Key={"targetId": target_id},
            UpdateExpression=(
                "SET #n=:name, description=:d, category=:c, vulnerabilities=:v, "
                "effort=:e, effortScore=:es, severityScore=:ss, "
                "goalAlignment=:ga, alignmentTags=:tags, "
                "#st=:status, enrichedAt=:now, updatedAt=:now"
            ),
            ConditionExpression="attribute_not_exists(enrichedAt)",
            ExpressionAttributeNames={"#st": "status", "#n": "name"},
            ExpressionAttributeValues={
                ":name": name,
                ":d": description,
                ":c": category,
                ":v": vulnerabilities,
                ":e": effort,
                ":es": effort_score,
                ":ss": severity_score,
                ":ga": goal_alignment,
                ":tags": alignment_tags,
                ":status": "enriched",
                ":now": now,
            },
        )
        return f"Enriched target {target_id}: '{name}' (category={category}, effort={effort}, severity={severity_score})"
    except Exception as exc:
        if "ConditionalCheckFailedException" in str(type(exc).__name__):
            return f"Target {target_id} already enriched -- skipping (idempotent)"
        raise
