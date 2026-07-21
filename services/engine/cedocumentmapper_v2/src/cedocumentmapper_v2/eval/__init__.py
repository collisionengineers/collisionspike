"""Extraction evaluation tooling.

The :mod:`cedocumentmapper_v2.eval.comparator` module provides a scored
extraction comparator: it runs an extraction *engine* over a labelled corpus
(the regression fixtures) and computes per-field precision / recall /
exact-match against the expected JSON. The default engine is the shipped v2
:class:`~cedocumentmapper_v2.application.service.DocumentMapperService`, but any
``Engine`` callable can be plugged in (v1, a "new engine") for side-by-side
scoring. v1 is intentionally optional and is never imported here.

Import the public API from the submodule directly, e.g.::

    from cedocumentmapper_v2.eval.comparator import score_corpus, summarize

The submodule is intentionally not re-exported here so that running
``python -m cedocumentmapper_v2.eval.comparator`` does not double-import the
module under runpy.
"""
