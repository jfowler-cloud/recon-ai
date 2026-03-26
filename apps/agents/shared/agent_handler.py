"""Shared chat agent handler factory — eliminates duplicate handler code across personas."""

import json
from typing import Callable

from aws_lambda_powertools import Logger, Tracer

from shared.chat_tools import clear_collected_output, get_collected_output

logger = Logger(service="recon-ai")
tracer = Tracer(service="recon-ai")


def make_chat_handler(persona: str, create_agent_fn: Callable):
    """Create a Lambda handler for a persona-specific chat agent.

    Args:
        persona: Agent persona name (for logging).
        create_agent_fn: Factory function that returns a configured Strands agent.
    """

    @tracer.capture_lambda_handler
    @logger.inject_lambda_context
    def handler(event, context):
        message = event.get("message", "").strip()
        if not message:
            return {"statusCode": 400, "body": json.dumps({"error": "message is required"})}

        response_text = ""
        output_data = None

        try:
            clear_collected_output()
            agent = create_agent_fn()
            result = agent(message)

            if isinstance(result, dict):
                response_text = result.get("content", str(result))
                output_data = result.get("outputData")
            else:
                response_text = str(result)

            if not output_data:
                collected = get_collected_output()
                if collected:
                    output_data = collected if len(collected) > 1 else collected[0]

        except Exception:
            logger.exception(f"{persona} chat agent error")
            response_text = "I encountered an error processing your request. Please try again."

        return {
            "statusCode": 200,
            "body": json.dumps({
                "content": response_text,
                "outputData": output_data,
            }),
        }

    return handler
