#!/bin/sh
# Download a versioned release. Run ON a rooted TV, after setting up CleanYourTV 1.6.10.
set -eu
VERSION=0.5.0
BASE="https://github.com/rtsa/CleanYourTVLG/releases/download/v$VERSION"
T=$(mktemp -d /tmp/cytvlg-download.XXXXXX)
trap 'rm -rf "$T"' EXIT
curl -fL --connect-timeout 15 --max-time 180 "$BASE/cleanyourtvlg-$VERSION.tar.gz" -o "$T/cleanyourtvlg-$VERSION.tar.gz"
curl -fL --connect-timeout 15 --max-time 60 "$BASE/SHA256SUMS" -o "$T/SHA256SUMS"
(cd "$T" && sha256sum -c SHA256SUMS)
tar -xzf "$T/cleanyourtvlg-$VERSION.tar.gz" -C "$T"
sh "$T/cleanyourtvlg-$VERSION/installer/install-local.sh" "$@"
