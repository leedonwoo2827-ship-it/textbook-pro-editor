/**
 * 파일 다운로드 모듈
 * 교정 결과를 마크다운(.md) 파일로 다운로드합니다.
 */
var FileManager = (function () {

  /**
   * 완료된 파일들의 교정 결과를 하나의 마크다운 파일로 다운로드합니다.
   * @param {Array} files - 완료된 파일 객체 배열 [{name, result}, ...]
   */
  async function downloadReport(files) {
    var completed = files.filter(function (f) { return f.status === 'completed'; });
    if (completed.length === 0) return;

    // 마크다운 본문 조립
    var today = new Date().toISOString().split('T')[0];
    var parts = [];

    parts.push('# 📝 교재 전문 편집 보고서\n');
    parts.push('생성일: ' + today + '\n');
    parts.push('---\n');

    completed.forEach(function (file) {
      parts.push('## 📄 원본 파일: ' + file.name + '\n');
      parts.push(file.result || '');
      parts.push('\n---\n');
    });

    var content = parts.join('\n');

    // 파일명 생성
    var fileName;
    if (completed.length === 1) {
      fileName = completed[0].name.replace(/\.[^/.]+$/, '');
    } else {
      fileName = completed[0].name.replace(/\.[^/.]+$/, '') + '_외_' + (completed.length - 1) + '건';
    }
    fileName = '교정보고서_' + fileName + '_' + today + '.md';

    // 다운로드 실행
    try {
      if (window.showSaveFilePicker) {
        var handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'Markdown File',
            accept: { 'text/markdown': ['.md'] }
          }]
        });
        var writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        _fallbackDownload(content, fileName);
      }
    } catch (e) {
      // 사용자가 취소한 경우
      if (e.name !== 'AbortError') {
        _fallbackDownload(content, fileName);
      }
    }
  }

  function _fallbackDownload(content, fileName) {
    var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { downloadReport: downloadReport };
})();
