#!/bin/sh
set -eu
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
L=/media/developer/cleanyourtv
B="$L/backup/cleanyourtvlg"
HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
say() { echo "[CleanYourTVLG] $*"; }
die() { say "ERROR: $*" >&2; exit 1; }
case "${1:-}" in ''|--check) ;; *) die 'Usage: install-local.sh [--check]' ;; esac
[ "$(id -u)" = 0 ] || die 'Run on the TV as root.'
for tool in node curl luna-send sha256sum tar; do command -v "$tool" >/dev/null || die "Missing $tool"; done
[ -d /var/lib/webosbrew/init.d ] || die 'Homebrew Channel and its boot scripts are required.'
[ -f "$L/luna.js" ] && [ -f "$L/exec.js" ] && [ -f "$L/home-standin.sh" ] || die 'Set up CleanYourTV 1.6.10 first.'
[ -f "$L/tvprofile.js" ] && [ -f "$L/jtool.js" ] || die 'Upstream TV profile helpers are missing.'
[ "$(cat "$L/home-method" 2>/dev/null || true)" != mount ] || die 'The mount Home method is not supported by this preview.'
KIND=$(node "$L/jtool.js" kind "$L/backup/home-appinfo.orig.json")
METHOD=$(node "$L/tvprofile.js" get homeTakeover --home "$KIND")
[ "$METHOD" = standin ] || die "Unsupported upstream Home method: $METHOD"
[ -f /home/root/.config/lginputhook/keybinds.json ] || die 'Enable the upstream Input key integration first.'
[ ! -e "$L/DISABLE" ] || die 'Enable CleanYourTV as Home in its manager first.'
T=$(mktemp -d /tmp/cytvlg-install.XXXXXX)
trap 'rm -rf "$T"' EXIT
luna-send -n 1 -w 5000 luna://com.webos.service.tv.systemproperty/getSystemInfo '{"keys":["sdkVersion"]}' </dev/null > "$T/system.json"
SDK=$(node -e 'var j=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(j.sdkVersion||(j.systemInfo||{}).sdkVersion||"")' "$T/system.json")
case "$SDK" in 5.*) ;; *) [ "${CYTVLG_ALLOW_UNTESTED:-0}" = 1 ] || die "Only webOS SDK 5.x is enabled by default (reported: $SDK). Read docs/COMPATIBILITY.md." ;; esac
# Refuse a port owned by something else. This port intentionally avoids upstream notifications on 8767.
if curl -sf -m 2 http://127.0.0.1:18767/satellite/status > "$T/port.json"; then
  node -e 'var j=JSON.parse(require("fs").readFileSync(process.argv[1]));if(j.mode!=="resident")process.exit(1)' "$T/port.json" || die 'Port 18767 belongs to another service.'
fi
node "$HERE/installer/configure.js" prepare "$T"
sh -n "$T/home-standin.sh"
sh -n "$T/10-cleanyourtv-home"
(cd "$HERE" && sha256sum -c MANIFEST.sha256) || die 'Bundle integrity check failed.'
if [ "${1:-}" = --check ]; then say 'Check complete. No persistent TV files were changed.'; exit 0; fi

# Keep the original settings once. Backups remain on the TV, never in a release.
mkdir -p "$B"
if [ ! -f "$B/state.json" ]; then
  cp "$L/home-standin.sh" "$B/home-standin.sh"
  cp "$L/10-cleanyourtv-home" "$B/10-cleanyourtv-home"
  cp "$T/state.json" "$B/state.json"
fi
cp "$HERE/installer/configure.js" "$L/cleanyourtvlg-configure.js"
cp "$HERE/installer/uninstall.sh" "$L/undo-satellite-menu.sh"
say 'Installing the overlay package (up to 60 seconds)...'
IPK="$HERE/packages/com.cleanyourtv.satellitehome_0.5.0_all.ipk"
luna-send -n 1 -w 5000 luna://com.webos.applicationManager/closeByAppId '{"id":"com.cleanyourtv.satellitehome"}' </dev/null >/dev/null 2>&1 || true
pkill -f '^node /media/developer/cleanyourtv/satellite-menu-server.js$' 2>/dev/null || true
luna-send -i luna://com.webos.appInstallService/dev/install "{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"$IPK\",\"subscribe\":true}" </dev/null > "$T/install.log" 2>&1 &
installer_pid=$!
ok=0
for n in $(seq 1 60); do
  if grep -q '"state":"installed"' "$T/install.log"; then ok=1; break; fi
  grep -q '"state":"install failed"' "$T/install.log" && break
  sleep 1
done
kill "$installer_pid" 2>/dev/null || true
if [ "$ok" != 1 ]; then
  cat "$T/install.log"
  # Existing controller may have been stopped; restart only if previously enabled.
  [ ! -f "$L/12-satellite-menu" ] || sh "$L/12-satellite-menu" || true
  die 'Package installation was not confirmed. Existing Home scripts/config were not changed.'
fi
rollback() {
  code=$?
  trap - EXIT
  if [ "$code" != 0 ]; then say 'Setup failed; restoring add-on-managed settings.'; sh "$L/undo-satellite-menu.sh" || true; fi
  rm -rf "$T"
  exit "$code"
}
trap rollback EXIT
# Preserve the inode of the stand-in: it may already be bind-mounted over LG Home.
cat "$T/home-standin.sh" > "$L/home-standin.sh"
cat "$T/10-cleanyourtv-home" > "$L/10-cleanyourtv-home"
for file in satellite-menu-server.js satellite-home-key.sh 12-satellite-menu; do cp "$HERE/runtime/$file" "$L/$file"; done
chmod 755 "$L/home-standin.sh" "$L/10-cleanyourtv-home" "$L/satellite-home-key.sh" "$L/12-satellite-menu" "$L/undo-satellite-menu.sh"
node "$L/cleanyourtvlg-configure.js" apply
touch "$L/satellite-menu-enabled"
ln -sf "$L/12-satellite-menu" /var/lib/webosbrew/init.d/12-satellite-menu
sh "$L/12-satellite-menu"
curl -sf -m 5 http://127.0.0.1:18767/satellite/status > "$T/status.json"
node -e 'var j=JSON.parse(require("fs").readFileSync(process.argv[1]));if(!j.returnValue||j.mode!=="resident")process.exit(1)' "$T/status.json"
say 'Installed. Open a native TV channel, then press Home. Back/Home closes the menu.'
say 'Reboot once when convenient to load the on-demand boot policy. This installer does not reboot the TV.'
say 'Disable/restore: sh /media/developer/cleanyourtv/undo-satellite-menu.sh'
