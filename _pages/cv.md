---
layout: editorial
title: "CV"
permalink: /cv/
redirect_from:
  - /resume
---

{% include base_path %}

<section class="page-head cv-head wrap">
  <div>
    <p class="kicker rise" style="--d:0">Curriculum Vitae</p>
    <h1 class="page-title rise" style="--d:1">Leheng Sheng</h1>
    <p class="page-note rise" style="--d:2">Leheng Sheng (盛乐恒) &nbsp;·&nbsp; Ph.D. student, School of Computing, National University of Singapore &nbsp;·&nbsp; <a href="mailto:{{ site.author.email }}">{{ site.author.email }}</a></p>
  </div>
  <figure class="portrait">
    <div class="portrait-frame">
      <img src="{{ base_path }}/images/portrait.jpg" alt="Portrait of Leheng Sheng" width="1100" height="1100">
    </div>
  </figure>
</section>

<section class="section wrap">
  <header class="section-head reveal"><span class="section-no">01</span><h2>Education</h2></header>
  {% include ed/entries.html items=site.data.experience.education cv=true %}
</section>

<section class="section wrap">
  <header class="section-head reveal"><span class="section-no">02</span><h2>Experience</h2></header>
  {% include ed/entries.html items=site.data.experience.work cv=true %}
</section>

<section class="section wrap">
  <header class="section-head reveal"><span class="section-no">03</span><h2>Publications</h2></header>
  <a class="more reveal" href="{{ base_path }}/publications/"><span>See all {{ site.data.publications | size }} papers</span><span class="more-arrow" aria-hidden="true">→</span></a>
</section>
