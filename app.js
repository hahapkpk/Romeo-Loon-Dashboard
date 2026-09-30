(() => {
  'use strict';
  const data = window.ROMEO_DATA;
  const results = document.getElementById('results');
  const search = document.getElementById('search');
  const sort = document.getElementById('sort');
  const count = document.getElementById('result-count');
  const more = document.getElementById('load-more');
  const toast = document.getElementById('toast');
  const storeKey = 'romeo-loon-favorites-v1';
  let favorites;
  try { favorites = new Set(JSON.parse(localStorage.getItem(storeKey) || '[]')); }
  catch { favorites = new Set(); }
  let filter = 'all';
  let shown = 40;
  let expanded = new Set();
  let matches = [];
  let toastTimer;
  const groups = new Map();

  function notice(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }
  function date(value) {
    if (!value) return '日期未知';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  }
  function el(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function preferred(items) {
    return [...items].sort((a, b) => {
      const score = x => (x.variant === 'Beta' ? 0 : 2) + (x.format === 'lpx' ? 1 : 0);
      return score(b) - score(a) || b.updated.localeCompare(a.updated);
    })[0];
  }
  function saveFavorites() {
    try { localStorage.setItem(storeKey, JSON.stringify([...favorites])); }
    catch { notice('浏览器未允许保存关注列表'); }
    document.getElementById('fav-count').textContent = favorites.size;
  }
  async function copy(text) {
    try {
      if (!navigator.clipboard?.writeText) throw Error('fallback');
      await navigator.clipboard.writeText(text);
      notice('已复制模块 Raw URL');
      return;
    } catch {
      const box = el('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(box);
      box.select();
      let success = false;
      try { success = document.execCommand('copy'); } catch { /* browser blocked */ }
      box.remove();
      if (success) notice('已复制模块 Raw URL');
      else notice('复制受浏览器限制，请打开源码页手动复制地址');
    }
  }
  function versionRow(item) {
    const row = el('div', 'version');
    const left = el('div', 'version-left');
    left.append(el('strong', '', `${item.author}  ·  ${item.variant === 'standard' ? '常规' : item.variant}  ·  ${item.format.toUpperCase()}`));
    left.append(el('small', '', item.originalName + (item.moduleDate ? `  ·  模块标注：${item.moduleDate}` : '')));
    const right = el('div', 'version-right');
    const time = el('time', '', date(item.updated));
    time.dateTime = item.updated;
    const link = el('a', '', '查看源码 ↗');
    link.href = item.github;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const button = el('button', '', '复制 Raw URL');
    button.type = 'button';
    button.setAttribute('aria-label', `复制 ${item.originalName}，作者 ${item.author} 的模块地址`);
    button.addEventListener('click', () => copy(item.url));
    right.append(time, link, button);
    row.append(left, right);
    return row;
  }
  function groupRow(group) {
    const opened = expanded.has(group.name);
    const root = el('article', 'group');
    const row = el('div', 'group-row');
    const fav = el('button', 'fav' + (favorites.has(group.name) ? ' on' : ''), favorites.has(group.name) ? '★' : '☆');
    fav.type = 'button';
    fav.setAttribute('aria-label', `${favorites.has(group.name) ? '取消关注' : '关注'}${group.name}`);
    fav.title = '关注此软件';
    fav.addEventListener('click', () => {
      favorites.has(group.name) ? favorites.delete(group.name) : favorites.add(group.name);
      saveFavorites();
      render();
    });
    const title = el('div', 'group-title');
    const name = el('button', 'name-button', group.name);
    name.type = 'button';
    name.setAttribute('aria-expanded', String(opened));
    name.addEventListener('click', () => toggle(group.name));
    title.append(name, el('div', 'group-sub', `${group.items.length} 个版本 · ${new Set(group.items.map(i => i.author)).size} 位作者`));
    const updated = el('div', 'group-date');
    updated.append(el('span', '', date(group.updated)), el('small', '', '最近提交'));
    const actions = el('div', 'group-actions');
    const primary = preferred(group.items);
    const copyBtn = el('button', 'copy-primary', '复制链接');
    copyBtn.type = 'button';
    copyBtn.title = `首选：${primary.author} / ${primary.variant} / ${primary.format}`;
    copyBtn.setAttribute('aria-label', `复制 ${group.name} 的首选模块链接：${primary.author}`);
    copyBtn.addEventListener('click', () => copy(primary.url));
    const arrow = el('button', 'expand', opened ? '−' : '⌄');
    arrow.type = 'button';
    arrow.setAttribute('aria-label', `${opened ? '收起' : '展开'}${group.name}的模块列表`);
    arrow.setAttribute('aria-expanded', String(opened));
    arrow.addEventListener('click', () => toggle(group.name));
    actions.append(copyBtn, arrow);
    row.append(fav, title, updated, actions);
    root.append(row);
    if (opened) {
      const detail = el('div', 'details');
      detail.append(el('p', 'detail-note', '下方按版本列出模块；顶部“复制链接”优先选择非 Beta 的 .lpx。复制前可在这里确认作者和用途。'));
      [...group.items].sort((a,b) => b.updated.localeCompare(a.updated)).forEach(item => detail.append(versionRow(item)));
      root.append(detail);
    }
    return root;
  }
  function toggle(name) {
    expanded.has(name) ? expanded.delete(name) : expanded.add(name);
    render();
  }
  function refreshMatches() {
    const q = search.value.trim().toLocaleLowerCase();
    matches = [...groups.values()].filter(group => {
      if (filter === 'favorites' && !favorites.has(group.name)) return false;
      return !q || group.search.includes(q);
    });
    if (sort.value === 'name') matches.sort((a,b) => a.name.localeCompare(b.name, 'zh-CN'));
    else matches.sort((a,b) => b.updated.localeCompare(a.updated) || a.name.localeCompare(b.name, 'zh-CN'));
  }
  function render() {
    refreshMatches();
    count.textContent = `找到 ${matches.length.toLocaleString('zh-CN')} 个软件 · 共 ${matches.reduce((n,g) => n+g.items.length, 0).toLocaleString('zh-CN')} 个模块`;
    results.replaceChildren();
    if (!matches.length) {
      const empty = el('div', 'empty');
      empty.append(el('strong', '', filter === 'favorites' && !search.value ? '还没有关注的软件' : '没有找到对应模块'), el('span', '', filter === 'favorites' && !search.value ? '返回“全部”，点击星号添加关注。' : '试试中文名、英文名或作者名称。'));
      results.append(empty);
    } else {
      const fragment = document.createDocumentFragment();
      matches.slice(0, shown).forEach(group => fragment.append(groupRow(group)));
      results.append(fragment);
    }
    more.hidden = shown >= matches.length;
    more.textContent = `显示更多软件（剩余 ${(matches.length - shown).toLocaleString('zh-CN')} 个） ↓`;
  }
  if (!data || !Array.isArray(data.items)) {
    results.append(el('div', 'empty', '未找到 data.js 索引，请保留整个文件夹后打开 index.html。'));
    count.textContent = '索引加载失败';
    return;
  }
  for (const item of data.items) {
    const name = item.name || item.originalName;
    let group = groups.get(name);
    if (!group) {
      group = {name, updated: item.updated, items: [], search: ''};
      groups.set(name, group);
    }
    group.items.push(item);
    if (item.updated > group.updated) group.updated = item.updated;
    group.search += ` ${name} ${item.originalName} ${item.author} ${item.path}`.toLocaleLowerCase();
  }
  document.getElementById('module-count').textContent = data.items.length.toLocaleString('zh-CN');
  document.getElementById('sync-time').textContent = `索引生成：${date(data.generatedAt)} · ${data.sourceRevision.slice(0, 7)}`;
  saveFavorites();
  search.addEventListener('input', () => { shown = 40; render(); });
  sort.addEventListener('change', () => { shown = 40; render(); });
  document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    shown = 40;
    document.querySelectorAll('.tab').forEach(tab => {
      const selected = tab === button;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
    render();
  }));
  more.addEventListener('click', () => { shown += 40; render(); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault(); search.focus();
    }
  });
  render();
})();
