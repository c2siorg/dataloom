"""Background jobs: slow work executed off the request path, in this process.

``runner`` owns the worker threads, the cancel flags and the session factory;
``registry`` maps each ``JobKind`` to the function that does the work; and
``context`` is the handle a run function reports progress and checks for
cancellation through. Job state itself lives in the ``jobs`` table and is
managed by :mod:`app.services.job_service`.

Workers are threads rather than processes on purpose: the per-project locks
(:mod:`app.utils.project_locks`) and the DataFrame cache are process-local, so
only an in-process worker takes the same locks as the synchronous endpoints.
"""
