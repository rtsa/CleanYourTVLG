# Compatibility

| Component | Status |
|---|---|
| LG 50NANO796NE, firmware 04.64.00, webOS SDK 5.6.2 | Runtime tested on this one model |
| CleanYourTV helper 1.6.10 / launcher 1.5.5 | Supported base used in testing |
| Node.js 8.12 / Chromium 68 | Runtime compatibility targets |
| Other SDK 5.x TVs | Not yet verified; installer accepts matching prerequisites |
| SDK 6.x and newer | Experimental and blocked by default |
| SDK 4.x and older | Unsupported |
| Unrooted TVs / Developer Mode alone | Unsupported |
| HDMI video, IPTV background, streaming apps | Not implemented as a seamless background; non-native-TV Home uses the existing CleanYourTV path |

The portable installer is new. Runtime tests on the existing private installation do **not** establish that a fresh installation on another TV will succeed. This is why the first public release is a preview.

LG changes private window, input and Luna APIs between firmware versions. A newer TV is not automatically more compatible. Successful setup also depends on upstream's native Home stand-in method; the installer checks the known script structure and method rather than patching unknown files.

Developers can explicitly try another SDK with `CYTVLG_ALLOW_UNTESTED=1 sh /tmp/cleanyourtvlg-install.sh --check`. This only bypasses the SDK guard, not the upstream-version or script checks. No support claim is implied.

The menu's reported warm frame times are roughly 0.3 seconds on the test TV. Cold starts and memory reclamation take longer. No claim is made about faster channel tuning, lower DRM startup times, universal seamless playback or reduced internet latency.
