# Contributing

Start with a compatibility report: TV model, firmware, webOS SDK, upstream CleanYourTV version, and the exact step that failed. Please redact private addresses, tokens, account information and channel/playlist URLs.

For changes:

1. Keep TV code compatible with Node.js 8.12 and Chromium 68. The overlay uses ES5 style.
2. Edit `ui/` or the build transformation; rebuild `app/index.html` with `python tools/build_ui.py`.
3. Run `node tests/run.js` and `python tools/build_release.py`.
4. Explain whether you tested on a real TV. Offline tests cannot establish native decoder continuity or physical remote behavior.
5. Test Home → Back → Home, Home → Home, channel +/− with the menu visible and hidden, and two minutes after power-on without pressing Home.

Do not broaden the tested-device claim based only on a successful package install. Check input focus, audio/video continuity, memory retention and restoration. Do not include private TV state, firmware/QML dumps, rooting utilities or GPL code in this MIT add-on.

Before changing someone's TV, agree on the scope with its owner and provide a restore command. Do not run tuning, reboot, rooting or remote-access changes merely to test this project.
