# Support

Report reproducible SDK defects through GitHub Issues, including the private `0.11.0` candidate revision, Node and operating-system versions, a minimal redacted reproduction, and expected versus actual behavior.

The private, unpublished `0.11.0` Slice A is integrated on `main` at merge commit `669b3ed3a30cccee098730fe6cf558bc37e18ac5` via PR #15; its PR checks all passed. Post-merge CI run `32950251966` passed all eight jobs, including Node `24.14.0` Ubuntu job `98119822963`, which passed "runs a fictional external host through an explicit source fixture and SQLite target". This records supported-runtime CI acceptance only; real-device acceptance, public RC/stable publication, npm OIDC/bootstrap work, production readiness, adoption, certification, SLA, and LTS remain pending or unclaimed.

Normative Stable resource contracts accept compatibility reports against their versioned bytes and rules. Supported Experimental runtime, connector, adapter, validator, CLI, and host-example surfaces may change under the documented pre-`1.0.0` compatibility policy. Private `0.11.0` provides no production support, adoption guarantee, certification, or service-level agreement. It provides no long-term support (LTS) promise.

For suspected vulnerabilities, use the [private GitHub Security Advisory route](https://github.com/xiongxhc/collective-cognition-sdk/security/advisories/new), not a public issue.

Do not share private data, personal data, secrets, credentials, live ledgers, vault data, or other operational records. Use synthetic or redacted examples.

Source connectors are independently owned unless this repository explicitly identifies them as maintained. Their availability, support channels, and release schedules are not implied by this SDK.
