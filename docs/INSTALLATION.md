# Installation

## Before you start

This is an add-on, not a rooting utility or a complete replacement for CleanYourTV's installer.

You need:

- A rooted LG webOS TV with Homebrew Channel and a working root shell.
- CleanYourTV **1.6.10**, already set up and selected as Home.
- Upstream Input key integration enabled, which provides the existing `lginputhook` configuration.
- Native broadcast reception already working in LG's Live TV application.
- Internet access on the TV for the online download, or a copied release bundle.

Only SDK 5.x is enabled by default. One SDK 5.6.2 model has been tested. Review [Compatibility](COMPATIBILITY.md) before trying another firmware. Installation stops if the upstream version, Home script structure, root access or required tools do not match.

The original CleanYourTV installer has its own recovery behavior. Finish that setup and let it settle before installing this add-on. Do not run both installers at the same time.

## Online installation

From your computer, open an existing root SSH session:

```sh
ssh root@TV_IP
```

Replace `TV_IP` with the TV's address. The following commands run **inside that TV session**:

```sh
curl -fsSL https://raw.githubusercontent.com/rtsa/CleanYourTVLG/v0.5.0/install.sh -o /tmp/cleanyourtvlg-install.sh
sh /tmp/cleanyourtvlg-install.sh --check
sh /tmp/cleanyourtvlg-install.sh
```

`--check` downloads and verifies the bundle, checks root access, SDK, upstream version, script anchors, configuration and shell syntax. It writes temporary files only. It does not install the app or change persistent TV settings.

The normal install then:

1. Saves the original Home binding, relevant settings and Home scripts under `/media/developer/cleanyourtv/backup/cleanyourtvlg`.
2. Installs the overlay IPK and waits for a terminal `installed` result. An initial accepted request is not treated as success.
3. Applies the supported Home-on-demand guards and native Live TV shortcut.
4. Installs the loopback controller and its Homebrew boot hook.
5. Checks the controller's status. If the post-install setup fails, it attempts to restore add-on-managed settings.

No automatic reboot occurs. Open a broadcast channel and test Home → Back → channel +/−. Then reboot once when convenient, leave the TV on its native channel for two minutes without pressing Home, and check that no menu appears. Finally test Home again.

## Offline/local bundle

Download `cleanyourtvlg-0.5.0.tar.gz` and `SHA256SUMS` from the [release page](https://github.com/rtsa/CleanYourTVLG/releases/tag/v0.5.0), and copy them to the TV using your existing SSH/SFTP tools. Then run on the TV, in their directory:

```sh
sha256sum -c SHA256SUMS
tar -xzf cleanyourtvlg-0.5.0.tar.gz
cd cleanyourtvlg-0.5.0
sh installer/install-local.sh --check
sh installer/install-local.sh
```

Use the release bundle, rather than GitHub's automatic source ZIP: the source tree does not include a built IPK or bundle manifest. Developers can create those with `python tools/build_release.py`.

Checksums detect corruption. A checksum downloaded from the same account is not an independent guarantee against that account being compromised.

## Disable and restore

```sh
sh /media/developer/cleanyourtv/undo-satellite-menu.sh
```

The script disables the controller, removes its own boot link, closes its overlay and restores the saved Home binding only if the binding is still owned by this add-on. Original scripts are restored only when their current hashes match this add-on's installed versions; otherwise the script keeps the newer files and tells you where the original copies are.

The native Live TV shortcut and upstream IPTV option are restored where their current values still match the add-on's changes. Other app configuration, the Input binding, root access and remote-access settings are not replaced. The inactive overlay package, its runtime files and backups remain on disk. Reboot when convenient to reload restored boot scripts.

This restores the **pre-add-on** CleanYourTV behavior, which may include upstream automatic Home opening. To return to LG's stock Home, use the existing CleanYourTV manager or its documented `undo-home.sh` procedure.

If the TV cannot finish booting, use Homebrew Channel's documented failsafe to skip boot scripts. Do not factory-reset or re-run rooting tools as a first troubleshooting step.

## Updating

This preview is pinned to upstream 1.6.10. Upstream updates can replace the Home scripts and change the helper API. Disable this add-on before updating CleanYourTV; wait for an explicitly compatible add-on release before installing it again. The installer refuses an unsupported upstream version.

Re-running the same release keeps the original backup. Do not delete that backup while the add-on is active. When making unrelated manual Home changes, keep your own copy as well.

## Troubleshooting

| Symptom | Check |
|---|---|
| “Set up CleanYourTV first” | Finish upstream setup and enable its Input key integration. Installing just the manager app is insufficient. |
| Unsupported version or Home stand-in | Use the documented upstream release and Home method. Do not manually remove the installer's checks. |
| IPK verification/installation failed | The installer stops before changing Home scripts/config. Review its printed terminal error. Package installation on additional TVs has not yet been verified. |
| Native TV works but Home does not | Read `curl -s http://127.0.0.1:18767/satellite/status` on the TV and `/tmp/satellite-menu.log`. |
| No broadcast picture before installing | Fix reception/channel tuning in LG's own TV app first. This add-on does not tune or supply channels. |
| Home opens slowly after another app | webOS may reclaim memory; the first open can be cold and display LG's spinner. |
| Channel buttons stop after dismissing | Disable with the restore command, then report SDK, model and whether `getFocusedWindowInfo` still names the overlay. |

When reporting an issue, remove local IP addresses, channel/playlist URLs, tokens and account details. Do not upload the entire TV configuration or unfiltered logs.
