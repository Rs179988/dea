# Repository Guidelines for DEA (Data Engineering Anything)

## Core Philosophy

DEA treats enterprise data stores as **unverified forensic artifacts**. 

1. **Evidence-Grounded Profiling**: Never accept database documentation or human claims at face value. Profiling must measure real null ratios, distinct value counts, uniqueness proofs, and foreign key referential integrity over sample partitions.
2. **Deterministic Invariant Derivation**: Primary keys must be validated for 100% uniqueness. Foreign keys must be established by measuring set inclusion (`fk_values ⊆ pk_values`).
3. **Modern Declarative Pipeline Synthesis**: Emits standard, idempotent dbt Core models (`stg_*.sql`, `int_*.sql`, `fct_*.sql`, `schema.yml`) with automated generic tests (`not_null`, `unique`, `accepted_values`) and Apache Iceberg DDLs.
4. **Agentic Interoperability**: Every capability is accessible both in terminal pipelines (`dea <command>`) and over MCP stdio for autonomous AI agents.
