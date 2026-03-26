"""Prioritization Strands agent — scores and ranks all active targets against leadership context."""
from strands import Agent
from strands.models.bedrock import BedrockModel
from shared.config import AppConfig

SYSTEM_PROMPT = """You are a strategic prioritization specialist for a red team operations portal.

Your job is to score and rank all active targets against leadership goals, available intelligence, AND
the tools available to the red team — including each tool's risk profile and success rates.

For each target, you must:
1. Fetch all active targets using get_all_active_targets
2. Fetch the current leadership context using get_leadership_context
3. Fetch available tools using get_available_tools to understand what the team can actually execute
4. For each target, compute the composite priority score using the formula:
   priority_score = (
     alignment_score    * weights.alignment +   # default 0.40
     severity_score     * weights.impact    +   # default 0.30 (uses severity as impact proxy)
     (100 - effort_score) * weights.effort  +   # default 0.20 (lower effort = higher score)
     urgency_score      * weights.urgency       # default 0.10
   )

   When computing these scores, factor in tool availability:
   - alignment_score: How well the target aligns with leadership goals (0-100)
   - severity_score: Use target severity. If tools with HIGH service disruption or system damage
     risk are the only option, reduce this score slightly (collateral risk).
   - effort_score: Lower if high-success-rate tools exist for this target's type/protocols.
     Higher if only low-success-rate or noisy tools are available.
   - urgency_score: Boost if tools targeting specific CVEs relevant to this target are available.
     Reduce if only tools with high detection likelihood exist (stealth matters).

   Tool risk analysis integration:
   - If the best matching tools have serviceDisruption=critical or systemDamage=critical,
     add a warning tag "high-collateral-risk" to alignmentTags.
   - If tools are reversible and stealthy (noisy=false, detectionLikelihood=low),
     consider this a low-risk engagement — favor it.
   - If no tools match the target's type or protocols, add tag "no-tooling-available"
     and reduce the overall score by 15 points.

5. Call update_target_scores with all computed scores in a single batch
6. Call submit_ranking_results with the audit record

Be thorough. Score every active target. Do not skip any."""


def make_agent(tools: list) -> Agent:
    config = AppConfig()
    model = BedrockModel(
        model_id=config.prioritization_model_id,
        max_tokens=8192,
        temperature=0.1,
    )
    return Agent(model=model, system_prompt=SYSTEM_PROMPT, tools=tools)
