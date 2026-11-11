# Lecture content and editing


Edit `web/lesson/lesson.json`. Each slide has:

```json
{
  "number": 1,
  "title": "Slide title",
  "image": "slides/slide-01.webp",
  "text": "Original extracted PDF text",
  "bullets": ["Readable description of slide content"],
  "transcript": "",
  "context": "Context and prerequisite notes in English",
  "explain": "Explanation in English",
  "glossary": [{ "term": "Term", "definition": "Local meaning", "formula": "Optional formula" }],
  "symbols": [{ "symbol": "γ", "definition": "The discount factor." }],
  "references": []
}
```

The top-level `"mode": "prepared"` makes the application return these notes directly, even if a previous browser session stored a provider or key. No backend health checks or LLM requests are sent. Missing notes, invalid glossary entries, unsafe file paths and references to future pages fail validation.

The `symbols` array is an editable, page-specific legend; this deck includes 718 local symbol definitions. Em dashes have been removed from the editable interface and teaching content. The source PDF remains unchanged.

The loader copies each page's glossary into a separate namespace, so the same symbol can have a different definition on different slides. Earlier page references use one-based PDF page numbers. The source PDF is `web/lesson/Lecture-5a.pdf`; images are in `web/lesson/slides/`.

## Clarifications included in the notes

The PDF remains unchanged. The explanations distinguish its printed notation from the underlying calculation:

- **Page 21:** the two trajectory calculations are sampled returns, not the expected state value. The second return is **−3.125**.
- **Page 43:** the displayed equation loses the negative sign of **vπ(C1) ≈ −1.3**. The explanation shows the corrected weighted calculation.
- **Pages 46 and 49:** with the displayed Pub reward **+1**, its action value is **9.4**, not the printed 8.4. Study still wins with value 10.
- **Pages 29 and 42:** the inverse formula requires an invertible system; for the undiscounted absorbing example, fix terminal values and solve for transient states.
- **Pages 47–48 and 61:** optimal-policy existence statements are qualified by the standard finite discounted / well-posed episodic assumptions.

