(() => {
  const prompt = document.getElementById('agent-prompt').textContent.trim();
  const commands = { macos: 'chmod +x ./session-bridge-macos-universal\n./session-bridge-macos-universal install', windows: '.\\session-bridge-windows-x64.exe install' };
  let os = 'macos', timer;
  const toast = message => { const el = document.getElementById('toast'); el.textContent = message; el.hidden = false; clearTimeout(timer); timer = setTimeout(() => { el.hidden = true; }, 3000); };
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('已复制，可以交给你的 Agent 了。'); }
    catch {
      const input = document.createElement('textarea'); input.value = text; input.setAttribute('readonly', ''); input.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(input); input.select();
      const ok = document.execCommand('copy'); input.remove(); toast(ok ? '已复制，可以交给你的 Agent 了。' : '复制未完成，请选择提示词后手动复制。');
    }
  }
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copy(button.dataset.copy === 'command' ? commands[os] : prompt)));
  const tabs = [...document.querySelectorAll('[data-tab]')];
  function selectTab(button) {
    tabs.forEach(tab => { const selected = tab === button; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected; });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => { if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; selectTab(next); next.focus(); } });
  });
  document.querySelectorAll('[data-os]').forEach(button => button.addEventListener('click', () => { os = button.dataset.os; document.getElementById('manual-command').textContent = commands[os]; document.querySelectorAll('[data-os]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); }));
  fetch('./release.json').then(response => { if (!response.ok) throw new Error('Release metadata unavailable'); return response.json(); }).then(release => {
    if (!/^\d+\.\d+\.\d+$/.test(release.version) || release.repository !== 'lyzMaster/session-bridge') throw new Error('Invalid release metadata');
    document.querySelectorAll('[data-version]').forEach(el => { el.textContent = 'v' + release.version + (release.published ? '' : ' · 预览'); });
    if (!release.published) return;
    document.querySelectorAll('[data-download]').forEach(link => { const artifact = release.platforms[link.dataset.download]; if (artifact && artifact.url === `https://github.com/lyzMaster/session-bridge/releases/download/${release.tag}/${artifact.filename}`) { link.href = artifact.url; link.setAttribute('download', artifact.filename); } });
    document.querySelector('[data-checksums]').href = `https://github.com/lyzMaster/session-bridge/releases/download/${release.tag}/SHA256SUMS`;
  }).catch(() => { /* Static release links and the agent prompt remain available. */ });
})();
