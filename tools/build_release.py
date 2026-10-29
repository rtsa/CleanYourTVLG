"""Build reproducible webOS IPK and a self-contained installer bundle (stdlib only)."""
import gzip, hashlib, io, json, subprocess, sys, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = (ROOT/'VERSION').read_text().strip()
ID = 'com.cleanyourtv.satellitehome'
DIST = ROOT/'dist'

def tar_gz(files):
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(files.items()):
            item = tarfile.TarInfo(name)
            item.size = len(data)
            item.mode = 0o755 if name.endswith('.sh') or name.endswith('/12-satellite-menu') else 0o644
            item.uid = item.gid = item.mtime = 0
            item.uname = item.gname = 'root'
            archive.addfile(item, io.BytesIO(data))
    compressed = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=compressed, mtime=0) as stream:
        stream.write(raw.getvalue())
    return compressed.getvalue()

def ar_file(files):
    out = bytearray(b'!<arch>\n')
    for name, data in files:
        header = f'{name + "/":<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{len(data):<10}`\n'.encode('ascii')
        assert len(header) == 60
        out.extend(header); out.extend(data)
        if len(data) % 2: out.extend(b'\n')
    return bytes(out)

def main():
    subprocess.run([sys.executable, str(ROOT/'tools/build_ui.py')], check=True)
    subprocess.run(['node', str(ROOT/'tests/run.js')], check=True)
    info = json.loads((ROOT/'app/appinfo.json').read_text())
    assert info['id'] == ID and info['version'] == VERSION
    app_files = {f'usr/palm/applications/{ID}/{p.name}':p.read_bytes() for p in sorted((ROOT/'app').iterdir()) if p.is_file()}
    app_files[f'usr/palm/packages/{ID}/packageinfo.json'] = (json.dumps({'id':ID,'version':VERSION,'app':ID},indent=2)+'\n').encode()
    control = (f'Package: {ID}\nVersion: {VERSION}\nSection: misc\nPriority: optional\nArchitecture: all\n'
               f'Installed-Size: {sum(map(len, app_files.values()))}\nMaintainer: CleanYourTVLG contributors\n'
               'Description: Native broadcast Home overlay for rooted LG webOS TVs.\nwebOS-Package-Format-Version: 2\n').encode()
    ipk = ar_file([('debian-binary',b'2.0\n'),('control.tar.gz',tar_gz({'control':control})),('data.tar.gz',tar_gz(app_files))])
    ipk_name = f'{ID}_{VERSION}_all.ipk'
    files = {f'packages/{ipk_name}':ipk}
    for relative in ['README.md','LICENSE','THIRD-PARTY.md','SECURITY.md','VERSION']:
        files[relative]=(ROOT/relative).read_bytes()
    for directory in ['runtime','installer','docs','assets']:
        for p in sorted((ROOT/directory).rglob('*')):
            if p.is_file(): files[p.relative_to(ROOT).as_posix()]=p.read_bytes()
    files['vendor/cleanyourtv/LICENSE']=(ROOT/'vendor/cleanyourtv/LICENSE').read_bytes()
    # Browser/source ZIP checkouts may retain CRLF. Normalize text in the release itself.
    for name in files:
        if not name.endswith(('.ipk','.png')):
            files[name]=files[name].replace(b'\r\n',b'\n')
    for name, data in files.items():
        if name.endswith(('.js','.sh')) or name.endswith('12-satellite-menu'):
            assert b'\r' not in data, f'CRLF in executable source: {name}'
    files['MANIFEST.sha256']=(''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in sorted(files.items()))).encode()
    prefix=f'cleanyourtvlg-{VERSION}'
    bundle=tar_gz({prefix+'/'+name:data for name,data in files.items()})
    DIST.mkdir(exist_ok=True)
    (DIST/ipk_name).write_bytes(ipk)
    bundle_name=prefix+'.tar.gz'
    (DIST/bundle_name).write_bytes(bundle)
    (DIST/'SHA256SUMS').write_bytes((hashlib.sha256(bundle).hexdigest()+'  '+bundle_name+'\n').encode())
    print(f'Built {bundle_name}: {len(bundle)} bytes; IPK: {len(ipk)} bytes')

if __name__=='__main__': main()
