"use strict";
// test_tool: flashen.js. Loaded by index.html in a fixed order; all files share
// one global scope (classic scripts), like the single script they came from.

// ===========================================================================
// Flashing (esptool-js over Web Serial). This was the page flash.html: the band
// compares the build on the board with the newest build on GitHub, the buttons
// pick what to write, the page downloads it and flashes the board.
// ===========================================================================
// The files: <name>-<variant>.bin = the program (address 0x10000, settings in
// NVS stay), <name>-<variant>-full.bin = bootloader + partition table + program
// (arduino-cli's <sketch>.ino.merged.bin, written from 0x0, see parseFirmware).
const ESPTOOL_URLS = ["https://cdn.jsdelivr.net/npm/esptool-js@0.6.1/bundle.js", "https://unpkg.com/esptool-js@0.6.1/bundle.js"];
const APP_DESC_MAGIC = 0xABCD5432;
// The chips the page flashes, by the chip id in the image header (esp_image_header_t.chip_id,
// u16 at byte 12; esptool-js ESPLoader.chip.IMAGE_CHIP_ID): where the chip's ROM
// looks for the bootloader, and the board types (file variants) built for it.
const CHIP_ID_C6 = 13, CHIP_ID_ESP32 = 0;
const CHIPS = {
  [CHIP_ID_C6]:    { bootloader: 0x0,    variants: ["beetle", "devkitc"] },
  [CHIP_ID_ESP32]: { bootloader: 0x1000, variants: ["esp32"] },  // classic ESP32 (AZ-Delivery DevKit, WROOM-32, CP2102)
};
const VARIANT_CHIP = { beetle: CHIP_ID_C6, devkitc: CHIP_ID_C6, esp32: CHIP_ID_ESP32 };
const VARIANT_NAMES = { beetle: "Beetle", devkitc: "DevKitC-1", esp32: "ESP32 DevKit" };
const chipLabel = id => id === CHIP_ID_C6 ? "ESP32-C6" : id === CHIP_ID_ESP32 ? t("f_chipKlassisch") : t("f_chipId", id);
// Board kinds, where their firmware is built (branch firmware-bin of each repo) and
// for which board types. Robot hand and test bridge exist for the ESP32-C6 only.
const FLASH_KINDS = {
  glove:  { repo: "ansteuerung_Gruppe1", file: "glove",     variants: ["beetle", "devkitc", "esp32"] },
  sim:    { repo: "ansteuerung_Gruppe1", file: "simulator", variants: ["beetle", "devkitc", "esp32"] },
  hand:   { repo: "ansteuerung_hand",    file: "hand",      variants: ["beetle", "devkitc"] },
  bridge: { repo: "tools",               file: "bridge",    variants: ["beetle", "devkitc"] },
};
// chips: the chip esptool-js found on a port, kept for the board row and the board type
const flash = { busy: false, chips: new WeakMap() };
// What to flash: kind, board variant, program or full image; file = {name, bytes, info} from disk
const flashPick = { kind: null, kindManual: false, variant: null, art: "app", file: null };
try { flashPick.variant = localStorage.getItem("ghVariante"); } catch (e) {}
let esptool = null;

async function loadEsptool() {
  if (esptool) return esptool;
  for (const url of ESPTOOL_URLS) {
    try { esptool = await import(url); return esptool; } catch (e) {}
  }
  throw new Error(t("f_esptoolFehlt"));
}

// What is in the file? App image (esp_app_desc right after the first segment
// header, written to 0x10000) or merged image (bootloader, partitions, app at
// flash 0x10000); which chip (image header byte 12); the flash address; and our
// "Firmware: ..." line from the program's strings.
// The address of a merged image comes from where its bootloader is: the chip's
// ROM reads the bootloader from 0x0 (C6) or 0x1000 (classic ESP32). Our CI copies
// arduino-cli's <sketch>.ino.merged.bin, which esptool merge-bin writes from 0x0
// (no --target-offset) and pads with 0xFF: on the classic ESP32 the file starts with
// 4 KB of 0xFF and the bootloader is at 0x1000 in the file, so it goes to 0x0 too.
// A merge with --target-offset 0x1000 starts with the ESP32 bootloader: that one
// goes to 0x1000. Either way the app must then sit at flash 0x10000.
// Returns null for anything that isn't firmware; address null for a chip we don't know.
function parseFirmware(bytes) {
  const u16 = o => bytes[o] | bytes[o + 1] << 8;
  const u32 = o => (u16(o) | bytes[o + 2] << 16 | bytes[o + 3] << 24) >>> 0;
  const isImage = o => o >= 0 && bytes.length >= o + 0x40 && bytes[o] === 0xE9;
  const isApp = o => isImage(o) && u32(o + 0x20) === APP_DESC_MAGIC;
  let kind, appStart, address, chip;
  if (isApp(0)) { kind = "app"; appStart = 0; address = 0x10000; chip = u16(12); }
  else {
    const boot = isImage(0) ? 0 : isImage(0x1000) && bytes.subarray(0, 0x1000).every(x => x === 0xFF) ? 0x1000 : -1;
    if (boot < 0) return null;
    kind = "full";
    chip = u16(boot + 12);
    if (!CHIPS[chip]) return { kind, address: null, chip, fw: null };
    address = CHIPS[chip].bootloader - boot;
    appStart = 0x10000 - address;
    if (address < 0 || !isApp(appStart) || u16(appStart + 12) !== chip) return null;
  }
  // search "Firmware: glove 2.0, protocol 2, build abc1234\0"
  const needle = encoder.encode("Firmware: ");
  let fw = null;
  outer: for (let i = appStart; i < bytes.length - 40; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    let end = i;
    while (end < bytes.length && bytes[end] !== 0 && end - i < 120) end++;
    const m = FW_RE.exec(new TextDecoder("latin1").decode(bytes.subarray(i, end)));
    if (m) { fw = { role: fwRole(m[1]), version: m[2], protocol: +m[3], build: m[4] || "" }; break; }
  }
  return { kind, address, chip, fw };
}

// The chip on a board: what esptool-js found the last time it talked to this port,
// else a guess from the USB id (303A = Espressif's own USB, only the C6 here; a
// classic ESP32 always sits behind a USB-UART chip such as the CP2102, 10C4:EA60,
// which the DevKitC-1's UART socket has as well, so that says nothing).
function knownChip(port) {
  const seen = port ? flash.chips.get(port) : null;
  if (seen) return seen;
  if (port?.getInfo?.().usbVendorId === 0x303A) return { id: CHIP_ID_C6, text: "", guess: true };
  return null;
}

// A board type that fits the chip (and the board kind, if given), or null
function fittingVariant(chip, kind, usb) {
  const list = (CHIPS[chip]?.variants ?? []).filter(v => !kind || !FLASH_KINDS[kind] || FLASH_KINDS[kind].variants.includes(v));
  if (list.includes(flashPick.variant)) return flashPick.variant;
  if (chip === CHIP_ID_C6 && list.includes("beetle") && list.includes("devkitc")) return usb?.usbVendorId === 0x303A ? "beetle" : "devkitc";
  return list[0] ?? null;
}

// Open the window. index.html#flashen (where flash.html now sends people) opens it at start.
function openFlash() {
  if (!("serial" in navigator)) { log(t("f_keinSerial")); }
  flashStatus("", "");
  $("flashBalken").hidden = true;
  fillFlashTargets(true);
  showFlash();
  if (!$("flashFenster").open) $("flashFenster").showModal();
  if (gh.token && !Object.keys(gh.repos).length && !gh.busy) ghRefresh();
}

// Which firmware a board runs: the test bridge is one firmware for both of its modes.
const fwKind = device => device === "bglove" || device === "bhand" || device === "bsniff" ? "bridge" : device;
const kindName = k => k === "bridge" ? t("fl_bridge") : FLASH_KINDS[k] ? t("g_" + k) : k || t("f_unbekannt");
const isSha = s => /^[0-9a-f]{7,40}$/.test(s || "");
const hex4 = n => n === undefined ? "?" : n.toString(16).padStart(4, "0");

// The board select: the connected boards, plus "another board" (port picked at Flash).
// Rebuilt only when the list changes, so it stays usable while lines come in.
function fillFlashTargets(fresh = false) {
  const sel = $("flashZiel"), before = sel.value;
  const items = connections.map((c, i) => [String(i), (c.device ? deviceName(c.device) : "?") + (c.fw && !c.fw.missing ? ` (${t("fw", c.fw.version)})` : "")]);
  items.push(["neu", t("f_andere")]);
  const sig = items.map(x => x.join("=")).join("|") + language;
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.innerHTML = "";
    for (const [v, text] of items) {
      const o = document.createElement("option");
      o.value = v; o.textContent = text;
      sel.appendChild(o);
    }
    sel.value = items.some(x => x[0] === before) ? before : "";
  }
  // on opening: the board on screen; otherwise keep what was picked
  if (fresh || !sel.value) {
    const i = connections.indexOf(viewConn());
    sel.value = i >= 0 ? String(i) : connections.length ? "0" : "neu";
    flashPick.kindManual = false;
  }
}

const flashConn = () => $("flashZiel").value === "neu" ? null : connections[+$("flashZiel").value] ?? null;

// The board's kind and firmware, as far as the page knows them
function boardFacts(conn) {
  if (!conn) return null;
  const fw = conn.fw && !conn.fw.missing ? conn.fw : null;
  const kind = fw && FLASH_KINDS[fw.role] ? fw.role : FLASH_KINDS[fwKind(conn.device)] ? fwKind(conn.device) : null;
  const usb = conn.port?.getInfo?.() ?? {};
  const asked = !!conn.fw || performance.now() - (conn.since ?? 0) > FW_WAIT_MS;
  return { kind, fw, usb, asked, silent: asked && !conn.device && !fw };
}

// The GitHub file for the current choice
// (CI names them <file>-<variant>[-full].bin; the classic ESP32 ones are glove-esp32*.bin and simulator-esp32*.bin)
const ghFileName = () => `${FLASH_KINDS[flashPick.kind]?.file}-${flashPick.variant}${flashPick.art === "full" ? "-full" : ""}.bin`;
function ghFile() {
  const k = FLASH_KINDS[flashPick.kind], repo = k && gh.repos[k.repo];
  if (!repo || !k.variants.includes(flashPick.variant)) return null;
  const name = ghFileName();
  const f = repo.files.find(x => x.name === name);
  return f ? { repo: k.repo, name, size: f.size, build: repo.build } : null;
}

const setText = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };
const dateText = iso => iso ? new Date(iso).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }) : "";

function showFlash() {
  const conn = flashConn(), b = boardFacts(conn);
  // what the board is preselects what to flash (until the user picks something else)
  if (b?.kind && !flashPick.kindManual) flashPick.kind = b.kind;
  if (!flashPick.kind) flashPick.kind = "glove";
  if (!flashPick.variant && b?.usb.usbVendorId) flashPick.variant = b.usb.usbVendorId === 0x303A ? "beetle" : "devkitc";  // 303A = the chip's own USB
  if (!flashPick.variant) flashPick.variant = "beetle";
  // once the chip is known, a board type for another chip is never right
  const chip = conn ? knownChip(conn.port) : null;
  if (chip && VARIANT_CHIP[flashPick.variant] !== chip.id) flashPick.variant = fittingVariant(chip.id, null, b.usb) ?? flashPick.variant;
  // Chip not known yet: a glove or simulator behind a CP2102 (10C4) is most likely the
  // ESP32 DevKit. Only a first guess, once per board (the user can pick another; if it
  // is wrong after all, the chip check at Flash refuses and switches the board type).
  if (conn && conn.port !== flash.guessedFor) {
    flash.guessedFor = conn.port;
    const kind = b.kind ?? flashPick.kind;
    if (!chip && b.usb.usbVendorId === 0x10C4 && FLASH_KINDS[kind]?.variants.includes("esp32")) flashPick.variant = "esp32";
  }
  const cmpKind = b?.kind ?? flashPick.kind;
  const k = FLASH_KINDS[cmpKind];
  const repo = k ? gh.repos[k.repo] : null;

  // board
  $("flBoardNeu").hidden = !!conn;
  $("flBoardDa").hidden = !conn;
  $("flVerbinden").disabled = flash.busy || !("serial" in navigator) || connections.length >= MAX_BOARDS;
  $("flashZiel").disabled = flash.busy;
  if (conn) {
    setText("flBoardName", b.kind ? kindName(b.kind) : b.asked ? t("fl_unbekannt") : t("fl_frage"));
    setText("flBoardFw", b.fw ? t("fl_fwText", b.fw.version, b.fw.protocol) : b.silent ? "–" : conn.fw?.missing ? t("fl_fwAlt") : t("fl_frage"));
    setText("flBoardMac", conn.mac ?? "–");
    setText("flBoardUsb", b.usb.usbVendorId ? `${hex4(b.usb.usbVendorId)}:${hex4(b.usb.usbProductId)}` : "–");
    setText("flBoardChip", !chip ? t("fl_chipSpaeter") : chip.guess ? t("fl_chipUsb", chipLabel(chip.id)) : `${chipLabel(chip.id)} · ${chip.text}`);
    setText("flBoardEinst", restoreCommands(currentBackup(conn) ?? {}).what || t("fl_keine"));
    $("flStumm").hidden = !b.silent;
  }

  // GitHub
  const inn = !!gh.user;
  setText("ghWer", inn ? t("gh_wer", gh.user) : "");
  $("ghAnmelden").hidden = !!gh.token;
  $("ghAbmelden").hidden = !gh.token;
  $("ghAktualisieren").hidden = !inn;
  $("ghAktualisieren").disabled = gh.busy;
  $("ghSpeichern").disabled = gh.busy;
  $("ghAus").hidden = !!gh.token;
  $("ghToken").placeholder = t("gh_tokenFeld");
  const list = $("ghRepos");
  const rows = GH_REPOS.filter(r => gh.repos[r]).map(r => [t("fl_repo_" + r), t("fl_build", gh.repos[r].build, dateText(gh.repos[r].date))]);
  const sig = JSON.stringify(rows);
  if (list.dataset.sig !== sig) {
    list.dataset.sig = sig;
    list.innerHTML = "";
    for (const [name, build] of rows) {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = name;
      const c = document.createElement("span"); c.className = "klein"; c.textContent = build;
      li.append(a, c);
      list.appendChild(li);
    }
  }
  list.hidden = !rows.length;

  // the band: the board's build next to the newest on GitHub
  const boardBuild = b?.fw?.build ?? "";
  setText("flHashBoard", !conn ? "–" : b.fw ? (boardBuild || "?") : "?");
  setText("flWerBoard", conn && b.kind ? kindName(b.kind) + (b.fw ? " " + b.fw.version : "") : "");
  const ghBuild = repo?.build ?? "";
  setText("flHashGh", ghBuild || "–");
  setText("flWerGh", repo ? dateText(repo.date) : "");
  let verdict = "", art = "";
  if (!conn) verdict = t("fl_keinBoard");
  else if (!b.asked && !b.fw) verdict = t("fl_warte");
  else if (!b.fw) { verdict = t("fl_ohneVersion"); art = "warn"; }
  else if (!gh.token) verdict = t("fl_keinGh");
  else if (gh.busy && !repo) verdict = t("gh_suche");
  else if (!repo) { verdict = t("fl_keinFw", kindName(cmpKind)); art = "warn"; }
  else if (boardBuild === "local" || !isSha(boardBuild)) verdict = t("fl_lokal");
  else if (ghBuild.startsWith(boardBuild) || boardBuild.startsWith(ghBuild)) { verdict = t("fl_gleich"); art = "ok"; }
  else {
    const c = compareBuilds(k.repo, boardBuild, repo.sha || ghBuild);
    art = "warn";
    if (!c) verdict = t("fl_vergleiche");
    else if (c.status === "ahead") verdict = t("fl_hinten", c.ahead);
    else if (c.status === "behind") { verdict = t("fl_vorn", c.behind); art = ""; }
    else if (c.status === "identical") { verdict = t("fl_gleich"); art = "ok"; }
    else verdict = t("fl_anders");
  }
  setText("flUrteilText", verdict);
  $("flUrteil").dataset.art = art;

  // choices
  for (const [id, key] of [["flRolle", "kind"], ["flVariante", "variant"], ["flArt", "art"]]) {
    for (const btn of $(id).querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(flashPick[key] === btn.dataset.wert));
      const otherChip = key === "variant" && chip && VARIANT_CHIP[btn.dataset.wert] !== chip.id;
      btn.disabled = flash.busy || !!otherChip;
      btn.title = otherChip ? t("fl_varianteNicht", chipLabel(chip.id)) : "";
    }
  }
  setText("flArtTipp", t(flashPick.art === "full" ? "fl_fullTipp" : "fl_appTipp"));
  $("flDateiAktiv").hidden = !flashPick.file;
  setText("flDateiName", flashPick.file?.name ?? "");

  // plan, warnings, backup
  let plan = "", planArt = "", warn = "", label = t("f_start");
  const f = flashPick.file ? null : ghFile();
  let fileKind = null, fileOk = false;
  if (flashPick.file) {
    const i = flashPick.file.info;
    if (!i) { plan = t("f_keinBild"); planArt = "fehler"; }
    else {
      fileKind = i.fw?.role ?? null;
      const kb = Math.round(flashPick.file.bytes.length / 1024);
      plan = t("fl_planDatei", flashPick.file.name, t(i.kind === "app" ? "f_infoApp" : "f_infoVoll", kindName(fileKind), i.fw?.version ?? "", i.fw?.build ?? "", kb));
      if (!CHIPS[i.chip]) { warn = t("f_falscherChip", i.chip); planArt = "fehler"; }
      else {
        plan += " " + t("fl_planChip", chipLabel(i.chip), i.address.toString(16));
        if (chip && chip.id !== i.chip) { warn = t("f_chipFalsch", flashPick.file.name, chipLabel(i.chip), chipLabel(chip.id)); planArt = "fehler"; }
        else fileOk = true;
      }
      label = t("fl_startName", flashPick.file.name);
    }
  } else if (FLASH_KINDS[flashPick.kind] && !FLASH_KINDS[flashPick.kind].variants.includes(flashPick.variant)) {
    plan = t("fl_keinEsp32", kindName(flashPick.kind)); planArt = "warn";
  } else if (f) {
    plan = t("fl_planGh", f.name, f.build, Math.round(f.size / 1024));
    fileKind = flashPick.kind;
    label = t("fl_startName", f.name);
  } else plan = gh.user ? (gh.busy ? t("gh_suche") : t("fl_keinFw", `${kindName(flashPick.kind)}, ${ghFileName()}`)) : t("fl_planOhne");
  if (!conn && (flashPick.file?.info || f)) plan += " " + t("fl_planNeu");
  const otherChipBoard = chip && !CHIPS[chip.id];  // a chip the page doesn't flash
  if (otherChipBoard) { warn = t("fl_chipFremd", chip.text); planArt = "fehler"; }
  const boardKind = b?.kind;
  if (!warn && fileKind && boardKind && FLASH_KINDS[fileKind] && fileKind !== boardKind) warn = t("f_rolleFalsch", t("rolle_" + fileKind), t("rolle_" + boardKind));
  else if (!warn && (flashPick.file?.info?.kind ?? flashPick.art) === "full") warn = t("f_vollWarnung");
  setText("flashInfo", plan);
  $("flashInfo").dataset.art = planArt;
  setText("flashWarnung", warn);
  const full = (flashPick.file?.info?.kind ?? flashPick.art) === "full";
  const backup = full && conn ? currentBackup(conn) : null;
  const what = backup ? restoreCommands(backup).what : "";
  $("flashSicherungZeile").hidden = !what;
  setText("flashSicherungText", what ? t("f_sicherung", what) : "");
  const ready = !flash.busy && !otherChipBoard && (flashPick.file ? fileOk : !!f) && "serial" in navigator;
  $("flashStart").disabled = !ready;
  setText("flashStart", flash.busy ? t("f_laeuft") : label);
}
const showGh = showFlash;

function currentBackup(conn) {
  if (conn.device === "glove" && conn.calib) return { calib: conn.calib, target: conn.target ?? null };
  if (conn.device === "hand" && conn.limits) {
    return { limits: Object.fromEntries(Object.entries(conn.limits).filter(([, l]) => !l.std)), target: conn.target ?? null,
             ...(conn.speed && !conn.speed.std ? { speed: conn.speed.deg } : {}) };
  }
  return loadBackup(conn.mac);
}

function flashStatus(text, kind = "", logIt = true) {
  $("flashStatus").textContent = text;
  $("flashStatus").dataset.art = kind;
  if (text && logIt) flog((kind === "fehler" ? "ERROR " : "") + text);
}

async function pickFlashFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const i = parseFirmware(bytes);
  flashPick.file = { name: file.name, bytes, info: i };
  flog(t("f_logDatei", file.name) + ` (${bytes.length} bytes)` + (i ? ` · ${i.kind === "app" ? "app" : "merged image"} @ ${i.address === null ? "?" : "0x" + i.address.toString(16)}, chip id ${i.chip}` +
    (i.fw ? ` · ${i.fw.role} ${i.fw.version}, protocol ${i.fw.protocol}, build ${i.fw.build || "?"}` : " · no version string") : " · not an ESP32 image"));
  if (i) flashPick.art = i.kind;
  $("flDateiBox").open = true;
  showFlash();
}

// ---------------------------------------------------------------------------
// Flash log: our steps plus what esptool-js prints. "verbose" turns on
// esptool's debug output, "everything" also its trace of the serial traffic.
// ---------------------------------------------------------------------------
const flashLog = { lines: [], timer: null, partial: "" };
const FLASH_LOG_MAX = 20000;
function flog(text) {
  const time = new Date().toISOString().slice(11, 23);
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    flashLog.lines.push(time + "  " + (line.length > 600 ? line.slice(0, 600) + " …(" + line.length + ")" : line));
  }
  if (flashLog.lines.length > FLASH_LOG_MAX) flashLog.lines.splice(0, flashLog.lines.length - FLASH_LOG_MAX);
  if (!flashLog.timer) flashLog.timer = setTimeout(renderFlashLog, 120);
}
function renderFlashLog() {
  flashLog.timer = null;
  const pre = $("flashLog");
  const atEnd = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 30;
  pre.textContent = flashLog.lines.slice(-2000).join("\n");  // the file (Save) has all of them
  if (atEnd) pre.scrollTop = pre.scrollHeight;
  $("flashLogAnzahl").textContent = flashLog.lines.length ? t("f_logZeilen", flashLog.lines.length) : "";
}
const flashLogLevel = () => $("flashLogStufe").value;
// esptool-js writes through this "terminal"
const flashTerminal = {
  clean() {},
  write(text) { flashLog.partial += text; },
  writeLine(text) { flog(flashLog.partial + text); flashLog.partial = ""; },
};
try { const v = localStorage.getItem("flashLogStufe"); if (v) $("flashLogStufe").value = v; } catch (e) {}
$("flashLogStufe").onchange = () => { try { localStorage.setItem("flashLogStufe", flashLogLevel()); } catch (e) {} };
$("flashLogLeeren").onclick = () => { flashLog.lines = []; renderFlashLog(); };
$("flashLogKopieren").onclick = () => navigator.clipboard?.writeText(flashLog.lines.join("\n")).catch(() => {});
$("flashLogSpeichern").onclick = () => download(`flash-log-${stamp()}.txt`, flashLog.lines.join("\n") + "\n", "text/plain");

// ---------------------------------------------------------------------------
// Firmware from GitHub. A page on its own can't use GitHub's normal login
// (the OAuth code exchange needs a server with a client secret, github.com
// sends no CORS headers) and can't download release files (the download
// redirects to a host without CORS). The REST API does allow CORS with a
// token, so the user creates a read-only token once, the page keeps it and
// reads the .bin files from the branch "firmware-bin", which the firmware
// workflow refills on every build of main.
// ---------------------------------------------------------------------------
const GH_ORG = "puls-MINT-hand-prothese-2026";
const GH_REPOS = ["ansteuerung_Gruppe1", "ansteuerung_hand", "tools"];  // tools: test bridge (bridge.yml)
const GH_BRANCH = "firmware-bin";
const GH_API = "https://api.github.com";
// repos: newest build per repo {build, sha, date, files}; compare: board build vs GitHub (cached)
const gh = { token: null, user: null, repos: {}, compare: {}, busy: false };
$("ghTokenLink").href = "https://github.com/settings/personal-access-tokens/new?" + new URLSearchParams({
  name: "Prosthesis test tool", description: "Firmware download in the test tool (read only)",
  target_name: GH_ORG, expires_in: "366", contents: "read",
});
$("ghTokenKlassisch").href = "https://github.com/settings/tokens/new?" + new URLSearchParams({ scopes: "repo", description: "Prosthesis test tool" });
try { gh.token = localStorage.getItem("ghToken") || sessionStorage.getItem("ghToken"); } catch (e) {}

async function ghFetch(path, accept = "application/vnd.github+json") {
  let r;
  try {
    r = await fetch(GH_API + path, { headers: { Authorization: "Bearer " + gh.token, Accept: accept }, cache: "no-store" });
  } catch (e) {
    throw Object.assign(new Error(t("gh_netz")), { status: 0 });
  }
  if (!r.ok) {
    const limited = (r.status === 403 || r.status === 429) && r.headers.get("x-ratelimit-remaining") === "0";
    throw Object.assign(new Error(r.status === 401 ? t("gh_ungueltig") : limited ? t("gh_limit") : `HTTP ${r.status}`), { status: r.status });
  }
  return r;
}

function ghMessage(text, kind = "") {
  $("ghMeldung").textContent = text;
  $("ghMeldung").dataset.art = kind;
  if (text && kind) flog(text.startsWith("GitHub") ? text : "GitHub: " + text);
}

async function ghLogin(token, remember) {
  gh.token = token;
  gh.busy = true;
  ghMessage(t("gh_pruefe"));
  showFlash();
  try {
    const user = await (await ghFetch("/user")).json();
    gh.user = user.login;
    try {
      localStorage.removeItem("ghToken"); sessionStorage.removeItem("ghToken");
      (remember ? localStorage : sessionStorage).setItem("ghToken", token);
    } catch (e) {}
    $("ghLogin").hidden = true;
    $("ghToken").value = "";
    flog("GitHub: " + t("gh_wer", user.login));
    gh.busy = false;
    await ghRefresh();
  } catch (e) {
    gh.busy = false;
    if (e.status === 401) ghLogout(false);
    ghMessage(t("gh_fehler", e.message), "fehler");
    showFlash();
  }
}

function ghLogout(clearMessage = true) {
  gh.token = gh.user = null;
  gh.repos = {}; gh.compare = {};
  try { localStorage.removeItem("ghToken"); sessionStorage.removeItem("ghToken"); } catch (e) {}
  if (clearMessage) ghMessage("");
  showFlash();
}

async function ghRefresh() {
  if (!gh.token || gh.busy) return;
  gh.busy = true;
  ghMessage(t("gh_suche"));
  showFlash();
  const errors = [];
  try {
    if (!gh.user) gh.user = (await (await ghFetch("/user")).json()).login;
    gh.repos = {}; gh.compare = {};
    await Promise.all(GH_REPOS.map(async repo => {
      try {
        const [list, commit] = await Promise.all([
          ghFetch(`/repos/${GH_ORG}/${repo}/contents?ref=${GH_BRANCH}`).then(r => r.json()),
          ghFetch(`/repos/${GH_ORG}/${repo}/commits/${GH_BRANCH}`).then(r => r.json()),
        ]);
        // the workflow names the source commit in the message of its firmware-bin commit
        const msg = commit.commit?.message ?? "";
        gh.repos[repo] = {
          build: (/\b[0-9a-f]{7}\b/.exec(msg) ?? [""])[0],
          sha: (/\b[0-9a-f]{40}\b/.exec(msg) ?? [""])[0],
          date: commit.commit?.committer?.date ?? "",
          files: list.filter(f => f.type === "file" && f.name.endsWith(".bin")).map(f => ({ name: f.name, size: f.size })),
        };
      } catch (e) {
        if (e.status === 401) throw e;
        errors.push(e.status === 404 ? t("gh_keinBranch", repo) : repo + ": " + e.message);
      }
    }));
    ghMessage(errors.join(" "), errors.length ? "warn" : "");
    flog("GitHub: " + Object.entries(gh.repos).map(([r, x]) => `${r} ${x.build} (${x.files.length} files)`).join(", "));
  } catch (e) {
    if (e.status === 401) ghLogout(false);
    ghMessage(t("gh_fehler", e.message), "fehler");
  } finally {
    gh.busy = false;
    showFlash();
  }
}

// How far apart are the board's build and GitHub's? (compare API, cached)
function compareBuilds(repo, base, head) {
  const key = `${repo}:${base}...${head}`;
  if (gh.compare[key] !== undefined) return gh.compare[key];
  gh.compare[key] = null;  // loading
  ghFetch(`/repos/${GH_ORG}/${repo}/compare/${base}...${head}`)
    .then(r => r.json())
    .then(c => { gh.compare[key] = { status: c.status, ahead: c.ahead_by, behind: c.behind_by }; })
    .catch(() => { gh.compare[key] = { status: "unknown" }; })
    .finally(() => { if ($("flashFenster").open) showFlash(); });
  return null;
}

async function ghDownload(f) {
  const r = await ghFetch(`/repos/${GH_ORG}/${f.repo}/contents/${encodeURIComponent(f.name)}?ref=${GH_BRANCH}`, "application/vnd.github.raw+json");
  const total = f.size || +r.headers.get("content-length") || 0;
  const reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) flashStatus(t("gh_lade", f.name, Math.round(100 * got / total)), "", false);
  }
  if (total && got !== total) throw new Error(`${got} / ${total} bytes`);
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  flog(`GitHub: ${f.repo}/${f.name}, build ${f.build || "?"} (${got} bytes)`);
  return bytes;
}

$("ghAnmelden").onclick = () => { $("ghLogin").hidden = !$("ghLogin").hidden; if (!$("ghLogin").hidden) $("ghToken").focus(); };
$("ghSpeichern").onclick = () => { const tok = $("ghToken").value.trim(); if (tok) ghLogin(tok, $("ghMerken").checked); };
$("ghToken").onkeydown = e => { if (e.key === "Enter") $("ghSpeichern").click(); };
$("ghAbmelden").onclick = () => ghLogout();
$("ghAktualisieren").onclick = () => ghRefresh();

async function startFlash() {
  if (flash.busy) return;
  const conn = flashConn();
  const before = boardFacts(conn);
  const full = (flashPick.file?.info?.kind ?? flashPick.art) === "full";
  const backup = full && conn && $("flashSicherung").checked && !$("flashSicherungZeile").hidden ? currentBackup(conn) : null;
  flash.busy = true;
  showFlash();
  let port = null, transport = null;
  try {
    let name, bytes;
    if (flashPick.file) ({ name, bytes } = flashPick.file);
    else {
      const f = ghFile();
      if (!f) throw new Error(t("fl_planOhne"));
      name = f.name;
      bytes = await ghDownload(f);
    }
    const info = parseFirmware(bytes);
    if (!info) throw new Error(t("f_keinBild"));
    if (!CHIPS[info.chip]) throw new Error(t("f_falscherChip", info.chip));
    // the kind the board is afterwards (for restoring the backup)
    const device = info.fw?.role === "bridge" ? conn?.device : info.fw?.role ?? before?.kind ?? null;
    flashStatus(t("f_ladeEsptool"));
    const esp = await loadEsptool();
    if (conn) {
      port = conn.port;
      if (link.running) stopLink();
      stopPlay();
      await disconnectOne(conn);
    } else {
      port = await navigator.serial.requestPort();
      if (connections.some(c => c.port === port)) await disconnectOne(connections.find(c => c.port === port));
    }
    const usb = port.getInfo?.() ?? {};
    flog("— " + t("f_logDatei", name) + " → 0x" + info.address.toString(16) + ` (${bytes.length} bytes)`);
    flog(t("f_logZiel", conn ? deviceName(conn.device) : t("f_andere"), usb.usbVendorId === undefined ? "" : hex4(usb.usbVendorId), hex4(usb.usbProductId)) +
      `, esptool-js 0.6.1, 460800 baud, log: ${flashLogLevel()}` + (backup ? ", backup: " + restoreCommands(backup).what : ""));
    flashStatus(t("f_verbinde"));
    const level = flashLogLevel();
    transport = new esp.Transport(port, level === "trace");
    if (level === "trace") transport.trace = msg => flog("TRACE " + msg);
    flashLog.partial = "";
    // Into the bootloader: esptool-js picks the reset itself (default_reset): the
    // USB-Serial-JTAG sequence for the C6's own USB port (PID 1001), else the classic
    // DTR/RTS sequence for a USB-UART chip (CP2102 on the ESP32 DevKit, DevKitC-1 "UART").
    const loader = new esp.ESPLoader({ transport, baudrate: 460800, terminal: flashTerminal, debugLogging: level !== "normal" });
    const desc = await loader.main();
    const found = loader.chip?.IMAGE_CHIP_ID;
    flash.chips.set(port, { id: found, text: desc });
    flashStatus(t("f_chip", chipLabel(found), desc));
    if (!CHIPS[found] || found !== info.chip) {
      // nothing written yet: say why, start the old firmware again and reconnect
      let msg = !CHIPS[found] ? t("f_chipNicht", desc) : t("f_chipFalsch", name, chipLabel(info.chip), chipLabel(found));
      if (CHIPS[found] && !flashPick.file) {
        const v = fittingVariant(found, flashPick.kind, usb);
        if (v) { flashPick.variant = v; msg += " " + t("f_chipUmgestellt", VARIANT_NAMES[v]); }
        else msg += " " + t("fl_keinEsp32", kindName(flashPick.kind));
      }
      await restartChip(transport, found);
      try { await transport.disconnect(); } catch (e) {}
      transport = null;
      const c = await connectAfterFlash(port, usb);
      if (c) { fillFlashTargets(); $("flashZiel").value = String(connections.indexOf(c)); }
      throw new Error(msg);
    }
    $("flashBalken").hidden = false;
    const bar = $("flashBalken").firstElementChild;
    const t0 = performance.now();
    let lastTenth = -1;
    await loader.writeFlash({
      fileArray: [{ data: bytes, address: info.address }],
      flashMode: "keep", flashFreq: "keep", flashSize: "keep", eraseAll: false, compress: true,
      reportProgress: (i, written, total) => {
        const p = Math.round(100 * written / total);
        bar.style.width = p + "%";
        flashStatus(t("f_schreibe", p), "", Math.floor(p / 10) !== lastTenth);
        lastTenth = Math.floor(p / 10);
      },
    });
    flog(t("f_logGeschrieben", ((performance.now() - t0) / 1000).toFixed(1), Math.round(bytes.length / 1024)));
    flashStatus(t("f_neustart"));
    await restartChip(transport, found);
    try { await transport.disconnect(); } catch (e) { /* the port is already gone after the reset */ }
    transport = null;
    gh.compare = {};  // the board runs a new build now: compare again
    // The C6's USB port drops out during the reset: find it again and connect.
    // (A USB-UART chip such as the CP2102 stays: the same port opens again at once.)
    const c = await connectAfterFlash(port, usb);
    if (c) {
      fillFlashTargets();
      $("flashZiel").value = String(connections.indexOf(c));  // keep looking at this board
      if (backup) restoreAfterFlash(c, device, backup);
      flashStatus(t("f_fertig"), "ok");
    } else {
      flashStatus(t("f_fertigOhne"), "ok");
    }
  } catch (e) {
    if (e?.name !== "NotFoundError") {
      flashStatus(t("f_fehler", e?.message ?? String(e)), "fehler");
      if (e?.stack && flashLogLevel() !== "normal") flog(e.stack);
      $("flashLogBox").open = true;
    } else flashStatus("");
    try { await transport?.disconnect(); } catch (e2) {}
  } finally {
    flash.busy = false;
    fillFlashTargets();
    showFlash();
  }
}

// Start the new firmware. esptool-js's own "hard_reset" only releases RTS and
// never pulls it first, so the chip is not reset at all: it stays in the flasher
// and the page connects to a board that prints nothing. This is the sequence of
// esptool (Python) for the USB port of the C6: DTR (boot pin) released, RTS
// pulled (EN low = reset), then RTS released, so it boots the firmware.
async function resetIntoFirmware(transport) {
  const pause = ms => new Promise(r => setTimeout(r, ms));
  try {
    await transport.setDTR(false);
    await transport.setRTS(true);
    await pause(200);
    await transport.setRTS(false);
    await pause(200);
  } catch (e) { /* the USB port drops out as soon as the chip resets */ }
}

// The classic ESP32 always sits behind a USB-UART chip (CP2102 on the AZ-Delivery
// DevKit) with the usual auto-reset circuit: RTS on alone pulls EN low (reset), DTR on
// alone pulls IO0 low (boot pin), both the same changes neither. Starting the firmware
// is esptool's hard reset for UART: DTR off (IO0 free), RTS on (EN low), RTS off again,
// so the chip comes out of reset with IO0 high and boots from flash. (esptool-js's
// own after("hard_reset") only releases RTS, see resetIntoFirmware.) The port stays.
async function resetClassic(transport) {
  const pause = ms => new Promise(r => setTimeout(r, ms));
  try {
    await transport.setDTR(false);
    await transport.setRTS(true);   // esptool-js's setRTS also sends DTR again (Windows usbser.sys work-around)
    await pause(100);
    await transport.setRTS(false);
    await pause(100);
  } catch (e) {}
}

// Start the firmware on the chip esptool-js found: the C6 exactly as before, the classic ESP32 over its USB-UART chip.
const restartChip = (transport, chip) => chip === CHIP_ID_ESP32 ? resetClassic(transport) : resetIntoFirmware(transport);

// Open the board again after the reset and connect. If the port was opened just
// before it dropped out, the connection ends at once: then try once more.
async function connectAfterFlash(port, info) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const again = await reopenPort(port, info);
    if (!again) return null;
    const c = await connect(again);
    if (!c) return null;
    await new Promise(r => setTimeout(r, 1500));
    if (connections.includes(c)) return c;
    flog(t("f_logNochmal"));
    port = again;
  }
  return null;
}

async function reopenPort(port, info) {
  const deadline = performance.now() + 8000;
  while (performance.now() < deadline) {
    await new Promise(r => setTimeout(r, 700));
    const ports = await navigator.serial.getPorts();
    const same = ports.includes(port) ? port
      : ports.find(p => !connections.some(c => c.port === p) && p.getInfo().usbVendorId === info.usbVendorId && p.getInfo().usbProductId === info.usbProductId);
    if (!same) continue;
    try { await same.open({ baudRate: 115200 }); return same; } catch (e) { /* not back yet */ }
  }
  return null;
}

// After a full flash: once the board is detected again, send the backup back.
function restoreAfterFlash(conn, device, backup) {
  const start = performance.now();
  const wait = () => {
    if (!connections.includes(conn) || performance.now() - start > 15000) return;
    if (conn.device === device && conn.fw) {
      const { cmds, what } = restoreCommands(backup);
      (async () => {
        for (const c of cmds) { await sendTo(conn, c); await new Promise(r => setTimeout(r, 150)); }
        if (cmds.length) { log(t("s_wiederhergestellt", what)); flog(t("f_logWiederhergestellt", cmds.map(c => c.trim()).join(" | "))); sendTo(conn, "i", true); }
      })();
      return;
    }
    setTimeout(wait, 300);
  };
  wait();
}

$("flashKnopf").onclick = openFlash;
$("flashAblage").onclick = () => $("flashDatei").click();
$("flashAblage").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("flashDatei").click(); } };
$("flashDatei").onchange = e => { if (e.target.files[0]) pickFlashFile(e.target.files[0]); e.target.value = ""; };
$("flashAblage").addEventListener("dragover", e => { e.preventDefault(); $("flashAblage").dataset.ueber = "ja"; });
$("flashAblage").addEventListener("dragleave", () => { $("flashAblage").dataset.ueber = ""; });
$("flashAblage").addEventListener("drop", e => {
  e.preventDefault();
  $("flashAblage").dataset.ueber = "";
  if (e.dataTransfer.files[0]) pickFlashFile(e.dataTransfer.files[0]);
});
$("flDateiWeg").onclick = () => { flashPick.file = null; showFlash(); };
$("flashZiel").onchange = () => { flashPick.kindManual = false; showFlash(); };
$("flVerbinden").onclick = async () => {
  const c = await connect();
  if (c) { fillFlashTargets(); $("flashZiel").value = String(connections.indexOf(c)); flashPick.kindManual = false; showFlash(); }
};
for (const [id, key] of [["flRolle", "kind"], ["flVariante", "variant"], ["flArt", "art"]]) {
  $(id).addEventListener("click", e => {
    const btn = e.target.closest("button[data-wert]");
    if (!btn || flash.busy) return;
    flashPick[key] = btn.dataset.wert;
    if (key === "kind") flashPick.kindManual = true;
    if (key === "variant") try { localStorage.setItem("ghVariante", flashPick.variant); } catch (e2) {}
    if (key === "art" && flashPick.file && flashPick.file.info?.kind !== flashPick.art) flashPick.file = null;
    showFlash();
  });
}
$("flashStart").onclick = startFlash;
$("flashFenster").addEventListener("cancel", e => { if (flash.busy) e.preventDefault(); });
// flash.html (the old flasher page) sends people here
if (location.hash === "#flashen") setTimeout(openFlash, 0);

// Called from the main loop and when texts change
function tickTools(now) {
  checkVersions(now);
  showRadioTrouble(now);
  tickPlay(now);
  showLink(now);
  if ($("grenzenFenster").open) showLimits();
  // the flash window follows what the boards say (detection, version line, settings)
  if ($("flashFenster").open && !flash.busy && now - (flash.shownAt ?? 0) > 300) { flash.shownAt = now; fillFlashTargets(); showFlash(); }
}
function toolTexts() {
  showVersions();
  if ($("grenzenFenster").open) buildLimits();
  if ($("griffeFenster").open) buildGrips();
  if ($("aufnahmeFenster").open) showRecording();
  if ($("flashFenster").open) { fillFlashTargets(); showFlash(); showGh(); }
  renderFlashLog();
  if ($("befehleFenster").open) buildCommands();
  $("linkKacheln").dataset.sprache = "";
  showLinkMarks();
}
