// app.js (web bluetooth, uses STATUS notifications)
const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
const CHAR_MODE = "12345678-1234-5678-1234-56789abcdef1";
const CHAR_SPEED = "12345678-1234-5678-1234-56789abcdef2";
const CHAR_LED = "12345678-1234-5678-1234-56789abcdef3";
const CHAR_STATUS = "12345678-1234-5678-1234-56789abcdef4"; // neu

let device=null, server=null, svc=null;
let modeChar=null, speedChar=null, ledChar=null, statusChar=null;
let statusPoll = null;
let ledStates = [0,0,0];

const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const statustxt = document.getElementById("statustxt");
const logEl = document.getElementById("log");
const speedSlider = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");
const directCmd = document.getElementById("directCmd");
const sendDirect = document.getElementById("sendDirect");

function log(s){ console.log(s); logEl.textContent += s + "\n"; logEl.scrollTop = logEl.scrollHeight; }
function setStatus(s){ statustxt.textContent = s; }

btnConnect.addEventListener("click", connect);
btnDisconnect.addEventListener("click", disconnect);
document.querySelectorAll(".mode").forEach(b=> b.addEventListener("click", ()=> sendMode(b.dataset.mode)));
speedSlider.addEventListener("input", ()=> speedVal.textContent = speedSlider.value);
speedSlider.addEventListener("change", ()=> sendSpeed(speedSlider.value));
sendDirect.addEventListener("click", ()=> sendDirectCmd(directCmd.value));
document.querySelectorAll(".led").forEach(el=>{
  el.addEventListener("click", async ()=>{
    const idx = el.dataset.idx;
    const cur = ledStates[idx]||0;
    const cmd = (cur>0) ? `${idx}:0` : `${idx}:1023`;
    await sendDirectCmd(cmd);
    ledStates[idx] = (cur>0)?0:1023;
    renderLeds();
  });
});

async function connect(){
  try {
    log("Starte Scan...");
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [SERVICE_UUID] });
    log("Gewählt: " + (device.name||"unnamed"));
    setStatus("Verbinde...");
    server = await device.gatt.connect();
    svc = await server.getPrimaryService(SERVICE_UUID);
    modeChar = await svc.getCharacteristic(CHAR_MODE);
    speedChar = await svc.getCharacteristic(CHAR_SPEED);
    ledChar = await svc.getCharacteristic(CHAR_LED);
    // try to get status char (new)
    try{
      statusChar = await svc.getCharacteristic(CHAR_STATUS);
      await statusChar.startNotifications();
      statusChar.addEventListener('characteristicvaluechanged', onStatusNotification);
      log("Status-Char abonniert");
    }catch(e){
      log("Status-Char nicht verfügbar (falls alte Firmware).");
      statusChar = null;
    }
    setStatus("Verbunden: " + (device.name||"unnamed"));
    btnConnect.disabled = true; btnDisconnect.disabled = false;
    device.addEventListener("gattserverdisconnected", onDisconnected);
    // initial read (if available)
    await readAllOnce();
    // fallback poll (nur wenn keine notifications)
    if(!statusChar){
      statusPoll = setInterval(readAllOnce, 1000);
    }
  } catch (e){
    log("Connect-Fehler: " + e);
    setStatus("Nicht verbunden");
  }
}

async function disconnect(){
  try {
    if(statusPoll){ clearInterval(statusPoll); statusPoll = null; }
    if(device && device.gatt.connected) device.gatt.disconnect();
    log("Getrennt");
  } catch(e){ log("Disconnect error: "+e); }
  setStatus("Nicht verbunden");
  btnConnect.disabled = false; btnDisconnect.disabled = true;
}

function onDisconnected(){ log("Device disconnected"); setStatus("Nicht verbunden"); btnConnect.disabled=false; btnDisconnect.disabled=true; if(statusPoll){ clearInterval(statusPoll); statusPoll=null; } }

async function sendMode(m){
  if(!modeChar){ log("MODE Char nicht verfügbar"); return; }
  try{ await modeChar.writeValue(new TextEncoder().encode(m)); log("MODE gesendet: "+m); } catch(e){ log("MODE-Error: "+e); }
}

async function sendSpeed(s){
  if(!speedChar){ log("SPEED Char nicht verfügbar"); return; }
  try{ await speedChar.writeValue(new TextEncoder().encode(String(s))); log("SPEED gesendet: "+s); } catch(e){ log("SPEED-Error: "+e); }
}

async function sendDirectCmd(cmd){
  if(!ledChar){ log("LED Char nicht verfügbar"); return; }
  try{
    await ledChar.writeValue(new TextEncoder().encode(cmd));
    log("DIRECT gesendet: "+cmd);
    parseDirectToLedStates(cmd);
    renderLeds();
  }catch(e){ log("DIRECT-Error: "+e); }
}

async function readAllOnce(){
  // MODE read (if supported)
  try{
    if(modeChar){
      const v = await modeChar.readValue();
      const txt = decodeDataView(v).trim();
      if(txt){ setStatus("Modus: " + txt); highlightMode(txt); }
    }
  }catch(e){}
  try{
    if(speedChar){
      const v = await speedChar.readValue();
      const txt = decodeDataView(v).trim();
      if(txt){ speedSlider.value = Number(txt); speedVal.textContent = txt; }
    }
  }catch(e){}
  try{
    if(statusChar){
      const v = await statusChar.readValue();
      handleStatusPayload(decodeDataView(v));
    } else if(ledChar){
      // if no statusChar, try to read a last direct value from ledChar (if readable)
      try{
        const v = await ledChar.readValue();
        const txt = decodeDataView(v).trim();
        if(txt){ parseDirectToLedStates(txt); renderLeds(); }
      }catch(e){}
    }
  }catch(e){}
}

function decodeDataView(dv){
  try{
    if(dv instanceof DataView) return new TextDecoder().decode(dv.buffer);
    if(dv.buffer) return new TextDecoder().decode(dv.buffer);
    return "";
  }catch(e){ return ""; }
}

function onStatusNotification(ev){
  try{
    const txt = decodeDataView(ev.target.value);
    handleStatusPayload(txt);
  }catch(e){ log("Status notify parse error: "+e); }
}

function handleStatusPayload(txt){
  if(!txt) return;
  try{
    const obj = JSON.parse(txt);
    // update UI
    if(obj.mode) setStatus("Modus: " + obj.mode);
    if(typeof obj.speed !== "undefined"){ speedSlider.value = obj.speed; speedVal.textContent = String(obj.speed); }
    if(Array.isArray(obj.led) && obj.led.length===3){
      ledStates = obj.led.slice();
      renderLeds();
    }
    document.getElementById("statusJson").textContent = JSON.stringify(obj, null, 2);
    log("Status empfangen: " + JSON.stringify(obj));
  }catch(e){
    // fallback: treat as direct string
    parseDirectToLedStates(txt);
    renderLeds();
  }
}

function parseDirectToLedStates(s){
  if(!s) return;
  s = s.toLowerCase().trim();
  if(["rot","gelb","gruen","grün","aus"].includes(s)){
    if(s==="rot"){ ledStates=[1023,0,0]; } else if(s==="gelb"){ ledStates=[0,1023,0]; }
    else if(s==="gruen"||s==="grün"){ ledStates=[0,0,1023]; } else ledStates=[0,0,0];
    return;
  }
  // index:val pairs
  let handled=false;
  if(s.indexOf(':')>=0){
    s.split(',').forEach(p=>{
      if(p.indexOf(':')>=0){
        const [a,b]=p.split(':',2); const idx=parseInt(a), val=parseInt(b);
        if(!isNaN(idx)&&idx>=0&&idx<3&&!isNaN(val)){ ledStates[idx] = val; handled=true; }
      }
    });
    if(handled) return;
  }
  // triple
  const nums = s.replace(/[,;]/g,' ').split(/\s+/);
  if(nums.length===3){
    const r=parseInt(nums[0]), g=parseInt(nums[1]), b=parseInt(nums[2]);
    if(!isNaN(r)&&!isNaN(g)&&!isNaN(b)){ ledStates=[r,g,b]; return; }
  }
}

function renderLeds(){
  for(let i=0;i<3;i++){
    const el = document.getElementById("led"+i);
    el.classList.remove("on-red","on-yellow","on-green");
    const v = ledStates[i]||0;
    if(v>0){
      if(i===0) el.classList.add("on-red");
      if(i===1) el.classList.add("on-yellow");
      if(i===2) el.classList.add("on-green");
    }
  }
}

function highlightMode(modeTxt){
  document.querySelectorAll(".mode").forEach(b=> b.style.outline = "");
  if(!modeTxt) return;
  const btn = document.querySelector(`.mode[data-mode="${modeTxt}"]`);
  if(btn) btn.style.outline = "3px solid #6fbf73";
}
