(() => {
  const STORAGE_KEY = 'session-bridge-lang';
  const I18N = {
    en: {
      htmlLang: 'en',
      title: 'Session Bridge — Switch machines, keep the same task',
      description: 'Bring your context, attachments, workspace files, and used Skills. Session Bridge lets you continue an agent task on another machine and another harness.',
      ogTitle: 'Session Bridge — Switch machines, keep the same task',
      ogDescription: 'One prompt to carry your task. Single-file executables for Windows and macOS, with no extra runtime required.',
      previewSuffix: ' · Preview',
      toastCopyFail: 'Copy failed; please select the prompt and copy manually.',
      toastCopiedCommand: 'Install command copied.',
      toastCopiedPrompt: 'Copied. Send it in your active SOURCE session.',
      text: {
        skip: 'Skip to main content',
        'nav.how': 'How it works',
        'nav.install': 'Get started',
        'nav.faq': 'FAQ',
        'hero.copy': 'Copy packaging prompt',
        'hero.noRuntime': 'No Node · Bun · Python',
        'art.taskHeading': 'Pack your work in progress',
        'art.row1': 'Task & next steps',
        'art.row2': 'Images & attachments',
        'art.row3': 'Current work files',
        'art.row4': 'Skills actually used',
        'art.terminal': 'Bundle & generate prompt',
        'art.packetMeta': 'Encrypted locally · Ciphertext relay',
        'art.targetTitle': 'Paste the generated prompt.',
        'art.targetSubtitle': 'Send it in a new session on target.',
        'art.caption': 'Workflow overview · Works across machines & harnesses',
        'compat.lead': 'Carry work across tool boundaries',
        'how.step1.title': 'Package on source',
        'how.step1.body': 'Keep requirements, latest corrections, decisions, and next steps, while collecting available history, attachments, workspace files, and used Skills.',
        'how.step1.tag': 'Context + Files + Skills',
        'how.step2.title': 'Copy target prompt',
        'how.step2.body': 'Probe available relays for your current network, upload encrypted parts, verify readback, and return a short continuation prompt.',
        'how.step2.tag': 'Short instruction + full credentials',
        'how.step3.title': 'Continue on target',
        'how.step3.body': 'Download, verify, decrypt, and restore into a fresh directory. Read the handoff and carried Skills, then resume work.',
        'how.step3.tag': 'Raw evidence & workspace separated',
        'install.tabAgent': 'Pack on source',
        'install.tabManual': 'Manual install',
        'install.promptHeader': 'Send in your active SOURCE session',
        'install.agentPrompt': `Use https://github.com/lyzMaster/session-bridge following INSTALL.md to install or reuse Session Bridge, upgrading older versions that lack multipart and checkpoint resume support.\nPackage the current session's context, attachments, workspace files, and Skills actually used, encrypt locally, automatically select a relay by live upload/readback probing, upload in parts with readback verification, and resume from the saved checkpoint if interrupted.\nOnce verified, output only a concise continuation prompt for TARGET: a line saying "Restore and continue this task", the project URL, and the complete transfer credential block (compacted onto one line). Omit install steps, commands, or format notes; add only brief remarks if critical items are missing or about expiry.`,
        'install.flowLeft': 'SOURCE → Package & upload',
        'install.flowRight': 'TARGET → Paste & continue',
        'install.macosSub': 'Apple Silicon / Intel · macOS 13+',
        'install.winSub': 'Single-file .exe · Embedded runtime',
        'install.checksums': 'View release & SHA-256 checksums ↗',
        'details.desc': 'The restored layout stays clean so an Agent can verify requirements, inspect original evidence, and keep editing in an isolated workspace.',
        'tree.start': 'Start continuing here',
        'tree.skillsIndex': 'Index of used Skills',
        'tree.bundle': 'Original context & evidence',
        'tree.workspace': 'Workspace to keep editing',
        'tree.skills': 'Scripts, assets & instructions',
        'tree.recovery': 'Verification, paths & omissions',
        'faq.title': 'Before you start, good to know.',
        'faq.issue': 'More questions? Open an Issue ↗',
        'faq.q1': 'Can any harness restore the full session?',
        'faq.a1': 'Restoration uses portable files and handoff instructions. Coverage depends on the history, attachments, and files exposed by the source harness; any omissions are recorded in the report. The target harness needs download, file read/write, and command execution capabilities. Hidden reasoning, internal model state, active processes, and login sessions do not migrate.',
        'faq.q2': 'Do I need Bun, Node, or age installed first?',
        'faq.a2': 'Not when using the released standalone executables. The macOS and Windows bootstraps rely solely on built-in OS tools, and the binary embeds Bun, age encryption, and the Skills installer. External runtimes, third-party packages, or MCP permissions required by carried Skills themselves must still exist on the target machine.',
        'faq.q3': 'How does it ensure installation into the current harness instead of another tool?',
        'faq.a3': 'The installer checks active runtime signals and upstream directory conventions, prioritizing explicit targets or paths. When unidentified, ambiguous across multiple candidates, or conflicting among strong signals, it asks you to specify explicitly rather than installing into every detected tool. Run detect-harness to preview the selection.',
        'faq.q4': 'How long do the continuation prompt and temporary files last?',
        'faq.a4': 'The continuation prompt contains both download locators and the decryption private key, so share it only with the recipient. By default, live upload and readback are measured against Filebin and Temp.sh, picking whichever passes verification first. Filebin retention follows the server response (usually ~7 days); Temp.sh uses an estimated 3-day policy. Deleting a public entry cannot revoke copies someone already downloaded; the project homepage never stores your bundles or keys.',
        'faq.q5': 'Will an existing local installation be overwritten?',
        'faq.a5': 'Healthy compatible installations pass checksum and local doctor verification and are reused untouched. Damaged managed installations are backed up before repair. Older versions lacking multipart resume support are backed up and upgraded automatically; installations already meeting the capability check are reused. Healthy shared directory symlinks are reused read-only without replacing through the link.',
      },
      html: {
        'hero.title': 'Switch machines,<br>keep the <span class="underlined">same task</span>.',
        'hero.lead': 'Bring your context, attachments, workspace files, and used Skills.<br class="desktop-break">One prompt to pick up in another harness.',
        'art.targetPrompt': 'Restore and continue this task.<br>&lt;with complete transfer credentials&gt;',
        'compat.more': 'and any harness with files &amp; commands <span aria-hidden="true">↗</span>',
        'how.title': 'Bring the progress,<br>and what it takes to continue.',
        'how.desc': 'The handoff tells the Agent what to do.<br>Raw evidence and Skills let it actually continue.',
        'install.title': 'Send one prompt on source,<br>take your task anywhere.',
        'install.desc': 'Send the packaging prompt in your active SOURCE session.<br>Once ready, paste the short output into TARGET.',
        'install.point1': '<i>✓</i> Auto-install or reuse existing Skill',
        'install.point2': '<i>✓</i> Live-probe relays for your current network',
        'install.point3': '<i>✓</i> Return a target prompt after readback verification',
        'install.guide': 'Read full setup guide <span aria-hidden="true">↗</span>',
        'install.panelCopy': 'Copy to package current session <span aria-hidden="true">↗</span>',
        'install.manualIntro': 'Download the binary for your OS and run <code>install</code> in your terminal.',
        'details.title': 'Leave the machine behind,<br>keep the basis for the work.',
        'details.note': 'Encrypted locally.<br>Relays only ever see ciphertext.',
        'closing.title': 'Next window,<br>pick up where you left off.',
        'footer.source': 'Source <span aria-hidden="true">↗</span>',
      },
      aria: {
        'brand.aria': 'Session Bridge Home',
        'nav.aria': 'Primary navigation',
        'lang.aria': 'Language',
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
      description: '把上下文、附件、工作文件和用过的 Skill 一起带走。Session Bridge 让你在另一台电脑、另一个 harness 中继续 agent 任务。',
      ogTitle: 'Session Bridge — 换一台电脑，继续同一件事',
      ogDescription: '一段提示词，带走任务。Windows 与 macOS 单文件，无需额外运行环境。',
      previewSuffix: ' · 预览',
      toastCopyFail: '复制未完成，请选择提示词后手动复制。',
      toastCopiedCommand: '已复制安装命令。',
      toastCopiedPrompt: '已复制，请在源端当前会话中发送。',
      text: {
        skip: '跳到主要内容',
        'nav.how': '如何接续',
        'nav.install': '开始使用',
        'nav.faq': '常见问题',
        'hero.copy': '复制打包提示词',
        'hero.noRuntime': '无需 Node · Bun · Python',
        'art.taskHeading': '把正在做的事带走',
        'art.row1': '任务与下一步',
        'art.row2': '图片与附件',
        'art.row3': '当前工作文件',
        'art.row4': '实际用过的能力',
        'art.terminal': '打包并生成接续提示词',
        'art.packetMeta': '本地加密 · 密文中转',
        'art.targetTitle': '粘贴源端生成的提示词。',
        'art.targetSubtitle': '把它发到目标端的新会话中。',
        'art.caption': '工作流示意 · 支持不同电脑与 harness',
        'compat.lead': '让任务跨过工具的边界',
        'how.step1.title': '在源端打包',
        'how.step1.body': '保留需求、最新修正、决策与下一步，收集可获得的历史、附件、工作文件及已用 Skill。',
        'how.step1.tag': '上下文 + 文件 + Skill',
        'how.step2.title': '复制目标端提示词',
        'how.step2.body': '源端实测选择当前网络可用的中转站，加密分片上传，校验成功后返回简短的接续提示词。',
        'how.step2.tag': '一句接续说明 + 完整交接凭证',
        'how.step3.title': '在目标端继续',
        'how.step3.body': '下载、校验、解密，恢复到新目录。先读接续说明和相关 Skill，再接着完成任务。',
        'how.step3.tag': '原始证据与工作区分开',
        'install.tabAgent': '在源端打包',
        'install.tabManual': '手动安装',
        'install.promptHeader': '在 SOURCE 当前会话中发送',
        'install.agentPrompt': `请使用 https://github.com/lyzMaster/session-bridge ，按 INSTALL.md 安装或复用，缺少分片和断点恢复能力的旧版先升级。\n将当前 session 的上下文、附件、工作文件和实际用过的 Skill 打包，本地加密后按当前网络实测自动选择中转站，分片上传并回读校验；中断后从原检查点继续。\n成功后只输出一段发给 TARGET 的简短接续提示词：一句“恢复并继续这个任务”、项目地址和完整交接凭证（压成一行）。不要附安装步骤、命令或格式说明；仅在有关键缺失或过期时间时简短补充。`,
        'install.flowLeft': 'SOURCE → 打包并上传',
        'install.flowRight': 'TARGET → 粘贴后继续',
        'install.macosSub': 'Apple Silicon / Intel · macOS 13+',
        'install.winSub': '单文件 .exe · 内嵌运行时',
        'install.checksums': '查看版本与 SHA-256 校验值 ↗',
        'details.desc': '恢复后的文件结构保持清晰，方便 Agent 查证需求、追踪原始资料，并在独立工作区继续修改。',
        'tree.start': '从这里接续',
        'tree.skillsIndex': '已用能力索引',
        'tree.bundle': '原始上下文与证据',
        'tree.workspace': '继续修改的工作区',
        'tree.skills': '脚本、资源与说明',
        'tree.recovery': '校验、路径与缺失报告',
        'faq.title': '开始之前，你可能想知道。',
        'faq.issue': '还有问题？提交 Issue ↗',
        'faq.q1': '任意 harness 都能恢复完整会话吗？',
        'faq.a1': '使用通用文件和接续说明恢复工作。完整程度取决于源端能提供哪些历史、附件和文件；缺失会记录在报告中。目标端需要能下载、读写文件并执行命令。隐藏推理、模型内部状态、活动进程与登录权限不会迁移。',
        'faq.q2': '需要先安装 Bun、Node 或 age 吗？',
        'faq.a2': '使用发布的单文件程序时无需额外安装这些环境。Mac 和 Windows 引导使用系统自带工具，程序内部包含 Bun、加密与 Skill 安装能力。其他 Skill 自身依赖的原生工具、第三方包或 MCP 权限仍需目标端具备。',
        'faq.q3': '怎样保证装到当前 harness，而不是其他工具？',
        'faq.a3': '安装器使用当前运行信号和上游目录规则，明确的目标或目录优先。无法识别、多个候选或强信号冲突时，会要求显式指定，不向所有检测到的产品安装。使用 detect-harness 可以先预览选择。',
        'faq.q4': '交接提示词和临时文件会保留多久？',
        'faq.a4': '交接提示词包含下载信息与解密私钥，请只交给接收方。默认实测 Filebin 与 Temp.sh 的上传和回读，选择先通过校验的站点。Filebin 期限以服务响应为准，通常约七天；Temp.sh 三天期限按策略估计。删除下载入口无法撤回别人已经下载的副本；项目主页不保存你的任务包或密钥。',
        'faq.q5': '本地已经装过，会被覆盖吗？',
        'faq.a5': '可用版本会通过文件校验和本地健康检查，直接复用而不改文件。受管理的损坏安装会先备份再修复。新流程会先备份、升级缺少分片恢复能力的旧版；能力已满足则直接复用。健康共享目录链接只读复用，不通过链接替换。',
      },
      html: {
        'hero.title': '换一台电脑，<br>继续<span class="underlined">同一件事</span>。',
        'hero.lead': '把上下文、附件、工作文件和用过的 Skill 一起带走。<br class="desktop-break">一段提示词，在另一个 harness 接着做。',
        'art.targetPrompt': '恢复并继续这个任务。<br>〈附源端生成的完整交接凭证〉',
        'compat.more': '以及支持文件与命令的 harness <span aria-hidden="true">↗</span>',
        'how.title': '带走进度，<br>也带走继续工作的条件。',
        'how.desc': '接续说明告诉 Agent 要做什么。<br>原始资料与 Skill 帮它真正做下去。',
        'install.title': '在源端发一句话，<br>把当前任务带走。',
        'install.desc': '在 SOURCE 当前会话中发送打包提示词。<br>完成后，把生成的短提示词发到 TARGET。',
        'install.point1': '<i>✓</i> 自动安装或复用已有 Skill',
        'install.point2': '<i>✓</i> 按当前网络实测选择中转站',
        'install.point3': '<i>✓</i> 上传成功后，返回目标端接续提示词',
        'install.guide': '阅读完整安装引导 <span aria-hidden="true">↗</span>',
        'install.panelCopy': '复制，去打包当前会话 <span aria-hidden="true">↗</span>',
        'install.manualIntro': '下载对应文件，在终端中执行 <code>install</code>。',
        'details.title': '离开的是环境，<br>留下的是工作依据。',
        'details.note': '加密在本地完成。<br>中转站接收到的是密文。',
        'closing.title': '下一个窗口，<br>接着上一步。',
        'footer.source': '源码 <span aria-hidden="true">↗</span>',
      },
      aria: {
        'brand.aria': 'Session Bridge 首页',
        'nav.aria': '主导航',
        'lang.aria': '语言切换',
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

  function renderVersion() {
    if (!latestRelease) return;
    const suffix = latestRelease.published ? '' : I18N[lang].previewSuffix;
    document.querySelectorAll('[data-version]').forEach(el => {
      el.textContent = 'v' + latestRelease.version + suffix;
    });
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
  }

  applyLanguage(lang);

  document.querySelectorAll('[data-lang]').forEach(button => {
    button.addEventListener('click', () => {
      const chosen = button.dataset.lang;
      try { localStorage.setItem(STORAGE_KEY, chosen); } catch {}
      applyLanguage(chosen);
    });
  });

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
    timer = setTimeout(() => { el.hidden = true; }, 3000);
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
