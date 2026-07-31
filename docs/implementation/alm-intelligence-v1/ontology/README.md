# Ontology (Phase 0)

Formal RDFS/OWL-RL + SHACL for the ALM world model. **Postgres remains SoR.**
This directory is documentation + CI — not a runtime graph database.

| File | Role |
|---|---|
| `domain.ttl` | Classes and properties |
| `domain.shacl.ttl` | Closed-world shapes mirroring ACCEPTANCE invariants |
| `competency-questions.md` | Six SPARQL sketches + SQL twins |
| `fixtures/valid-instance.ttl` | Minimal valid instance for CI |
| `validate_ontology.py` | rdflib + owlrl + pyshacl checker |

```bash
python docs/implementation/alm-intelligence-v1/ontology/validate_ontology.py
```

See also: `docs/decisions/2026-07-30-alm-postgres-kernel.md`.
