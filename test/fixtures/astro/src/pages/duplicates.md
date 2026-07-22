---
layout: ../layouts/Layout.astro
title: Duplicate keys
---

<!-- The same data-rosey key twice: Rosey collapses them to one base.json key
     (total: 2), and editing one must update the other. The sibling with no
     data-rosey must stay uneditable. -->
<p data-rosey="shared">Edit me once and both copies update.</p>
<p data-rosey="shared">Edit me once and both copies update.</p>
<p>Sibling with no data-rosey — stays uneditable.</p>
