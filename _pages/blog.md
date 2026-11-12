---
layout: editorial
title: "Blog"
permalink: /blog/
---

{% include base_path %}

<section class="page-head wrap">
  <p class="kicker rise" style="--d:0">Notes &amp; writing</p>
  <h1 class="page-title rise" style="--d:1">Blog</h1>
</section>

<section class="wrap">
  {% if site.posts.size > 0 %}
  <ol class="posts">
    {% for post in site.posts %}
      {% include ed/post-item.html post=post preview=true %}
    {% endfor %}
  </ol>
  {% else %}
  <p class="empty-state rise" style="--d:3">No posts yet. The first one is on its way.</p>
  {% endif %}
</section>
