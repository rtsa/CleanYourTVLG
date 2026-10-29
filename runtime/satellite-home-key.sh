#!/bin/sh
L=/media/developer/cleanyourtv
if [ ! -e "$L/satellite-menu-enabled" ] || [ -e "$L/DISABLE" ]; then
  luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home","params":{"launchType":"homeKey"}}' </dev/null
  exit
fi
curl -s -f -m 2 -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:18767/satellite/toggle >/dev/null && exit 0
touch /tmp/cleanyourtv-menu-bootstrap-spinner
luna-send -n 1 -w 2000 luna://com.webos.surfacemanager/showSpinner '{"show":true,"owner":"com.cleanyourtv.satellitehome.bootstrap"}' </dev/null >/dev/null 2>&1
nohup sh -c 'sleep 8; luna-send -n 1 -w 2000 luna://com.webos.surfacemanager/showSpinner '\''{"show":false,"owner":"com.cleanyourtv.satellitehome.bootstrap"}'\'' </dev/null' >/dev/null 2>&1 </dev/null &
sh "$L/12-satellite-menu" </dev/null
if ! curl -s -f -m 8 -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:18767/satellite/toggle >/dev/null; then
  luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home","params":{"launchType":"homeKey"}}' </dev/null
  luna-send -n 1 -w 2000 luna://com.webos.surfacemanager/showSpinner '{"show":false,"owner":"com.cleanyourtv.satellitehome.bootstrap"}' </dev/null >/dev/null 2>&1
  rm -f /tmp/cleanyourtv-menu-bootstrap-spinner
fi
