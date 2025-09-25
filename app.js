// app.js (mobilfreundlich, interaktive Ampel, BLE-Kommandos)
const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
const CHAR_MODE = "12345678-1234-5678-1234-56789abcdef1";
const CHAR_SPEED = "12345678-1234-5678-1234-56789abcdef2";
const CHAR_LED = "12345678-1234-5678-1234-56789abcdef3";

let device=null, server=null, svc=null, modeChar=null, speedChar=null, ledChar=null;
const logEl = document.getElementById("log");
const statustxt = document.getElementById("statustxt");
const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const speedSlider = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");
const lights = Array.from(document.querySelectorAll(".light"));
const modeButtons = Array.from(document.querySelectorAll(".mode"));
const quickButtons = Array.from(document.querySelectorAll(".quick"));

function log(s){
  const t = `[${new Date().toLocaleTimeString()}] ${s}`;
  logEl.textContent += t + "\n";
  logEl.scrollTop = logEl.scrollHeight;
  console.log(s);
}
function setStatus(s){ statustxt.textContent = s; }

btnConnect.addEventListener("click", connect);
btnDisconnect.addEventListener("click", disconnect);

speedSlider.addEventListener("input", ()=> { speedVal.textContent = speedSlider.value; });
speedSlider.addEventListener("change", ()=> sendSpeed(speedSlider.value) );

// Light click: toggles local visual and sends direct command
lights.forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    const idx = btn.dataset.idx;
    const pressed = btn.getAttribute("aria-pressed")==="true";
    const newState = !pressed;
    btn.setAttribute("aria-pressed", newState ? "true" : "false");
    // send direct command full on or off
    await sendDirectCmd(`${idx}:${newState?1023:0}`);
  });
});

// Quick commands
quickButtons.forEach(b=>{
  b.addEventListener("click", ()=> {
    const cmd = b.dataset.cmd;
    sendDirectCmd(cmd);
    // reflect on UI: set lights according to cmd (simple parse)
    applyDirectToUI(cmd);
  });
});

// Mode buttons
modeButtons.forEach(b=>{
  b.addEventListener("click", ()=> {
    const m = b.dataset.mode;
    sendMode(m);
    // if it's a program, play local animation preview
    playLocalAnimation(m);
  });
});

// UI helper to parse direct string and update UI bulbs
function applyDirectToUI(cmd){
  try{
    const parts = cmd.split(";").map(p=>p.trim()).filter(Boolean);
    parts.forEach(p=>{
      const [i,v] = p.split(":").map(x=>x.trim());
      const idx = Number(i);
      const val = Number(v);
      if(!isNaN(idx) && lights[idx]){
        lights[idx].setAttribute("aria-pressed", val>0 ? "true" : "false");
      }
    });
  }catch(e){}
}

// BLE connect / setup
async function connect(){
  try{
    log("Starte Scan...");
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID]
    });
    log("Gerät gewählt: " + (device.name||"unnamed"));
    setStatus("Verbinde...");
    server = await device.gatt.connect();
    log("GATT verbunden");
    svc = await server.getPrimaryService(SERVICE_UUID);
    modeChar  = await svc.getCharacteristic(CHAR_MODE);
    speedChar = await svc.getCharacteristic(CHAR_SPEED);
    ledChar   = await svc.getCharacteristic(CHAR_LED);
    setStatus("Verbunden: " + (device.name||"ESP"));
    btnConnect.disabled = true; btnDisconnect.disabled = false;
    device.addEventListener("gattserverdisconnected", onDisconnected);
    log("Characteristics bereit");
    // optional: read initial state from chars if implemented
  }catch(err){
    log("Verbindung fehlgeschlagen: " + err);
    setStatus("Nicht verbunden");
  }
}

async function disconnect(){
  try{
    if(device && device.gatt.connected){
      device.gatt.disconnect();
      log("Getrennt");
    }
  }catch(e){ log("Disconnect-Error: "+e); }
  btnConnect.disabled = false; btnDisconnect.disabled = true;
  setStatus("Nicht verbunden");
}

function onDisconnected(){
  log("Device disconnected");
  setStatus("Nicht verbunden");
  btnConnect.disabled = false; btnDisconnect.disabled = true;
}

// Send functions
async function sendMode(m){
  if(!modeChar){ log("MODE Char nicht verfügbar"); return; }
  try{
    await modeChar.writeValue(new TextEncoder().encode(m));
    log("MODE gesendet: " + m);
  }catch(e){ log("MODE-Error: "+e); }
}

async function sendSpeed(s){
  if(!speedChar){ log("SPEED Char nicht verfügbar"); return; }
  try{
    await speedChar.writeValue(new TextEncoder().encode(String(s)));
    log("SPEED gesendet: " + s);
  }catch(e){ log("SPEED-Error: "+e); }
}

async function sendDirectCmd(cmd){
  if(!ledChar){ log("LED Char nicht verfügbar; versuche trotzdem UI"); return applyDirectToUI(cmd); }
  try{
    await ledChar.writeValue(new TextEncoder().encode(cmd));
    log("DIRECT gesendet: " + cmd);
  }catch(e){
    log("DIRECT-Error: "+e);
  }
}

// Local animation preview (does not affect device unless mode sent)
let animHandle = null;
function stopLocalAnimation(){
  if(animHandle) { clearInterval(animHandle); animHandle = null; }
}
function playLocalAnimation(mode){
  stopLocalAnimation();
  // Reset bulbs
  lights.forEach(l=>l.setAttribute("aria-pressed","false"));
  const speed = Number(speedSlider.value) || 200;

  if(mode === "stop") return;
  if(mode === "lauflicht"){
    let i=0;
    animHandle = setInterval(()=>{
      lights.forEach((b,idx)=>b.setAttribute("aria-pressed", idx===i ? "true":"false"));
      i = (i+1)%3;
    }, speed);
    return;
  }
  if(mode === "blinken"){
    let on=false;
    animHandle = setInterval(()=>{
      lights.forEach(b=>b.setAttribute("aria-pressed", on?"true":"false"));
      on = !on;
    }, speed);
    return;
  }
  if(mode === "fading"){
    // simple pseudo-fade: cycle each light on in sequence
    let i=0;
    animHandle = setInterval(()=>{
      lights.forEach((b,idx)=>b.setAttribute("aria-pressed", idx===i ? "true":"false"));
      i = (i+1)%3;
    }, Math.max(80, Math.floor(speed/3)));
    return;
  }
  if(mode === "mode3"){
    let seq=[0,1,2,1], i=0;
    animHandle = setInterval(()=>{
      lights.forEach((b,idx)=>b.setAttribute("aria-pressed", idx===seq[i] ? "true":"false"));
      i = (i+1)%seq.length;
    }, speed);
    return;
  }
  // fallback: single light rotate
  let i=0; animHandle = setInterval(()=>{
    lights.forEach((b,idx)=>b.setAttribute("aria-pressed", idx===i ? "true":"false"));
    i=(i+1)%3;
  }, speed);
}

// Cleanup when page hidden
document.addEventListener("visibilitychange", ()=> {
  if(document.hidden) stopLocalAnimation();
});

// Initialize UI from default
speedVal.textContent = speedSlider.value;
