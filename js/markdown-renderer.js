/**
 * 마크다운 렌더러 모듈
 * Gemini 응답의 마크다운(테이블, ==하이라이트==, 제목)을 HTML로 변환합니다.
 */
var MarkdownRenderer = (function () {

  /**
   * ==텍스트== 패턴을 <mark>텍스트</mark>로 변환
   */
  function _convertHighlights(text) {
    return text.replace(/==(.*?)==/g, '<mark>$1</mark>');
  }

  /**
   * 특수 HTML 문자를 이스케이프 (mark 태그는 유지)
   */
  function _escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * 테이블 행(|...|)을 셀 배열로 분리
   */
  function _parseTableRow(line) {
    var cells = line.split('|');
    // 앞뒤 빈 문자열 제거 (|cell|cell| → ["", "cell", "cell", ""])
    if (cells.length > 0 && cells[0].trim() === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(function (c) { return c.trim(); });
  }

  /**
   * 구분자 행인지 확인 (|---|---|)
   */
  function _isSeparatorRow(line) {
    return /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|?$/.test(line.trim());
  }

  /**
   * 축적된 테이블 행들을 HTML <table>로 변환
   */
  function _buildTable(headerCells, bodyRows) {
    var html = '<table>';

    // thead
    if (headerCells) {
      html += '<thead><tr>';
      headerCells.forEach(function (cell) {
        html += '<th>' + _convertHighlights(_escapeHtml(cell)) + '</th>';
      });
      html += '</tr></thead>';
    }

    // tbody
    if (bodyRows.length > 0) {
      html += '<tbody>';
      bodyRows.forEach(function (row) {
        html += '<tr>';
        row.forEach(function (cell) {
          html += '<td>' + _convertHighlights(_escapeHtml(cell)) + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody>';
    }

    html += '</table>';
    return html;
  }

  /**
   * 마크다운 텍스트를 HTML 문자열로 변환합니다.
   * @param {string} markdown
   * @returns {string} HTML
   */
  function render(markdown) {
    if (!markdown) return '';

    var lines = markdown.split('\n');
    var htmlParts = [];

    // 테이블 축적 상태
    var inTable = false;
    var headerCells = null;
    var bodyRows = [];
    var headerConsumed = false;

    function flushTable() {
      if (inTable) {
        htmlParts.push(_buildTable(headerCells, bodyRows));
        inTable = false;
        headerCells = null;
        bodyRows = [];
        headerConsumed = false;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      // 빈 줄
      if (!trimmed) {
        flushTable();
        continue;
      }

      // ### 제목
      if (trimmed.startsWith('###')) {
        flushTable();
        var headingText = trimmed.replace(/^#{1,6}\s*/, '');
        htmlParts.push('<h3>' + _convertHighlights(_escapeHtml(headingText)) + '</h3>');
        continue;
      }

      // 테이블 행
      if (trimmed.startsWith('|')) {
        if (_isSeparatorRow(trimmed)) {
          // 구분자 행 → 스킵 (이전 행이 헤더임을 확인)
          headerConsumed = true;
          continue;
        }

        var cells = _parseTableRow(trimmed);

        if (!inTable) {
          // 새 테이블 시작 → 첫 행은 헤더 후보
          inTable = true;
          headerCells = cells;
          headerConsumed = false;
        } else if (!headerConsumed) {
          // 구분자 없이 두 번째 행 → 첫 행은 일반 행이었음
          bodyRows.push(headerCells);
          headerCells = null;
          bodyRows.push(cells);
          headerConsumed = true; // 더 이상 헤더 없음
        } else {
          bodyRows.push(cells);
        }
        continue;
      }

      // 일반 텍스트
      flushTable();
      htmlParts.push('<p>' + _convertHighlights(_escapeHtml(trimmed)) + '</p>');
    }

    // 마지막 테이블 flush
    flushTable();

    return htmlParts.join('\n');
  }

  return { render: render };
})();
