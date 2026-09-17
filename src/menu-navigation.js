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

// All menu transitions share gameplay's edge ledger. Consume before clicking:
// a Start press must never become a fresh Pause on the next gameplay frame.
(() => {
  const nav=window.menuNavigation, directions=new Map();
  function root() {
    if ($('#settings').open) return $('#settings');
    if ($('#lan-dialog').open || mode==='playing') return null;
    if (window.arcade?.phase==='demo') return $('.demo-menu');
    if (['ready','paused','over','win'].includes(mode)) return $('#overlay');
    return null;
  }
  const controls = host => nav.available(host.querySelectorAll('button,summary,input,select'));
  function back(host) {
    if (host===$('#settings')) { if(capture) {capture=null;$('#mapping').textContent='MAPPING CANCELLED';} else host.close(); }
    else if(mode==='paused') pause();
  }
  nav.poll = () => {
    const host=root();
    if(!host || capture || window.halfControllers?.snapshot().calibration) return false;
    const list=pads();
    for(const p of list) {
      const pressed=p.buttons.map(b=>b.pressed), prev=previous.get(p.index)||[], c=config(p);
      const edge=i=>pressed[i]&&!prev[i], direction=nav.direction(p);
      previous.set(p.index,pressed);
      window.lan?.consumeMenuPad?.(p);
      const fresh=pressed.some((v,i)=>v&&!prev[i]);
      if(!assignments.includes(p.index) && fresh && host!==$('#settings') && !window.lan?.active) {
        const slot=availableControllerSlot(p);
        if(slot>=0) {
          assignments[slot]=p.index;
          joined[slot]=true;
          sfx.playSfx('playerJoined');
          if(window.arcade?.phase==='demo') window.aircraftMenu?.open();
          updateHUD();
        }
        // Activation does not also activate the focused menu item.
        directions.set(p.index,direction); continue;
      }
      const items=controls(host);
      if(!items.includes(document.activeElement)) nav.focus(items[0]);
      if(edge(c.back)) back(host);
      else if(mode==='paused' && edge(c.pause)) pause();
      else if(edge(c.confirm)) {
        const target=document.activeElement;
        if(target?.tagName==='SUMMARY') target.parentElement.open=!target.parentElement.open;
        else if(items.includes(target)) target.click();
      } else if(direction && direction!==directions.get(p.index)) {
        const target=document.activeElement;
        if(target?.type==='range' && ['left','right'].includes(direction)) {
          target.value=Number(target.value)+(direction==='right'?1:-1);target.dispatchEvent(new Event('input',{bubbles:true}));
        } else nav.focus(nav.next(items,target,direction));
      }
      directions.set(p.index,direction);
      if(root()!==host || capture) break;
    }
    return host!==$('#settings'); // Keep the existing capture/debug refresh pipeline.
  };
  window.addEventListener('keydown', e=>{
    const host=root();
    if(!host || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code) || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!e.repeat) nav.focus(nav.next(controls(host),document.activeElement,e.code.slice(5).toLowerCase()));
  },true);
})();
