#!/usr/bin/env python3
"""Fleet claim fence + reviewed local @1/@2 drain. Never invokes inference.

Failure deliberately leaves the durable fence held. Resume is explicit and
requires the same operator-owned DRAIN_TOKEN, not a token discovered from DB.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from urllib.request import Request, urlopen

SERVICES = ('auditlayer-worker@1.service', 'auditlayer-worker@2.service')


def systemctl(*args):
    return subprocess.check_output(['systemctl', *args], text=True, timeout=15).strip()


def topology():
    for unit in ('auditlayer-worker.service', 'auditlayer-pdf-worker.service'):
        for command in ('is-active', 'is-enabled'):
            result = subprocess.run(['systemctl', command, '--quiet', unit], timeout=15)
            if result.returncode == 0:
                raise RuntimeError('legacy worker unit must be disabled: ' + unit)
    units = {line.split()[0] for line in systemctl('list-units', '--all', '--plain', '--no-legend', 'auditlayer-worker@*.service').splitlines() if line.strip()}
    if units != set(SERVICES):
        raise RuntimeError('unreviewed local worker topology')


def request_json(url, payload=None, key=None):
    headers = {'Content-Type': 'application/json'}
    if key:
        headers.update(apikey=key, Authorization='Bearer ' + key)
    request = Request(url, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
    with urlopen(request, timeout=10) as response:
        body = response.read()
        return json.loads(body) if body else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('drain', 'verify', 'resume', 'status'), nargs='?', default='drain')
    parser.add_argument('--env-file', default='/opt/auditlayer/worker/.env')
    parser.add_argument('--timeout', type=float, default=1800)
    parser.add_argument('--poll-seconds', type=float, default=2)
    args = parser.parse_args()
    if args.env_file:
        from dotenv import load_dotenv
        if not load_dotenv(args.env_file, override=True):
            raise RuntimeError('environment file unavailable or empty')
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')
    if not key:
        raise RuntimeError('service role credential required')
    token = str(uuid.UUID(os.environ['DRAIN_TOKEN']))
    if args.timeout <= 0 or args.poll_seconds <= 0:
        raise RuntimeError('positive timeout and poll interval required')

    def rpc(name, payload=None):
        return request_json(base + '/rest/v1/rpc/' + name, payload if payload is not None else {}, key)

    def state():
        value = rpc('worker_drain_status')
        if not isinstance(value, dict) or value.get('paused') is not True or value.get('drain_token') != token:
            raise RuntimeError('claim fence not held by this drain token')
        for field in ('active_audits', 'active_refinements'):
            if type(value.get(field)) is not int or value[field] < 0:
                raise RuntimeError('invalid active claim evidence')
        return value

    if args.action == 'status':
        print(json.dumps(rpc('worker_drain_status')))
        return
    if args.action == 'resume':
        value = state()
        if value['active_audits'] or value['active_refinements']:
            raise RuntimeError('outstanding claims prevent recovery resume')
        topology()
        urls = os.environ.get('ALM_DRAIN_HEALTH_URLS', 'http://127.0.0.1:8788/healthz,http://127.0.0.1:8789/healthz').split(',')
        if len(urls) != 2 or len(set(urls)) != 2 or not all(urls):
            raise RuntimeError('two distinct worker health URLs required')
        for unit, url in zip(SERVICES, urls):
            if systemctl('show', unit, '-p', 'ActiveState', '--value') != 'active':
                raise RuntimeError('resume requires an active reviewed worker: ' + unit)
            health = request_json(url)
            if (
                not isinstance(health, dict)
                or health.get('status') != 'ok'
                or health.get('service') != 'auditlayer-worker'
                or 'active_job_kind' not in health
                or health['active_job_kind'] is not None
            ):
                raise RuntimeError('resume requires healthy idle worker evidence: ' + unit)
        # Keep the fence through startup/health validation, and recheck its
        # ownership and outstanding claims immediately before releasing it.
        for unit in SERVICES:
            if systemctl('show', unit, '-p', 'ActiveState', '--value') != 'active':
                raise RuntimeError('worker stopped during resume verification: ' + unit)
        value = state()
        if value['active_audits'] or value['active_refinements']:
            raise RuntimeError('active claims changed during resume verification')
        rpc('resume_worker_claims', {'p_drain_token': token})
        value = rpc('worker_drain_status')
        if not isinstance(value, dict) or value.get('paused') is not False or value.get('drain_token') is not None:
            raise RuntimeError('resume not confirmed')
        print('Claims resumed; workers may now claim queued work.')
        return

    topology()
    if args.action == 'drain':
        rpc('pause_worker_claims', {'p_drain_token': token})
    deadline = time.monotonic() + args.timeout
    urls = os.environ.get('ALM_DRAIN_HEALTH_URLS', 'http://127.0.0.1:8788/healthz,http://127.0.0.1:8789/healthz').split(',')
    if len(urls) != 2:
        raise RuntimeError('exactly two worker health URLs required')
    while True:
        value = state()
        idle = value['active_audits'] == value['active_refinements'] == 0
        for unit, url in zip(SERVICES, urls):
            active = systemctl('show', unit, '-p', 'ActiveState', '--value')
            if active == 'inactive':
                continue
            if active != 'active':
                raise RuntimeError('worker not in stable active/inactive state: ' + unit)
            health = request_json(url)
            if not isinstance(health, dict) or health.get('status') != 'ok' or 'active_job_kind' not in health:
                raise RuntimeError('missing healthy active-job evidence: ' + unit)
            idle = idle and health['active_job_kind'] is None
        if idle:
            # Re-read DB after health, including any claim committed before pause.
            value = state()
            if value['active_audits'] == value['active_refinements'] == 0:
                break
        if time.monotonic() >= deadline:
            raise RuntimeError('drain timed out; fence remains paused, no stop attempted')
        time.sleep(args.poll_seconds)
    if args.action == 'drain':
        subprocess.run(['sudo', 'systemctl', 'stop', *SERVICES], check=True, timeout=90)
    for unit in SERVICES:
        if systemctl('show', unit, '-p', 'ActiveState', '--value') != 'inactive':
            raise RuntimeError('worker not stopped: ' + unit)
    value = state()
    if value['active_audits'] or value['active_refinements']:
        raise RuntimeError('active claims appeared after stop')
    print('Drain verified: claims paused, zero active audit/refinement claims, @1/@2 inactive.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Do not print HTTP request objects, headers or response bodies (secrets).
        print('Drain failed closed (' + type(exc).__name__ + '). Inspect state; do not overwrite or auto-resume.', file=sys.stderr)
        sys.exit(1)
