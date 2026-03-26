"""Lambda handler for the Target Enrichment agent."""
import logging
from typing import Any
from target_enrichment.agent import make_agent
from target_enrichment.tools import get_leadership_context, save_enriched_target

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: dict, context: Any) -> dict:
    target_id = event.get("targetId", "")
    plain_text_goal = event.get("plainTextGoal", "")

    if not target_id or not plain_text_goal:
        logger.error("Missing targetId or plainTextGoal in event: %s", event)
        return {"statusCode": 400, "error": "Missing targetId or plainTextGoal"}

    logger.info("Enriching target %s", target_id)

    agent = make_agent([get_leadership_context, save_enriched_target])
    response = agent(
        f"Enrich this red team target (ID: {target_id}).\n\nPlain-text goal:\n{plain_text_goal}"
    )

    logger.info("Enrichment complete for target %s", target_id)
    return {"statusCode": 200, "targetId": target_id, "body": str(response)}
