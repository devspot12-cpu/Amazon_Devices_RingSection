# OpenRouter Vision Model Evaluation

## 1. Evidence status and limits

This handbook compares fifteen image-capable models whose endpoint records were retrieved through the connected OpenRouter account on 2026-11-12 at approximately 05:39 UTC. Every selected record declared image input and at least one endpoint. Catalog membership does not establish account-specific request eligibility, privacy approval, available credit, or wildlife accuracy. No paid completion, screenshot benchmark, or hardware test was performed while preparing this document.

The general model-list tool returned only three records, reported a total of 431, and provided no continuation link. The separate count tool reported 467. This mismatch means the general list is incomplete for evaluation purposes. The fifteen candidates below were verified individually using model endpoint records; they are a deliberate shortlist, not an exhaustive catalog or a claim about the best available models.

Use the model links as current reference pages. Re-query endpoint availability, prices, supported parameters, and provider policy before an evaluation run. Provider telemetry changes continuously and is not a contractual service-level guarantee.

## 2. Comparable workload and cost mathematics

For a transparent planning comparison, assume each screenshot produces 1,500 total billable input tokens and 150 output tokens. The input assumption includes text and an assumed image-token equivalent; it is not a measured tokenizer result. Estimated cost for 1,000 screenshots equals 1,000 multiplied by the sum of input tokens times the per-token input price and output tokens times the per-token output price.

These estimates exclude additional reasoning tokens, taxes, platform or payment fees, cache effects, separate image charges, long-context tiers, retries, and any provider-specific surcharges. Actual high-resolution image billing can vary substantially across models. Capture request usage and final billed cost during a funded benchmark before making a procurement decision.

The Carbon endpoint showed a 50 percent discount and had no undiscounted endpoint in the returned set. Its estimate is explicitly promotional. Other selected rows use an endpoint whose reported discount was zero, but the published price must still be reconfirmed.

## 3. Fifteen-model comparison matrix

Prices are USD per million tokens. Latency is the selected endpoint's reported rolling 30-minute p50 in milliseconds, not measured end-to-end screenshot latency. Accuracy is unmeasured for every row because no wildlife dataset has been supplied or executed.

| Model and source | Observed provider | Input / output USD | Estimated USD / 1,000 | Reported p50 ms | Wildlife accuracy | Evaluation role |
|---|---|---:|---:|---:|---|---|
| [openai/gpt-4o](https://openrouter.ai/openai/gpt-4o) | Azure | 2.50 / 10.00 | 5.2500 | 1283 | Unmeasured | Established comparison model |
| [openai/gpt-4o-mini](https://openrouter.ai/openai/gpt-4o-mini) | Azure | 0.15 / 0.60 | 0.3150 | 869 | Unmeasured | Low-cost baseline candidate |
| [openai/gpt-4.1](https://openrouter.ai/openai/gpt-4.1) | Azure | 2.00 / 8.00 | 4.2000 | 1037 | Unmeasured | Detailed identification review |
| [openai/gpt-4.1-mini](https://openrouter.ai/openai/gpt-4.1-mini) | Azure | 0.40 / 1.60 | 0.8400 | 1110 | Unmeasured | Balanced primary candidate |
| [openai/gpt-4.1-nano](https://openrouter.ai/openai/gpt-4.1-nano) | Azure | 0.10 / 0.40 | 0.2100 | 1089 | Unmeasured | Budget sensitivity comparison |
| [openai/gpt-5](https://openrouter.ai/openai/gpt-5) | Azure | 1.25 / 10.00 | 3.3750 | 5741.5 | Unmeasured | Reasoning-budget stress test |
| [google/gemini-2.5-pro](https://openrouter.ai/google/gemini-2.5-pro) | Google AI Studio | 0.625 / 5.00 | 1.6875 | 3577 | Unmeasured | Difficult-scene review candidate |
| [google/gemini-2.5-flash](https://openrouter.ai/google/gemini-2.5-flash) | Google AI Studio | 0.15 / 1.25 | 0.4125 | 691 | Unmeasured | Cross-vendor primary candidate |
| [google/gemini-2.5-flash-lite](https://openrouter.ai/google/gemini-2.5-flash-lite) | Google AI Studio | 0.05 / 0.20 | 0.1050 | 649 | Unmeasured | Lowest planning-cost comparison |
| [google/gemini-4-carbon](https://openrouter.ai/google/gemini-4-carbon) | Google AI Studio | 1.00 / 5.00 | 2.2500 | 5581.5 | Unmeasured | New-model review; 50% discount |
| [anthropic/claude-sonnet-4.5](https://openrouter.ai/anthropic/claude-sonnet-4.5) | Claude Platform on AWS | 3.00 / 15.00 | 6.7500 | 852 | Unmeasured | Cross-family adjudication candidate |
| [anthropic/claude-haiku-4.5](https://openrouter.ai/anthropic/claude-haiku-4.5) | Azure | 1.00 / 5.00 | 2.2500 | 504.5 | Unmeasured | Fast cross-family comparison |
| [anthropic/claude-opus-4.1](https://openrouter.ai/anthropic/claude-opus-4.1) | Amazon Bedrock | 15.00 / 75.00 | 33.7500 | 3259 | Unmeasured | Cost-capped expert-review comparison |
| [qwen/qwen3-vl-235b-a22b-instruct](https://openrouter.ai/qwen/qwen3-vl-235b-a22b-instruct) | DeepInfra | 0.20 / 0.88 | 0.4320 | 1267 | Unmeasured | Open-weight family comparison |
| [amazon/nova-pro-v1](https://openrouter.ai/amazon/nova-pro-v1) | Amazon Bedrock | 0.80 / 3.20 | 1.6800 | 442 | Unmeasured | Independent vendor comparison |

A model's publisher and inference provider are separate entities. For example, an OpenAI model served through Azure and an Anthropic model served through another platform can have different processing terms, regions, and operational behavior. Do not approve a model family while overlooking the actual routed processor.

## 4. Wildlife accuracy protocol

Build the initial evaluation set from [the 25-scenario catalog](06-test-video-dataset-and-qa-catalog.md), then expand with independent clips before any production accuracy claim. Count animals and episodes, not merely frames; adjacent screenshots from one video must not appear in both tuning and final evaluation partitions.

Two reviewers establish animal presence, broad category, species when supportable, image quality, and safety-context annotations. Reviewers may label a species unresolved. They must not force a precise snake species, infer aggression, or identify ownership of a dog from appearance alone. Resolve disagreement before revealing model outputs.

Report animal-presence precision and recall, species macro-averaged accuracy, predator false-negative rate, benign false-positive rate, abstention rate, and invalid-response rate. Keep infrared, rain, fog, small-subject, occlusion, and multi-animal slices separate. A large easy daylight subset must not hide failures on dangerous or visually ambiguous scenes.

Confidence values are self-reported estimates until calibrated against held-out evidence. Plot confidence bins against correctness, and record when a model is confidently wrong. Do not rank models solely by average confidence or by a general-purpose benchmark mentioned in vendor marketing.

## 5. Latency and reliability protocol

Measure local detection, screenshot encoding, network upload, provider response, parsing, and visible rendering separately. End-to-end latency starts when a qualifying screenshot is selected and ends when a valid result or an explicit unavailable state appears. Preserve both wall-clock duration and the video's elapsed timestamp without conflating them.

Run cold and warm sessions, controlled concurrency, and a documented region and connection profile. Report p50, p95, maximum, timeout fraction, and sample count. A single quick response is not a latency benchmark. The rolling provider values in the matrix are useful context but may describe different workloads and measurement definitions.

Record model identifier, selected provider, request settings, prompt version, response size, finish reason, and usage. Keep raw screenshots and sensitive response content in restricted evidence storage. The public issue receives only sanitized aggregates and an evidence reference.

## 6. Routing and fallback standard

| Condition | Permitted response | Prohibited shortcut |
|---|---|---|
| Primary healthy and approved | Use selected primary once for the approved frame | Unbounded parallel requests to every model |
| HTTP 429 | Honor Retry-After within the event deadline; use one approved fallback if allowed | Tight retry loops or evading provider limits |
| Transient 5xx or timeout | Record failure; attempt one allowlisted fallback within budget | Treat timeout as no animal |
| Authentication or billing error | Stop external attempts and show unavailable | Switch credentials, processors, or payment methods silently |
| Malformed response | Reject the result; permit one controlled recovery | Render raw text or parse invented certainty |
| Species disagreement | Preserve uncertainty and require review | Choose whichever answer reports the highest danger or confidence |

Proposed evaluation order is a balanced primary candidate, a cross-vendor fallback, and a separately invoked adjudication candidate. This is not a production routing change. Privacy eligibility comes before price or speed; if no approved endpoint remains, the correct result is unavailable.

## 7. Prompt and response compatibility

Use the exact prompt versions in [the standards library](04-openrouter-system-prompts-and-response-templates.md). Keep screenshot bytes and prompt wording identical when comparing candidates. Record unsupported parameters instead of silently changing the task for one provider. JSON-object support is not equivalent to strict JSON-schema enforcement; test both syntax and semantic field validity.

The baseline adapter returns species, confidence, peopleOnly, model, and done status. Richer safety summaries and strict validation are proposed standards, not existing guarantees. Reasoning-capable models can consume output budgets before producing usable JSON; include finish-reason and empty-content tests without exposing internal reasoning to homeowners.

## 8. Approval and spending gates

Before any paid run, approve a total budget, per-event cap, screenshot count, concurrency limit, and shutdown condition. The largest planning row demonstrates why an unrestricted adjudication model should not receive every screenshot. Recalculate costs using actual image-token usage and include at least one fallback allowance.

Select a winner only after privacy review, held-out evaluation, per-condition reliability, and accessible user-state checks. Document tradeoffs, including abstention behavior and failure handling. There is no approved production winner in this handbook. All fifteen are verified catalog candidates awaiting funded, authorized evaluation on supplied media.
