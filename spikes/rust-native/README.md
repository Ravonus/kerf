# Reloading an addon in a running server

PLAN §11 assumed a rebuilt addon means restarting the server worker. `sh build.sh`, then `reload.mjs` and `bench.mjs` on
each runtime, says otherwise: a rebuild at a new path loads beside the old one. Results are in research 39 §1.
