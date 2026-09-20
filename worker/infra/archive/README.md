# Retired singleton deployment examples

These files are historical references, deliberately named `.example`, not
installable production units. They describe the old user checkout / HTTP-gateway
or singleton topology. Do not install or enable them.

Use `../auditlayer-worker@.service` through `../deploy.sh`, with the reviewed full
commit SHA and an explicitly audited fleet-drain hook. The canonical script fails
closed when an old singleton or PDF worker remains active.
