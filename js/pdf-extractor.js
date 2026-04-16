/**
 * PDF 텍스트 추출 모듈
 * PDF.js(UMD 글로벌 pdfjsLib)를 사용하여 PDF에서 텍스트를 추출합니다.
 */
var PDFExtractor = (function () {

  // PDF.js 워커 설정
  function _initWorker() {
    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  /**
   * PDF 파일에서 텍스트를 추출합니다.
   * @param {File} file - PDF File 객체
   * @returns {Promise<{text: string, pageCount: number}>}
   */
  async function extract(file) {
    _initWorker();

    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js 라이브러리를 불러올 수 없습니다. 인터넷 연결을 확인해 주세요.');
    }

    var arrayBuffer = await file.arrayBuffer();
    var doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var totalPages = doc.numPages;
    var pagesToRead = Math.min(totalPages, APP_CONFIG.MAX_PAGES);
    var textParts = [];

    for (var i = 1; i <= pagesToRead; i++) {
      var page = await doc.getPage(i);
      var content = await page.getTextContent();
      var pageText = content.items.map(function (item) { return item.str; }).join(' ');
      textParts.push('[Page ' + i + ']\n' + pageText);
    }

    var fullText = textParts.join('\n\n');

    if (!fullText.trim()) {
      throw new Error(
        '텍스트를 추출할 수 없는 PDF입니다. 텍스트 선택이 가능한 PDF만 지원합니다.'
      );
    }

    return {
      text: fullText,
      pageCount: totalPages
    };
  }

  return { extract: extract };
})();
