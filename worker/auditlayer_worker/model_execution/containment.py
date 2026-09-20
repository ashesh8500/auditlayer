"""Linux worker containment. Local cancellation is not upstream billing cancellation."""
import ctypes
import json
import multiprocessing
import os
import signal
import time
from typing import Any


def _child(boundary, request, sender, parent_pid):
    try:
        os.setsid()
        if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
            raise RuntimeError('parent death fence unavailable')
        if os.getppid() != parent_pid:
            os._exit(70)
        raw = boundary.complete(request, request.model)
        encoded = json.dumps(raw, allow_nan=False).encode()
        if len(encoded) > 262144:
            sender.send_bytes(b'{"error":"response_size"}')
        else:
            sender.send_bytes(json.dumps({'raw': raw}, allow_nan=False).encode())
    except BaseException:
        # Never carry provider exceptions, URLs, credentials or prompt text back.
        sender.send_bytes(b'{"error":"provider_error"}')
    finally:
        sender.close()


def one_call(boundary, request, deadline) -> dict[str, Any]:
    ctx = multiprocessing.get_context('fork')
    receiver, sender = ctx.Pipe(duplex=False)
    process = ctx.Process(target=_child, args=(boundary, request, sender, os.getpid()), daemon=True)
    started = False
    try:
        if deadline <= time.monotonic():
            return {'error': 'timeout'}
        process.start()
        started = True
        sender.close()
        if not receiver.poll(max(0, deadline - time.monotonic())):
            return {'error': 'timeout'}
        return json.loads(receiver.recv_bytes(300000))
    except (EOFError, OSError, ValueError):
        return {'error': 'provider_error'}
    finally:
        sender.close()
        receiver.close()
        if started:
            # Kill group before reaping leader; never allow PID reuse first.
            try:
                if process.pid is not None:
                    os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            if process.is_alive():
                process.kill()
            process.join(timeout=.5)
            if process.is_alive():
                os._exit(70)  # fail-stop rather than return a reusable worker
            process.close()
