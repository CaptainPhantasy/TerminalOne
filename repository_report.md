# Repository Report

## JSON Format (Recommended)

```json
{
  "project_name": "Unknown",
  "completion_percentage": 0,
  "tech_stack": [],
  "complexity_score": 0,
  "team_size_minimum": 1,
  "go_to_market_timeline": "unknown",
  "industry_vertical": "unknown",
  "business_model": "unknown",
  "technical_debt": 100,
  "scalability_needs": "unknown",
  "target_users": "unknown",
  "key_features": [],
  "risks": ["Repository has not yet been code-reviewed by OMF governance."]
}
```

## Mandatory execution contract

For EACH requested item:
1) Show exact action taken
2) Show direct evidence (file/line/command/output)
3) Show verification result
4) Mark status only after proof

## Forbidden behaviors

- Declaring "done" without evidence
- Collapsing multiple requested items into one vague summary
- Skipping failed steps without explicit blocker report

## Required output structure

A) Requested items checklist
B) Per-item evidence ledger
C) Verification receipts
D) Completeness matrix (item -> done/blocked -> evidence)

## Hard gate

If any requested item has no evidence row, final status MUST be INCOMPLETE.
