(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const csrfToken = () => (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
  const renderIcons = () => { if (window.lucide) window.lucide.createIcons(); };
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function postJSON(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken(),
        'X-Requested-With': 'fetch',
      },
      body: JSON.stringify(body || {}),
    });
    let data = {};
    try { data = await response.json(); } catch (error) { data = {}; }
    return { ok: response.ok, status: response.status, data };
  }

  function toast(message, type = 'info') {
    const stack = $('#toastStack');
    if (!stack) return;
    const icon = { success: 'circle-check', error: 'circle-alert', info: 'info' }[type] || 'info';
    const element = document.createElement('div');
    element.className = `toast ms-toast ms-toast-${type}`;
    element.setAttribute('role', 'status');
    element.innerHTML = `<div class="toast-body"><i data-lucide="${icon}"></i><span></span></div>`;
    element.querySelector('span').textContent = message;
    stack.appendChild(element);
    renderIcons();
    element.addEventListener('hidden.bs.toast', () => element.remove());
    new bootstrap.Toast(element, { delay: 3500 }).show();
  }

  const storage = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch (error) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { return; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (error) { return; }
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderIcons();
    $$('[data-flash]').forEach((element) => new bootstrap.Toast(element, { delay: 4000 }).show());
    initTheme();
    initConfirmForms();
    initCopyButtons();
    initDeleteModal();
    initFavorites();
    initFilters();
    initNoteForm();
    initOnboarding();
  });

  function initTheme() {
    if (!window.MemoTheme) return;
    const options = $$('[data-theme-option]');

    function sync() {
      const current = window.MemoTheme.get();
      options.forEach((button) => {
        button.setAttribute('aria-checked', button.dataset.themeOption === current ? 'true' : 'false');
      });
    }

    options.forEach((button) => {
      button.addEventListener('click', () => window.MemoTheme.set(button.dataset.themeOption));
    });

    const cycle = $('[data-theme-cycle]');
    if (cycle) {
      const order = ['system', 'light', 'dark'];
      cycle.addEventListener('click', () => {
        const next = order[(order.indexOf(window.MemoTheme.get()) + 1) % order.length];
        window.MemoTheme.set(next);
        const labels = { system: 'mengikuti perangkat', light: 'terang', dark: 'gelap' };
        toast(`Tampilan ${labels[next]}.`, 'info');
      });
    }

    document.addEventListener('memospace:themechange', sync);
    sync();
  }

  function initConfirmForms() {
    document.addEventListener('submit', (event) => {
      const message = event.target.getAttribute && event.target.getAttribute('data-confirm');
      if (message && !window.confirm(message)) event.preventDefault();
    });
  }

  function initCopyButtons() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy]');
      if (!button) return;
      const target = $(button.getAttribute('data-copy'));
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        toast('Kode disalin ke clipboard.', 'success');
      } catch (error) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        toast('Tekan Ctrl+C untuk menyalin kode.', 'info');
      }
    });
  }

  function initDeleteModal() {
    const modalElement = $('#deleteModal');
    if (!modalElement) return;
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    const form = $('#deleteForm');

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-url]');
      if (!button) return;
      form.setAttribute('action', button.getAttribute('data-delete-url'));
      $('#deleteNoteTitle').textContent = button.getAttribute('data-delete-title') || '';
      const submit = form.querySelector('[type="submit"]');
      if (submit) submit.disabled = false;
      modal.show();
    });

    form.addEventListener('submit', (event) => {
      const submit = event.target.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
    });
  }

  function initFavorites() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-fav-url]');
      if (!button || button.dataset.busy) return;
      button.dataset.busy = '1';
      try {
        const { ok, data } = await postJSON(button.getAttribute('data-fav-url'));
        if (!ok) throw new Error(data.error || 'Gagal memperbarui favorit.');
        button.classList.toggle('active', data.is_favorite);
        button.setAttribute('aria-pressed', data.is_favorite ? 'true' : 'false');
        button.classList.remove('pop');
        void button.offsetWidth;
        button.classList.add('pop');
        toast(data.is_favorite ? 'Ditambahkan ke favorit.' : 'Dihapus dari favorit.', 'success');
        const favoriteFilter = $('#favToggle');
        if (favoriteFilter && favoriteFilter.checked && window.__msRefresh) window.__msRefresh();
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        delete button.dataset.busy;
      }
    });
  }

  function initFilters() {
    const form = $('#filterForm');
    if (!form) return;

    const results = $('#notesResults');
    const search = $('#searchInput');
    const modeSingle = $('#modeSingle');
    const groupSingle = $('#groupSingle');
    const groupRange = $('#groupRange');
    const categoryInput = $('#categoryInput');
    const panelElement = $('#filterPanel');
    const dateFields = ['date', 'start', 'end', 'time_from', 'time_to'];
    let controller = null;
    let timer = null;

    const closePanel = () => {
      const panel = bootstrap.Offcanvas.getInstance(panelElement);
      if (panel) panel.hide();
    };

    function syncMode() {
      const single = modeSingle.checked;
      groupSingle.classList.toggle('d-none', !single);
      groupRange.classList.toggle('d-none', single);
      $$('input', groupSingle).forEach((input) => { input.disabled = !single; });
      $$('input', groupRange).forEach((input) => { input.disabled = single; });
    }

    function updateBadge() {
      const value = (name) => {
        const element = form.elements[name];
        return element && !element.disabled && element.value;
      };
      const count = (value('date') || value('start') || value('end') ? 1 : 0)
        + (value('time_from') || value('time_to') ? 1 : 0);
      const trigger = $('.ms-filter-btn');
      let badge = $('.ms-badge-dot', trigger);
      if (count && !badge) {
        badge = document.createElement('span');
        badge.className = 'ms-badge-dot';
        trigger.appendChild(badge);
      }
      if (badge) {
        if (count) badge.textContent = count;
        else badge.remove();
      }
    }

    function buildParams() {
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form).entries()) {
        if (key === 'date_mode' || key === 'csrf_token' || value === '') continue;
        params.append(key, value);
      }
      if (params.get('sort') === 'newest') params.delete('sort');
      return params;
    }

    async function refresh() {
      clearTimeout(timer);
      syncMode();
      updateBadge();
      const query = buildParams().toString();
      const url = query ? `${location.pathname}?${query}` : location.pathname;
      if (controller) controller.abort();
      controller = new AbortController();
      results.style.opacity = '.55';
      try {
        const response = await fetch(url, {
          headers: { 'X-Requested-With': 'fetch' },
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('bad response');
        results.innerHTML = await response.text();
        history.replaceState(null, '', url);
        renderIcons();
      } catch (error) {
        if (error.name === 'AbortError') return;
        location.href = url;
      } finally {
        results.style.opacity = '';
      }
    }

    window.__msRefresh = refresh;

    function clearDateFields() {
      dateFields.forEach((name) => { form.elements[name].value = ''; });
    }

    function clearAll() {
      search.value = '';
      clearDateFields();
      categoryInput.value = '';
      $('#favToggle').checked = false;
      $$('.ms-chip[data-category]').forEach((chip) => chip.classList.toggle('active', chip.dataset.category === ''));
      refresh();
    }

    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      refresh();
      closePanel();
    });

    $('#sortSelect').addEventListener('change', refresh);
    $('#favToggle').addEventListener('change', refresh);
    modeSingle.addEventListener('change', syncMode);
    $('#modeRange').addEventListener('change', syncMode);

    $('#filterReset').addEventListener('click', () => {
      clearDateFields();
      refresh();
      closePanel();
    });

    $$('.ms-chip[data-category]').forEach((chip) => {
      chip.addEventListener('click', (event) => {
        event.preventDefault();
        categoryInput.value = chip.dataset.category;
        $$('.ms-chip[data-category]').forEach((item) => item.classList.toggle('active', item === chip));
        refresh();
      });
    });

    results.addEventListener('click', (event) => {
      if (event.target.closest('#clearAll, #clearAllEmpty')) clearAll();
    });

    form.elements.start.addEventListener('change', () => {
      form.elements.end.min = form.elements.start.value;
    });

    syncMode();
  }

  function initNoteForm() {
    const form = $('#noteForm');
    if (!form) return;

    const title = $('#noteTitle');
    const content = $('#noteContent');
    const category = $('#noteCategory');
    const counter = $('#charCount');
    const status = $('#saveStatus');
    const titleError = $('#titleError');
    const autosaveUrl = form.dataset.autosaveUrl;
    const draftKey = form.dataset.draftKey;
    let saveTimer = null;
    let saving = false;
    let queued = false;
    let dirty = false;
    let submitting = false;

    const updateCount = () => { counter.textContent = content.value.length.toLocaleString('id-ID'); };
    updateCount();

    function setStatus(kind, html) {
      status.className = `ms-save-status ${kind}`;
      status.innerHTML = html;
      renderIcons();
    }

    function validateTitle() {
      if (!title.value.trim()) {
        title.classList.add('is-invalid');
        titleError.textContent = 'Judul wajib diisi.';
        return false;
      }
      title.classList.remove('is-invalid');
      titleError.textContent = '';
      return true;
    }

    async function autosave() {
      if (!autosaveUrl || submitting) return;
      if (!title.value.trim()) {
        setStatus('error', '<i data-lucide="circle-alert"></i> Isi judul agar bisa disimpan');
        return;
      }
      if (saving) {
        queued = true;
        return;
      }
      saving = true;
      queued = false;
      setStatus('saving', '<i data-lucide="loader-2"></i> Menyimpan');
      try {
        const { ok, data } = await postJSON(autosaveUrl, {
          title: title.value,
          content: content.value,
          category_id: category ? category.value : null,
        });
        if (!ok) throw new Error('save failed');
        dirty = false;
        setStatus('saved', `<i data-lucide="cloud-check"></i> Tersimpan pukul ${data.saved_at}`);
      } catch (error) {
        setStatus('error', '<i data-lucide="cloud-off"></i> Gagal menyimpan otomatis');
      } finally {
        saving = false;
        if (queued) autosave();
      }
    }

    function saveDraft() {
      if (!draftKey) return;
      if (!title.value && !content.value) {
        storage.remove(draftKey);
        return;
      }
      storage.set(draftKey, {
        title: title.value,
        content: content.value,
        category: category ? category.value : '',
      });
      setStatus('saved', '<i data-lucide="hard-drive"></i> Draf tersimpan di perangkat ini');
    }

    function onInput() {
      dirty = true;
      updateCount();
      if (title.value.trim()) {
        title.classList.remove('is-invalid');
        titleError.textContent = '';
      }
      clearTimeout(saveTimer);
      if (autosaveUrl) {
        setStatus('saving', '<i data-lucide="pencil-line"></i> Mengetik');
        saveTimer = setTimeout(autosave, 1200);
      } else if (draftKey) {
        saveTimer = setTimeout(saveDraft, 500);
      }
    }

    [title, content, category].forEach((element) => {
      if (element) element.addEventListener('input', onInput);
    });

    if (draftKey) {
      const draft = storage.get(draftKey);
      const banner = $('#draftBanner');
      if (title.value || content.value) {
        saveDraft();
      } else if (draft && (draft.title || draft.content) && banner) {
        banner.classList.remove('d-none');
        $('#draftRestore').addEventListener('click', () => {
          title.value = draft.title || '';
          content.value = draft.content || '';
          if (category && draft.category) category.value = draft.category;
          banner.classList.add('d-none');
          updateCount();
          title.focus();
        });
        $('#draftDiscard').addEventListener('click', () => {
          storage.remove(draftKey);
          banner.classList.add('d-none');
        });
      }
    }

    form.addEventListener('submit', (event) => {
      if (!validateTitle()) {
        event.preventDefault();
        title.focus();
        return;
      }
      if (submitting) {
        event.preventDefault();
        return;
      }
      submitting = true;
      clearTimeout(saveTimer);
      if (draftKey) storage.remove(draftKey);
      $('#saveBtn').disabled = true;
    });

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    window.addEventListener('beforeunload', (event) => {
      if (autosaveUrl && dirty && !submitting) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && autosaveUrl && dirty) {
        clearTimeout(saveTimer);
        autosave();
      }
    });
  }

  function initOnboarding() {
    const root = $('#onboarding');
    if (!root) return;

    const STORAGE_KEY = 'memospace:onboarding';
    const frames = {};
    $$('.ms-frame', root).forEach((frame) => { frames[frame.dataset.frame] = frame; });
    const nameInput = $('#obName');
    const birthInput = $('#obBirth');
    const loader = $('#obLoader');
    const codeInput = $('#obCode');
    let current = '1';
    let submitting = false;

    const today = new Date();
    birthInput.max = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    const normalizedName = () => nameInput.value.trim().replace(/\s+/g, ' ');

    function persist() {
      if (submitting) return;
      storage.set(STORAGE_KEY, {
        step: current === '2' ? '2' : '1',
        name: nameInput.value,
        birth: birthInput.value,
      });
    }

    function show(id) {
      const from = frames[current];
      const to = frames[id];
      if (!to || from === to) return;

      const reveal = () => {
        from.hidden = true;
        from.classList.remove('ms-frame-out');
        to.hidden = false;
        to.classList.remove('ms-frame-in');
        void to.offsetWidth;
        to.classList.add('ms-frame-in');
        current = id;
        const field = to.querySelector('input');
        if (field) setTimeout(() => field.focus({ preventScroll: true }), 60);
        persist();
      };

      if (reducedMotion()) {
        reveal();
      } else {
        from.classList.add('ms-frame-out');
        setTimeout(reveal, 200);
      }
    }

    function fieldError(selector, message) {
      const element = $(selector);
      element.textContent = message || '';
      const input = element.previousElementSibling;
      if (input && input.tagName === 'INPUT') input.classList.toggle('is-invalid', Boolean(message));
      if (message) {
        const frame = element.closest('.ms-frame');
        frame.classList.remove('ms-shake');
        void frame.offsetWidth;
        frame.classList.add('ms-shake');
      }
    }

    const saved = storage.get(STORAGE_KEY);
    if (saved) {
      nameInput.value = saved.name || '';
      birthInput.value = saved.birth || '';
      if (saved.step === '2' && nameInput.value.trim()) {
        frames['1'].hidden = true;
        frames['2'].hidden = false;
        current = '2';
      }
    }
    nameInput.addEventListener('input', persist);
    birthInput.addEventListener('input', persist);
    (frames[current].querySelector('input') || nameInput).focus({ preventScroll: true });

    async function goToDateStep() {
      const name = normalizedName();
      if (!name) return fieldError('#obNameError', 'Nama wajib diisi.');
      if (name.length > 100) return fieldError('#obNameError', 'Nama maksimal 100 karakter.');
      const { ok, data } = await postJSON(root.dataset.validateUrl, { step: 1, name });
      if (!ok || !data.ok) {
        return fieldError('#obNameError', (data.errors && data.errors.name) || 'Nama tidak valid.');
      }
      fieldError('#obNameError', '');
      show('2');
    }

    $('#obNext1').addEventListener('click', goToDateStep);
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        goToDateStep();
      }
    });
    nameInput.addEventListener('input', () => fieldError('#obNameError', ''));

    async function finish(skipBirth) {
      if (submitting) return;
      const birth = skipBirth ? '' : birthInput.value;
      if (birth && birth > birthInput.max) {
        return fieldError('#obBirthError', 'Tanggal lahir tidak boleh di masa depan.');
      }
      submitting = true;
      loader.hidden = false;

      const release = () => {
        submitting = false;
        loader.hidden = true;
      };

      try {
        const { ok, data } = await postJSON(root.dataset.completeUrl, {
          name: normalizedName(),
          birth_date: birth,
        });
        if (ok && data.ok) {
          storage.remove(STORAGE_KEY);
          window.location.href = data.redirect;
          return;
        }
        release();
        const errors = data.errors || {};
        if (errors.name) {
          show('1');
          setTimeout(() => fieldError('#obNameError', errors.name), 300);
        } else if (errors.birth_date) {
          fieldError('#obBirthError', errors.birth_date);
        } else {
          $('#obSubmitError').textContent = data.error || 'Terjadi kesalahan. Muat ulang halaman lalu coba lagi.';
        }
      } catch (error) {
        release();
        $('#obSubmitError').textContent = 'Tidak bisa terhubung ke server. Periksa koneksimu.';
      }
    }

    $('#obNext2').addEventListener('click', () => finish(false));
    $('#obSkip').addEventListener('click', () => {
      birthInput.value = '';
      finish(true);
    });
    $('#obBack2').addEventListener('click', () => show('1'));
    birthInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(false);
      }
    });
    birthInput.addEventListener('input', () => fieldError('#obBirthError', ''));

    $('#obOpenRecover').addEventListener('click', () => show('recover'));
    $('#obBackRecover').addEventListener('click', () => show('1'));
    codeInput.addEventListener('input', () => {
      const raw = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
      codeInput.value = raw.replace(/(.{4})(?=.)/g, '$1-');
      fieldError('#obCodeError', '');
    });

    async function recover() {
      if (submitting) return;
      if (codeInput.value.replace(/-/g, '').length !== 16) {
        return fieldError('#obCodeError', 'Kode terdiri dari 16 karakter.');
      }
      submitting = true;
      $('#obRecover').disabled = true;
      const { ok, data } = await postJSON(root.dataset.recoverUrl, { code: codeInput.value });
      if (ok && data.ok) {
        storage.remove(STORAGE_KEY);
        window.location.href = data.redirect;
        return;
      }
      submitting = false;
      $('#obRecover').disabled = false;
      fieldError('#obCodeError', data.error || 'Kode pemulihan tidak valid.');
    }

    $('#obRecover').addEventListener('click', recover);
    codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        recover();
      }
    });
  }
})();
