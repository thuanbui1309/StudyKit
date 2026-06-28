# Blueprint template — worked example

A concrete model for the `profile.md` / `syllabus.md` shapes that `/sk:init` produces. Treat the numbers below as an **example to verify at runtime**, not ground truth — exam blueprints change, so always research or have the user confirm before writing.

## Worked example: AWS Certified Solutions Architect – Associate (SAA-C03)

### profile.md

```markdown
# AWS Certified Solutions Architect – Associate (SAA-C03) — Study Profile

## Exam
- Code / Provider: SAA-C03 / Amazon Web Services
- Structure: 65 questions, 130 minutes, multiple-choice + multiple-response, scaled score 100–1000, pass 720
- Difficulty: Associate; ~1 year hands-on AWS recommended
- Target date: none yet

## Domains
| Domain | Weight |
|--------|--------|
| Design Secure Architectures | 30% |
| Design Resilient Architectures | 26% |
| Design High-Performing Architectures | 24% |
| Design Cost-Optimized Architectures | 20% |

## Candidate Background
<!-- filled during the background interview -->

## Notes
- Sources: AWS exam guide (confirm current version at study time)
```

### syllabus.md (topics derived from domains)

```markdown
# Syllabus

| topic | domain | status | last_studied |
|-------|--------|--------|--------------|
| iam-and-identity | Design Secure Architectures | not-started | |
| data-protection-encryption | Design Secure Architectures | not-started | |
| vpc-network-security | Design Secure Architectures | not-started | |
| multi-az-and-failover | Design Resilient Architectures | not-started | |
| decoupling-sqs-sns | Design Resilient Architectures | not-started | |
| backup-and-dr | Design Resilient Architectures | not-started | |
| compute-scaling | Design High-Performing Architectures | not-started | |
| storage-selection | Design High-Performing Architectures | not-started | |
| caching-and-cdn | Design High-Performing Architectures | not-started | |
| cost-effective-compute | Design Cost-Optimized Architectures | not-started | |
| cost-effective-storage | Design Cost-Optimized Architectures | not-started | |
```

Use kebab-case `topic` slugs that match the `knowledge/<topic>.md` filenames. Number of topics per domain should roughly track its weight (heavier domains get more topics).

### knowledge/<topic>.md skeleton

```markdown
# IAM and Identity

> Domain: Design Secure Architectures · Status: not-started

## Summary

## Key concepts

## Common pitfalls / exam traps

## References
```

## Other exams

For any other cert, keep the same four sections in `profile.md` (Exam / Domains / Candidate Background / Notes) and the same four columns in `syllabus.md`. Derive topics from the confirmed domain breakdown. When the web is unavailable, build all of this from the official exam guide the user pastes.
