const DB_NAME = "photoFarhad";
const STORE = "photos";
const DB_VERSION = 3;

let els = {};
let selectedDataUrls = [];
let viewerStoredList = [];
let viewerStoredIndex = 0;
const groupViewState = new Map();

// =========================
// Utility
// =========================
function safe(value) {
  return value == null ? "" : String(value);
}

function normalizeText(value) {
  let text = safe(value);

  text = text
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/إ/g, "ا")
    .replace(/أ/g, "ا")
    .replace(/ئ/g, "ی")
    .replace(/‌/g, " ");

  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

  text = text.replace(/[۰-۹]/g, d => String(persianDigits.indexOf(d)));
  text = text.replace(/[٠-٩]/g, d => String(arabicDigits.indexOf(d)));

  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function getEls() {
  els = {
    codeInput: document.getElementById("codeInput"),
    descriptionInput: document.getElementById("descriptionInput"),
    searchInput: document.getElementById("searchInput"),
    fileInput: document.getElementById("fileInput"),

    saveBtn: document.getElementById("saveBtn"),
    clearPickBtn: document.getElementById("clearPickBtn"),
    backupBtn: document.getElementById("backupBtn"),
    restoreInput: document.getElementById("restoreInput"),
    clearAllBtn: document.getElementById("clearAllBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    refreshBtn2: document.getElementById("refreshBtn2"),
    searchBtn: document.getElementById("searchBtn"),

    compressToggle: document.getElementById("compressToggle"),
    qualityRange: document.getElementById("qualityRange"),
    maxWidthInput: document.getElementById("maxWidthInput"),

    list: document.getElementById("list"),
    emptyState: document.getElementById("emptyState"),

    viewer: document.getElementById("viewer"),
    viewerImg: document.getElementById("viewerImg"),
    viewerMeta: document.getElementById("viewerMeta"),
    viewerCloseBtn: document.getElementById("viewerCloseBtn"),
    viewerPrevBtn: document.getElementById("viewerPrevBtn"),
    viewerNextBtn: document.getElementById("viewerNextBtn"),
    viewerDownloadBtn: document.getElementById("viewerDownloadBtn"),
    viewerShareBtn: document.getElementById("viewerShareBtn")
  };

  const missing = Object.entries(els)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    console.error("Missing elements:", missing);
  }
}

// =========================
// IndexedDB
// =========================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      let store;

      if (!db.objectStoreNames.contains(STORE)) {
        store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      } else {
        store = req.transaction.objectStore(STORE);
      }

      if (!store.indexNames.contains("code")) {
        store.createIndex("code", "code", { unique: false });
      }

      if (!store.indexNames.contains("createdAt")) {
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putPhoto(photo) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.add(photo);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearAllPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      resolve(list);
    };

    req.onerror = () => reject(req.error);
  });
}

// =========================
// Search
// کد: فقط دقیق (نرمال‌سازی)
// توضیحات: includes (نرمال‌سازی)
// =========================
async function searchPhotos(query) {
  const all = await getAllPhotos();
  const q = normalizeText(query);
  if (!q) return all;

  // 1) اول: تطابق دقیق کد
  const exactCode = all.filter(item => normalizeText(item.code) === q);
  if (exactCode.length) return exactCode;

  // 2) اگر کد دقیق پیدا نشد: جستجو در توضیحات (includes)
  return all.filter(item => normalizeText(item.description).includes(q));
}

// =========================
// File helpers
// =========================
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("خطا در بارگذاری تصویر"));
    img.src = src;
  });
}

async function compressImageDataUrl(dataUrl, { quality = 0.8, maxWidth = 1600 } = {}) {
  const img = await loadImage(dataUrl);

  const scale = Math.min(1, maxWidth / img.width);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mime });
}

// =========================
// Share / Download
// =========================
async function sharePhoto(item) {
  if (!item) return;

  const text =
    `کد: ${item.code || "-"}\n` +
    `توضیحات: ${item.description ? item.description : "-"}`;

  try {
    if (navigator.share) {
      const blob = dataUrlToBlob(item.dataUrl);
      const file = new File([blob], item.name || "photo.jpg", { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: item.code || "photo",
          text,
          files: [file]
        });
      } else {
        await navigator.share({
          title: item.code || "photo",
          text
        });
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      alert("اشتراک‌گذاری پشتیبانی نمی‌شود، متن کپی شد");
    } else {
      alert("اشتراک‌گذاری در این مرورگر پشتیبانی نمی‌شود");
    }
  } catch (err) {
    console.error(err);
  }
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "photo.jpg";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// =========================
// Viewer
// =========================
function updateViewer() {
  const item = viewerStoredList[viewerStoredIndex];
  if (!item) return;

  els.viewerImg.src = item.dataUrl;

  const metaLines = [
    `${viewerStoredIndex + 1} / ${viewerStoredList.length}`,
    `کد: ${safe(item.code)}`,
    item.description ? `توضیحات: ${safe(item.description)}` : null
  ].filter(Boolean);

  els.viewerMeta.textContent = metaLines.join("\n");
}

function openViewerForStored(list, index) {
  viewerStoredList = list || [];
  viewerStoredIndex = index || 0;
  updateViewer();
  els.viewer.hidden = false;
}

// =========================
// Render
// =========================
function groupByCode(list) {
  const map = new Map();

  for (const item of list) {
    const code = safe(item.code) || "بدون کد";
    if (!map.has(code)) map.set(code, []);
    map.get(code).push(item);
  }

  return Array.from(map.entries()).map(([code, items]) => ({ code, items }));
}

function createStoredAlbum(group) {
  const card = document.createElement("div");
  card.className = "album-card";

  const title = document.createElement("div");
  title.className = "album-title";
  title.textContent = `کد: ${group.code}`;

  // توضیحات گروه: اولین توضیحِ غیرخالی از داخل عکس‌های همان کد
  const firstDesc = group.items.map(x => safe(x.description).trim()).find(d => d.length > 0) || "";
  const desc = document.createElement("div");
  desc.className = "album-description";
  desc.textContent = firstDesc ? `توضیحات: ${firstDesc}` : "";

  const frame = document.createElement("div");
  frame.className = "album-frame";

  const img = document.createElement("img");

  const counter = document.createElement("div");
  counter.className = "counter";

  const controls = document.createElement("div");
  controls.className = "controls";

  const btnPrev = document.createElement("button");
  const btnNext = document.createElement("button");
  const btnOpen = document.createElement("button");
  const btnDown = document.createElement("button");
  const btnShare = document.createElement("button");
  const btnDel = document.createElement("button");
  const btnDelAll = document.createElement("button");

  btnPrev.textContent = "قبلی";
  btnNext.textContent = "بعدی";
  btnOpen.textContent = "نمایش";
  btnDown.textContent = "دانلود";
  btnShare.textContent = "اشتراک";
  btnDel.textContent = "حذف";
  btnDelAll.textContent = "حذف گروه";

  btnPrev.className = "secondary";
  btnNext.className = "secondary";
  btnDown.className = "secondary";
  btnShare.className = "secondary";
  btnDel.className = "danger";
  btnDelAll.className = "danger";

  if (!groupViewState.has(group.code)) {
    groupViewState.set(group.code, 0);
  }

  function renderAt(idx) {
    const len = group.items.length;
    if (!len) return;

    const i = ((idx % len) + len) % len;
    groupViewState.set(group.code, i);

    const item = group.items[i];
    img.src = item.dataUrl;
    counter.textContent = `${i + 1} / ${len}`;

    // اگر خواستی توضیح با ورق زدن هم تغییر کند:
    // const d = safe(item.description).trim();
    // desc.textContent = d ? `توضیحات: ${d}` : (firstDesc ? `توضیحات: ${firstDesc}` : "");
  }

  btnPrev.onclick = () => renderAt(groupViewState.get(group.code) - 1);
  btnNext.onclick = () => renderAt(groupViewState.get(group.code) + 1);

  btnOpen.onclick = () => openViewerForStored(group.items, groupViewState.get(group.code));
  img.onclick = () => openViewerForStored(group.items, groupViewState.get(group.code));

  btnDown.onclick = () => {
    const item = group.items[groupViewState.get(group.code)];
    downloadDataUrl(item.dataUrl, item.name);
  };

  btnShare.onclick = () => {
    const item = group.items[groupViewState.get(group.code)];
    sharePhoto(item);
  };

  btnDel.onclick = async () => {
    const item = group.items[groupViewState.get(group.code)];
    if (!item) return;

    if (!confirm("این عکس حذف شود؟")) return;
    await deletePhoto(item.id);
    await refresh();
  };

  btnDelAll.onclick = async () => {
    if (!confirm("کل این گروه حذف شود؟")) return;

    for (const item of group.items) {
      await deletePhoto(item.id);
    }

    await refresh();
  };

  frame.appendChild(img);
  frame.appendChild(counter);

  controls.appendChild(btnPrev);
  controls.appendChild(btnNext);
  controls.appendChild(btnOpen);
  controls.appendChild(btnDown);
  controls.appendChild(btnShare);
  controls.appendChild(btnDel);
  controls.appendChild(btnDelAll);

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(frame);
  card.appendChild(controls);

  renderAt(groupViewState.get(group.code));
  return card;
}

async function refresh() {
  const query = els.searchInput ? els.searchInput.value : "";
  const list = await searchPhotos(query);
  const groups = groupByCode(list);

  els.list.innerHTML = "";

  if (!groups.length) {
    els.emptyState.hidden = false;
    return;
  }

  els.emptyState.hidden = true;

  for (const group of groups) {
    els.list.appendChild(createStoredAlbum(group));
  }
}

// =========================
// Actions
// =========================
async function saveSelected() {
  try {
    const code = els.codeInput ? els.codeInput.value.trim() : "";
    const description = els.descriptionInput ? els.descriptionInput.value.trim() : "";

    if (!code) {
      alert("کد را وارد کنید");
      return;
    }

    if (!selectedDataUrls.length) {
      alert("عکس را انتخاب کنید");
      return;
    }

    const compress = els.compressToggle ? els.compressToggle.checked : false;
    const quality = els.qualityRange ? Number(els.qualityRange.value || 0.8) : 0.8;
    const maxWidth = els.maxWidthInput ? Number(els.maxWidthInput.value || 1600) : 1600;

    for (const item of selectedDataUrls) {
      let finalDataUrl = item.dataUrl;

      if (compress) {
        finalDataUrl = await compressImageDataUrl(item.dataUrl, {
          quality,
          maxWidth
        });
      }

      await putPhoto({
        code,
        description, // اینجا ذخیره می‌شود
        name: item.name,
        type: item.type,
        size: item.size,
        dataUrl: finalDataUrl,
        createdAt: Date.now()
      });
    }

    if (els.fileInput) els.fileInput.value = "";
    if (els.codeInput) els.codeInput.value = "";
    if (els.descriptionInput) els.descriptionInput.value = "";

    selectedDataUrls = [];
    await refresh();
    alert("ذخیره شد");
  } catch (err) {
    console.error(err);
    alert("خطا: " + err.message);
  }
}

async function handleFiles(files) {
  selectedDataUrls = [];

  for (const file of files) {
    const dataUrl = await readFileAsDataURL(file);
    selectedDataUrls.push({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl
    });
  }
}

// =========================
// Backup / Restore
// =========================
async function backupData() {
  const data = await getAllPhotos();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function restoreData(file) {
  if (!file) return;

  const text = await file.text();
  const arr = JSON.parse(text);

  for (const item of arr) {
    const copy = {
      code: item.code || "",
      description: item.description || "",
      name: item.name || "photo.jpg",
      type: item.type || "image/jpeg",
      size: item.size || 0,
      dataUrl: item.dataUrl,
      createdAt: item.createdAt || Date.now()
    };

    await putPhoto(copy);
  }

  await refresh();
  alert("بازیابی انجام شد");
}

// =========================
// Events
// =========================
function bindEvents() {
  if (els.fileInput) {
    els.fileInput.onchange = e => handleFiles(Array.from(e.target.files || []));
  }

  if (els.saveBtn) {
    els.saveBtn.onclick = saveSelected;
  }

  if (els.clearPickBtn) {
    els.clearPickBtn.onclick = () => {
      if (els.fileInput) els.fileInput.value = "";
      selectedDataUrls = [];
    };
  }

  if (els.refreshBtn) {
    els.refreshBtn.onclick = refresh;
  }

  if (els.refreshBtn2) {
    els.refreshBtn2.onclick = () => {
      if (els.searchInput) els.searchInput.value = "";
      refresh();
    };
  }

  if (els.searchBtn) {
    els.searchBtn.onclick = refresh;
  }

  if (els.searchInput) {
    els.searchInput.addEventListener("input", refresh);
  }

  if (els.backupBtn) {
    els.backupBtn.onclick = backupData;
  }

  if (els.restoreInput) {
    els.restoreInput.onchange = async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await restoreData(file);
      e.target.value = "";
    };
  }

  if (els.clearAllBtn) {
    els.clearAllBtn.onclick = async () => {
      if (!confirm("همه عکس‌ها حذف شوند؟")) return;
      await clearAllPhotos();
      await refresh();
    };
  }

  if (els.viewerCloseBtn) {
    els.viewerCloseBtn.onclick = () => {
      els.viewer.hidden = true;
    };
  }

  if (els.viewerNextBtn) {
    els.viewerNextBtn.onclick = () => {
      if (!viewerStoredList.length) return;
      viewerStoredIndex = (viewerStoredIndex + 1) % viewerStoredList.length;
      updateViewer();
    };
  }

  if (els.viewerPrevBtn) {
    els.viewerPrevBtn.onclick = () => {
      if (!viewerStoredList.length) return;
      viewerStoredIndex =
        (viewerStoredIndex - 1 + viewerStoredList.length) % viewerStoredList.length;
      updateViewer();
    };
  }

  if (els.viewerDownloadBtn) {
    els.viewerDownloadBtn.onclick = () => {
      const item = viewerStoredList[viewerStoredIndex];
      if (!item) return;
      downloadDataUrl(item.dataUrl, item.name);
    };
  }

  if (els.viewerShareBtn) {
    els.viewerShareBtn.onclick = () => {
      const item = viewerStoredList[viewerStoredIndex];
      if (!item) return;
      sharePhoto(item);
    };
  }
}

// =========================
// Service Worker
// =========================
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.error("SW register error:", err);
    });
  }
}

// =========================
// Init
// =========================
async function init() {
  try {
    getEls();
    bindEvents();
    await refresh();
    registerServiceWorker();
  } catch (err) {
    console.error(err);
    alert("خطا در اجرای برنامه: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", init);
