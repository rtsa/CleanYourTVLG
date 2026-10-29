# Security

CleanYourTVLG runs a controller as root on the TV. Install it only after reviewing its scripts and the upstream project you already depend on.

- The controller listens on `127.0.0.1:18767`; the helper stays on `127.0.0.1:8765`.
- It does not enable Telnet/SSH, add keys, change passwords or expose a setup page on the LAN.
- Installation downloads a versioned release over HTTPS and checks SHA-256 integrity. The repository/release account remains a trust dependency.
- No analytics are added. The upstream project and launched apps can have their own network behavior.
- Backups and runtime logs stay on the TV. Never upload configuration, private keys, playlist URLs or unfiltered logs to a public issue.

Please use GitHub's **Report a vulnerability** / private vulnerability reporting if enabled for this repository. If that is unavailable, open an issue that asks for a private reporting route without including exploit details, secrets or personal data.
