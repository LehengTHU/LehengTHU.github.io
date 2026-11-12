let state = null;
function initCanvas(doc, srcBuf) {
  const n = doc.width * doc.height * 3;
  const c = new Float32Array(n);
  if (srcBuf) {
    const u8 = new Uint8ClampedArray(srcBuf);
    for (let i = 0, j = 0; i < n; i += 3, j += 4) {
      c[i] = u8[j]; c[i + 1] = u8[j + 1]; c[i + 2] = u8[j + 2];
    }
  } else {
    const bg = doc.background || [255, 255, 255];
    for (let i = 0; i < n; i += 3) {
      c[i] = bg[0]; c[i + 1] = bg[1]; c[i + 2] = bg[2];
    }
  }
  return c;
}
function paintStroke(s, st) {
  const doc = s.doc, W = doc.width, H = doc.height;
  const rg = doc.region || [0, 0, W, H];
  const type = st.type, g = st.geometry, [r, gc, b] = st.color;
  if (type === 'soft' || type === 'capsule') {
    const [x, y, len, w, angle, opacity] = g;
    if (opacity <= 0) return;
    const ca = Math.cos(angle), sa = Math.sin(angle), a = Math.max(0.5, len / 2), bb = Math.max(0.5, w / 2);
    const cap = type === 'capsule', seg = Math.max(0, a - bb);
    const ex = cap ? Math.abs(ca) * seg + bb + 0.5 : Math.sqrt((a * ca) ** 2 + (bb * sa) ** 2);
    const ey = cap ? Math.abs(sa) * seg + bb + 0.5 : Math.sqrt((a * sa) ** 2 + (bb * ca) ** 2);
    const x0 = Math.max(rg[0], Math.max(0, Math.floor(x - ex))), x1 = Math.min(rg[2], Math.min(W, Math.ceil(x + ex) + 1));
    const y0 = Math.max(rg[1], Math.max(0, Math.floor(y - ey))), y1 = Math.min(rg[3], Math.min(H, Math.ceil(y + ey) + 1));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const dx = xx - x, dy = yy - y;
        let m = 0;
        if (cap) {
          const along = ca * dx + sa * dy, across = -sa * dx + ca * dy;
          const d = Math.hypot(Math.max(Math.abs(along) - seg, 0), across) - bb;
          m = opacity * Math.max(0, Math.min(1, 0.5 - d));
        } else {
          const u = (ca * dx + sa * dy) / a, v = (-sa * dx + ca * dy) / bb;
          m = opacity * Math.pow(Math.max(0, 1 - u * u - v * v), 0.65);
        }
        if (!m) continue;
        const k = (yy * W + xx) * 3, q = 1 - m;
        s.canvas[k] = s.canvas[k] * q + r * m;
        s.canvas[k + 1] = s.canvas[k + 1] * q + gc * m;
        s.canvas[k + 2] = s.canvas[k + 2] * q + b * m;
      }
    }
    return;
  }
  if (type === 'rectangle') {
    const [x, y, len, w, angle, opacity] = g;
    if (opacity <= 0) return;
    const ca = Math.cos(angle), sa = Math.sin(angle), a = len / 2, bb = w / 2;
    const axis = Math.abs(sa) < 1e-12 || Math.abs(ca) < 1e-12;
    const ex = axis ? (Math.abs(sa) < 1e-12 ? a : bb) : Math.abs(ca) * a + Math.abs(sa) * bb;
    const ey = axis ? (Math.abs(sa) < 1e-12 ? bb : a) : Math.abs(sa) * a + Math.abs(ca) * bb;
    const x0 = Math.max(rg[0], Math.min(W, Math.max(0, Math.floor(x - ex + 0.5))));
    const x1 = Math.min(rg[2], Math.min(W, Math.max(0, Math.ceil(x + ex + 0.5))));
    const y0 = Math.max(rg[1], Math.min(H, Math.max(0, Math.floor(y - ey + 0.5))));
    const y1 = Math.min(rg[3], Math.min(H, Math.max(0, Math.ceil(y + ey + 0.5))));
    if (x0 >= x1 || y0 >= y1) return;
    if (axis) {
      for (let yy = y0; yy < y1; yy++) {
        const vy = Math.max(0, Math.min(1, Math.min(yy + 0.5, y + ey) - Math.max(yy - 0.5, y - ey)));
        if (!vy) continue;
        for (let xx = x0; xx < x1; xx++) {
          const hx = Math.max(0, Math.min(1, Math.min(xx + 0.5, x + ex) - Math.max(xx - 0.5, x - ex)));
          const m = Math.fround(vy * hx * opacity);
          if (!m) continue;
          const k = (yy * W + xx) * 3, q = 1 - m;
          s.canvas[k] = s.canvas[k] * q + r * m;
          s.canvas[k + 1] = s.canvas[k + 1] * q + gc * m;
          s.canvas[k + 2] = s.canvas[k + 2] * q + b * m;
        }
      }
    } else {
      const pe = 0.5 * (Math.abs(ca) + Math.abs(sa)), offs = [-0.375, -0.125, 0.125, 0.375];
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const dx = xx - x, dy = yy - y, u = ca * dx + sa * dy, v = -sa * dx + ca * dy;
          const au = Math.abs(u), av = Math.abs(v);
          if (au >= a + pe || av >= bb + pe) continue;
          let cov = 0;
          if (au <= a - pe && av <= bb - pe) cov = 1;
          else {
            let cnt = 0;
            for (const sy of offs) for (const sx of offs) {
              if (Math.abs(u + ca * sx + sa * sy) <= a && Math.abs(v - sa * sx + ca * sy) <= bb) cnt++;
            }
            cov = cnt / 16;
          }
          const m = Math.fround(cov * opacity);
          if (!m) continue;
          const k = (yy * W + xx) * 3, q = 1 - m;
          s.canvas[k] = s.canvas[k] * q + r * m;
          s.canvas[k + 1] = s.canvas[k + 1] * q + gc * m;
          s.canvas[k + 2] = s.canvas[k + 2] * q + b * m;
        }
      }
    }
    return;
  }
}
function seek(s, end) {
  if (end < s.at) {
    let best = 0;
    for (const k of s.cache.keys()) if (k <= end && k > best) best = k;
    s.canvas = s.cache.get(best).slice();
    s.at = best;
  }
  while (s.at < end) {
    paintStroke(s, s.doc.strokes[s.at++]);
    if (s.at % s.stride === 0 && !s.cache.has(s.at)) s.cache.set(s.at, s.canvas.slice());
  }
  const pixels = new Uint8ClampedArray(s.doc.width * s.doc.height * 4);
  for (let i = 0, j = 0; i < s.canvas.length; i += 3, j += 4) {
    pixels[j] = Math.min(255, Math.max(0, Math.round(s.canvas[i])));
    pixels[j + 1] = Math.min(255, Math.max(0, Math.round(s.canvas[i + 1])));
    pixels[j + 2] = Math.min(255, Math.max(0, Math.round(s.canvas[i + 2])));
    pixels[j + 3] = 255;
  }
  return pixels;
}
self.onmessage = ({data}) => {
  try {
    if (data.type === 'init') {
      const doc = data.doc;
      const canvas = initCanvas(doc, data.sourceBuffer || null);
      state = {doc, canvas, at: 0, stride: Math.max(128, Math.ceil(doc.strokes.length / 16)), cache: new Map([[0, canvas.slice()]])};
      postMessage({type: 'ready', total: doc.strokes.length});
      return;
    }
    if (!state) return;
    const count = Math.min(state.doc.strokes.length, Math.max(0, Math.round(data.step || 0)));
    const px = seek(state, count);
    postMessage({type: 'frame', step: count, width: state.doc.width, height: state.doc.height, pixels: px.buffer}, [px.buffer]);
  } catch (e) {
    postMessage({type: 'error', message: e.message});
  }
};
