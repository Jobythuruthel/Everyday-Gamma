// Draws an industrial plant scene in SVG from element data. Coordinates are percentages of a 160 x 100 canvas.
// Each element is drawn so a trained eye can judge it; the answer (hazard or safe) stays on the server.
window.drawScene = function drawScene(container, elements, onTap, onEmpty) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 160 100');
  svg.innerHTML = `
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a211c"/><stop offset="1" stop-color="#0e1410"/></linearGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232a24"/><stop offset="1" stop-color="#151a16"/></linearGradient>
      <pattern id="stripe" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="#F5A524"/></pattern>
    </defs>
    <rect width="160" height="58" fill="url(#wall)"/>
    <rect y="58" width="160" height="42" fill="url(#floor)"/>
    <g stroke="#2e3a31" stroke-width="2.4" fill="none">
      <path d="M0 12 H160"/><path d="M0 17 H120 V58"/><path d="M140 0 V58"/>
    </g>
    <g stroke="#3a463c" stroke-width=".6"><path d="M0 72 H160"/><path d="M0 92 H160"/></g>
    <rect x="0" y="72" width="160" height="1.4" fill="url(#stripe)" opacity=".5"/>
    <rect x="0" y="90.6" width="160" height="1.4" fill="url(#stripe)" opacity=".5"/>`;
  svg.addEventListener('pointerdown', e => { if (e.target === svg || !e.target.closest('.el')) onEmpty(); });

  for (const el of elements) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'el');
    g.dataset.id = el.id;
    g.setAttribute('transform', `translate(${el.x * 1.6} ${el.y})`);
    g.innerHTML = `<circle class="hit" r="9" fill="transparent"/>${GLYPHS[el.kind]?.(el.variant) ?? ''}<circle class="ring" r="9.5"/>`;
    g.addEventListener('pointerdown', e => { e.stopPropagation(); onTap(el.id, g); });
    svg.append(g);
  }
  container.replaceChildren(svg);
  return svg;
};

const GLYPHS = {
  worker: v => `
    <rect x="-3" y="-2" width="6" height="8" rx="1.5" fill="#E07A1F"/>
    <rect x="-3" y="1" width="6" height="1" fill="#F2F5F0" opacity=".8"/>
    <rect x="-2.6" y="6" width="2" height="4" fill="#2b3a55"/><rect x=".6" y="6" width="2" height="4" fill="#2b3a55"/>
    <circle cy="-4.5" r="2.4" fill="#c99a76"/>
    ${v === 'helmet' ? '<path d="M-3 -5 A3 3 0 0 1 3 -5 L3.6 -4.6 H-3.6 Z" fill="#F5D524"/>' : '<path d="M-2.4 -5.4 A2.4 2 0 0 1 2.4 -5.4" fill="#2a1d14"/>'}`,
  platform: v => `
    <rect x="-9" y="0" width="18" height="1.6" fill="#6b776d"/>
    <path d="M-8 1.6 V10 M8 1.6 V10" stroke="#6b776d" stroke-width="1"/>
    ${v === 'rail' ? '<path d="M-9 -5 H9 M-9 -2.5 H9 M-9 -5 V0 M0 -5 V0 M9 -5 V0" stroke="#F5D524" stroke-width=".7" fill="none"/>' : '<path d="M-9 -.2 H9" stroke="#F5A524" stroke-width=".4" stroke-dasharray="1 1"/>'}`,
  floor: () => `<path d="M-8 1 C-6 -3 -1 -2 2 -3 C6 -4 9 -1 8 2 C7 4 2 3 -1 4 C-5 5 -9 4 -8 1 Z" fill="#0b0d10" stroke="#4d5a73" stroke-width=".4"/><path d="M-3 0 C-1 -1 2 -1 4 0" stroke="#7b8fb3" stroke-width=".4" fill="none" opacity=".7"/>`,
  exit: v => `
    <rect x="-5" y="-6" width="10" height="16" fill="#101512" stroke="#3a463c" stroke-width=".6"/>
    <rect x="-4.5" y="-9.5" width="9" height="3" fill="#2f9e44"/><text y="-7.2" font-size="2.2" text-anchor="middle" fill="#F2F5F0" font-family="Arial" font-weight="700">EXIT</text>
    ${v === 'blocked' ? '<rect x="-6" y="3" width="6" height="6" fill="#8a6a3f" stroke="#5b4527" stroke-width=".4"/><rect x="-1" y="1" width="7" height="8" fill="#9b7a4a" stroke="#5b4527" stroke-width=".4"/><rect x="-4" y="-2" width="5" height="5" fill="#8a6a3f" stroke="#5b4527" stroke-width=".4"/>' : ''}`,
  cable: () => `<path d="M-9 2 C-6 -2 -3 5 0 1 C3 -3 6 4 9 0" stroke="#111" stroke-width="1.4" fill="none"/><rect x="7.5" y="-1.4" width="3" height="2.2" fill="#E5484D"/>`,
  cylinder: v => `
    <g transform="rotate(${v === 'unchained' ? 12 : 0})">
      <rect x="-2.4" y="-8" width="4.8" height="16" rx="2.2" fill="#3f7fbf"/><rect x="-1" y="-10" width="2" height="2.4" fill="#9aa4ab"/>
    </g>
    ${v === 'chained' ? '<path d="M-6 -3 H6" stroke="#c9ced1" stroke-width=".8" stroke-dasharray="1.2 .6"/><rect x="-7" y="-4.5" width="1.2" height="3" fill="#6b776d"/>' : ''}`,
  extinguisher: v => v === 'missing'
    ? `<rect x="-3" y="-7" width="6" height="12" rx="2" fill="none" stroke="#E5484D" stroke-width=".5" stroke-dasharray="1 1"/><rect x="-3.5" y="-8" width="7" height="1.2" fill="#6b776d"/><text y="9" font-size="2" text-anchor="middle" fill="#E5484D" font-family="Arial">FIRE</text>`
    : `<rect x="-2.6" y="-6" width="5.2" height="11" rx="2" fill="#d63a3a"/><path d="M0 -6 V-8 H3" stroke="#222" stroke-width=".8" fill="none"/><rect x="-3.5" y="-8" width="7" height="1.2" fill="#6b776d"/><text y="9" font-size="2" text-anchor="middle" fill="#E5484D" font-family="Arial">FIRE</text>`,
  flame: () => `<rect x="-5" y="4" width="10" height="3" fill="#4a4f52"/><path d="M0 4 C-5 1 -3 -4 0 -8 C1 -4 5 -2 3 2 C2.5 0 1 -1 0 -2 C0 1 -2 1 0 4 Z" fill="#F5A524"/><path d="M0 4 C-2 2 -1 0 0 -2 C1 0 2 2 0 4 Z" fill="#fff3b0"/>`
};
