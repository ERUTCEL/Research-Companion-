"""PyInstaller entry point — runs the FastAPI backend via uvicorn."""
import multiprocessing
import os
import sys

# Keep databases and indexes outside the packaged app. Downloaded macOS apps
# may run from a read-only DMG, so writing beside the bundled executable fails.
data_dir = os.environ.get('CLIO_DATA_DIR')
if data_dir:
    os.makedirs(data_dir, exist_ok=True)
    os.chdir(data_dir)

import uvicorn

if __name__ == '__main__':
    multiprocessing.freeze_support()
    port = int(os.environ.get('CLIO_PORT', '8001'))
    uvicorn.run('api.main:app', host='127.0.0.1', port=port, log_level='warning')
