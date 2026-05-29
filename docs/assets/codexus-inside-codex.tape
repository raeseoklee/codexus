Output docs/assets/codexus-inside-codex.gif

Require node
Require jq

Set Shell "bash"
Set FontSize 24
Set Width 1280
Set Height 720
Set Theme "Catppuccin Mocha"
Set Padding 24
Set BorderRadius 8
Set WindowBar Colorful
Set TypingSpeed 24ms

Type "printf 'codex> use codexus to check schema evidence\n'"
Enter
Sleep 700ms

Type "node codex/skills/codexus/scripts/cx.mjs schema check --json | jq -r .ok"
Enter
Sleep 1200ms

Type "printf 'codex> use $codexus to inspect durable run state\n'"
Enter
Sleep 700ms

Type "node codex/skills/codexus/scripts/cx.mjs runs list --json | jq -r '.runs | length'"
Enter
Sleep 1200ms

Type "printf 'codex> durable evidence stays in the Codex conversation\n'"
Enter
Sleep 2s
