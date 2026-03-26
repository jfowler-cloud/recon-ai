"""Lambda handler for the Prioritization agent."""
import logging
import time
import uuid
from typing import Any
from prioritization.agent import make_agent
from prioritization.tools import (
    get_all_active_targets,
    get_leadership_context,
    get_available_tools,
    update_target_scores,
    submit_ranking_results,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: dict, context: Any) -> dict:
    triggered_by = event.get("triggeredBy", "manual")
    run_id = str(uuid.uuid4())
    start_ms = int(time.time() * 1000)

    logger.info("Prioritization run %s triggered_by=%s", run_id, triggered_by)

    agent = make_agent([
        get_all_active_targets,
        get_leadership_context,
        get_available_tools,
        update_target_scores,
        submit_ranking_results,
    ])

    response = agent(
        f"Run ID: {run_id}\n"
        f"Triggered by: {triggered_by}\n\n"
        f"Score and rank all active targets against the current leadership context. "
        f"Save the results using submit_ranking_results."
    )

    duration_ms = int(time.time() * 1000) - start_ms
    logger.info("Prioritization run %s complete in %dms", run_id, duration_ms)
    return {"statusCode": 200, "runId": run_id, "durationMs": duration_ms, "body": str(response)}
