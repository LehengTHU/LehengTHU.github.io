(function () {
  'use strict';

  const CASES_ROOT = '/blog/2026/painting-by-code/assets/cases/';
  const INDEX_URL = CASES_ROOT + 'index.json';
  const WORKER_URL = '/blog/2026/painting-by-code/assets/replay-worker.js';
  const STEPS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
  const MAX_WORKERS = 8;
  const caseCache = new Map();
  const sourcePixelCache = new Map();
  let indexPromise = null;
  let viewerSerial = 0;
  let activeViewer = null;
  let liveWorkers = 0;
  const workerWaiters = [];

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  const ICON_PATHS = { play: 'M3.2 1.8 10 6 3.2 10.2z', pause: 'M3 2h2.2v8H3zM6.8 2H9v8H6.8z', end: 'M2 2 7.4 6 2 10zM8.2 2H10v8H8.2z' };
  function icon(name) {
    return '<svg class="pbc-viewer__icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="' + ICON_PATHS[name] + '" fill="currentColor"/></svg>';
  }

  function bilingual(zh, en) {
    return '<span class="zh">' + escapeHTML(zh) + '</span><span class="en">' + escapeHTML(en) + '</span>';
  }

  function formatInteger(value) {
    return Math.round(Number(value) || 0).toLocaleString('en-US');
  }

  function caseAsset(path) {
    return CASES_ROOT + String(path || '').replace(/^\/+/, '');
  }

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(INDEX_URL, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('Case index request failed');
        return response.json();
      }).then(function (data) {
        if (!Array.isArray(data)) throw new Error('Invalid case index');
        return data;
      }).catch(function (error) {
        indexPromise = null;
        throw error;
      });
    }
    return indexPromise;
  }

  function loadCase(caseId) {
    if (!/^case-\d{3}$/.test(caseId)) return Promise.reject(new Error('Invalid case id'));
    if (!caseCache.has(caseId)) {
      const request = fetch(CASES_ROOT + caseId + '.json', { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('Case request failed');
          return response.json();
        })
        .catch(function (error) {
          caseCache.delete(caseId);
          throw error;
        });
      caseCache.set(caseId, request);
    }
    return caseCache.get(caseId);
  }

  function pumpWorkerQueue() {
    while (liveWorkers < MAX_WORKERS && workerWaiters.length) {
      const waiter = workerWaiters.shift();
      liveWorkers += 1;
      try {
        const worker = new Worker(WORKER_URL);
        let released = false;
        waiter.resolve({
          worker: worker,
          terminate: function () {
            if (released) return;
            released = true;
            worker.terminate();
            liveWorkers = Math.max(0, liveWorkers - 1);
            pumpWorkerQueue();
          }
        });
      } catch (error) {
        liveWorkers = Math.max(0, liveWorkers - 1);
        waiter.reject(error);
      }
    }
  }

  function acquireWorker() {
    return new Promise(function (resolve, reject) {
      workerWaiters.push({ resolve: resolve, reject: reject });
      pumpWorkerQueue();
    });
  }

  function loadImagePixels(url, width, height) {
    const key = url + '|' + width + 'x' + height;
    if (!sourcePixelCache.has(key)) {
      const promise = new Promise(function (resolve, reject) {
        const image = new Image();
        image.onload = function () {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0, width, height);
            resolve(context.getImageData(0, 0, width, height).data);
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = function () { reject(new Error('Source image failed to load')); };
        image.src = url;
      }).catch(function (error) {
        sourcePixelCache.delete(key);
        throw error;
      });
      sourcePixelCache.set(key, promise);
    }
    return sourcePixelCache.get(key);
  }

  function sourcePixelsFor(detail, drawing) {
    if (detail.task !== 'editing' || !detail.input) return Promise.resolve(null);
    return loadImagePixels(caseAsset(detail.input), drawing.width, drawing.height);
  }

  let rasterizerPromise = null;

  // Same rasterizer as the worker, compiled on the main thread; used only when a
  // worker has not answered in time (throttled workers, virtual-time renderers).
  function loadRasterizer() {
    if (!rasterizerPromise) {
      rasterizerPromise = fetch(WORKER_URL, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('Replay worker source request failed');
        return response.text();
      }).then(function (source) {
        return new Function('self', 'postMessage', source + '\nreturn { initCanvas: initCanvas, seek: seek };')({}, function () {});
      }).catch(function (error) {
        rasterizerPromise = null;
        throw error;
      });
    }
    return rasterizerPromise;
  }

  function rasterizeOnMainThread(rasterizer, drawing, step, sourcePixels) {
    const canvas = rasterizer.initCanvas(drawing, sourcePixels ? sourcePixels.buffer.slice(0) : null);
    const state = {
      doc: drawing,
      canvas: canvas,
      at: 0,
      stride: Math.max(128, Math.ceil(drawing.strokes.length / 16)),
      cache: new Map([[0, canvas.slice()]])
    };
    const count = Math.min(drawing.strokes.length, Math.max(0, Math.round(step || 0)));
    const pixels = rasterizer.seek(state, count);
    return {
      image: new ImageData(pixels, drawing.width, drawing.height),
      step: count,
      width: drawing.width,
      height: drawing.height
    };
  }

  async function renderWorkerFrame(drawing, step, sourcePixels, isCurrent, controller) {
    const lease = await acquireWorker();
    if ((isCurrent && !isCurrent()) || (controller && controller.cancelled)) {
      lease.terminate();
      return null;
    }
    return new Promise(function (resolve, reject) {
      const worker = lease.worker;
      let finished = false;
      let timeout = 0;
      const cancel = function () { finish(null, null); };

      if (controller) {
        controller.leases.add(lease);
        controller.cancelers.add(cancel);
      }
      timeout = window.setTimeout(function () {
        finish(new Error('Replay worker timed out'));
      }, 30000);
      const fallback = window.setTimeout(function () {
        if (finished) return;
        loadRasterizer().then(function (rasterizer) {
          if (finished) return;
          if (isCurrent && !isCurrent()) {
            finish(null, null);
            return;
          }
          let frame = null;
          try {
            frame = rasterizeOnMainThread(rasterizer, drawing, step, sourcePixels);
          } catch (error) {
            return;
          }
          finish(null, frame);
        }).catch(function () {
          /* Keep waiting for the worker. */
        });
      }, 250);

      function finish(error, frame) {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        window.clearTimeout(fallback);
        if (controller) {
          controller.leases.delete(lease);
          controller.cancelers.delete(cancel);
        }
        lease.terminate();
        if (error) reject(error);
        else resolve(frame);
      }

      worker.onerror = function () { finish(new Error('Replay worker failed')); };
      worker.onmessage = function (event) {
        const data = event.data || {};
        if (data.type === 'error') {
          finish(new Error(data.message || 'Replay worker failed'));
          return;
        }
        if (data.type === 'ready') {
          worker.postMessage({ type: 'seek', step: step });
          return;
        }
        if (data.type === 'frame') {
          if (isCurrent && !isCurrent()) {
            finish(null, null);
            return;
          }
          const pixels = new Uint8ClampedArray(data.pixels);
          finish(null, {
            image: new ImageData(pixels, data.width, data.height),
            step: data.step,
            width: data.width,
            height: data.height
          });
        }
      };

      const sourceBuffer = sourcePixels ? sourcePixels.buffer.slice(0) : null;
      const message = { type: 'init', doc: drawing };
      const transfer = [];
      if (sourceBuffer) {
        message.sourceBuffer = sourceBuffer;
        transfer.push(sourceBuffer);
      }
      worker.postMessage(message, transfer);
    });
  }

  function observeNearViewport(element, callback) {
    if (!('IntersectionObserver' in window)) {
      callback();
      return;
    }
    const observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        observer.disconnect();
        callback();
      }
    }, { rootMargin: '400px 0px 400px 0px' });
    observer.observe(element);
  }

  function skeletonMarkup() {
    return (
      '<div class="pbc-viewer__skeleton" aria-hidden="true">' +
        '<span></span><span></span><span></span>' +
      '</div>' +
      '<p class="pbc-viewer__loading">' +
        bilingual('正在加载回放…', 'Loading replay…') +
      '</p>'
    );
  }

  class ReplayViewer {
    constructor(host) {
      this.host = host;
      this.id = 'pbc-viewer-' + (++viewerSerial);
      this.task = host.dataset.task || '';
      this.caseSpec = host.dataset.cases || '';
      this.defaultCase = host.dataset.default || '';
      this.cases = [];
      this.detail = null;
      this.caseId = '';
      this.selectedStep = 'C7';
      this.fraction = 1;
      this.generation = 0;
      this.workerEpoch = 0;
      this.workerPanels = new Map();
      this.workerInitPromise = null;
      this.snapshotController = null;
      this.lastFrames = new Map();
      this.playing = false;
      this.raf = 0;
      this.playStartedAt = 0;
      this.playStartedFraction = 0;
      this.ready = false;
      this.host.setAttribute('aria-busy', 'true');
      this.host.innerHTML = skeletonMarkup();
      this.host.addEventListener('pbc:select-case', (event) => {
        const requested = event.detail && event.detail.caseId;
        if (!requested) return;
        if (this.content) this.selectCase(String(requested), true);
        else this.defaultCase = String(requested);
      });
      observeNearViewport(this.host, () => this.initialize());
    }

    async initialize() {
      try {
        const index = await loadIndex();
        const taskCases = index.filter((entry) => entry.task === this.task);
        if (this.caseSpec === 'all') {
          this.cases = taskCases;
        } else {
          const requested = this.caseSpec.split(',').map((value) => value.trim()).filter(Boolean);
          this.cases = requested.map((caseId) => taskCases.find((entry) => entry.id === caseId)).filter(Boolean);
        }
        if (!this.cases.length) throw new Error('No matching replay cases');
        this.renderShell();
        const initial = this.cases.some((entry) => entry.id === this.defaultCase)
          ? this.defaultCase
          : this.cases[0].id;
        await this.selectCase(initial, false);
      } catch (error) {
        this.showFatalError();
      }
    }

    showFatalError() {
      this.host.setAttribute('aria-busy', 'false');
      this.host.innerHTML =
        '<div class="pbc-viewer__error" role="status">' +
          bilingual('回放暂时无法加载，请稍后再试。', 'The replay could not load. Please try again later.') +
        '</div>';
    }

    renderShell() {
      const showArrows = this.caseSpec === 'all' || this.cases.length > 6;
      const chips = this.cases.map((entry, index) => {
        const label = String(index + 1);
        return (
          '<button type="button" class="pbc-viewer__case-chip pbc-viewer__case-chip--image" data-case-id="' + escapeHTML(entry.id) + '"' +
            ' aria-pressed="false" aria-label="' + escapeHTML('选择案例 ' + label + ' / Select case ' + label) + '">' +
            '<img src="' + escapeHTML(caseAsset(entry.target)) + '" alt="" loading="lazy" width="56" height="56">' +
          '</button>'
        );
      }).join('');

      this.host.innerHTML =
        '<div class="pbc-viewer__case-nav">' +
          (showArrows
            ? '<button type="button" class="pbc-viewer__case-arrow pbc-viewer__case-arrow--prev" aria-label="上一组案例 / Previous cases">‹</button>'
            : '') +
          '<div class="pbc-viewer__case-strip" role="list" aria-label="案例 / Cases">' + chips + '</div>' +
          (showArrows
            ? '<button type="button" class="pbc-viewer__case-arrow pbc-viewer__case-arrow--next" aria-label="下一组案例 / Next cases">›</button>'
            : '') +
        '</div>' +
        '<div class="pbc-viewer__content">' + skeletonMarkup() + '</div>' +
        '<div class="pbc-viewer__controls">' +
          '<button type="button" class="pbc-viewer__button pbc-viewer__button--primary pbc-viewer__play" disabled>' +
            icon('play') + bilingual('同步播放', 'Play') +
          '</button>' +
          '<button type="button" class="pbc-viewer__button pbc-viewer__final" disabled>' +
            icon('end') + bilingual('终稿', 'Final') +
          '</button>' +
          '<div class="pbc-viewer__scrubber">' +
            '<label class="pbc-viewer__visually-hidden" for="' + this.id + '-slider">' +
              bilingual('回放进度', 'Replay progress') +
            '</label>' +
            '<input id="' + this.id + '-slider" class="pbc-viewer__slider" type="range" min="0" max="1000" step="1" value="1000" disabled>' +
            '<output class="pbc-viewer__percentage" for="' + this.id + '-slider">100%</output>' +
          '</div>' +
        '</div>';

      this.caseStrip = this.host.querySelector('.pbc-viewer__case-strip');
      this.content = this.host.querySelector('.pbc-viewer__content');
      this.playButton = this.host.querySelector('.pbc-viewer__play');
      this.finalButton = this.host.querySelector('.pbc-viewer__final');
      this.slider = this.host.querySelector('.pbc-viewer__slider');
      this.percentage = this.host.querySelector('.pbc-viewer__percentage');

      this.host.querySelectorAll('.pbc-viewer__case-chip').forEach((button) => {
        button.addEventListener('click', () => this.selectCase(button.dataset.caseId, true));
      });
      const previous = this.host.querySelector('.pbc-viewer__case-arrow--prev');
      const next = this.host.querySelector('.pbc-viewer__case-arrow--next');
      if (previous) previous.addEventListener('click', () => this.scrollCases(-1));
      if (next) next.addEventListener('click', () => this.scrollCases(1));
      this.playButton.addEventListener('click', () => this.togglePlayback());
      this.finalButton.addEventListener('click', () => {
        this.stopPlayback();
        this.setFraction(1, true);
      });
      this.slider.addEventListener('input', () => {
        this.stopPlayback();
        this.setFraction(Number(this.slider.value) / 1000, true);
      });
    }

    scrollCases(direction) {
      if (!this.caseStrip) return;
      this.caseStrip.scrollBy({
        left: direction * Math.max(160, this.caseStrip.clientWidth * 0.72),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    }

    markActiveCase(caseId, shouldScroll) {
      this.host.querySelectorAll('.pbc-viewer__case-chip').forEach((button) => {
        const active = button.dataset.caseId === caseId;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (active && shouldScroll) {
          button.scrollIntoView({
            block: 'nearest',
            inline: 'center',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
          });
        }
      });
    }

    async selectCase(caseId, shouldScroll) {
      const summary = this.cases.find((entry) => entry.id === caseId);
      if (!summary) return;
      const generation = ++this.generation;
      this.stopPlayback();
      if (activeViewer === this) activeViewer = null;
      this.cancelSnapshotWorkers();
      this.terminateWorkers();
      this.caseId = caseId;
      this.selectedStep = 'C7';
      this.fraction = 1;
      this.detail = null;
      this.ready = false;
      this.lastFrames.clear();
      this.markActiveCase(caseId, shouldScroll);
      this.host.setAttribute('aria-busy', 'true');
      this.content.innerHTML = skeletonMarkup();
      this.setControlsDisabled(true);
      this.percentage.textContent = '100%';
      this.slider.value = '1000';

      try {
        const detail = await loadCase(caseId);
        if (generation !== this.generation) return;
        this.detail = detail;
        this.renderCase(detail);
        await this.renderInitialFrames(generation);
        if (generation !== this.generation) return;
        this.ready = true;
        this.host.setAttribute('aria-busy', 'false');
        this.setControlsDisabled(false);
        this.host.dispatchEvent(new CustomEvent('pbc:casechange', {
          detail: { caseId: caseId },
          bubbles: true
        }));
      } catch (error) {
        if (generation !== this.generation) return;
        this.host.setAttribute('aria-busy', 'false');
        this.content.innerHTML =
          '<div class="pbc-viewer__error" role="status">' +
            bilingual('这个案例暂时无法加载，请选择其他案例。', 'This case could not load. Please choose another case.') +
          '</div>';
      }
    }

    setControlsDisabled(disabled) {
      if (!this.playButton) return;
      this.playButton.disabled = disabled;
      this.finalButton.disabled = disabled;
      this.slider.disabled = disabled;
    }

    renderCase(detail) {
      const width = Number(detail.width) || 256;
      const height = Number(detail.height) || 256;
      const aspect = width + ' / ' + height;
      const bestValue = Math.max.apply(null, STEPS.map((step) => Number(detail.steps[step].psnr_db)));
      const prompt = detail.prompt
        ? '<blockquote class="pbc-viewer__prompt">' +
            '<strong>' +
              (detail.task === 'editing'
                ? bilingual('指令', 'Instruction')
                : bilingual('文字描述', 'Prompt')) +
            '</strong>' +
            '<span class="zh">“' + escapeHTML(detail.prompt) + '”</span>' +
            '<span class="en">“' + escapeHTML(detail.prompt) + '”</span>' +
          '</blockquote>'
        : '';

      const figure = (kind, src, zh, en) => {
        return (
          '<figure class="pbc-viewer__focus-card">' +
            '<div class="pbc-viewer__focus-media" style="aspect-ratio:' + aspect + '">' +
              '<img src="' + escapeHTML(src) + '" alt="" width="' + width + '" height="' + height + '">' +
            '</div>' +
            '<figcaption>' + bilingual(zh, en) + '</figcaption>' +
          '</figure>'
        );
      };

      let references = '';
      if (detail.task === 'editing') {
        references += figure('input', caseAsset(detail.input), '原图', 'Input');
        references += figure('target', caseAsset(detail.target), '目标图', 'Target');
      } else {
        references += figure('target', caseAsset(detail.target), '目标图', 'Target');
      }
      references +=
        '<figure class="pbc-viewer__focus-card pbc-viewer__focus-card--render">' +
          '<div class="pbc-viewer__focus-media is-loading" style="aspect-ratio:' + aspect + '">' +
            '<canvas class="pbc-viewer__focus-canvas" width="' + width + '" height="' + height + '"></canvas>' +
          '</div>' +
          '<figcaption><span class="pbc-viewer__focus-step">C7</span> · ' +
            bilingual('模型绘制', 'Render') +
          '</figcaption>' +
        '</figure>';

      const filmstrip = STEPS.map((step) => {
        const record = detail.steps[step];
        const best = Number(record.psnr_db) === bestValue;
        return (
          '<button type="button" class="pbc-viewer__checkpoint' + (best ? ' is-best' : '') + (step === 'C7' ? ' is-selected' : '') + '"' +
            ' data-step="' + step + '" aria-pressed="' + (step === 'C7' ? 'true' : 'false') + '"' +
            ' aria-label="' + escapeHTML('选择 ' + step + ' / Select ' + step) + '">' +
            '<span class="pbc-viewer__checkpoint-head">' +
              '<span class="pbc-viewer__checkpoint-chip">' + step + '</span>' +
              (best ? '<span class="pbc-viewer__best">' + bilingual('最佳', 'best') + '</span>' : '') +
            '</span>' +
            '<span class="pbc-viewer__thumb-media is-loading" style="aspect-ratio:' + aspect + '">' +
              '<canvas width="' + width + '" height="' + height + '"></canvas>' +
            '</span>' +
            '<span class="pbc-viewer__psnr">' + Number(record.psnr_db).toFixed(2) + ' dB</span>' +
          '</button>'
        );
      }).join('');

      this.content.innerHTML =
        prompt +
        '<div class="pbc-viewer__focus-grid pbc-viewer__focus-grid--' + escapeHTML(detail.task) + '">' +
          references +
        '</div>' +
        '<div class="pbc-viewer__focus-meta" aria-live="polite"></div>' +
        '<div class="pbc-viewer__filmstrip" role="group" aria-label="训练检查点 / Training checkpoints">' +
          filmstrip +
        '</div>';

      this.focusCanvas = this.content.querySelector('.pbc-viewer__focus-canvas');
      this.focusMeta = this.content.querySelector('.pbc-viewer__focus-meta');
      this.focusStep = this.content.querySelector('.pbc-viewer__focus-step');
      this.checkpointButtons = new Map();
      this.thumbCanvases = new Map();
      this.content.querySelectorAll('.pbc-viewer__checkpoint').forEach((button) => {
        this.checkpointButtons.set(button.dataset.step, button);
        this.thumbCanvases.set(button.dataset.step, button.querySelector('canvas'));
        button.addEventListener('click', () => this.selectCheckpoint(button.dataset.step));
      });
      this.updateFocusMeta();
    }

    async renderInitialFrames(generation) {
      const controller = {
        cancelled: false,
        leases: new Set(),
        cancelers: new Set()
      };
      this.snapshotController = controller;
      const order = [this.selectedStep].concat(STEPS.filter((step) => step !== this.selectedStep));
      for (const step of order) {
        const drawing = this.detail.steps[step].drawing;
        const sourcePixels = await sourcePixelsFor(this.detail, drawing);
        if (generation !== this.generation || controller.cancelled) return;
        renderWorkerFrame(
          drawing,
          drawing.strokes.length,
          sourcePixels,
          () => generation === this.generation,
          controller
        ).then((frame) => {
          if (frame && generation === this.generation) this.drawFrame(step, frame);
        }).catch(() => {
          if (generation === this.generation) this.markPanelLoaded(step);
        });
      }
    }

    cancelSnapshotWorkers() {
      const controller = this.snapshotController;
      if (!controller) return;
      controller.cancelled = true;
      Array.from(controller.cancelers).forEach((cancel) => cancel());
      Array.from(controller.leases).forEach((lease) => lease.terminate());
      controller.cancelers.clear();
      controller.leases.clear();
      this.snapshotController = null;
    }

    markPanelLoaded(step) {
      const canvas = this.thumbCanvases && this.thumbCanvases.get(step);
      if (canvas) canvas.parentElement.classList.remove('is-loading');
      if (step === this.selectedStep && this.focusCanvas) {
        this.focusCanvas.parentElement.classList.remove('is-loading');
      }
    }

    drawFrame(step, frame) {
      this.markPanelLoaded(step);
      const canvas = this.thumbCanvases && this.thumbCanvases.get(step);
      if (canvas) {
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width;
          canvas.height = frame.height;
        }
        canvas.getContext('2d').putImageData(frame.image, 0, 0);
      }
      this.lastFrames.set(step, frame);
      if (step === this.selectedStep && this.focusCanvas) {
        if (this.focusCanvas.width !== frame.width || this.focusCanvas.height !== frame.height) {
          this.focusCanvas.width = frame.width;
          this.focusCanvas.height = frame.height;
        }
        this.focusCanvas.getContext('2d').putImageData(frame.image, 0, 0);
      }
      if (step === this.selectedStep) this.updateFocusMeta();
    }

    selectCheckpoint(step) {
      if (!STEPS.includes(step) || !this.detail) return;
      this.selectedStep = step;
      this.checkpointButtons.forEach((button, key) => {
        const selected = key === step;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      this.focusStep.textContent = step;
      const frame = this.lastFrames.get(step);
      if (frame) {
        if (this.focusCanvas.width !== frame.width || this.focusCanvas.height !== frame.height) {
          this.focusCanvas.width = frame.width;
          this.focusCanvas.height = frame.height;
        }
        this.focusCanvas.getContext('2d').putImageData(frame.image, 0, 0);
        this.focusCanvas.parentElement.classList.remove('is-loading');
      } else {
        this.focusCanvas.getContext('2d').clearRect(0, 0, this.focusCanvas.width, this.focusCanvas.height);
        this.focusCanvas.parentElement.classList.add('is-loading');
      }
      this.updateFocusMeta();
    }

    updateFocusMeta() {
      if (!this.detail || !this.focusMeta) return;
      const record = this.detail.steps[this.selectedStep];
      const total = record.drawing.strokes.length;
      const current = Math.round(this.fraction * total);
      this.focusMeta.innerHTML =
        '<span>' + this.selectedStep + '</span>' +
        '<span aria-hidden="true"> · </span>' +
        '<span>' + Number(record.psnr_db).toFixed(2) + ' dB</span>' +
        '<span aria-hidden="true"> · </span>' +
        '<span>' + formatInteger(current) + ' / ' + formatInteger(total) + ' ' +
          bilingual('笔', 'strokes') +
        '</span>';
    }

    setFraction(value, activate) {
      this.fraction = Math.max(0, Math.min(1, Number(value) || 0));
      if (this.slider) this.slider.value = String(Math.round(this.fraction * 1000));
      if (this.percentage) this.percentage.textContent = Math.round(this.fraction * 100) + '%';
      this.updateFocusMeta();
      this.workerPanels.forEach((panel) => {
        panel.wanted = Math.round(this.fraction * panel.total);
        this.schedulePanel(panel);
      });
      if (activate && this.detail) this.ensureWorkers();
    }

    async ensureWorkers() {
      if (!this.detail) return;
      this.cancelSnapshotWorkers();
      if (activeViewer !== this) {
        if (activeViewer) {
          activeViewer.stopPlayback();
          activeViewer.terminateWorkers();
        }
        activeViewer = this;
      }
      if (this.workerInitPromise) return this.workerInitPromise;
      const generation = this.generation;
      const epoch = ++this.workerEpoch;
      this.workerPanels.clear();

      STEPS.forEach((step) => {
        const drawing = this.detail.steps[step].drawing;
        this.workerPanels.set(step, {
          step: step,
          drawing: drawing,
          total: drawing.strokes.length,
          wanted: Math.round(this.fraction * drawing.strokes.length),
          shown: -1,
          busy: false,
          ready: false,
          lease: null
        });
      });

      this.workerInitPromise = Promise.all(STEPS.map(async (step) => {
        const panel = this.workerPanels.get(step);
        const sourcePixels = await sourcePixelsFor(this.detail, panel.drawing);
        const lease = await acquireWorker();
        if (generation !== this.generation || epoch !== this.workerEpoch || this.workerPanels.get(step) !== panel) {
          lease.terminate();
          return;
        }
        panel.lease = lease;
        const worker = lease.worker;
        worker.onerror = () => this.failPanel(panel);
        worker.onmessage = (event) => {
          if (generation !== this.generation || epoch !== this.workerEpoch || this.workerPanels.get(step) !== panel) return;
          const data = event.data || {};
          if (data.type === 'error') {
            this.failPanel(panel);
            return;
          }
          if (data.type === 'ready') {
            panel.total = Number(data.total);
            panel.ready = true;
            panel.busy = false;
            panel.wanted = Math.round(this.fraction * panel.total);
            this.schedulePanel(panel);
            return;
          }
          if (data.type === 'frame') {
            panel.busy = false;
            panel.shown = Number(data.step);
            const frame = {
              image: new ImageData(new Uint8ClampedArray(data.pixels), data.width, data.height),
              step: panel.shown,
              width: data.width,
              height: data.height
            };
            this.drawFrame(step, frame);
            this.schedulePanel(panel);
          }
        };
        const sourceBuffer = sourcePixels ? sourcePixels.buffer.slice(0) : null;
        const message = { type: 'init', doc: panel.drawing };
        const transfer = [];
        if (sourceBuffer) {
          message.sourceBuffer = sourceBuffer;
          transfer.push(sourceBuffer);
        }
        worker.postMessage(message, transfer);
      })).catch(() => {
        if (generation === this.generation) this.terminateWorkers();
      });
      return this.workerInitPromise;
    }

    failPanel(panel) {
      if (panel.lease) panel.lease.terminate();
      panel.lease = null;
      panel.ready = false;
      panel.busy = false;
    }

    schedulePanel(panel) {
      if (!panel || !panel.lease || !panel.ready || panel.busy || panel.wanted === panel.shown) return;
      panel.busy = true;
      panel.lease.worker.postMessage({ type: 'seek', step: panel.wanted });
    }

    terminateWorkers() {
      this.workerEpoch += 1;
      this.workerPanels.forEach((panel) => {
        if (panel.lease) panel.lease.terminate();
      });
      this.workerPanels.clear();
      this.workerInitPromise = null;
    }

    togglePlayback() {
      if (this.playing) {
        this.stopPlayback();
        return;
      }
      if (this.fraction >= 1) this.setFraction(0, false);
      this.ensureWorkers();
      this.playing = true;
      this.playStartedAt = 0;
      this.playStartedFraction = this.fraction;
      this.playButton.innerHTML = icon('pause') + bilingual('暂停', 'Pause');
      this.playButton.setAttribute('aria-label', '暂停同步回放 / Pause synchronized replay');
      const tick = (time) => {
        if (!this.playing) return;
        if (!this.playStartedAt) this.playStartedAt = time;
        const next = this.playStartedFraction + (time - this.playStartedAt) / 6000;
        this.setFraction(Math.min(1, next), false);
        if (next >= 1) {
          this.stopPlayback();
          return;
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    stopPlayback() {
      this.playing = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.playStartedAt = 0;
      if (this.playButton) {
        this.playButton.innerHTML = icon('play') + bilingual('同步播放', 'Play');
        this.playButton.setAttribute('aria-label', '同步播放 / Play synchronized replay');
      }
    }
  }

  function mountAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const viewers = [];
    const viewerHosts = Array.from(scope.querySelectorAll('.pbc-viewer'));
    if (scope.matches && scope.matches('.pbc-viewer')) viewerHosts.unshift(scope);

    viewerHosts.forEach(function (host) {
      if (host.dataset.pbcMounted === 'true') return;
      host.dataset.pbcMounted = 'true';
      viewers.push(new ReplayViewer(host));
    });
    return { viewers: viewers };
  }

  window.PBCReplay = { mountAll: mountAll };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { mountAll(document); }, { once: true });
  } else {
    mountAll(document);
  }
})();
