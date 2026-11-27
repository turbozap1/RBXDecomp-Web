import argparse
import hashlib
from pathlib import Path, PurePosixPath
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
URL = 'https://archive.org/download/ROBLOX20072013/December%2029%202007%20%280.3.676.0%29.zip'
CLIENT_SHA256 = 'f16069abb753483338ec0ff3a508dc2ee7c696f30997664816446e80863096cc'
ARCHIVE_SHA256 = '9debee41da85aa9d2d6274e2484c408e83286e5a86fbfef494d0375afab5c0b2'


def main():
    parser = argparse.ArgumentParser(description='Extract original content from the client archive linked in the repository README. Native executables and DLLs are not installed or executed.')
    parser.add_argument('--archive', type=Path, help='Use an already downloaded client ZIP')
    args = parser.parse_args()
    archive_path = args.archive or ROOT / 'build-web' / 'original-client.zip'
    if not archive_path.exists():
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        print('Downloading the original client archive...', flush=True)
        with urllib.request.urlopen(URL, timeout=45) as response:
            data = response.read(64 * 1024 * 1024 + 1)
        if len(data) > 64 * 1024 * 1024:
            raise RuntimeError('Client archive exceeds 64 MB')
        archive_path.write_bytes(data)
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise RuntimeError('Original client archive SHA256 mismatch')
    with zipfile.ZipFile(archive_path) as archive:
        if hashlib.sha256(archive.read('Roblox.exe')).hexdigest() != CLIENT_SHA256:
            raise RuntimeError('Original client executable does not match the README SHA256')
        contents = [entry for entry in archive.infolist() if entry.filename.startswith('content/') and not entry.is_dir() and not entry.filename.lower().endswith(('.dll', '.exe'))]
        if sum(entry.file_size for entry in contents) > 64 * 1024 * 1024:
            raise RuntimeError('Content archive exceeds 64 MB uncompressed')
        destination = ROOT / 'web' / 'content'
        for entry in contents:
            relative = PurePosixPath(entry.filename).relative_to('content')
            if '..' in relative.parts or '\\' in entry.filename or ':' in entry.filename:
                raise RuntimeError('Invalid content path')
            target = destination.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(entry))
    print(f'Extracted {len(contents)} original content files to {destination}')
    print('Reconfigure and rebuild the WebAssembly engine to embed them.')


if __name__ == '__main__':
    main()
