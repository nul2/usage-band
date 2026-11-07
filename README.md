# usage-band

A Claude Code mod that puts a small dashboard above the prompt box:

- **퇴근 카운터** (top right): time left until the end of the workday to the second, a thin progress bar and %, a 🎉 at quitting time. Set the hours with `/workhours 09:00 18:30` (saved in `~/.claude/workhours.json`; default 09:00–18:00). Weekends show a day off.
- **Usage**: SESSION (5-hour limit, time to reset), WEEK (7-day limit, time to reset) and CONTEXT (with a weather icon), as bars that turn orange past 80%. Figures the engine cannot read show as `–`.
- **This computer**: CPU, RAM and battery, read every 5 seconds with local macOS commands (`ps`, `vm_stat`, `sysctl`, `pmset`). Nothing is sent anywhere.
- **다음 할 일**: the first three unchecked `[ ]` items of `오늘_할일.md` in the session folder as buttons. Pressing one fills the prompt box (it never sends).
- **A walking dog**: a pixel dog walks a line from 🏠 to 🚩 as `오늘_할일.md` gets checked off.
- **클꾸미**: a small 8-bit pet that eats when files are written, shows a heart after each answer, and gets hungry, sulky or sleepy. Its meal count is kept in `~/.claude/klkkumi.json` and resets each day.

The mod never calls a model. On the desktop app the rows are drawn as small pictures; in a terminal, as text.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-band --marketplace nul2/usage-band
```

Answer `y` to add the marketplace, then pick a scope (user is first).

From a shell:

```bash
claude plugin install usage-band --marketplace nul2/usage-band
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nul2/usage-band`, then Add plugin.

## Notes

- The computer row uses macOS commands; on other systems those figures show as `–`.
- The checklist file name is `오늘_할일.md`, read from the folder the session runs in.

## License

MIT
