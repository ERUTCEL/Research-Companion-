"""PyInstaller entry point — runs the FastAPI backend via uvicorn."""
import multiprocessing
import os
import sys

# PyInstaller sets sys._MEIPASS; use it as the working directory so that
# relative imports inside api/ still resolve correctly.
if getattr(sys, 'frozen', False):
    os.chdir(sys._MEIPASS)

import uvicorn

if __name__ == '__main__':
    multiprocessing.freeze_support()
    port = int(os.environ.get('CLIO_PORT', '8001'))
    uvicorn.run('api.main:app', host='127.0.0.1', port=port, log_level='warning')
