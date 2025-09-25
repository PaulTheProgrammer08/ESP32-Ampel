// app.js
const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
const CHAR_MODE = "12345678-1234-5678-1234-56789abcdef1";
const CHAR_SPEED = "12345678-1234-5678-1234-56789abcdef2";
const CHAR_LED = "12345678-1234-5678-1234-56789abcdef3";

let device = null;
let server = null;
let svc = null;
let modeChar = null;
let speedChar = null;
let ledChar = null;

const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const statustxt = document.getElementById("statustxt");
const logEl = document.getElementById("log");
const speedSlider = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");
const directCmd = document.getElementById("directCmd");
const sendDirect = document.getElementById("sendDirect");

function log(s){
  console.log(s);
  logEl.textContent += s + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(s){
  statustxt.textContent = s;
}

btnConnect.addEventListener("click", connect);
btnDisconnect.addEventListener("click", disconnect);

document.querySelectorAll(".mode").forEach(b=>{
  b.addEventListener("click", ()=> sendMode(b.dataset.mode));
});

speedSlider.addEventListener("input", ()=>{
  speedVal.textContent = speedSlider.value;
});
speedSlider.addEventListener("change", ()=> sendSpeed(speedSlider.value));

sendDirect.addEventListener("click", ()=>{
  sendDirectCmd(directCmd.value);
});

async function connect(){
  try {
    log("Starte Scan...");
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID]
    });
    log("Gerät gewählt: " + device.name);
    setStatus("Verbinde...");
    server = await device.gatt.connect();
    log("GATT verbunden");
    svc = await server.getPrimaryService(SERVICE_UUID);
    log("Service gefunden");
    modeChar  = await svc.getCharacteristic(CHAR_MODE);
    speedChar = await svc.getCharacteristic(CHAR_SPEED);
    ledChar   = await svc.getCharacteristic(CHAR_LED);
    setStatus("Verbunden: " + (device.name || "unnamed"));
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    log("Characteristics bereit");

    device.addEventListener("gattserverdisconnected", onDisconnected);
  } catch (err) {
    log("Verbindung fehlgeschlagen: " + err);
    setStatus("Nicht verbunden");
  }
}

async function disconnect(){
  try {
    if (device && device.gatt.connected){
      device.gatt.disconnect();
      log("Getrennt");
    }
  } catch(e){ log("Disconnect-Error: "+e); }
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
  setStatus("Nicht verbunden");
}

function onDisconnected(){
  log("Device disconnected");
  setStatus("Nicht verbunden");
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
}

async function sendMode(m){
  if (!modeChar){ log("MODE Char nicht verfügbar"); return; }
  try {
    const data = new TextEncoder().encode(m);
    await modeChar.writeValue(data);
    log("MODE gesendet: " + m);
  } catch (e){ log("MODE-Error: "+e); }
}

async function sendSpeed(s){
  if (!speedChar){ log("SPEED Char nicht verfügbar"); return; }
  try {
    const data = new TextEncoder().encode(String(s));
    await speedChar.writeValue(data);
    log("SPEED gesendet: " + s);
  } catch (e){ log("SPEED-Error: "+e); }
}

async function sendDirectCmd(cmd){
  if (!ledChar){ log("LED Char nicht verfügbar"); return; }
  try {
    const data = new TextEncoder().encode(cmd);
    await ledChar.writeValue(data);
    log("DIRECT gesendet: " + cmd);
  } catch (e){ log("DIRECT-Error: "+e); }
}
