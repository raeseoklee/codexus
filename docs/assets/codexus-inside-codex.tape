Output docs/assets/codexus-inside-codex.gif

Require node
Require jq
Require bash

Set Shell "bash"
Set FontSize 24
Set Width 1280
Set Height 720
Set Theme "Catppuccin Mocha"
Set Padding 24
Set BorderRadius 8
Set WindowBar Colorful
Set TypingSpeed 24ms

Hide
Type "case ${BASH_VERSION-}:${ZSH_VERSION-} in :*|*:?*) exit 42;; esac"
Enter
Type "export PS1='bash$ '"
Enter
Type "CODEXUS_DEMO_CWD=$(mktemp -d)"
Enter
Type "trap 'rm -rf $CODEXUS_DEMO_CWD' EXIT"
Enter
Type "cx(){ node codex/skills/codexus/scripts/cx.mjs $@; }"
Enter
Show
Ctrl+L
Sleep 300ms

Type "printf 'codex> use codexus to run a supervised mock task\n'"
Enter
Sleep 700ms

Type "cx run --cwd $CODEXUS_DEMO_CWD --driver mock --json 'demo supervised run' | jq -r .outcome"
Enter
Sleep 1200ms

Type "printf 'codex> durable run state is queryable\n'"
Enter
Sleep 700ms

Type "cx runs list --cwd $CODEXUS_DEMO_CWD --json | jq -r '.runs[0].outcome'"
Enter
Sleep 1200ms

Type "printf 'codex> schema evidence stays in the Codex conversation\n'"
Enter
Sleep 700ms

Type "cx schema check --json | jq -r .ok"
Enter
Sleep 2s
