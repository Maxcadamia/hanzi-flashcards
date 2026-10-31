'use strict';
// Two small SVG charts for the History page: no library, hover tooltips, sized to their container.

const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function frame(host, height, ariaLabel) {
    host.innerHTML = '';
    host.classList.add('chart');
    const width = Math.max(280, host.clientWidth);
    const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel }, host);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.appendChild(tip);
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });
    return { svg, tip, width };
  }

  function showTip(host, tip, html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(x - w / 2, 0), host.clientWidth - w) + 'px';
    tip.style.top = Math.max(0, y - tip.offsetHeight - 12) + 'px';
  }

  function niceScale(maxValue, steps = 4) {
    if (maxValue <= 0) return { max: steps, ticks: [...Array(steps + 1).keys()] };
    const raw = maxValue / steps;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
    const max = step * Math.ceil(maxValue / step);
    const ticks = [];
    for (let t = 0; t <= max + step / 2; t += step) ticks.push(+t.toFixed(6));
    return { max, ticks };
  }

  function axes(svg, m, width, ih, ticks, y, suffix) {
    ticks.forEach(t => {
      el('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), class: 'grid' }, svg);
      const tx = el('text', { x: m.l - 8, y: y(t), class: 'axis', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
      tx.textContent = t + suffix;
    });
  }

  // Indices whose x labels fit without colliding, always including the last one.
  function labelIndices(n, innerWidth, minGap = 64) {
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerWidth / minGap))));
    const out = [];
    for (let i = 0; i < n; i += every) out.push(i);
    if (out[out.length - 1] !== n - 1) {
      if (n - 1 - out[out.length - 1] < every / 2) out.pop();
      out.push(n - 1);
    }
    return out;
  }

  // points: [{ value, label, tip }] with value on a 0..yMax scale
  function line(host, points, { height = 220, yMax = 100, suffix = '%', ariaLabel = '' } = {}) {
    const { svg, tip, width } = frame(host, height, ariaLabel);
    const m = { t: 14, r: 18, b: 28, l: 44 };
    const iw = width - m.l - m.r;
    const ih = height - m.t - m.b;
    const n = points.length;
    const x = i => m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = v => m.t + ih - (v / yMax) * ih;

    axes(svg, m, width, ih, [0, 25, 50, 75, 100].map(t => (t * yMax) / 100), y, suffix);
    labelIndices(n, iw).forEach(i => {
      const tx = el('text', { x: x(i), y: height - 8, class: 'axis', 'text-anchor': n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, svg);
      tx.textContent = points[i].label;
    });

    el('path', { d: points.map((p, i) => (i ? 'L' : 'M') + x(i) + ',' + y(p.value)).join(' '), class: 'series-line' }, svg);
    const cross = el('line', { class: 'crosshair', y1: m.t, y2: m.t + ih, visibility: 'hidden' }, svg);
    const dots = points.map((p, i) => el('circle', { cx: x(i), cy: y(p.value), r: 4, class: 'series-dot' }, svg));

    const colW = n === 1 ? iw : iw / (n - 1);
    points.forEach((p, i) => {
      const hit = el('rect', { x: x(i) - colW / 2, y: m.t, width: colW, height: ih, class: 'hit' }, svg);
      hit.addEventListener('mouseenter', () => {
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
        dots.forEach((d, j) => d.classList.toggle('active', j === i));
        showTip(host, tip, p.tip, x(i), y(p.value));
      });
    });
    svg.addEventListener('mouseleave', () => {
      cross.setAttribute('visibility', 'hidden');
      dots.forEach(d => d.classList.remove('active'));
    });
  }

  // points: [{ value, label, tip }]
  function bars(host, points, { height = 200, suffix = '', ariaLabel = '' } = {}) {
    const { svg, tip, width } = frame(host, height, ariaLabel);
    const m = { t: 14, r: 18, b: 28, l: 44 };
    const iw = width - m.l - m.r;
    const ih = height - m.t - m.b;
    const n = points.length;
    const scale = niceScale(Math.max(...points.map(p => p.value)));
    const y = v => m.t + ih - (v / scale.max) * ih;
    const band = iw / n;
    const barW = Math.max(2, Math.min(40, band - 2));

    axes(svg, m, width, ih, scale.ticks, y, suffix);
    labelIndices(n, iw, 56).forEach(i => {
      const tx = el('text', { x: m.l + band * i + band / 2, y: height - 8, class: 'axis', 'text-anchor': 'middle' }, svg);
      tx.textContent = points[i].label;
    });

    points.forEach((p, i) => {
      const cx = m.l + band * i + band / 2;
      const x0 = cx - barW / 2;
      const top = y(p.value);
      const base = m.t + ih;
      let bar = null;
      if (p.value > 0) {
        const r = Math.min(4, barW / 2, base - top);
        bar = el('path', {
          class: 'bar',
          d: `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z`,
        }, svg);
      }
      const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ih, class: 'hit' }, svg);
      hit.addEventListener('mouseenter', () => {
        svg.querySelectorAll('.bar.active').forEach(b => b.classList.remove('active'));
        if (bar) bar.classList.add('active');
        showTip(host, tip, p.tip, cx, Math.min(top, base - 4));
      });
    });
    svg.addEventListener('mouseleave', () => svg.querySelectorAll('.bar.active').forEach(b => b.classList.remove('active')));
  }

  return { line, bars };
})();
