---
layout: ../layouts/Layout.astro
title: Stale states
---

<!--
  Three deterministic stale states, keyed so the crafted rosey/locales/fr.json
  drives each one:
    stale:uptodate     — locale `original` matches this source → NOT stale
    stale:changed      — locale `original` is an OLD string; this source drifted,
                         so the build refreshes _base_original away from it → amber
    stale:untranslated — locale `value` equals `original` (the source text, which
                         is what write-locales seeds) → untranslated, not stale
-->
<p data-rosey="uptodate">This translation is up to date.</p>
<p data-rosey="changed">This sentence changed since it was last translated.</p>
<p data-rosey="untranslated">This one has no translation yet.</p>
