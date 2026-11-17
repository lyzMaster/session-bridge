(() => {
  const STORAGE_KEY = 'session-bridge-lang';
  const I18N = {
    en: {
      htmlLang: 'en',
      title: 'Session Bridge — Switch machines. Keep the momentum.',
      description: "Session Bridge packs your agent's context, attachments, workspace files, and used Skills into one encrypted bundle, so any harness on any machine can continue the task.",
      ogTitle: 'Session Bridge — Switch machines. Keep the momentum.',
      ogDescription: 'One prompt to carry your agent task anywhere. Encrypted locally, resumable multipart transfers, single-file executables for Windows and macOS.',
      previewSuffix: ' · Preview',
      toastCopyFail: 'Copy failed; please select the prompt and copy manually.',
      toastCopiedCommand: 'Install command copied.',
      toastCopiedPrompt: 'Copied. Send it in your active SOURCE session.',
      toastStar: 'Opening GitHub — click ★ Star on the repo to support Session Bridge!',
      motionPause: 'Pause animations',
      motionResume: 'Resume animations',
      text: {
        skip: 'Skip to main content',
        'nav.features': 'Features',
        'nav.how': 'How it works',
        'nav.install': 'Get started',
        'star.label': 'Star',
        'star.cta': 'Star on GitHub',
        'hero.badge': 'Resumable multipart transfers are here',
        'hero.lead': "Session Bridge packs your agent's context, attachments, workspace files, and the Skills it actually used into one encrypted bundle — then hands it to any harness on any machine with a single prompt.",
        'hero.copy': 'Copy packaging prompt',
        'hero.chip1': 'Windows & macOS',
        'hero.chip2': 'No runtime to install',
        'hero.chip3': 'Encrypted locally',
        'art.taskHeading': 'Pack your work in progress',
        'art.row1': 'Task & next steps',
        'art.row2': 'Images & attachments',
        'art.row3': 'Current work files',
        'art.row4': 'Skills actually used',
        'art.terminal': 'Bundle & generate prompt',
        'art.packetMeta': 'Encrypted locally · Ciphertext relay',
        'art.targetTitle': 'Paste the generated prompt.',
        'art.targetSubtitle': 'Send it in a new session on target.',
        'compat.lead': 'Works across agent harnesses',
        'compat.more': '…and any harness that can read files and run commands.',
        'features.desc': 'A summary tells the next agent what happened. Session Bridge also brings the evidence, files and capabilities it needs to actually finish the job.',
        'f1.title': 'Real context, not a summary',
        'f1.body': 'Requirements, latest corrections, decisions, raw history, attachments and workspace files travel together — with omissions recorded.',
        'f2.title': 'Skills come along',
        'f2.body': 'Only Skills with evidence of use are bundled — scripts, assets and instructions — and registered on the target automatically.',
        'f3.title': 'Encrypted before it leaves',
        'f3.body': 'age encryption runs locally. Relays only ever store ciphertext; the key lives in your continuation prompt.',
        'f4.title': 'Picks the fastest relay',
        'f4.body': 'The first encrypted part is uploaded and read back on Filebin and Temp.sh at the same time; whichever verifies first wins on your network.',
        'f5.title': 'Multipart & resumable',
        'f5.body': 'Adaptive 256 KiB–8 MiB parts, up to 6 workers, saved checkpoints and Range downloads — an interrupted transfer picks up where it stopped.',
        'f6.title': 'One file, zero setup',
        'f6.body': 'A single executable for Windows x64 or macOS 13+ with Bun, age and the Skills installer embedded. No Node, Python or npm.',
        stat1: 'prompt to hand off',
        stat2: 'relays raced live',
        stat3: 'runtimes to install',
        stat4: 'parallel transfer workers',
        'how.step1.title': 'Pack on source',
        'how.step1.body': 'Send one prompt in your current session. Session Bridge installs or reuses itself, then gathers context, files and used Skills.',
        'how.step1.tag': 'Context + Files + Skills',
        'how.step2.title': 'Encrypt & relay',
        'how.step2.body': 'The bundle is encrypted locally, uploaded in verified parts to the fastest relay, and turned into a short continuation prompt.',
        'how.step2.tag': 'Short prompt + full credentials',
        'how.step3.title': 'Continue on target',
        'how.step3.body': 'Paste the prompt anywhere. The target downloads, verifies, decrypts and restores into a fresh directory — then keeps working.',
        'how.step3.tag': 'Evidence & workspace kept separate',
        'install.desc': 'Paste the packaging prompt into your active SOURCE session. When it finishes, send the short output to TARGET.',
        'install.point1': 'Auto-installs or reuses an existing Skill',
        'install.point2': 'Live-probes relays for your current network',
        'install.point3': 'Returns a target prompt only after readback verification',
        'install.guide': 'Read the full setup guide ↗',
        'install.tabAgent': 'Pack on source',
        'install.tabManual': 'Manual install',
        'install.promptHeader': 'Send in your active SOURCE session',
        'install.agentPrompt': `Use https://github.com/lyzMaster/session-bridge following INSTALL.md to install or reuse Session Bridge, upgrading older versions that lack multipart and checkpoint resume support.\nPackage the current session's context, attachments, workspace files, and Skills actually used, encrypt locally, automatically select a relay by live upload/readback probing, upload in parts with readback verification, and resume from the saved checkpoint if interrupted.\nOnce verified, output only a concise continuation prompt for TARGET: a line saying "Restore and continue this task", the project URL, and the complete transfer credential block (compacted onto one line). Omit install steps, commands, or format notes; add only brief remarks if critical items are missing or about expiry.`,
        'install.flowLeft': 'SOURCE → Package & upload',
        'install.flowRight': 'TARGET → Paste & continue',
        'install.panelCopy': 'Copy & package current session',
        'install.macosSub': 'Apple Silicon / Intel · macOS 13+',
        'install.winSub': 'Single-file .exe · Embedded runtime',
        'install.checksums': 'View release & SHA-256 checksums ↗',
        'details.desc': 'The restored layout keeps original evidence and the editable workspace apart, so the next agent can verify requirements, trace sources, and keep working safely.',
        'tree.start': 'Start continuing here',
        'tree.skillsIndex': 'Index of used Skills',
        'tree.bundle': 'Original context & evidence',
        'tree.workspace': 'Workspace to keep editing',
        'tree.skills': 'Scripts, assets & instructions',
        'tree.recovery': 'Verification, paths & omissions',
        'closing.desc': 'Copy the prompt, send it in your current session, and paste the result on any machine.',
        'footer.source': 'Source ↗',
      },
      html: {
        'hero.title': 'Switch machines.<br><span class="grad">Keep the momentum.</span>',
        'art.targetPrompt': 'Restore and continue this task.<br>&lt;complete transfer credentials&gt;',
        'features.title': 'Everything the next agent needs<br>to <span class="hl">keep going</span>.',
        'how.title': 'Three steps.<br>One <span class="hl hl-cyan">continuous</span> task.',
        'install.title': 'Send one prompt.<br>Take your task <span class="hl hl-yellow">anywhere</span>.',
        'install.manualIntro': 'Download the binary for your OS and run <code>install</code> in your terminal.',
        'details.title': 'Leave the machine behind.<br>Keep the <span class="hl hl-pink">evidence</span>.',
        'details.note': 'Encrypted locally.<br>Relays only ever see ciphertext.',
        'closing.title': 'Next window,<br>pick up where you left off.',
      },
      aria: {
        'brand.aria': 'Session Bridge Home',
        'nav.aria': 'Primary navigation',
        'lang.aria': 'Language',
        'star.aria': 'Star Session Bridge on GitHub',
        'art.aria': 'Workflow illustration showing an encrypted bundle carrying a task between two machines',
        'compat.aria': 'Compatibility',
        'install.tabsAria': 'Installation mode',
        'install.copyPromptAria': 'Copy source packaging prompt',
        'install.copyCmdAria': 'Copy install command',
      },
    },
    zh: {
      htmlLang: 'zh-CN',
      title: 'Session Bridge — 换一台电脑，继续同一件事',
      description: 'Session Bridge 把上下文、附件、工作文件和用过的 Skill 一起加密打包，只需一段提示词，让另一台电脑上的任何 harness 原地接续工作。',
      ogTitle: 'Session Bridge — 换一台电脑，继续同一件事',
      ogDescription: '一段提示词带走你的任务。本地加密、断点续传、Windows 与 macOS 单文件零依赖运行。',
      previewSuffix: ' · 预览',
      toastCopyFail: '复制未完成，请选择提示词后手动复制。',
      toastCopiedCommand: '已复制安装命令。',
      toastCopiedPrompt: '已复制，请在源端当前会话中发送。',
      toastStar: '正在前往 GitHub 仓库 — 点击右上角 ★ Star 即可一键支持！',
      motionPause: '暂停动画',
      motionResume: '恢复动画',
      text: {
        skip: '跳到主要内容',
        'nav.features': '核心能力',
        'nav.how': '如何接续',
        'nav.install': '开始使用',
        'star.label': 'Star',
        'star.cta': '去 GitHub 点 Star',
        'hero.badge': '现已支持自适应分片与断点续传',
        'hero.lead': '把当前会话的上下文、附件、工作文件和实际用过的 Skill 一起本地加密打包——只需一段提示词，在另一台电脑、另一个 harness 无缝继续。',
        'hero.copy': '复制打包提示词',
        'hero.chip1': 'Windows & macOS',
        'hero.chip2': '零运行时依赖',
        'hero.chip3': '本地加密上传',
        'art.taskHeading': '把正在做的事带走',
        'art.row1': '任务与下一步',
        'art.row2': '图片与附件',
        'art.row3': '当前工作文件',
        'art.row4': '实际用过的能力',
        'art.terminal': '打包并生成接续提示词',
        'art.packetMeta': '本地加密 · 密文中转',
        'art.targetTitle': '粘贴源端生成的提示词。',
        'art.targetSubtitle': '把它发到目标端的新会话中。',
        'compat.lead': '跨越不同 Agent 工具边界',
        'compat.more': '……以及所有支持读写文件与执行命令的 harness。',
        'features.desc': '普通总结只告诉下一个 Agent 发生了什么；Session Bridge 直接把原始依据、工作文件和已用 Skill 一起带过去。',
        'f1.title': '完整上下文，而非简略摘要',
        'f1.body': '需求、最新修正、关键决策、原始历史、附件与工作文件一同打包迁移，如有遗漏会明确记录。',
        'f2.title': '用过的 Skill 一并同行',
        'f2.body': '按真实使用证据精准识别 Skill，连同脚本、资源与说明一并携带，并在目标端自动注册。',
        'f3.title': '离开本机前先加密',
        'f3.body': '本地完成 age 加密，中转站只保存密文；解密私钥随接续提示词直达接收方，不落第三方服务器。',
        'f4.title': '自动赛马选最快中转',
        'f4.body': '首片密文同时实测 Filebin 与 Temp.sh 的上传与回读，谁先校验通过就用谁，适配你当前的网络环境。',
        'f5.title': '分片并发 & 断点续传',
        'f5.body': '256 KiB–8 MiB 自适应分片、最高 6 路并发、检查点持久化与 Range 分段缓存，中断后只需补传缺失片段。',
        'f6.title': '单文件开箱即用',
        'f6.body': 'Windows x64 与 macOS 13+ 各自只需一个可执行文件，内嵌 Bun、age 与 Skill 安装器，无需 Node 或 Python。',
        stat1: '段提示词完成交接',
        stat2: '家中转站实时竞速',
        stat3: '额外运行时要安装',
        stat4: '路并发分片加速',
        'how.step1.title': '在源端打包',
        'how.step1.body': '在当前会话发一句话即可：自动安装或复用 Session Bridge，收集上下文、附件、工作区与已用 Skill。',
        'how.step1.tag': '上下文 + 文件 + Skill',
        'how.step2.title': '加密分片中转',
        'how.step2.body': '本地加密后分片上传至实测最快的站点，逐片回读校验通过，输出一段简短的交接提示词。',
        'how.step2.tag': '短提示词 + 完整交接凭证',
        'how.step3.title': '在目标端继续',
        'how.step3.body': '将提示词发给任意目标端：自动下载、校验、解密并恢复到全新目录，马上接着往下做。',
        'how.step3.tag': '原始证据与工作区分开',
        'install.desc': '把右侧打包提示词发给当前 SOURCE 会话；完成后把生成的短提示词粘贴到 TARGET 即可。',
        'install.point1': '自动安装或复用本地已有 Skill',
        'install.point2': '按当前网络实测自动选择最快中转站',
        'install.point3': '回读校验确认无误后才生成交接提示词',
        'install.guide': '阅读完整安装引导 ↗',
        'install.tabAgent': '在源端打包',
        'install.tabManual': '手动安装',
        'install.promptHeader': '在 SOURCE 当前会话中发送',
        'install.agentPrompt': `请使用 https://github.com/lyzMaster/session-bridge ，按 INSTALL.md 安装或复用，缺少分片和断点恢复能力的旧版先升级。\n将当前 session 的上下文、附件、工作文件和实际用过的 Skill 打包，本地加密后按当前网络实测自动选择中转站，分片上传并回读校验；中断后从原检查点继续。\n成功后只输出一段发给 TARGET 的简短接续提示词：一句“恢复并继续这个任务”、项目地址和完整交接凭证（压成一行）。不要附安装步骤、命令或格式说明；仅在有关键缺失或过期时间时简短补充。`,
        'install.flowLeft': 'SOURCE → 打包并上传',
        'install.flowRight': 'TARGET → 粘贴后继续',
        'install.panelCopy': '复制并打包当前会话',
        'install.macosSub': 'Apple Silicon / Intel · macOS 13+',
        'install.winSub': '单文件 .exe · 内嵌运行时',
        'install.checksums': '查看版本与 SHA-256 校验值 ↗',
        'details.desc': '恢复目录结构清晰，原始证据与可编辑工作区严格隔离，方便下一个 Agent 查证需求、追溯来源并安全续写。',
        'tree.start': '从这里接续',
        'tree.skillsIndex': '已用能力索引',
        'tree.bundle': '原始上下文与证据',
        'tree.workspace': '继续修改的工作区',
        'tree.skills': '脚本、资源与说明',
        'tree.recovery': '校验、路径与缺失报告',
        'closing.desc': '复制提示词在当前会话发送，然后把结果粘贴到任何一台新电脑上。',
        'footer.source': '源码 ↗',
      },
      html: {
        'hero.title': '换一台电脑，<br><span class="grad">继续同一件事。</span>',
        'art.targetPrompt': '恢复并继续这个任务。<br>〈附源端生成的完整交接凭证〉',
        'features.title': '带走的不是摘要，<br>而是<span class="hl">继续干活的条件</span>。',
        'how.title': '只需三步，<br>任务<span class="hl hl-cyan">原地复活</span>。',
        'install.title': '源端发一句话，<br>把任务带到<span class="hl hl-yellow">任何地方</span>。',
        'install.manualIntro': '下载对应系统二进制文件，在终端中执行 <code>install</code>。',
        'details.title': '离开的是环境，<br>留下的是<span class="hl hl-pink">完整依据</span>。',
        'details.note': '加密在本地完成。<br>中转站接收到的是密文。',
        'closing.title': '下一个窗口，<br>接着上一步。',
      },
      aria: {
        'brand.aria': 'Session Bridge 首页',
        'nav.aria': '主导航',
        'lang.aria': '语言切换',
        'star.aria': '在 GitHub 上为 Session Bridge 点 Star',
        'art.aria': '任务在两台电脑之间通过加密包接续的流程示意',
        'compat.aria': '兼容说明',
        'install.tabsAria': '安装方式',
        'install.copyPromptAria': '复制源端打包提示词',
        'install.copyCmdAria': '复制安装命令',
      },
    },
  };

  function normalizeLang(tag) {
    if (!tag || typeof tag !== 'string') return null;
    const lower = tag.trim().toLowerCase().replace(/_/g, '-');
    if (lower === 'zh' || lower.startsWith('zh-')) return 'zh';
    if (lower === 'en' || lower.startsWith('en-')) return 'en';
    return null;
  }

  function detectLanguage() {
    const query = normalizeLang(new URLSearchParams(window.location.search).get('lang'));
    if (query) return query;
    try {
      const saved = normalizeLang(localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch {}
    const list = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language || navigator.userLanguage || ''];
    for (const entry of list) {
      const matched = normalizeLang(entry);
      if (matched) return matched;
      // Default non-English / non-Chinese primary device languages to English.
      if (entry && entry.trim()) return 'en';
    }
    return 'en';
  }

  let lang = detectLanguage();
  let latestRelease = null;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionToggle = document.querySelector('[data-motion-toggle]');

  function renderVersion() {
    if (!latestRelease) return;
    const suffix = latestRelease.published ? '' : I18N[lang].previewSuffix;
    document.querySelectorAll('[data-version]').forEach(el => {
      el.textContent = 'v' + latestRelease.version + suffix;
    });
  }

  function renderMotionLabel() {
    if (!motionToggle) return;
    const paused = document.documentElement.classList.contains('paused');
    motionToggle.textContent = paused ? I18N[lang].motionResume : I18N[lang].motionPause;
  }

  function applyLanguage(nextLang) {
    lang = Object.prototype.hasOwnProperty.call(I18N, nextLang) ? nextLang : 'en';
    const dict = I18N[lang];
    document.documentElement.lang = dict.htmlLang;
    document.title = dict.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', dict.description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', dict.ogTitle);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', dict.ogDescription);

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = dict.text[el.dataset.i18n];
      if (typeof val === 'string') el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const val = dict.html[el.dataset.i18nHtml];
      if (typeof val === 'string') el.innerHTML = val;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const val = dict.aria[el.dataset.i18nAria];
      if (typeof val === 'string') el.setAttribute('aria-label', val);
    });
    document.querySelectorAll('[data-lang]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    });
    renderVersion();
    renderMotionLabel();
  }

  applyLanguage(lang);

  document.querySelectorAll('[data-lang]').forEach(button => {
    button.addEventListener('click', () => {
      const chosen = button.dataset.lang;
      try { localStorage.setItem(STORAGE_KEY, chosen); } catch {}
      applyLanguage(chosen);
    });
  });

  // Scroll reveal animations (progressive enhancement with reduced-motion respect)
  const reveals = [...document.querySelectorAll('.reveal')];
  if (!reducedMotion && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('motion');
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('in'));
  }

  if (motionToggle) {
    if (reducedMotion) motionToggle.hidden = true;
    motionToggle.addEventListener('click', () => {
      const paused = document.documentElement.classList.toggle('paused');
      if (paused) reveals.forEach(el => el.classList.add('in'));
      renderMotionLabel();
    });
  }

  const commands = {
    macos: 'chmod +x ./session-bridge-macos-universal\n./session-bridge-macos-universal install',
    windows: '.\\session-bridge-windows-x64.exe install',
  };
  let os = 'macos', timer;
  const toast = message => {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => { el.hidden = true; }, 3200);
  };
  async function copy(text, message) {
    try { await navigator.clipboard.writeText(text); toast(message); }
    catch {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(input);
      input.select();
      const ok = document.execCommand('copy');
      input.remove();
      toast(ok ? message : I18N[lang].toastCopyFail);
    }
  }
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => {
    const isCommand = button.dataset.copy === 'command';
    const text = isCommand ? commands[os] : document.getElementById('agent-prompt').textContent.trim();
    copy(text, isCommand ? I18N[lang].toastCopiedCommand : I18N[lang].toastCopiedPrompt);
  }));

  function burstStars(origin) {
    if (reducedMotion || document.documentElement.classList.contains('paused')) return;
    const rect = origin.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = ['#ff4fa3', '#ff8a3d', '#ffd23f', '#7bdc4c', '#33c9ff', '#8b5cf6'];
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const dist = 36 + (i % 2) * 18;
      const el = document.createElement('span');
      el.className = 'star-burst';
      el.textContent = i % 2 === 0 ? '★' : '✦';
      el.style.left = cx + 'px';
      el.style.top = cy + 'px';
      el.style.color = colors[i % colors.length];
      el.style.setProperty('--tx', Math.round(Math.cos(angle) * dist) + 'px');
      el.style.setProperty('--ty', Math.round(Math.sin(angle) * dist) + 'px');
      el.style.setProperty('--tr', (i % 2 === 0 ? 140 : -140) + 'deg');
      document.body.append(el);
      setTimeout(() => el.remove(), 800);
    }
  }

  document.querySelectorAll('[data-star]').forEach(link => {
    link.addEventListener('click', () => {
      burstStars(link);
      toast(I18N[lang].toastStar);
    });
  });

  fetch('https://api.github.com/repos/lyzMaster/session-bridge').then(r => {
    if (!r.ok) throw new Error('GitHub API unavailable');
    return r.json();
  }).then(repo => {
    if (typeof repo?.stargazers_count === 'number') {
      const formatted = repo.stargazers_count >= 1000
        ? (repo.stargazers_count / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
        : String(repo.stargazers_count);
      document.querySelectorAll('[data-star-count]').forEach(el => {
        el.textContent = formatted;
        el.hidden = false;
      });
    }
  }).catch(() => { /* Star buttons keep working without live count. */ });

  const tabs = [...document.querySelectorAll('[data-tab]')];
  function selectTab(button) {
    tabs.forEach(tab => {
      const selected = tab === button;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        selectTab(next);
        next.focus();
      }
    });
  });
  document.querySelectorAll('[data-os]').forEach(button => button.addEventListener('click', () => {
    os = button.dataset.os;
    document.getElementById('manual-command').textContent = commands[os];
    document.querySelectorAll('[data-os]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  }));
  fetch('./release.json').then(response => {
    if (!response.ok) throw new Error('Release metadata unavailable');
    return response.json();
  }).then(release => {
    if (!/^\d+\.\d+\.\d+$/.test(release.version) || release.repository !== 'lyzMaster/session-bridge') throw new Error('Invalid release metadata');
    latestRelease = release;
    renderVersion();
    if (!release.published) return;
    document.querySelectorAll('[data-download]').forEach(link => {
      const artifact = release.platforms[link.dataset.download];
      if (artifact && artifact.url === `https://github.com/lyzMaster/session-bridge/releases/download/${release.tag}/${artifact.filename}`) {
        link.href = artifact.url;
        link.setAttribute('download', artifact.filename);
      }
    });
    document.querySelector('[data-checksums]').href = `https://github.com/lyzMaster/session-bridge/releases/download/${release.tag}/SHA256SUMS`;
  }).catch(() => { /* Static release links and the agent prompt remain available. */ });
})();
