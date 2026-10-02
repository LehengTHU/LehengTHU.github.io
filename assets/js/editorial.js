(function () {
  var root = document.documentElement;
  root.classList.add('js');

  // Hairline under the nav once the page scrolls.
  var nav = document.querySelector('.nav');
  var onScroll = function () { nav && nav.classList.toggle('scrolled', window.scrollY > 8); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Scroll reveals, staggered within each batch.
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (e) { return e.isIntersecting; });
      batch.forEach(function (e, i) {
        e.target.style.setProperty('--stagger', Math.min(i, 6) * 70 + 'ms');
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  // Publication topic filters.
  var chips = document.querySelectorAll('.chip[data-filter]');
  if (chips.length) {
    var pubs = document.querySelectorAll('.pub-years .pub');
    var groups = document.querySelectorAll('.year-group');
    var empty = document.querySelector('.empty');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var f = chip.getAttribute('data-filter');
        chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
        var shown = 0;
        pubs.forEach(function (p) {
          var match = f === 'all' || (' ' + p.getAttribute('data-topics') + ' ').indexOf(' ' + f + ' ') > -1;
          p.hidden = !match;
          if (match) { p.classList.add('in'); shown++; }
        });
        groups.forEach(function (g) {
          g.hidden = !g.querySelector('.pub:not([hidden])');
        });
        if (empty) empty.hidden = shown > 0;
      });
    });
  }
})();
