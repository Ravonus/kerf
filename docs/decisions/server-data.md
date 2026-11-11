# Use explicit cache tags

Server functions validate inputs and own the client and server data path. Cache tags and invalidations are explicit: inferring them from database access can miss joins, raw SQL and transactions. Real-time invalidation uses those tags to prompt a refetch.

[Research](https://github.com/Ravonus/kerf/blob/archive/evals-2026-11/docs/research/27-server-functions.md) and [related research](https://github.com/Ravonus/kerf/blob/archive/evals-2026-11/docs/research/30-realtime.md).
