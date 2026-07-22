---
layout: ../layouts/Layout.astro
title: Nested keys
---

<!-- Deep key resolution: nested data-rosey-ns wrappers give keys like nested:section:card:title. -->
<div data-rosey-ns="section">
<div data-rosey-ns="card">
<h1 data-rosey="title">Deeply namespaced heading</h1>
<p data-rosey="body">Its Rosey key is nested:section:card:body.</p>
</div>
</div>
