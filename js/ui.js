/**
 * UI 컨트롤러 모듈
 * DOM 조작, 상태 관리, 이벤트 바인딩을 담당합니다.
 */
var UI = (function () {

  // ===== State =====
  var state = {
    files: [],          // [{id, name, file, text, pageCount, status, result, error}]
    isProcessing: false,
    apiKey: '',
    model: ''
  };

  var _idCounter = 0;

  // ===== DOM References =====
  var dom = {};

  function _cacheDom() {
    dom.btnReset       = document.getElementById('btn-reset');
    dom.btnStart       = document.getElementById('btn-start');
    dom.btnDownload    = document.getElementById('btn-download');
    dom.inputApiKey    = document.getElementById('input-api-key');
    dom.selectModel    = document.getElementById('select-model');
    dom.inputCustom    = document.getElementById('input-custom-model');
    dom.inputFile      = document.getElementById('input-file');
    dom.dropzone       = document.getElementById('dropzone');
    dom.queueCount     = document.getElementById('queue-count');
    dom.queueEmpty     = document.getElementById('queue-empty');
    dom.queueList      = document.getElementById('queue-list');
    dom.reportContent  = document.getElementById('report-content');
    dom.reportEmpty    = document.getElementById('report-empty');
  }

  // ===== Initialization =====

  function init() {
    _cacheDom();
    _populateModelSelect();
    _restoreSettings();
    _bindEvents();
    _updateUI();
  }

  /** 모델 옵션을 config 기반으로 동적 생성 */
  function _populateModelSelect() {
    var customOption = dom.selectModel.querySelector('option[value="custom"]');
    APP_CONFIG.MODEL_OPTIONS.forEach(function (opt) {
      var el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.label;
      dom.selectModel.insertBefore(el, customOption);
    });
  }

  /** localStorage에서 설정 복원 */
  function _restoreSettings() {
    state.apiKey = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.API_KEY) || '';
    state.model = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.MODEL) || APP_CONFIG.DEFAULT_MODEL;

    dom.inputApiKey.value = state.apiKey;

    // 모델이 preset 목록에 있으면 select, 아니면 custom
    var isPreset = APP_CONFIG.MODEL_OPTIONS.some(function (o) { return o.value === state.model; });
    if (isPreset) {
      dom.selectModel.value = state.model;
      dom.inputCustom.value = state.model;
    } else {
      dom.selectModel.value = 'custom';
      dom.inputCustom.value = state.model;
    }
  }

  // ===== Event Binding =====

  function _bindEvents() {
    // API Key 입력
    dom.inputApiKey.addEventListener('input', function () {
      state.apiKey = dom.inputApiKey.value.trim();
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.API_KEY, state.apiKey);
    });

    // 모델 select 변경
    dom.selectModel.addEventListener('change', function () {
      var val = dom.selectModel.value;
      if (val === 'custom') {
        dom.inputCustom.value = '';
        dom.inputCustom.focus();
        state.model = '';
      } else {
        state.model = val;
        dom.inputCustom.value = val;
      }
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.MODEL, state.model);
    });

    // 커스텀 모델 입력
    dom.inputCustom.addEventListener('input', function () {
      state.model = dom.inputCustom.value.trim();
      // preset과 일치하면 select도 동기화
      var isPreset = APP_CONFIG.MODEL_OPTIONS.some(function (o) { return o.value === state.model; });
      dom.selectModel.value = isPreset ? state.model : 'custom';
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.MODEL, state.model);
    });

    // 파일 input 변경
    dom.inputFile.addEventListener('change', function () {
      if (dom.inputFile.files.length > 0) {
        _handleFiles(dom.inputFile.files);
        dom.inputFile.value = ''; // 같은 파일 재선택 허용
      }
    });

    // 드롭존 클릭
    dom.dropzone.addEventListener('click', function () {
      dom.inputFile.click();
    });

    // 드래그앤드롭
    dom.dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dom.dropzone.classList.add('dropzone-active');
    });
    dom.dropzone.addEventListener('dragleave', function () {
      dom.dropzone.classList.remove('dropzone-active');
    });
    dom.dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dom.dropzone.classList.remove('dropzone-active');
      if (e.dataTransfer.files.length > 0) {
        _handleFiles(e.dataTransfer.files);
      }
    });

    // 버튼들
    dom.btnStart.addEventListener('click', _startAnalysis);
    dom.btnReset.addEventListener('click', _reset);
    dom.btnDownload.addEventListener('click', function () {
      FileManager.downloadReport(state.files);
    });
  }

  // ===== File Handling =====

  async function _handleFiles(fileList) {
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      if (file.type !== 'application/pdf') continue;

      var entry = {
        id: ++_idCounter,
        name: file.name,
        file: file,
        text: null,
        pageCount: null,
        status: 'extracting', // extracting → pending → processing → completed/error
        result: null,
        error: null
      };
      state.files.push(entry);
      _renderQueue();

      // 텍스트 추출
      try {
        var extracted = await PDFExtractor.extract(file);
        entry.text = extracted.text;
        entry.pageCount = extracted.pageCount;
        entry.status = 'pending';
      } catch (err) {
        entry.status = 'error';
        entry.error = err.message;
      }
      _renderQueue();
    }
    _updateUI();
  }

  function _removeFile(id) {
    if (state.isProcessing) return;
    state.files = state.files.filter(function (f) { return f.id !== id; });
    _renderQueue();
    _renderReport();
    _updateUI();
  }

  /** 오류 발생한 파일을 다시 분석 */
  async function _retryFile(id) {
    if (state.isProcessing) return;
    var file = state.files.find(function (f) { return f.id === id; });
    if (!file || file.status !== 'error' || !file.text) return;

    if (!state.apiKey) {
      alert('Gemini API Key를 입력해 주세요.');
      return;
    }

    state.isProcessing = true;
    file.status = 'processing';
    file.error = null;
    _renderQueue();
    _renderReport();
    _updateUI();

    try {
      file.result = await GeminiAPI.proofread(file.name, file.text, state.apiKey, state.model);
      file.status = 'completed';
    } catch (err) {
      file.status = 'error';
      file.error = err.message;
    }

    state.isProcessing = false;
    _renderQueue();
    _renderReport();
    _updateUI();
  }

  // ===== Analysis =====

  async function _startAnalysis() {
    if (state.isProcessing) return;
    if (!state.apiKey) {
      alert('Gemini API Key를 입력해 주세요.');
      dom.inputApiKey.focus();
      return;
    }
    if (!state.model) {
      alert('모델을 선택해 주세요.');
      return;
    }

    var pending = state.files.filter(function (f) { return f.status === 'pending'; });
    if (pending.length === 0) return;

    state.isProcessing = true;
    _updateUI();

    for (var i = 0; i < pending.length; i++) {
      var file = pending[i];
      file.status = 'processing';
      _renderQueue();
      _renderReport();

      try {
        file.result = await GeminiAPI.proofread(file.name, file.text, state.apiKey, state.model);
        file.status = 'completed';
      } catch (err) {
        file.status = 'error';
        file.error = err.message;
      }

      _renderQueue();
      _renderReport();
    }

    state.isProcessing = false;
    _updateUI();
  }

  function _reset() {
    if (state.isProcessing) return;
    state.files = [];
    _renderQueue();
    _renderReport();
    _updateUI();
  }

  // ===== Rendering =====

  function _updateUI() {
    var hasFiles = state.files.length > 0;
    var hasCompleted = state.files.some(function (f) { return f.status === 'completed'; });
    var hasPending = state.files.some(function (f) { return f.status === 'pending'; });

    // 초기화 버튼
    dom.btnReset.classList.toggle('hidden', !hasFiles || state.isProcessing);

    // 시작 버튼
    var canStart = !state.isProcessing && hasPending;
    dom.btnStart.disabled = !canStart;
    if (state.isProcessing) {
      dom.btnStart.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 분석 중...';
      dom.btnStart.className = 'px-6 py-2 rounded-full font-bold transition-all shadow-lg bg-slate-700 text-slate-400 cursor-not-allowed';
    } else if (canStart) {
      dom.btnStart.textContent = '교정 분석 시작';
      dom.btnStart.className = 'px-6 py-2 rounded-full font-bold transition-all shadow-lg active:scale-95 bg-emerald-500 text-slate-900 hover:bg-emerald-400';
    } else {
      dom.btnStart.textContent = '교정 분석 시작';
      dom.btnStart.className = 'px-6 py-2 rounded-full font-bold transition-all shadow-lg bg-slate-700 text-slate-500 cursor-not-allowed';
    }

    // 다운로드 버튼
    dom.btnDownload.classList.toggle('hidden', !hasCompleted);
  }

  function _renderQueue() {
    var completedCount = state.files.filter(function (f) { return f.status === 'completed'; }).length;
    dom.queueCount.textContent = completedCount + '/' + state.files.length;

    if (state.files.length === 0) {
      dom.queueEmpty.classList.remove('hidden');
      dom.queueList.classList.add('hidden');
      return;
    }

    dom.queueEmpty.classList.add('hidden');
    dom.queueList.classList.remove('hidden');

    var html = '';
    state.files.forEach(function (file, idx) {
      var borderClass, statusIcon;

      switch (file.status) {
        case 'extracting':
          borderClass = 'border-slate-100 bg-slate-50';
          statusIcon = '<i class="fas fa-file-import text-slate-400 text-xs animate-pulse"></i>';
          break;
        case 'pending':
          borderClass = 'border-slate-100 bg-slate-50';
          statusIcon = '';
          break;
        case 'processing':
          borderClass = 'border-emerald-200 bg-emerald-50';
          statusIcon = '<i class="fas fa-circle-notch fa-spin text-emerald-500 text-xs"></i>';
          break;
        case 'completed':
          borderClass = 'border-blue-100 bg-blue-50';
          statusIcon = '<i class="fas fa-check-circle text-blue-500 text-xs"></i>';
          break;
        case 'error':
          borderClass = 'border-red-100 bg-red-50';
          statusIcon = '<i class="fas fa-triangle-exclamation text-red-500 text-xs"></i>';
          break;
      }

      var pageInfo = '';
      if (file.status === 'extracting') {
        pageInfo = '텍스트 추출 중...';
      } else if (file.pageCount !== null) {
        pageInfo = file.pageCount + '페이지' + (file.pageCount > APP_CONFIG.MAX_PAGES ? ' (최대 ' + APP_CONFIG.MAX_PAGES + 'p 분석)' : '');
      }

      var deleteBtn = '';
      var retryBtn = '';
      if ((file.status === 'pending' || file.status === 'error') && !state.isProcessing) {
        deleteBtn = '<button data-remove-id="' + file.id + '" class="text-slate-400 hover:text-red-500 transition-colors"><i class="fas fa-trash-can pointer-events-none"></i></button>';
      }
      if (file.status === 'error' && file.text && !state.isProcessing) {
        retryBtn = '<button data-retry-id="' + file.id + '" class="text-slate-400 hover:text-emerald-500 transition-colors" title="재시도"><i class="fas fa-rotate-right pointer-events-none"></i></button>';
      }

      html += '<div class="p-3 rounded-xl border flex items-center justify-between transition-all ' + borderClass + '">' +
        '<div class="flex items-center gap-3 overflow-hidden">' +
          '<span class="text-xs text-slate-400 font-mono font-bold">' + String(idx + 1).padStart(2, '0') + '</span>' +
          '<div class="overflow-hidden">' +
            '<p class="text-sm font-bold text-slate-700 truncate" title="' + _escAttr(file.name) + '">' + _escHtml(file.name) + '</p>' +
            '<p class="text-[10px] text-slate-400 font-bold uppercase">' + pageInfo + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2 ml-2">' +
          retryBtn +
          deleteBtn +
          statusIcon +
        '</div>' +
      '</div>';
    });

    dom.queueList.innerHTML = html;

    // 삭제 버튼 이벤트 바인딩
    dom.queueList.querySelectorAll('[data-remove-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _removeFile(Number(btn.getAttribute('data-remove-id')));
      });
    });

    // 재시도 버튼 이벤트 바인딩
    dom.queueList.querySelectorAll('[data-retry-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _retryFile(Number(btn.getAttribute('data-retry-id')));
      });
    });
  }

  function _renderReport() {
    var active = state.files.filter(function (f) {
      return f.status === 'completed' || f.status === 'error' || f.status === 'processing';
    });

    if (active.length === 0) {
      dom.reportEmpty.classList.remove('hidden');
      // 기존 리포트 블록 제거 (empty 제외)
      var blocks = dom.reportContent.querySelectorAll('.report-block');
      blocks.forEach(function (b) { b.remove(); });
      return;
    }

    dom.reportEmpty.classList.add('hidden');

    active.forEach(function (file) {
      var existing = document.getElementById('report-' + file.id);

      if (file.status === 'processing') {
        if (!existing) {
          var el = document.createElement('div');
          el.id = 'report-' + file.id;
          el.className = 'report-block animate-fade-in';
          el.innerHTML =
            '<div class="flex flex-col items-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200 mb-8">' +
              '<div class="relative mb-6">' +
                '<i class="fas fa-brain text-5xl text-emerald-500 animate-pulse"></i>' +
                '<i class="fas fa-magnifying-glass text-xl text-blue-500 absolute -bottom-1 -right-1"></i>' +
              '</div>' +
              '<p class="text-lg font-bold text-slate-700">\'' + _escHtml(file.name) + '\' 정밀 교정 중...</p>' +
              '<p class="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">AI Editor is reviewing content</p>' +
            '</div>';
          dom.reportContent.appendChild(el);
        }
      } else if (file.status === 'error') {
        if (existing) {
          var retryHtml = file.text
            ? '<button data-report-retry-id="' + file.id + '" class="mt-3 px-4 py-1.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"><i class="fas fa-rotate-right"></i> 재시도</button>'
            : '';
          existing.innerHTML =
            '<div class="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 mb-8 animate-fade-in">' +
              '<p class="font-bold flex items-center gap-2"><i class="fas fa-circle-exclamation text-xl"></i> 분석 중 오류 발생</p>' +
              '<p class="text-sm mt-2 font-medium">파일명: ' + _escHtml(file.name) + '</p>' +
              '<p class="text-sm mt-1 opacity-80">' + _escHtml(file.error) + '</p>' +
              retryHtml +
            '</div>';
          var retryBtnEl = existing.querySelector('[data-report-retry-id]');
          if (retryBtnEl) {
            retryBtnEl.addEventListener('click', function () {
              _retryFile(file.id);
            });
          }
        }
      } else if (file.status === 'completed') {
        if (existing) {
          existing.innerHTML =
            '<div class="mb-16 animate-fade-in">' +
              '<div class="markdown-report">' +
                MarkdownRenderer.render(file.result) +
              '</div>' +
            '</div>';
        }
      }
    });
  }

  // ===== Helpers =====

  function _escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function _escAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { init: init };
})();
