#!/bin/sh
set -eu
L=/media/developer/cleanyourtv
B="$L/backup/cleanyourtvlg"
[ -f "$B/state.json" ] || { echo 'No CleanYourTVLG backup found; nothing changed.'; exit 1; }
rm -f "$L/satellite-menu-enabled"
curl -s -m 3 -X POST -d '{}' http://127.0.0.1:18767/satellite/terminate >/dev/null || true
pkill -f '^node /media/developer/cleanyourtv/satellite-menu-server.js$' 2>/dev/null || true
if [ -L /var/lib/webosbrew/init.d/12-satellite-menu ] && [ "$(readlink /var/lib/webosbrew/init.d/12-satellite-menu)" = "$L/12-satellite-menu" ]; then
  rm -f /var/lib/webosbrew/init.d/12-satellite-menu
fi
node "$L/cleanyourtvlg-configure.js" restore
luna-send -n 1 -w 5000 luna://com.webos.applicationManager/closeByAppId '{"id":"com.cleanyourtv.satellitehome"}' </dev/null >/dev/null 2>&1 || true
echo 'CleanYourTVLG disabled; managed settings restored. Reboot when convenient.'
echo 'The inactive overlay package and backup files are retained. CleanYourTV itself is still installed.'
