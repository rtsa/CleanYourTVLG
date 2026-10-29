# Architecture

The add-on reuses the native broadcast pipeline. It does not create another `tv://` player, capture the TV picture or stream video through a computer.

```text
Home key (existing lginputhook)
    -> satellite-home-key.sh
    -> controller on 127.0.0.1:18767
    -> transparent web overlay above com.webos.app.livetv
         -> existing CleanYourTV helper on 127.0.0.1:8765 for app/config/icon APIs
```

The controller uses an increasing generation token to reject stale dismiss/hidden responses. SSE delivers hide requests immediately; a 250 ms visible-only pulse is a fallback. If hiding is not acknowledged, the controller closes the overlay. Hidden pages stop the SSE/pulse loop.

`webOSSystem.keepAlive(true)` permits WAM's hide operation while retaining the web process. Before hiding, the page clears its key mask and pointer input region. Without KeepAlive on the tested firmware, CSS transparency alone left remote focus on the invisible overlay. A software test that checks only video continuity will miss this bug; focus and actual channel changes must also be checked.

Visible programme keys are forwarded through two guarded controller endpoints. They require the current visible generation and native Live TV in the foreground. The controller sends the same `sendKeyPress`/`sendKeyRelease` parameters used by LG's floating TV toolbar: Qt values 18874401/18874402. Other apps do not receive these forwarded channel commands.

On cold or slow opening, the controller requests LG's system spinner with an owner specific to that generation. Painting, canceling and errors clear only this owner. An independent eight-second timeout prevents a stuck indicator. Invisible preparation does not request a spinner.

All add-on HTTP endpoints bind to **loopback only**. Port 18767 is intentionally separate from upstream's optional notification listener on port 8767. Browser origins other than the file/null origins used by the TV app are rejected. The root service still has substantial power; its source and dependencies belong in your trust boundary.

The installer edits only the existing writable CleanYourTV stand-in/boot scripts, its key binding and selected helper settings, plus add-on files and its Homebrew boot link. It does not write firmware partitions or create remote-access credentials. Upstream remains responsible for its own Home mount, Input integration and optional debloat features.

## Source layout

- `vendor/cleanyourtv/index.html`: pinned MIT-licensed upstream built page.
- `ui/satellite-overlay-ui.js`: resident overlay lifecycle and programme-key handling.
- `tools/build_ui.py`: reproducible transformation of the pinned base into `app/index.html`.
- `runtime/`: root controller, Home key script and boot starter.
- `installer/`: preflight, install, minimal-state backup and guarded restore.
- `tools/build_release.py`: deterministic IPK and release-bundle packaging using Python's standard library.
- `tests/run.js`: offline input lifecycle, stale-generation and configuration checks.
