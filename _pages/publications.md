---
layout: editorial
title: "Publications"
permalink: /publications/
---

{% include base_path %}
{% assign years = site.data.publications | group_by: "year" %}
{% assign total = site.data.publications | size %}

<section class="page-head wrap">
  <p class="kicker rise" style="--d:0">{{ total }} papers &nbsp;/&nbsp; 2023 — {{ site.data.publications.first.year }}</p>
  <h1 class="page-title rise" style="--d:1">Publications</h1>
  <p class="page-note rise" style="--d:2">* co-first author &nbsp;·&nbsp; † corresponding author &nbsp;·&nbsp; Most up-to-date list on <a href="https://scholar.google.com/citations?user=j4ZcRakAAAAJ&amp;hl=en">Google Scholar</a></p>
  <div class="filters rise" style="--d:3" role="group" aria-label="Filter by topic">
    <button type="button" class="chip" data-filter="all" aria-pressed="true">All</button>
    <button type="button" class="chip" data-filter="reasoning" aria-pressed="false">Reasoning</button>
    <button type="button" class="chip" data-filter="alignment" aria-pressed="false">Alignment &amp; Safety</button>
    <button type="button" class="chip" data-filter="representation" aria-pressed="false">Representations</button>
    <button type="button" class="chip" data-filter="recsys" aria-pressed="false">RecSys &amp; Agents</button>
    <button type="button" class="chip chip-me" data-filter="first" aria-pressed="false">First author</button>
  </div>
</section>

<section class="wrap pub-years">
  {% assign n = total %}
  {% for y in years %}
  <div class="year-group">
    <h2 class="year reveal">{{ y.name }}</h2>
    <ol class="pubs">
      {% for p in y.items %}
        {% include ed/pub.html p=p num=n %}
        {% assign n = n | minus: 1 %}
      {% endfor %}
    </ol>
  </div>
  {% endfor %}
  <p class="empty" hidden>No papers in this category yet.</p>
</section>
