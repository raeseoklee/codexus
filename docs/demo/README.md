# Codexus Demo Tape

[Korean](../ko/demo/README.md)

This directory contains the reproducible VHS source for the README demo.

The demo is a redacted fixture. It intentionally does not run a live Codex model
or print real local paths, auth state, transcripts, or package-manager logs.
Its job is to show the core user-facing loop:

1. install Codexus globally;
2. run a supervised task with a verification command;
3. fail once;
4. feed bounded failure output into repair;
5. report `complete` only after the verification command passes;
6. leave a durable run ledger.

Full live release validation remains in the release evidence documents instead
of the README media asset.

## Regenerate

Install [VHS](https://github.com/charmbracelet/vhs), then run:

```bash
vhs docs/demo/codexus-supervised-run.tape
```

The generated asset is:

```text
docs/assets/codexus-supervised-run.gif
```
