# Codexus Demo Tape

[Korean](../ko/demo/README.md)

This directory contains the reproducible VHS source for the README demo.

The demo is a redacted fixture. It intentionally does not run a live Codex model
or print real local paths, auth state, transcripts, or package-manager logs.
Its job is to show the core user-facing loop:

1. install Codexus globally;
2. run a supervised task with a verification command;
3. run the verification command;
4. report `complete` only after the verification command passes;
5. leave a durable run ledger.

The README media intentionally shows the clean pass path for first-impression
clarity. Repair behavior is described in prose and validated in release
evidence instead of being shown as a red test frame in the demo.

## Regenerate

Install [VHS](https://github.com/charmbracelet/vhs), then run:

```bash
vhs docs/demo/codexus-supervised-run.tape
```

The generated asset is:

```text
docs/assets/codexus-supervised-run.gif
```
