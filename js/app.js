/* ============ 旅行手账 核心逻辑 ============ */
(() => {
  'use strict';

  // ---------- 工具 ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2300);
  }
  function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function storageDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ---------- 分类 ----------
  const CATS = {
    food:    { label: '美食',   icon: '🍜' },
    scenery: { label: '风景',   icon: '🏞' },
    culture: { label: '人文',   icon: '🏮' },
    story:   { label: '故事',   icon: '📖' },
    fun:     { label: '趣事',   icon: '😄' },
    activity:{ label: '活动',   icon: '🎪' },
  };

  // ---------- 状态 ----------
  let currentCat = 'food';
  // 每个分类各自保留照片和文字，切换分类互不丢失
  const catData = {}; // { food: {photos:[], text:''}, scenery: {...}, ... }
  Object.keys(CATS).forEach(k => catData[k] = { photos: [], text: '' });
  function cur() { return catData[currentCat]; }
  let photos = []; // 便捷引用，始终指向 cur().photos
  let history = [];      // {id, date, title, cat, text, img}
  let generating = null; // 当前预览的 {img, text}

  // ---------- 初始化 ----------
  function init() {
    loadHistory();
    bindEvents();
    renderPhotos();
    renderHistory();
  }

  // ---------- 事件 ----------
  function bindEvents() {
    $$('.cat-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        // 保存当前分类的照片和文字
        cur().photos = photos;
        cur().text = $('#note-input').value;
        // 切换
        $$('.cat-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCat = btn.dataset.cat;
        // 加载新分类的照片和文字
        photos = cur().photos;
        $('#note-input').value = cur().text;
        $('#char-count').textContent = cur().text.length + ' / 500';
        $('#cat-label').textContent = CATS[currentCat].icon + ' ' + CATS[currentCat].label;
        renderPhotos();
      });
    });

    const fileInput = $('#file-input');
    $('#photo-zone').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      handleFiles(e.target.files);
      e.target.value = ''; // 重置，确保下次选图（含重复选同一张）能正常触发
    });

    $('#note-input').addEventListener('input', () => {
      let v = $('#note-input').value;
      if (v.length > 500) { v = v.slice(0, 500); $('#note-input').value = v; }
      $('#char-count').textContent = v.length + ' / 500';
      cur().text = v; // 实时保存
    });

    $('#btn-ai').addEventListener('click', handleAI);
    $('#btn-generate').addEventListener('click', handleGenerate);
    $('#btn-save').addEventListener('click', handleSave);
    $('#btn-share').addEventListener('click', handleShare);
    $('#btn-back').addEventListener('click', () => {
      $('#screen-preview').classList.remove('active');
      $('#screen-edit').classList.add('active');
    });
    $('#btn-delete').addEventListener('click', handleDelete);

    $('#btn-settings').addEventListener('click', openSettings);
    $('#modal-close').addEventListener('click', closeSettings);
    $('#btn-save-settings').addEventListener('click', saveSettings);
    $('#settings-modal').addEventListener('click', e => { if (e.target === $('#settings-modal')) closeSettings(); });
  }

  // ---------- 图片 ----------
  function handleFiles(list) {
    if (!list || !list.length) return;
    let pending = 0;
    Array.from(list).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      pending++;
      const reader = new FileReader();
      reader.onload = ev => {
        const id = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
        photos.push({ id, dataUrl: ev.target.result });
        if (photos.length > 9) photos = photos.slice(-9);
        renderPhotos();
        pending--;
        if (pending === 0) toast('已添加 ' + photos.length + ' 张照片');
      };
      reader.onerror = () => { toast('图片读取失败，请重试'); pending--; };
      reader.readAsDataURL(file);
    });
    if (pending === 0) toast('未选择有效的图片');
  }

  function renderPhotos() {
    const zone = $('#photo-zone');
    const preview = $('#photo-preview');
    if (photos.length) {
      zone.classList.add('has-photo');
      let html = '<div class="photo-bar">';
      html += '<span class="photo-count">📷 ' + photos.length + ' / 9 张</span>';
      if (photos.length < 9) html += '<button class="add-more" id="add-more-btn">＋ 继续添加</button>';
      html += '</div>';
      html += '<div class="photo-grid">';
      html += photos.map(p => `
        <div class="thumb" data-id="${p.id}">
          <img src="${p.dataUrl}" alt="沿途照片">
          <button class="del" data-id="${p.id}">✕</button>
        </div>`).join('');
      html += '</div>';
      preview.innerHTML = html;
      // 绑定删除
      preview.querySelectorAll('.del').forEach(d => {
        d.addEventListener('click', ev => {
          ev.stopPropagation();
          photos = photos.filter(p => p.id !== d.dataset.id);
          cur().photos = photos;
          renderPhotos();
          if (photos.length === 0) toast('已清空，可重新选图');
        });
      });
      // 绑定继续添加
      const addBtn = $('#add-more-btn');
      if (addBtn) addBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        $('#file-input').click();
      });
    } else {
      zone.classList.remove('has-photo');
      preview.innerHTML = '';
    }
  }

  // ---------- 设置 ----------
  function loadKey() { return (storageGet('ark_api_key') || '').trim(); }
  function openSettings() {
    $('#api-key').value = loadKey();
    $('#settings-modal').classList.add('show');
  }
  function closeSettings() { $('#settings-modal').classList.remove('show'); }
  function saveSettings() {
    const key = $('#api-key').value.trim();
    storageSet('ark_api_key', key);
    closeSettings();
    toast(key ? 'AI 设置已保存 ✓' : '已清除 AI 设置');
  }

  // ---------- 历史 ----------
  function loadHistory() {
    try { history = JSON.parse(storageGet('history') || '[]'); }
    catch (e) { history = []; }
  }
  function saveHistory() { storageSet('history', JSON.stringify(history)); }
  function renderHistory() {
    const list = $('#history-list');
    const empty = $('#empty-history');
    if (!history.length) { empty.style.display = 'block'; list.innerHTML = ''; return; }
    empty.style.display = 'none';
    list.innerHTML = history.map(h => `
      <div class="history-item" data-id="${h.id}">
        <div class="thumb-box"><img src="${h.img}" alt="手账预览"></div>
        <div class="his-info">
          <div class="his-title">${h.title || '旅途手账'}</div>
          <div class="his-meta">${h.date} · ${CATS[h.cat]?.icon || ''}${CATS[h.cat]?.label || ''}</div>
        </div>
      </div>`).join('');
    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => openHistory(item.dataset.id));
    });
  }
  function openHistory(id) {
    const h = history.find(x => x.id === id);
    if (!h) return;
    generating = { dataUrl: h.img, text: h.text, id: h.id };
    showPreview();
  }

  // ---------- AI 整理（火山引擎豆包 vision） ----------
  const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  const ARK_MODEL = 'doubao-1-5-vision-pro-32k-250115';

  async function callAI(userText) {
    const key = loadKey();
    if (!key) throw Object.assign(new Error('未设置AI Key'), { noKey: true });
    const content = [{ type: 'text', text: buildPrompt(userText) }];
    photos.forEach(p => content.push({ type: 'image_url', image_url: { url: p.dataUrl } }));

    const resp = await fetch(ARK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: ARK_MODEL, messages: [{ role: 'user', content }], max_tokens: 800, temperature: 0.8 })
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error('AI 请求失败 (' + resp.status + ') ' + t.slice(0, 120));
    }
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  }

  function buildPrompt(userText) {
    return `你是旅行手账的整理助手。用户是一名旅行者，在途中随手记录，随消息附带了一张或多张沿途照片，以及一段随手写的话。
请把内容整理成一段【温暖、有画面感、口语化】的旅行手账文案，适合发朋友圈分享。
要求：
1. 结合照片内容补充具体细节，让文字有画面感。
2. 语气亲切真诚，像朋友分享旅程，避免空话套话。
3. 全文 100-180 字，中文输出。
4. 不要写“今天天气很好”之类的废话开头。

用户随手记（可能不完整，仅供参考）：
${userText || '（用户没有写文字，请仅依据照片内容描述）'}

直接输出整理好的文案，不要任何前言。`;
  }

  async function handleAI() {
    const text = $('#note-input').value.trim();
    if (!loadKey()) { toast('请先在设置里填入 AI Key'); openSettings(); return; }
    if (!photos.length && !text) { toast('请先拍照/选图，或写几句话'); return; }
    const btn = $('#btn-ai');
    btn.disabled = true; btn.textContent = 'AI 整理中…';
    try {
      const out = await callAI(text);
      $('#note-input').value = out;
      $('#char-count').textContent = out.length + ' / 500';
      toast('文案已整理 ✨');
    } catch (err) {
      console.error(err);
      if (err.noKey) { toast('请先在设置里填入 AI Key'); openSettings(); }
      else toast('AI 出错：' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = '✨ AI 整理文案';
    }
  }

  // ---------- 长图渲染 ----------
  const W = 750, PAD = 56, TOP = 190;

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('图片加载失败'));
      img.src = src;
    });
  }

  // 压缩图片到指定最大边，减少内存和 dataURL 体积
  function compressImage(dataUrl, maxSide) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w <= maxSide && h <= maxSide) { resolve(dataUrl); return; }
        if (w > h) { h = Math.round(h * maxSide / w); w = maxSide; }
        else { w = Math.round(w * maxSide / h); h = maxSide; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl); // 压缩失败用原图
      img.src = dataUrl;
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      if (!para) { out.push(''); continue; }
      let line = '';
      for (const ch of Array.from(para)) {
        if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
        else line += ch;
      }
      if (line) out.push(line);
    }
    return out;
  }

  async function renderJournal(text, catKey) {
    const cat = CATS[catKey] || CATS.food;
    // 压缩图片，避免手机大图导致 canvas 溢出
    const compressed = await Promise.all(photos.map(p => compressImage(p.dataUrl, 1200)));
    const imgs = await Promise.all(compressed.map(src => loadImage(src)));

    // 布局：第1张全宽，其余2张/行
    const cw = W - PAD * 2; // 内容宽
    const gap = 18;
    const blocks = [];
    // 第一张
    if (imgs[0]) {
      const r = imgs[0].height / imgs[0].width;
      blocks.push({ img: imgs[0], x: PAD, y: 0, w: cw, h: Math.min(cw * r, cw * 1.3) });
    }
    // 其余
    const rest = imgs.slice(1);
    for (let i = 0; i < rest.length; i += 2) {
      const a = rest[i];
      const b = rest[i + 1];
      const itemW = (cw - gap) / 2;
      const rowH = Math.max(itemW * (a.height / a.width), b ? itemW * (b.height / b.width) : 0);
      blocks.push({ img: a, x: PAD, y: 0, w: itemW, h: Math.min(rowH, itemW * 1.3) });
      if (b) blocks.push({ img: b, x: PAD + itemW + gap, y: 0, w: itemW, h: Math.min(rowH, itemW * 1.3) });
    }

    // 文字区
    const tmp = document.createElement('canvas').getContext('2d');
    tmp.font = '28px "PingFang SC","Microsoft YaHei",sans-serif';
    const textLines = wrap(tmp, text, cw);
    const lineH = 42, headH = 46;

    // 总高
    let ph = 0;
    for (const b of blocks) ph += b.h + gap;
    let textH = headH + textLines.length * lineH + 20;
    let bottomH = 80;
    let H = PAD + TOP + ph + textH + bottomH;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx2 = canvas.getContext('2d');

    // 背景
    const grad = ctx2.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#FFF7EC'); grad.addColorStop(1, '#FFFDF5');
    ctx2.fillStyle = grad; ctx2.fillRect(0, 0, W, H);

    // 顶部标题区
    ctx2.fillStyle = '#FFF7EC';
    // 顶部装饰圆
    ctx2.fillStyle = 'rgba(232,163,61,.16)';
    ctx2.beginPath(); ctx2.arc(W - 90, 20, 70, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = 'rgba(226,96,75,.14)';
    ctx2.beginPath(); ctx2.arc(70, 130, 40, 0, Math.PI * 2); ctx2.fill();

    // 分类徽章
    const badge = cat.icon + ' ' + cat.label + '手账';
    ctx2.font = '26px sans-serif'; ctx2.textAlign = 'center';
    const bw = ctx2.measureText(badge).width + 40;
    ctx2.fillStyle = '#E2604B';
    roundRect(ctx2, W / 2 - bw / 2, PAD - 8, bw, 46, 23); ctx2.fill();
    ctx2.fillStyle = '#fff'; ctx2.fillText(badge, W / 2, PAD + 26);

    // 标题
    ctx2.font = 'bold 56px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx2.fillStyle = '#4A3728'; ctx2.textAlign = 'center';
    ctx2.fillText(todayTitle(), W / 2, PAD + 118);

    // 日期小字
    ctx2.font = '24px sans-serif'; ctx2.fillStyle = '#8A7A6A';
    ctx2.fillText(todayStr(), W / 2, PAD + 158);

    // 图片
    let y = PAD + TOP;
    for (const b of blocks) {
      b.y = y;
      ctx2.save();
      roundRect(ctx2, b.x, b.y, b.w, b.h, 16); ctx2.clip();
      ctx2.drawImage(b.img, b.x, b.y, b.w, b.h);
      ctx2.restore();
      y += b.h + gap;
    }

    // 文字区
    y += 6;
    ctx2.textAlign = 'left';
    ctx2.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx2.fillStyle = '#E2604B';
    ctx2.fillText('✍ 旅途随记', PAD, y); y += headH;

    ctx2.font = '30px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx2.fillStyle = '#4A3728';
    for (const ln of textLines) { ctx2.fillText(ln, PAD, y); y += lineH; }
    y += 10;

    // 署名
    ctx2.textAlign = 'right';
    ctx2.font = '24px "KaiTi","STKaiti",sans-serif';
    ctx2.fillStyle = '#A8A095';
    ctx2.fillText('· 记于 ' + todayStr(), W - PAD, H - 30);

    return canvas.toDataURL('image/png');
  }

  // ---------- 生成 / 预览 / 保存 ----------
  async function handleGenerate() {
    if (!photos.length) { toast('请至少添加一张照片'); return; }
    const text = $('#note-input').value.trim();
    if (!text) { toast('请写几句话再生成'); return; }
    const btn = $('#btn-generate');
    btn.disabled = true; btn.textContent = '排版中…';
    try {
      const url = await renderJournal(text, currentCat);
      generating = { dataUrl: url, text };
      showPreview();
      addHistory(url, text);
      toast('手账已生成');
    } catch (err) {
      console.error('renderJournal error:', err);
      toast('生成失败：' + (err.message || err));
    } finally {
      btn.disabled = false; btn.textContent = '🎨 生成长图';
    }
  }

  function showPreview() {
    if (!generating || !generating.dataUrl) { toast('没有可预览的手账'); return; }
    $('#journal-canvas').innerHTML = '<img src="' + generating.dataUrl + '" alt="旅行手账长图" style="width:100%;height:auto;border-radius:16px;box-shadow:0 8px 24px rgba(234,168,120,.3);">';
    $('#screen-edit').classList.remove('active');
    $('#screen-preview').classList.add('active');
    window.scrollTo(0, 0);
  }

  function addHistory(url, text) {
    const item = { id: 'h' + Date.now(), date: todayStr(), cat: currentCat, title: todayTitle(), text, img: url };
    history.unshift(item);
    if (history.length > 8) history.pop();
    saveHistory();
    renderHistory();
    if (generating) generating.id = item.id;
  }

  function handleSave() {
    if (!generating) { toast('请先生成手账'); return; }
    const a = document.createElement('a');
    a.href = generating.dataUrl;
    a.download = '旅行手账_' + Date.now() + '.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('已保存到相册/下载 📂');
  }

  async function handleShare() {
    if (!generating) { toast('请先生成手账'); return; }
    try {
      const blob = await (await fetch(generating.dataUrl)).blob();
      const file = new File([blob], '旅行手账.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '旅行手账', text: '我的旅途手账' });
      } else {
        handleSave(); // 不支持原生分享则下载
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // 用户取消
      console.error(err);
      toast('分享失败：' + err.message);
    }
  }

  function handleDelete() {
    if (!generating) { toast('没有可删除的手账'); return; }
    if (generating.id) {
      // 从历史记录中删除
      history = history.filter(h => h.id !== generating.id);
      saveHistory();
      renderHistory();
    }
    generating = null;
    $('#journal-canvas').innerHTML = '';
    $('#screen-preview').classList.remove('active');
    $('#screen-edit').classList.add('active');
    toast('已删除该页手账');
  }

  // ---------- 日期 ----------
  function todayStr() {
    const d = new Date();
    const p = n => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '·' + p(d.getMonth() + 1) + '·' + p(d.getDate());
  }
  function todayTitle() {
    const d = new Date();
    const weeks = ['日', '一', '二', '三', '四', '五', '六'];
    const p = n => (n < 10 ? '0' : '') + n;
    return p(d.getMonth() + 1) + '月' + p(d.getDate()) + '日 · 周' + weeks[d.getDay()];
  }

  // 启动
  document.addEventListener('DOMContentLoaded', init);
})();