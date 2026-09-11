'use strict';
// First-time local co-op entry; dead players remain in the existing rejoin flow.
(() => {
  const box=document.createElement('div');box.id='drop-in';box.hidden=true;
  box.innerHTML='<button id="drop-in-join">JOIN</button><span id="drop-in-confirmation" hidden><span id="drop-in-label"></span><button id="drop-in-confirm">CONFIRM JOIN</button><button id="drop-in-cancel">CANCEL</button></span>';
  $('.bottomline').append(box);
  let confirming=false, controller=null, cursor=null, direction='';
  const nav=window.menuNavigation;
  const eligible=()=>!touchOnly() && !window.lan?.active && !window.arcade?.simulating && mode==='playing' && loopTransition<=0 && players.length===1 && players[0].lives>0 && !$('#settings').open && !$('#lan-dialog').open;
  const slot=()=>1-(players[0]?.controlSlot ?? players[0]?.index ?? 0);
  const buttons=()=>nav.available(box.querySelectorAll('button'));
  function focus(button) {cursor=button;nav.focus(button,'drop-in-focus');}
  function reset(){confirming=false;controller=null;cursor=null;direction='';nav.focus(null,'drop-in-focus');}
  function sync(){
    box.hidden=!eligible();
    if(box.hidden){reset();return;}
    $('#drop-in-join').textContent=`P${slot()+1} JOIN`;
    $('#drop-in-join').hidden=confirming;
    $('#drop-in-confirmation').hidden=!confirming;
    $('#drop-in-label').textContent=`P${slot()+1} · ${players[0].aircraft===0?'MINT':'GINGER'} · 3 lives`;
  }
  function join(){
    if(!eligible() || !confirming)return false;
    if(controller!==null && !pads().some(p=>p.index===controller)){reset();sync();return false;}
    const controlSlot=slot(), aircraftId=1-(players[0].aircraft ?? aircraft[players[0].controlSlot ?? players[0].index]);
    // Append to preserve existing shot-owner references and player indices.
    const newcomer={...pilot(1),controlSlot,aircraft:aircraftId,y:H+55,entering:true,inv:3};
    players.push(newcomer);joined[controlSlot]=true;aircraft[controlSlot]=aircraftId;
    if(controller!==null)assignments[controlSlot]=controller;
    window.flightControls?.reset();
    sfx.playSfx('playerJoined');reset();updateHUD();sync();return true;
  }
  $('#drop-in-join').onclick=()=>{if(!eligible())return;confirming=true;sync();focus($('#drop-in-confirm'));};
  $('#drop-in-confirm').onclick=join;
  $('#drop-in-cancel').onclick=()=>{reset();sync();};
  window.dropIn={sync,
    handlePad(p,pressed,prev){
      if(!eligible())return false;
      const assigned=assignments.indexOf(p.index),missing=slot();
      if(assigned>=0 && assigned!==missing)return false;
      // Preserve hot-attachment to an existing keyboard/touch pilot when vacant.
      if(assigned<0 && controller!==p.index && !confirming && assignments[players[0].controlSlot ?? players[0].index]===null)return false;
      const fresh=pressed.some((v,i)=>v&&!prev[i]);
      if(controller===null && fresh){controller=p.index;focus(buttons()[0]);direction='';return true;}
      if(controller!==p.index)return true;
      const nextDirection=nav.direction(p), c=config(p);
      if(!buttons().includes(cursor))focus(buttons()[0]);
      if(pressed[c.fire]&&!prev[c.fire])cursor?.click();
      else if(nextDirection && nextDirection!==direction)focus(nav.next(buttons(),cursor,nextDirection));
      direction=nextDirection;return true;
    },
  };
})();
