# Security Policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through [GitHub Security Advisories](https://github.com/xiongxhc/collective-cognition-sdk/security/advisories/new). Do not report vulnerabilities in public GitHub Issues.

Do not include secrets, credentials, live ledgers, vault data, personal data, or other private operational data in public issues, pull requests, reproductions, or advisory reports. Use synthetic or redacted examples instead.

## Scope and expectations

The maintained scope is the current private, unpublished `0.11.0` source and package candidate, including its Normative Stable resource contracts and Supported Experimental runtime surfaces. Hosts remain responsible for authentication, authorization-policy execution, encryption, tenant or workspace isolation, credential management, persistence, publication, recovery, monitoring, and deployment controls. Conformance does not certify those host controls. This project makes no service-level agreement, certification, production-readiness, adoption, or long-term-support promise. Reports are reviewed as maintainer capacity permits; no response or remediation timeframe is guaranteed.

The private, unpublished `0.11.0` Slice A is integrated on `main` at merge commit `669b3ed3a30cccee098730fe6cf558bc37e18ac5` via PR #15; its PR checks all passed. Post-merge CI run `32950251966` passed all eight jobs, including Node `24.14.0` Ubuntu job `98119822963`, which passed "runs a fictional external host through an explicit source fixture and SQLite target". This records supported-runtime CI acceptance only; real-device acceptance, public RC/stable publication, npm OIDC/bootstrap work, production readiness, adoption, certification, SLA, and LTS remain pending or unclaimed.

## Disclosure process

Provide a minimal, redacted reproduction, affected revision or prerelease version, impact, and any mitigations you have identified. The maintainer will coordinate validation and disclosure through the private advisory when appropriate.
