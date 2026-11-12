/* Painting by Code: opening film.
   A ~38 s chaptered explainer driven by one requestAnimationFrame clock.
   Mounts into <div id="pbc-film" class="pbc-film">; does nothing if it is absent.
   Stroke renders come from replay-worker.js (pixels only, never stroke data in the DOM). */
(function () {
  'use strict';
  var root = document.getElementById('pbc-film');
  if (!root || root.dataset.pbcFilm) return;
  root.dataset.pbcFilm = '1';

  var BASE = '/blog/2026/painting-by-code/assets/';
  var WORKER_URL = BASE + 'replay-worker.js';
  var CASES = BASE + 'cases/';
  var SVGNS = 'http://www.w3.org/2000/svg';

  // reconstruction + editing training loss divided by its first point, centered moving average,
  // downsampled evenly on log(step): [relative_step, loss, relative_step, loss, ...]
  var LOSS = [1.0,1.0,1.027,0.9964,1.053,0.991,1.08,0.9859,1.106,0.9778,1.136,0.9705,1.163,0.9643,1.193,0.9575,1.223,0.954,1.256,0.9492,1.286,0.9437,1.319,0.9382,1.352,0.9334,1.389,0.9272,1.422,0.9235,1.458,0.921,1.495,0.9172,1.535,0.9152,1.575,0.913,1.615,0.9118,1.655,0.9077,1.698,0.9028,1.741,0.8992,1.784,0.8949,1.827,0.8946,1.877,0.8909,1.924,0.8891,1.973,0.887,2.023,0.8849,2.073,0.8834,2.126,0.8818,2.179,0.8793,2.236,0.877,2.292,0.8734,2.352,0.8712,2.412,0.8688,2.472,0.8693,2.535,0.8684,2.598,0.867,2.664,0.8643,2.734,0.8631,2.801,0.8637,2.874,0.8626,2.947,0.8604,3.02,0.8589,3.1,0.8549,3.176,0.8534,3.259,0.8529,3.342,0.8536,3.425,0.8538,3.512,0.8524,3.601,0.8487,3.694,0.8472,3.787,0.8472,3.884,0.847,3.983,0.8421,4.083,0.8425,4.186,0.8429,4.296,0.8417,4.402,0.8407,4.515,0.8375,4.631,0.8352,4.747,0.8365,4.867,0.8375,4.993,0.836,5.12,0.8341,5.249,0.8311,5.382,0.8317,5.518,0.8327,5.661,0.8287,5.804,0.828,5.95,0.8262,6.103,0.8262,6.259,0.8256,6.419,0.8245,6.581,0.8258,6.747,0.8241,6.92,0.822,7.096,0.818,7.276,0.8172,7.462,0.82,7.651,0.818,7.844,0.8159,8.043,0.8174,8.249,0.8153,8.459,0.8119,8.674,0.8117,8.894,0.8105,9.12,0.8093,9.352,0.8101,9.591,0.8104,9.834,0.8086,10.086,0.8061,10.342,0.8073,10.605,0.8058,10.874,0.8036,11.149,0.8034,11.435,0.8036,11.724,0.8017,12.023,0.8015,12.329,0.7989,12.641,0.7993,12.963,0.8,13.292,0.7958,13.631,0.7965,13.98,0.7964,14.335,0.7951,14.698,0.7936,15.073,0.7908,15.455,0.7947,15.851,0.7883,16.253,0.7907,16.665,0.7861,17.09,0.7867,17.525,0.7857,17.97,0.7857,18.425,0.7854,18.897,0.7828,19.375,0.7841,19.867,0.7827];
  var POOLED = [8.78, 14.74, 15.86, 16.33, 16.77, 17.25, 17.44]; // reconstruction PSNR over 7 successive checkpoints
  var CKPTS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']; // data keys only, never shown

  var CH = [
    {id: 'open', zh: '开场', en: 'Opening', dur: 4500, hold: 1500},
    {id: 'ae', zh: '代码自编码', en: 'Code autoencoding', dur: 7500, hold: Infinity},
    {id: 'how', zh: '怎么画', en: 'How it paints', seg: 'How', dur: 7500, hold: 900},
    {id: 'train', zh: '训练', en: 'Training', dur: 6000, hold: Infinity},
    {id: 'results', zh: '结果', en: 'Results', dur: 8500, hold: 200},
    {id: 'edit', zh: '编辑与文生图', en: 'Editing & text-to-image', seg: 'Editing', dur: 7500, hold: 900},
    {id: 'end', zh: '结论', en: 'Conclusion', dur: 6500, hold: Infinity}
  ];
  var IX = {};
  CH.forEach(function (c, i) { IX[c.id] = i; });
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function counter(i) { return pad2(i + 1) + ' / ' + pad2(CH.length); }
  var CONCL_ZH = '<u>图片生成是一个可学的代码生成任务</u>：看图重建展现出稳定 scaling，编辑与文生图学到了基础，但 scaling 仍慢。';
  var CONCL_EN = '<u>Image generation is a learnable code-generation task</u>: reconstruction scales steadily, while editing and text-to-image have learned the basics but still scale slowly.';
  var TOTAL = 0;
  var CASES_URL = '/blog/2026/painting-by-code/assets/cases/';
  CH.forEach(function (c) { c.start = TOTAL; TOTAL += c.dur; });
  var FADE_IN = 450, FADE_OUT = 350;
  var POSTER_T = 1500;                        // claim text fully in, painting under way
  var START = 0.28;                           // replays open on a frame that already shows clear strokes
  var SUMMARY_T = CH[IX.results].start + CH[IX.results].dur - FADE_OUT - 20; // results chapter, final state

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- helpers ----------
  function bi(zh, en) { return '<span class="zh">' + zh + '</span><span class="en">' + en + '</span>'; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function easeInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function prog(lt, a, b, ease) { var p = clamp01((lt - a) / (b - a)); return ease ? ease(p) : p; }
  function q(sel, el) { return (el || root).querySelector(sel); }
  function qa(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function isEn() { return document.body.classList.contains('lang-en'); }
  function setOT(el, o, y) {
    o = Math.round(o * 1000) / 1000; y = Math.round(y * 10) / 10;
    if (el._o === o && el._y === y) return;
    el._o = o; el._y = y;
    el.style.opacity = o;
    el.style.transform = y ? 'translateY(' + y + 'px)' : '';
  }
  function rev(el, lt, at, dur, dy) {
    var p = easeOut(clamp01((lt - at) / (dur || 520)));
    setOT(el, p, (1 - p) * (dy == null ? 8 : dy));
  }
  function setText(el, s) { s = String(s); if (el._t !== s) { el._t = s; el.textContent = s; } }
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function svgText(parent, x, y, zh, en, attrs) {
    var langs = en == null ? [[null, zh]] : [['zh', zh], ['en', en]];
    return langs.map(function (l) {
      var a = {x: x, y: y};
      for (var k in attrs) a[k] = attrs[k];
      if (l[0]) a['class'] = (a['class'] ? a['class'] + ' ' : '') + l[0];
      var n = svg('text', a, parent); n.textContent = l[1]; return n;
    });
  }
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    return (s < 600 ? '0' : '') + Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function blit(canvas, img) {
    if (canvas.width !== img.width) { canvas.width = img.width; canvas.height = img.height; }
    canvas.getContext('2d').putImageData(img, 0, 0);
    canvas.classList.add('is-shown');
  }
  var ARROW = '<svg class="pbc-film__arrow" viewBox="0 0 34 12" aria-hidden="true"><path d="M1 6h30M26 1.5 31.5 6 26 10.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';

  // ---------- workers ----------
  var liveWorkers = 0;
  function Replayer(doc, source) {
    this.doc = doc; this.source = source || null; this.total = doc.strokes.length;
    this.w = null; this.ready = false; this.busy = false; this.target = null; this.drawn = new Map();
  }
  Replayer.prototype.ensure = function () {
    if (this.w) return;
    var self = this;
    this.w = new Worker(WORKER_URL); liveWorkers++;
    this.ready = false; this.busy = true;
    this.w.onmessage = function (e) { self.onMsg(e.data); };
    this.w.onerror = function () { self.failed = true; self.dispose(); };
    var msg = {type: 'init', doc: this.doc};
    if (this.source) msg.sourceBuffer = this.source.slice(0);
    this.w.postMessage(msg);
  };
  Replayer.prototype.onMsg = function (d) {
    if (d.type === 'ready') { this.ready = true; this.busy = false; this.pump(); return; }
    if (d.type === 'frame') {
      this.busy = false;
      var c = this.reqCanvas;
      if (c) { blit(c, new ImageData(new Uint8ClampedArray(d.pixels), d.width, d.height)); this.drawn.set(c, d.step); }
      this.pump();
      return;
    }
    if (d.type === 'error') { this.busy = false; this.failed = true; }
  };
  Replayer.prototype.want = function (step, canvas) {
    step = Math.max(0, Math.min(this.total, Math.round(step)));
    this.target = {step: step, canvas: canvas};
    this.ensure(); this.pump();
  };
  Replayer.prototype.pump = function () {
    if (!this.w || !this.ready || this.busy || !this.target) return;
    var tg = this.target;
    if (this.drawn.get(tg.canvas) === tg.step) return;
    this.busy = true; this.reqCanvas = tg.canvas;
    this.w.postMessage({type: 'seek', step: tg.step});
  };
  Replayer.prototype.dispose = function () {
    if (!this.w) return;
    this.w.terminate(); this.w = null; liveWorkers--;
    this.ready = false; this.busy = false;
  };

  function renderFinal(doc) {
    return new Promise(function (resolve, reject) {
      var w = new Worker(WORKER_URL); liveWorkers++;
      function done() { w.terminate(); liveWorkers--; }
      w.onmessage = function (e) {
        var d = e.data;
        if (d.type === 'ready') w.postMessage({type: 'seek', step: d.total});
        else if (d.type === 'frame') { done(); resolve(new ImageData(new Uint8ClampedArray(d.pixels), d.width, d.height)); }
        else if (d.type === 'error') { done(); reject(new Error(d.message)); }
      };
      w.onerror = function (e) { done(); reject(e); };
      w.postMessage({type: 'init', doc: doc});
    });
  }

  // ---------- code autoencoding figure ----------
  var DIAGRAM_URL = '/blog/2026/painting-by-code/assets/diagram/';
  var LATENT_SVG = (function () {
    var g = ['C4C4C4', 'C4C4C4', 'BDBDBD', '9A9A9A', 'CFCFCF', 'ADADAD', 'BDBDBD', '8C8C8C', 'C4C4C4', 'BDBDBD', 'CFCFCF', 'BDBDBD',
             'C4C4C4', 'ADADAD', 'ADADAD', 'ADADAD', 'D9D9D9', 'ADADAD', 'CFCFCF', 'ADADAD', 'CFCFCF', '8C8C8C', 'ADADAD', 'ADADAD'];
    return '<svg viewBox="0 0 168 112" aria-hidden="true">' + g.map(function (c, i) {
      return '<rect x="' + (8.1 + (i % 8) * 19.4).toFixed(1) + '" y="' + (18 + Math.floor(i / 8) * 30) + '" width="16" height="16" rx="2" fill="#' + c + '"/>';
    }).join('') + '</svg>';
  })();
  // colored silhouettes on three baselines (the same ribbon as the post's figure): a picture, not code
  var RIBBON_SVG = (function () {
    var e = function (cx, cy, rx, ry, c, o, a) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="#' + c + '" fill-opacity="' + o + '" transform="rotate(' + a + ' ' + cx + ' ' + cy + ')"/>'; };
    var r = function (x, y, w, h, c, o, a) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (h / 2) + '" fill="#' + c + '" fill-opacity="' + o + '" transform="rotate(' + a + ' ' + (x + w / 2).toFixed(1) + ' ' + (y + h / 2).toFixed(1) + ')"/>'; };
    var base = function (y) { return '<line x1="6" y1="' + y + '" x2="162" y2="' + y + '" stroke="rgba(0,0,0,.1)" stroke-width="1"/>'; };
    return '<svg viewBox="0 0 168 112" aria-hidden="true">' +
      base(35) + r(6.7, 17.3, 23.4, 10.6, '265485', .78, -60) + r(26.5, 18.4, 25.9, 10.6, '632e0a', .78, -35) + r(53.8, 18.4, 19.2, 12.2, '0d192b', 1, 90) +
      e(83.1, 23.7, 13, 8.4, '265485', .94, 65) + e(105.9, 22.8, 13.1, 8.1, '394856', .78, -35) + e(127.5, 25.1, 11.7, 6.2, '4f6973', 1, 40) + e(149.8, 22.3, 15.2, 8.6, '394856', 1, 0) +
      base(67) + e(17.6, 54.5, 7.5, 4.8, '1b4f8f', .94, 25) + e(33.7, 57.1, 8.4, 4.4, '352d15', .94, 90) + r(40.9, 50.8, 20.1, 6.9, '890c10', 1, -35) + r(55.7, 51.9, 21.9, 8.8, '890c10', 1, 40) +
      e(83.7, 56.4, 10.4, 3.7, '0d192b', .86, 40) + e(100.6, 57.5, 8.7, 4.2, '1b4f8f', 1, -35) + e(117.6, 56.2, 11.3, 3.7, 'c81e1a', 1, 25) + e(134, 54.9, 8, 3.3, '1c2d2f', .86, 40) + r(142.3, 50.2, 17.9, 12.2, 'ffce79', .78, -20) +
      base(97) + e(14.8, 86.2, 4.9, 3.3, 'be6c00', 1, 25) + r(19.6, 82.6, 12.7, 4.4, '265485', .94, -20) + e(39.8, 87.8, 7.1, 3.2, '0d192b', .78, 90) + r(46.8, 82.4, 9.8, 6, 'e1c130', .78, 12) +
      r(58.2, 82.3, 13.5, 5.9, '265485', .94, -20) + r(71.1, 81, 13.2, 7.7, 'c81e1a', .86, 65) + e(89.8, 86.6, 6.1, 3.8, 'ffce79', .94, -35) + r(96, 82.6, 12.7, 7.2, 'c81e1a', .86, 65) +
      r(109.8, 82, 10.3, 6, 'ffce79', .86, 25) + e(129.5, 87.2, 6.6, 3.9, '890c10', .86, 40) + e(142, 88, 4.9, 2.9, '265485', .86, 12) + r(147.6, 84.6, 12, 6.6, '1c2d2f', .78, 90) +
      '</svg>';
  })();
  var TRAP = {enc: '0,0 100,24 100,76 0,100', dec: '0,24 100,0 100,100 0,76'};
  function aeLane(k, title, cells, names, subs) {
    var out = '<div class="pbc-film__aelane is-' + k + '" data-ae="' + k + '-title">' + title + '</div>';
    cells.forEach(function (c, i) {
      var col = i + 1;
      if (typeof c === 'string') {
        out += '<div class="pbc-film__aenode is-' + k + '" data-ae="' + k + '-' + col + '" style="--col:' + col + '">' + c +
          '<span class="pbc-film__aename">' + names[i / 2] + '</span>' +
          (subs[i / 2] ? '<span class="pbc-film__aesub">' + subs[i / 2] + '</span>' : '') + '</div>';
      } else {
        out += '<div class="pbc-film__aetrap is-' + k + '" data-ae="' + k + '-' + col + '" style="--col:' + col + '">' +
          '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="' + (i === 1 ? TRAP.enc : TRAP.dec) + '" vector-effect="non-scaling-stroke"/></svg></div>' +
          '<div class="pbc-film__aelabel is-' + k + '" data-ae="' + k + '-' + col + 'l" style="--col:' + col + '">' +
          '<span class="pbc-film__aename">' + c[0] + '</span><span class="pbc-film__aesub">' + c[1] + '</span></div>';
      }
    });
    return out;
  }
  function diff(z0, z1, e0, e1) {
    return '<span class="zh"><i>' + z0 + '</i> → <em>' + z1 + '</em></span><span class="en"><i>' + e0 + '</i> → <em>' + e1 + '</em></span>';
  }
  // grey pixel cards for the autoencoder lane, sampled from the same two images
  function pixelate(canvas, url) {
    var im = new Image();
    im.onload = function () {
      var ctx = canvas.getContext('2d');
      ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
      var d = ctx.getImageData(0, 0, canvas.width, canvas.height), px = d.data;
      for (var i = 0; i < px.length; i += 4) {
        var g = Math.round(150 + (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * 0.42);
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      ctx.putImageData(d, 0, 0);
      canvas.classList.add('is-shown');
    };
    im.src = url;
  }

  // ---------- markup ----------
  var zhWords = ['语言模型', '可以学会', '用代码', '<em>一笔一笔</em>', '画画'];
  var enWords = 'Language models can learn to paint with code,'.split(' ').concat(['<em>stroke by stroke</em>']);
  function words(list) {
    return list.map(function (w) {
      var em = w.indexOf('<em>') === 0;
      return '<span class="pbc-film__w' + (em ? ' pbc-film__w--em' : '') + '">' +
        (em ? w.replace(/<\/?em>/g, '') + '<span class="pbc-film__ul"></span>' : w) + '</span>';
    }).join('<wbr>');
  }
  function head(i) {
    return '<div class="pbc-film__head" data-rev="0"><span class="pbc-film__num">' + counter(i) + '</span>' +
      '<h3 class="pbc-film__title">' + bi(CH[i].zh, CH[i].en) + '</h3></div>';
  }

  root.innerHTML =
    '<p class="pbc-film__sr">' + bi('开场影片：语言模型可以学会用代码一笔一笔画画。' + CONCL_ZH, 'Opening film: language models can learn to paint with code, stroke by stroke. ' + CONCL_EN) + '</p>' +
    '<div class="pbc-film__stage" aria-hidden="true">' +
      // 1. claim
      '<div class="pbc-film__scene pbc-film__scene--claim">' +
        '<div class="pbc-film__claim-text">' +
          '<div class="pbc-film__kicker" data-rev="0">' + bi('Painting by Code · 用代码画画', 'Painting by Code') + '</div>' +
          '<p class="pbc-film__headline"><span class="zh">' + words(zhWords) + '</span><span class="en">' + words(enWords) + '</span></p>' +
        '</div>' +
        '<div class="pbc-film__claim-art pbc-film__fig" data-rev="300">' +
          '<span class="pbc-film__sq">' + '<img src="' + CASES_URL + 'img/case-001-target.jpg" alt="" loading="lazy">' + '<canvas data-c="claim" width="256" height="256"></canvas></span>' +
          '<div class="pbc-film__under pbc-film__mono" style="width:100%"><span>' + bi('逐笔渲染', 'stroke by stroke') + '</span><span><span class="pbc-film__count" data-n="claim"></span> ' + bi('笔', 'strokes') + '</span></div>' +
        '</div>' +
      '</div>' +
      // 2. code autoencoding (animated version of the post's comparison figure)
      '<div class="pbc-film__scene pbc-film__scene--ae">' + head(IX.ae) +
        '<div class="pbc-film__body"><div class="pbc-film__ae">' +
          aeLane('a', bi('自编码器', 'Autoencoder'), [
            '<span class="pbc-film__aevis is-raster"><canvas data-px="target" width="15" height="10"></canvas></span>',
            [bi('编码器', 'Encoder'), bi('可学习', 'learned')],
            '<span class="pbc-film__aevis is-latent">' + LATENT_SVG + '</span>',
            [bi('解码器', 'Decoder'), bi('可学习', 'learned')],
            '<span class="pbc-film__aevis is-raster"><canvas data-px="recon" width="15" height="10"></canvas></span>'
          ], [bi('输入图', 'Input image'), bi('潜表示', 'Latent'), bi('重建图', 'Reconstruction')], ['', '', '']) +
          '<div class="pbc-film__aediff" data-diff="0" style="--col:2">' + diff('学出来', '解出来', 'learned', 'solved') + '</div>' +
          '<div class="pbc-film__aediff" data-diff="1" style="--col:3">' + diff('向量', '代码', 'vector', 'code') + '</div>' +
          '<div class="pbc-film__aediff" data-diff="2" style="--col:4">' + diff('可学习', '固定', 'learned', 'fixed') + '</div>' +
          aeLane('b', bi('代码自编码', 'Code autoencoding'), [
            '<span class="pbc-film__aevis is-img"><img src="' + DIAGRAM_URL + 'target.jpg" alt="" loading="lazy"></span>',
            [bi('代码拟合', 'Code fitting'), bi('优化求解', 'solved by optimization')],
            '<span class="pbc-film__aevis is-prog">' + RIBBON_SVG + '</span>',
            [bi('执行代码', 'Execute the code'), bi('固定渲染器', 'fixed renderer')],
            '<span class="pbc-film__aevis is-img"><img src="' + DIAGRAM_URL + 'recon.jpg" alt="" loading="lazy"></span>'
          ], [bi('目标图', 'Target'), bi('代码', 'Code'), bi('重建图', 'Reconstruction')], ['', bi('可读、可执行', 'readable and executable'), '']) +
        '</div></div>' +
        '<p class="pbc-film__caption" data-rev="5600">' + bi('代码自编码：用优化把图片拟合成可读、可执行的代码，再交给固定渲染器画回来。', 'Code autoencoding: optimization fits readable, executable code to an image, and a fixed renderer draws it back.') + '</p>' +
      '</div>' +
      // 3. how it paints
      '<div class="pbc-film__scene pbc-film__scene--how">' + head(IX.how) +
        '<div class="pbc-film__body"><div class="pbc-film__how">' +
          '<div class="pbc-film__fig" data-rev="150">' +
            '<div class="pbc-film__row pbc-film__label">' + bi('目标图', 'Target') + '</div>' +
            '<span class="pbc-film__sq">' + '<img src="' + CASES_URL + 'img/case-001-target.jpg" alt="" loading="lazy">' + '</span>' +
            '<div class="pbc-film__row pbc-film__label">&nbsp;</div>' +
          '</div>' + '<span data-rev="300">' + ARROW + '</span>' +
          '<div class="pbc-film__fig" data-rev="300">' +
            '<div class="pbc-film__row pbc-film__countrow pbc-film__label"><span>' + bi('逐笔渲染', 'stroke by stroke') + '</span><span><span class="pbc-film__count" data-n="how"></span> / <span data-n="howTotal"></span></span></div>' +
            '<span class="pbc-film__sq">' + '<img src="' + CASES_URL + 'img/case-001-target.jpg" alt="" loading="lazy">' + '<canvas data-c="how" width="256" height="256"></canvas></span>' +
            '<div class="pbc-film__row"><span class="pbc-film__progress"><i data-howbar></i></span></div>' +
          '</div>' +
        '</div></div>' +
        '<p class="pbc-film__caption" data-rev="700">' + bi('把图像拟合为笔触序列，逐笔渲染出画面', 'Each image is represented as a sequence of strokes and rendered stroke by stroke') + '</p>' +
      '</div>' +
      // 3. training
      '<div class="pbc-film__scene pbc-film__scene--train">' + head(IX.train) +
        '<div class="pbc-film__body" style="padding:14px 0 10px"><div class="pbc-film__chart" data-chart="loss" data-rev="150"></div></div>' +
        '<p class="pbc-film__caption" data-rev="1200">' + bi('loss 平稳下降，没有 spike', 'Loss falls smoothly, with no spikes') + '</p>' +
      '</div>' +
      // 4. results
      '<div class="pbc-film__scene pbc-film__scene--results">' + head(IX.results) +
        '<div class="pbc-film__body" style="padding-top:14px"><div class="pbc-film__results">' +
          '<div class="pbc-film__label" data-rev="100">' + bi('同一张图，随训练推进 · 单图 PSNR', 'Same image as training goes on · per-image PSNR') + '</div>' +
          '<div class="pbc-film__tiles">' + CKPTS.map(function (k, i) {
            return '<div class="pbc-film__tile" data-tile="' + i + '"><span class="pbc-film__sq"><canvas data-c="final' + i + '" width="256" height="256"></canvas></span>' +
              '<span class="pbc-film__mono"><b data-psnr="' + i + '">&nbsp;</b></span></div>';
          }).join('') + '</div>' +
          '<div class="pbc-film__axis pbc-film__label" data-rev="100"><span>' + bi('训练早期', 'early in training') + '</span><span class="pbc-film__axis-line"></span><span>' + bi('训练后期', 'late in training') + '</span></div>' +
          '<div class="pbc-film__chart" data-chart="psnr"></div>' +
        '</div></div>' +
        '<p class="pbc-film__caption" data-rev="5300">' + bi('重建 PSNR 随训练稳步上涨，曲线还没变平', 'Reconstruction PSNR keeps rising with training, with no plateau yet') + '</p>' +
      '</div>' +
      // 5. editing and text-to-image
      '<div class="pbc-film__scene pbc-film__scene--edit">' + head(IX.edit) +
        '<div class="pbc-film__body"><div class="pbc-film__pair">' +
          '<div class="pbc-film__task" data-rev="150">' +
            '<div class="pbc-film__label">' + bi('编辑', 'Editing') + '</div>' +
            '<div><span class="pbc-film__label">' + bi('指令 ', 'instruction ') + '</span><span class="pbc-film__instr" data-txt="instr">&nbsp;</span></div>' +
            '<div class="pbc-film__task-row"><span class="pbc-film__sq"><img src="' + CASES_URL + 'img/case-023-input.jpg" alt="" loading="lazy"></span>' + ARROW +
              '<span class="pbc-film__sq"><img src="' + CASES_URL + 'img/case-023-input.jpg" alt="" loading="lazy"><canvas data-c="edit" width="256" height="256"></canvas></span></div>' +
            '<div class="pbc-film__under pbc-film__label"><span>' + bi('输入图', 'input') + '</span><span>' + bi('结果', 'result') + '</span></div>' +
          '</div>' +
          '<div class="pbc-film__task" data-rev="2300">' +
            '<div class="pbc-film__label">' + bi('文生图', 'Text-to-image') + '</div>' +
            '<div class="pbc-film__label pbc-film__opt">' + bi('提示词 → 画', 'prompt → painting') + '</div>' +
            '<div class="pbc-film__task-row"><span class="pbc-film__prompt" data-txt="prompt"></span>' + ARROW +
              '<span class="pbc-film__sq"><canvas data-c="t2i" width="256" height="256"></canvas></span></div>' +
            '<div class="pbc-film__under pbc-film__label"><span>' + bi('提示词', 'prompt') + '</span><span>' + bi('画出的图', 'painting') + '</span></div>' +
          '</div>' +
        '</div></div>' +
        '<p class="pbc-film__caption" data-rev="5400">' + bi('学到了基础，但分数还没涨', 'They learn the basics, but the scores have not moved yet') + '</p>' +
      '</div>' +
      // 6. conclusion
      '<div class="pbc-film__scene pbc-film__scene--end">' +
        '<div class="pbc-film__kicker" data-rev="0"><span class="pbc-film__num">' + counter(IX.end) + '</span> · ' + bi(CH[IX.end].zh, CH[IX.end].en) + '</div>' +
        '<p class="pbc-film__end" data-rev="200">' + bi(CONCL_ZH, CONCL_EN) + '</p>' +
      '</div>' +
    '</div>' +
    '<div class="pbc-film__bar">' +
      '<button type="button" class="pbc-film__play"></button>' +
      '<span class="pbc-film__now"></span>' +
      '<div class="pbc-film__segs" role="group">' + CH.map(function (c, i) {
        return '<button type="button" class="pbc-film__seg" style="flex:' + c.dur + ' 1 auto" data-seg="' + i + '">' +
          '<span class="pbc-film__track"><span class="pbc-film__fill"></span></span>' +
          '<span class="pbc-film__seglabel">' + bi(c.zh, c.seg || c.en) + '</span></button>';
      }).join('') + '</div>' +
      '<span class="pbc-film__time"></span>' +
    '</div>';

  var stage = q('.pbc-film__stage');
  var scenes = qa('.pbc-film__scene');
  scenes.forEach(function (s) {
    s._revs = qa('[data-rev]', s).map(function (el) { return {el: el, at: +el.getAttribute('data-rev')}; });
  });
  var cv = {};
  qa('canvas[data-c]').forEach(function (c) { cv[c.getAttribute('data-c')] = c; });
  var cnt = {};
  qa('[data-n]').forEach(function (n) { cnt[n.getAttribute('data-n')] = n; });
  var wordEls = {zh: qa('.pbc-film__headline .zh .pbc-film__w'), en: qa('.pbc-film__headline .en .pbc-film__w')};
  var ulEls = qa('.pbc-film__ul');
  var howBar = q('[data-howbar]');
  var aeParts = qa('[data-ae]').map(function (el) { return {el: el, k: el.getAttribute('data-ae')}; });
  var aeDiffs = qa('[data-diff]');
  var tiles = qa('[data-tile]');
  var playBtn = q('.pbc-film__play');
  var segs = qa('.pbc-film__seg');
  var segsBox = q('.pbc-film__segs');
  var timeEl = q('.pbc-film__time');
  var nowEl = q('.pbc-film__now');

  // ---------- data ----------
  var D = {rep001: null, rep023: null, rep031: null, finals: [], finalsDone: false,
           failed: {c001: false, c023: false, c031: false}};
  var loadStarted = false;

  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
  function getImage(url) {
    return new Promise(function (resolve, reject) {
      var im = new Image(); im.decoding = 'async';
      im.onload = function () { resolve(im); }; im.onerror = reject; im.src = url;
    });
  }

  function load() {
    if (loadStarted) return;
    loadStarted = true;
    pixelate(q('[data-px="target"]'), DIAGRAM_URL + 'target.jpg');
    pixelate(q('[data-px="recon"]'), DIAGRAM_URL + 'recon.jpg');
    getJSON(CASES + 'case-001.json').then(function (c) {
      var d7 = c.steps.C7.drawing;
      D.rep001 = new Replayer(d7);
      setText(cnt.howTotal, d7.strokes.length);
      var best = -1, bestV = -Infinity;
      CKPTS.forEach(function (k, i) {
        var v = c.steps[k].psnr_db;
        q('[data-psnr="' + i + '"]').innerHTML = '<span class="pbc-film__d2">' + v.toFixed(2) + ' dB</span><span class="pbc-film__d1">' + v.toFixed(1) + '</span>';
        if (v > bestV) { bestV = v; best = i; }
      });
      tiles[best].classList.add('is-best');
      requestRender();
      // final frames C1..C7, two workers at a time
      var queue = CKPTS.map(function (k, i) { return i; });
      function next() {
        if (!queue.length) return Promise.resolve();
        var i = queue.shift();
        return renderFinal(c.steps[CKPTS[i]].drawing).then(function (img) {
          D.finals[i] = img; blit(cv['final' + i], img);
        }, function () {}).then(next);
      }
      Promise.all([next(), next()]).then(function () { D.finalsDone = true; requestRender(); });
    }).catch(function () { D.failed.c001 = true; D.finalsDone = true; })
      .then(function () {
        return Promise.all([getJSON(CASES + 'case-023.json'), getImage(CASES + 'img/case-023-input.jpg')]).then(function (r) {
          var c = r[0], im = r[1], d7 = c.steps.C7.drawing;
          setText(q('[data-txt="instr"]'), '“' + c.prompt + '”');
          var tmp = document.createElement('canvas');
          tmp.width = d7.width; tmp.height = d7.height;
          var ctx = tmp.getContext('2d');
          ctx.drawImage(im, 0, 0, d7.width, d7.height);
          D.rep023 = new Replayer(d7, ctx.getImageData(0, 0, d7.width, d7.height).data.buffer);
          requestRender();
        }).catch(function () { D.failed.c023 = true; });
      })
      .then(function () {
        return getJSON(CASES + 'case-031.json').then(function (c) {
          setText(q('[data-txt="prompt"]'), '“' + c.prompt.trim() + '”');
          D.rep031 = new Replayer(c.steps.C7.drawing);
          requestRender();
        }).catch(function () { D.failed.c031 = true; });
      });
  }

  function repReady(r, failed) { return failed || (r && (r.ready || r.failed)); }
  function chapterReady(i) {
    if (i === IX.open) return repReady(D.rep001, D.failed.c001);
    if (i === IX.how) return repReady(D.rep001, D.failed.c001);
    if (i === IX.results) return D.finalsDone || D.finals.filter(Boolean).length === 7;
    if (i === IX.edit) return repReady(D.rep023, D.failed.c023) && repReady(D.rep031, D.failed.c031) &&
      (D.failed.c031 || cv.t2i.classList.contains('is-shown'));
    return true;
  }

  // ---------- charts (rebuilt on resize so SVG text stays at its CSS pixel size) ----------
  var lossChart = q('[data-chart="loss"]'), psnrChart = q('[data-chart="psnr"]');
  var LC = null, PC = null;

  function buildLoss() {
    var W = lossChart.clientWidth, H = lossChart.clientHeight;
    lossChart.innerHTML = '';
    if (W < 50 || H < 50) { LC = null; return; }
    var narrow = W < 420;
    var m = {l: narrow ? 12 : 16, r: narrow ? 16 : 20, t: 28, b: 34};
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var lx0 = 0, lx1 = Math.log(20), y0 = 0.76, y1 = 1.0;
    function X(s) { return m.l + (Math.log(s) - lx0) / (lx1 - lx0) * pw; }
    function Y(v) { return m.t + (y1 - v) / (y1 - y0) * ph; }
    var s = svg('svg', {viewBox: '0 0 ' + W + ' ' + H, width: W, height: H});
    var g = svg('g', {}, s);
    [0.8, 0.9, 1.0].forEach(function (v) {
      svg('line', {x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), stroke: '#E6E6E6', 'stroke-width': 1}, g);
    });
    svg('line', {x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, stroke: 'rgba(0,0,0,.25)', 'stroke-width': 1}, g);
    [1, 2, 5, 10, 20].forEach(function (v) {
      svg('line', {x1: X(v), x2: X(v), y1: m.t + ph, y2: m.t + ph + 4, stroke: 'rgba(0,0,0,.25)'}, g);
      svgText(g, X(v), m.t + ph + 19, v + '×', null, {'text-anchor': 'middle'});
    });
    svgText(g, m.l, m.t - 12, '归一化 loss', 'normalized loss', {});
    svgText(g, m.l + pw, m.t - 12, '相对训练步数（对数轴）', narrow ? 'training step (log)' : 'relative training step (log)', {'text-anchor': 'end'});
    var id = 'pbcf-clip-' + Math.random().toString(36).slice(2, 8);
    var clip = svg('rect', {x: m.l - 4, y: 0, width: 0, height: H});
    svg('clipPath', {id: id}, svg('defs', {}, s)).appendChild(clip);
    var pts = [], d = '';
    for (var i = 0; i < LOSS.length; i += 2) {
      var px = X(LOSS[i]), py = Y(LOSS[i + 1]);
      pts.push([px, py, LOSS[i + 1]]);
      d += (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
    }
    svg('path', {d: d, fill: 'none', stroke: '#2456A6', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'clip-path': 'url(#' + id + ')'}, s);
    var series = svgText(s, m.l + pw - 4, Y(0.975), '重建 + 编辑', 'reconstruction + editing', {'class': 'pbc-film__svg-series', 'text-anchor': 'end'});
    var dot = svg('circle', {r: 3.5, fill: '#2456A6', cx: pts[0][0], cy: pts[0][1]}, s);
    lossChart.appendChild(s);
    LC = {pts: pts, clip: clip, dot: dot, series: series, x0: m.l, pw: pw, last: -1};
  }

  function drawLoss(p) {
    if (!LC) return;
    if (LC.last === p) return;
    LC.last = p;
    var x = LC.x0 + p * LC.pw, pts = LC.pts, j = 1;
    while (j < pts.length - 1 && pts[j][0] < x) j++;
    var a = pts[j - 1], b = pts[j], f = b[0] === a[0] ? 0 : clamp01((x - a[0]) / (b[0] - a[0]));
    var y = a[1] + (b[1] - a[1]) * f;
    LC.clip.setAttribute('width', Math.max(0, x - LC.x0 + 4));
    LC.dot.setAttribute('cx', x.toFixed(1)); LC.dot.setAttribute('cy', y.toFixed(1));
    LC.dot.style.opacity = p > 0 ? 1 : 0;
  }

  function buildPsnr() {
    var W = psnrChart.clientWidth, H = psnrChart.clientHeight;
    psnrChart.innerHTML = '';
    if (W < 50 || H < 40) { PC = null; return; }
    var box = psnrChart.getBoundingClientRect();
    var xs = tiles.map(function (t) { var r = t.getBoundingClientRect(); return r.left + r.width / 2 - box.left; });
    var m = {t: 34, b: 10};
    var ph = H - m.t - m.b, v0 = 8, v1 = 18;
    function Y(v) { return m.t + (v1 - v) / (v1 - v0) * ph; }
    var s = svg('svg', {viewBox: '0 0 ' + W + ' ' + H, width: W, height: H});
    svg('line', {x1: 0, x2: W, y1: 0.5, y2: 0.5, stroke: 'rgba(0,0,0,.07)'}, s);
    svgText(s, 0, 21, '整体重建 PSNR（dB）', 'pooled reconstruction PSNR (dB)', {});
    var pts = POOLED.map(function (v, i) { return [xs[i], Y(v)]; });
    var d = '', len = 0, cum = [0];
    pts.forEach(function (p, i) {
      d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      if (i) { len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); cum.push(len); }
    });
    var path = svg('path', {d: d, fill: 'none', stroke: '#2456A6', 'stroke-width': 2, 'stroke-linejoin': 'round',
      'stroke-dasharray': len + ' ' + len, 'stroke-dashoffset': len}, s);
    var dots = pts.map(function (p, i) {
      var last = i === pts.length - 1;
      return svg('circle', {cx: p[0], cy: p[1], r: last ? 4.5 : 3, fill: last ? '#2456A6' : '#FFFFFF', stroke: last ? '#2456A6' : '#85A4D6', 'stroke-width': 1.5}, s);
    });
    var lo = svg('text', {x: pts[0][0] + 9, y: pts[0][1] + 4}, s); lo.textContent = POOLED[0].toFixed(2);
    var hi = svg('text', {'class': 'pbc-film__svg-strong', x: pts[6][0] + 5, y: pts[6][1] + 20, 'text-anchor': 'end'}, s);
    hi.textContent = POOLED[6].toFixed(2) + ' dB';
    psnrChart.appendChild(s);
    PC = {path: path, len: len, cum: cum, dots: dots, lo: lo, hi: hi};
  }

  function drawPsnr(lt) {
    if (!PC) return;
    var p = prog(lt, 3100, 5100, easeInOut), L = p * PC.len;
    PC.path.setAttribute('stroke-dashoffset', (PC.len - L).toFixed(1));
    PC.path.style.opacity = lt >= 3000 ? 1 : 0;
    PC.dots.forEach(function (dt, i) { dt.style.opacity = lt >= 3000 && PC.cum[i] <= L + 0.5 ? 1 : 0; });
    PC.lo.style.opacity = prog(lt, 3000, 3400);
    PC.hi.style.opacity = prog(lt, 5050, 5450);
  }

  // ---------- scenes ----------
  // stroke count for replay progress p in [0, 1]; starts at START * total, never on an empty canvas
  function stepAt(r, p) { return Math.round(r.total * (START + (1 - START) * p)); }

  var SCENE = [
    function claim(lt) {
      ['zh', 'en'].forEach(function (lang) {
        var ws = wordEls[lang], gap = 1000 / ws.length;
        ws.forEach(function (w, i) { rev(w, lt, 80 + i * gap, 480, 10); });
      });
      var p = prog(lt, 0, 4100, easeInOut);
      ulEls.forEach(function (u) { u.style.transform = 'scaleX(' + p.toFixed(3) + ')'; });
      if (D.rep001) {
        var step = stepAt(D.rep001, p);
        D.rep001.want(step, cv.claim);
        setText(cnt.claim, step);
      }
    },
    function ae(lt) {
      var at = {'a-title': 300, 'a-1': 450, 'a-2': 700, 'a-2l': 800, 'a-3': 950, 'a-4': 1200, 'a-4l': 1300, 'a-5': 1450,
                'b-title': 2100, 'b-1': 2250, 'b-2': 2500, 'b-2l': 2600, 'b-3': 2750, 'b-4': 3000, 'b-4l': 3100, 'b-5': 3250};
      aeParts.forEach(function (p) { rev(p.el, lt, at[p.k], 500, 6); });
      aeDiffs.forEach(function (d, i) {
        var a = 3800 + i * 600;
        rev(d, lt, a, 450, 4);
        d.classList.toggle('is-lit', lt >= a + 150);
      });
    },
    function how(lt) {
      if (!D.rep001) return;
      var p = prog(lt, 700, 6300, easeInOut), step = stepAt(D.rep001, p);
      D.rep001.want(step, cv.how);
      setText(cnt.how, step);
      var w = (p * 100).toFixed(1) + '%';
      if (howBar._w !== w) { howBar._w = w; howBar.style.width = w; }
    },
    function train(lt) {
      drawLoss(prog(lt, 500, 4700, easeInOut));
    },
    function results(lt) {
      tiles.forEach(function (t, i) { rev(t, lt, 250 + i * 330, 480, 10); });
      drawPsnr(lt);
    },
    function edit(lt) {
      if (D.rep023) D.rep023.want(prog(lt, 900, 2500, easeInOut) * D.rep023.total, cv.edit);
      if (D.rep031) D.rep031.want(stepAt(D.rep031, prog(lt, 3000, 5600, easeInOut)), cv.t2i);
    },
    function next() {}
  ];
  // which chapters each replayer serves (workers are dropped when the clock is far away)
  function manageWorkers(cur) {
    [[D.rep001, IX.open, IX.how], [D.rep023, IX.edit, IX.edit], [D.rep031, IX.edit, IX.edit]].forEach(function (r) {
      if (!r[0]) return;
      var near = cur >= r[1] - 1 && cur <= r[2] + 1;
      if (!near || ended) r[0].dispose();
      else if (cur === r[1] - 1) { // warm up: show the first frame before the chapter fades in
        if (r[0] === D.rep023) r[0].want(0, cv.edit);
        if (r[0] === D.rep031) r[0].want(stepAt(r[0], 0), cv.t2i);
      }
    });
  }

  // ---------- clock ----------
  var t = reduced ? SUMMARY_T : POSTER_T;
  var playing = false, ended = false, userPaused = false, started = false, lastTs = null, raf = 0;
  var visible50 = false, stallMs = 0;

  function chapterAt(time) {
    for (var i = CH.length - 1; i >= 0; i--) if (time >= CH[i].start) return i;
    return 0;
  }

  var shownScene = -1;
  function render() {
    var cur = chapterAt(Math.min(t, TOTAL - 1));
    var c = CH[cur], lt = t - c.start;
    var oin = cur === 0 ? 1 : easeOut(clamp01(lt / FADE_IN));
    var oout = cur === CH.length - 1 ? 1 : clamp01((c.dur - lt) / FADE_OUT);
    var sc = scenes[cur];
    if (shownScene !== cur) {
      if (shownScene >= 0) { scenes[shownScene].classList.remove('is-on'); setOT(scenes[shownScene], 0, 0); }
      sc.classList.add('is-on'); shownScene = cur;
    }
    setOT(sc, Math.min(oin, oout), (1 - oin) * 10);
    sc._revs.forEach(function (r) { rev(r.el, lt, r.at); });
    SCENE[cur](lt);
    manageWorkers(cur);
    // controls
    segs.forEach(function (s, i) {
      var f = clamp01((t - CH[i].start) / CH[i].dur), w = (f * 100).toFixed(2) + '%', fill = s.firstChild.firstChild;
      if (fill._w !== w) { fill._w = w; fill.style.width = w; }
      s.classList.toggle('is-current', i === cur);
      if (i === cur) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
    });
    setText(timeEl, fmtTime(t) + ' / ' + fmtTime(TOTAL));
    if (nowEl._k !== cur) { nowEl._k = cur; nowEl.innerHTML = pad2(cur + 1) + ' · ' + bi(c.zh, c.en); }
  }
  var pendingRender = 0;
  function requestRender() {
    if (playing || pendingRender) return;
    pendingRender = requestAnimationFrame(function () { pendingRender = 0; render(); });
  }

  function tick(ts) {
    raf = 0;
    if (!playing) return;
    var dt = lastTs == null ? 0 : Math.min(100, ts - lastTs);
    lastTs = ts;
    var nt = t + dt, cur = chapterAt(Math.min(nt, TOTAL - 1)), hold = CH[cur].start + CH[cur].hold;
    if (nt > hold && t <= hold + 1 && !chapterReady(cur) && stallMs < 8000) { // buffer like a video
      stallMs += dt; nt = Math.max(t, hold);
    } else if (chapterReady(cur)) stallMs = 0;
    if (nt >= TOTAL) {
      t = TOTAL; playing = false; ended = true;
      render(); updateButton();
      return;
    }
    t = nt;
    render();
    raf = requestAnimationFrame(tick);
  }

  function play() {
    if (playing) return;
    if (ended || t >= TOTAL) { t = 0; ended = false; }
    if (reduced && !started) t = 0;
    started = true; playing = true; lastTs = null;
    load();
    if (pendingRender) { cancelAnimationFrame(pendingRender); pendingRender = 0; }
    raf = requestAnimationFrame(tick);
    updateButton();
  }
  function pause() {
    if (!playing) return;
    playing = false; lastTs = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    updateButton(); render();
  }
  function seek(ms) {
    t = Math.max(0, Math.min(TOTAL, +ms || 0));
    ended = t >= TOTAL; started = true; lastTs = null; stallMs = 0;
    if (ended && playing) pause();
    load(); render(); updateButton();
  }

  var ICONS = {
    play: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 0.8v8.4L9 5z"/></svg>',
    pause: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1h2.4v8H1.5zM6.1 1h2.4v8H6.1z"/></svg>',
    replay: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.2a3.8 3.8 0 1 1-3.6 2.6l1.1.4A2.6 2.6 0 1 0 5 2.4v1.4L2.6 1.8 5 -.2z"/></svg>'
  };
  function updateButton() {
    var k = playing ? 'pause' : ended ? 'replay' : 'play';
    var L = {play: ['播放', 'Play'], pause: ['暂停', 'Pause'], replay: ['重播', 'Replay']}[k];
    if (playBtn._k !== k) {
      playBtn._k = k;
      playBtn.innerHTML = ICONS[k] + bi(L[0], L[1]);
      playBtn.classList.toggle('is-primary', k !== 'pause');
    }
    var en = isEn();
    playBtn.setAttribute('aria-label', en ? L[1] + ' film' : L[0] + '影片');
    segsBox.setAttribute('aria-label', en ? 'Chapters' : '章节');
    segs.forEach(function (sg, i) { sg.setAttribute('aria-label', counter(i) + ' ' + (en ? CH[i].en : CH[i].zh)); });
  }

  playBtn.addEventListener('click', function () {
    if (playing) { userPaused = true; pause(); }
    else { userPaused = false; play(); }
  });

  // chapter segments: click jumps to the chapter, dragging scrubs
  function timeAtX(clientX) {
    for (var i = 0; i < segs.length; i++) {
      var r = segs[i].getBoundingClientRect();
      if (clientX <= r.right || i === segs.length - 1) {
        return CH[i].start + clamp01((clientX - r.left) / r.width) * CH[i].dur;
      }
    }
    return 0;
  }
  function jumpTo(i) { seek(CH[i].start + (i ? FADE_IN + 50 : 0)); }
  var drag = null;
  segsBox.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var seg = e.target.closest('.pbc-film__seg');
    drag = {x: e.clientX, seg: seg ? +seg.getAttribute('data-seg') : null, moved: false, wasPlaying: playing};
    segsBox.setPointerCapture(e.pointerId);
  });
  segsBox.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 5) return;
    if (!drag.moved) { drag.moved = true; if (playing) pause(); }
    seek(timeAtX(e.clientX));
  });
  function endDrag(e, cancel) {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.moved && !cancel && d.seg != null) jumpTo(d.seg);
    if (d.wasPlaying && t < TOTAL) play();
    else if (!d.wasPlaying && !d.moved && !cancel && !reduced) { userPaused = false; play(); }
  }
  segsBox.addEventListener('pointerup', function (e) { endDrag(e, false); });
  segsBox.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  segsBox.addEventListener('click', function (e) {
    if (e.detail !== 0) return; // keyboard activation only; pointer handled above
    var seg = e.target.closest('.pbc-film__seg');
    if (seg) jumpTo(+seg.getAttribute('data-seg'));
  });

  // ---------- visibility, autoplay, lazy loading ----------
  function maybeAutoplay() {
    if (visible50 && !reduced && !userPaused && !ended && !playing && !document.hidden) play();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) load(); },
      {rootMargin: '600px 0px'}).observe(root);
    new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      visible50 = e.intersectionRatio >= 0.5;
      if (!e.isIntersecting && playing) pause();
      maybeAutoplay();
    }, {threshold: [0, 0.5]}).observe(stage);
  } else {
    load();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else maybeAutoplay();
  });
  if (reduced) load();

  // keep the button's aria-label in the page language
  new MutationObserver(updateButton).observe(document.body, {attributes: true, attributeFilter: ['class']});

  var resizeQueued = 0;
  function rebuild() {
    resizeQueued = 0;
    buildLoss(); buildPsnr();
    render();
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { if (!resizeQueued) resizeQueued = requestAnimationFrame(rebuild); }).observe(stage);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!resizeQueued) resizeQueued = requestAnimationFrame(rebuild); });

  rebuild();
  updateButton();

  window.PBCFilm = {
    seek: seek, play: function () { userPaused = false; play(); }, pause: function () { userPaused = true; pause(); },
    get time() { return t; }, duration: TOTAL,
    chapters: CH.map(function (c) { return {id: c.id, zh: c.zh, en: c.en, start: c.start, duration: c.dur}; }),
    get workers() { return liveWorkers; }
  };
})();
