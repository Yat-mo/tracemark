# TraceMark Apple Design Web Redesign

See also: `docs/plans/2026-07-18-apple-design-web-redesign.md`
Spec: `docs/superpowers/specs/2026-07-18-apple-design-web-redesign.md`

## Hypothesis
A Vite + React SPA with Apple system-tool chrome can replace the single-file UI without changing probe/scoring/proxy behavior.

## Success criteria
- Four workflows work with domain parity
- light/dark + reduced motion/transparency
- `python3 start.py` serves `web/dist`
- pure logic unit tests pass
- Python unit tests still pass

## Failure signals
- scoring outputs differ on fixtures
- proxy headers missing
- baselines localStorage key changed silently
- build missing blocks start.py without clear message

## Plan tasks
1. Scaffold web/
2. TDD pure domain modules
3. tokens/materials
4. shell components
5. api/run engine
6. four views
7. start.py static
8. docs/changelog
9. final verification
