# Example interactions

Run all seven scenarios with `npm run examples`. The script invokes the shipped frontend adapter and backend agent, checks the outcomes, and requires no API key. Run `npm run examples -- --write` to refresh [the complete captured results](../examples/submission-results.json).

The interface is action-driven. The quoted student requests below describe intent, while the listed buttons and API payloads are the actual inputs. Examples 1 through 4 return the same bundled content as the browser. Examples 5 and 7 use explicitly fixed adapter outputs to exercise the real backend logic; they are not transcripts of cloud-model inference.

## 1. A student has lost the thread

**Student intent:** “What do I need to remember to understand this Bellman equation?”

**Interaction:** open slide 25 and click **Katchup**. Actual input: `{ "slideNumber": 25, "action": "context" }`.

**Returned text:**

> The return is an infinite discounted sum (slide 17), and value is its conditional expectation (slide 20). Separate the first term from the rest of that sum.
>
> The remaining tail is the same kind of return, shifted forward by one step and multiplied by γ.

The student can open prerequisite links while keeping the current slide visible. Choosing **Explain this slide** closes the context panel and starts the explanation.

## 2. A beginner needs the notation

**Student intent:** “What do Gₜ and γ mean on this slide?”

**Interaction:** select slide 17. **Glossary** is already visible; reopen it to see the progressive reveal. Actual action: `glossary`.

**Returned excerpts:**

> **Gₜ: return**: The sum of discounted future rewards along a trajectory, starting with the next reward.
>
> **γ**: The discount factor, between 0 and 1. Each additional step multiplies a reward’s weight by γ.

The glossary also renders `Gₜ = Rₜ₊₁ + γRₜ₊₂ + γ²Rₜ₊₃ + …` as a mathematical expression. The symbol legend is visible immediately, independently of the definition animation.

## 3. A student challenges a calculation

**Student intent:** “Why does the Pub action show 8.4?”

**Interaction:** open slide 46 and click **Explain this slide**.

**Returned excerpt:**

> For Pub at C3, the shown model gives:
> `q*(C3,Pub) = 1 + 0.2×6 + 0.4×8 + 0.4×10 = 9.4`.
>
> **Slide correction:** the diagram prints 8.4, which omits the displayed +1 reward. With that reward included the value is 9.4. Study still wins at C3 because 10 > 9.4.

The original slide remains unchanged. The explanation distinguishes the printed result from the calculation using the displayed reward.

## 4. A student needs an intuitive interpretation

**Student intent:** “How should I interpret a belief such as [0.7, 0.3]?”

**Interaction:** open slide 58 and click **Explain this slide**.

**Returned excerpt:**

> For two possible locations, a belief [0.7, 0.3] represents 70% and 30% confidence, not a physical state halfway between them.

The rest of the response connects the probability distribution to the history of observations, actions and rewards. Formula symbols are available alongside it in the glossary.

## 5. A grounded response through the agent pipeline

**Situation:** a reviewer evaluates the optional API agent on the small English fixture in `examples/agent-check/lecture.json`.

**Input:** `{ "slideNumber": 2, "action": "context" }`.

The example supplies a fixed candidate response to `LectureAgent`, which builds the real context and validates the answer. It returns:

```json
{
  "status": "ok",
  "summary": "Distinguish a one-step reward from a return.",
  "points": [
    {
      "text": "A reward is numerical feedback from one step, not the entire future of a trajectory.",
      "sourceIds": ["transcript:1"]
    }
  ]
}
```

This is an excerpt of the full result, which includes the original source text, action, slide and transcript cutoff. The example asserts that slide 3 and transcript 2 never enter this request's context.

## 6. Boundary: the student requests a future transcript

**Student intent:** “Use the transcript from slide 3 even though the selected slide is 2.”

**Attempted API input:**

```json
{
  "action": "explain",
  "slideNumber": 2,
  "transcriptThroughSlide": 3
}
```

**Actual agent error, mapped to HTTP 400 by the API:**

```json
{
  "error": {
    "code": "INVALID_CUTOFF",
    "message": "The available transcript must stop at or before the selected slide."
  }
}
```

The agent makes **zero model calls**. It rejects the request before composing a model prompt. This is the implemented temporal boundary of the optional agent, not a restriction on browsing the 62-page study deck.

## 7. Boundary: generated output cites a future source

**Situation:** a test adapter returns a candidate answer citing `transcript:3`, while the student is on slide 2.

`LectureAgent` rejects the source ID, requests one correction, and rejects the same invalid citation again. The result is `INVALID_LLM_OUTPUT` with HTTP status 502. The runner asserts exactly two adapter calls and no accepted answer.

This case proves the validator and retry limit work with invalid output. It does not claim that an external model was tested or that valid citation IDs guarantee factual correctness.
