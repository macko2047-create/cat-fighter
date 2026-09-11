'use strict';
// Spatial navigation shared by controller menus. Movement never activates a button.
window.menuNavigation = {
  direction(p) {
    const x = (p.axes[0] || 0) + Number(p.buttons[15]?.pressed || false) - Number(p.buttons[14]?.pressed || false);
    const y = (p.axes[1] || 0) + Number(p.buttons[13]?.pressed || false) - Number(p.buttons[12]?.pressed || false);
    if (Math.max(Math.abs(x), Math.abs(y)) < .5) return '';
    return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
  },
  available(elements) { return Array.from(elements).filter(el => !el.disabled && el.getClientRects().length); },
  next(elements, current, direction) {
    const list = this.available(elements);
    if (!list.includes(current)) return list[0];
    const rect = current.getBoundingClientRect(), x = rect.left + rect.width/2, y = rect.top + rect.height/2;
    const horizontal = direction === 'left' || direction === 'right', sign = ['left','up'].includes(direction) ? -1 : 1;
    return list.filter(el => el !== current).map(el => {
      const r = el.getBoundingClientRect(), dx = r.left+r.width/2-x, dy = r.top+r.height/2-y;
      // A wide button such as START spans both player columns.
      const across = horizontal ? Math.max(0, rect.top-r.bottom, r.top-rect.bottom) : Math.max(0, rect.left-r.right, r.left-rect.right);
      return {el, forward:(horizontal ? dx : dy)*sign, across};
    }).filter(v => v.forward > 1).sort((a,b) =>
      // Prefer the requested row/column before considering diagonal controls.
      // Otherwise a wide CONFIRM below a card can beat its right-hand neighbor.
      Number(a.across > 0)-Number(b.across > 0) ||
      (a.forward+a.across*3)-(b.forward+b.across*3))[0]?.el || current;
  },
  focus(el, name = 'menu-focus') {
    document.querySelectorAll('.'+name).forEach(old => { if (old !== el) old.classList.remove(name); });
    if (!el) return;
    el.classList.add(name);
    el.focus({preventScroll:true});
    el.scrollIntoView({block:'nearest',inline:'nearest'});
  },
};
