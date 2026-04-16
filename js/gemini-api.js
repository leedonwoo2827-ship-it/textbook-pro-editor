/**
 * Gemini REST API 호출 모듈
 * SDK 없이 fetch()로 직접 호출합니다.
 */
var GeminiAPI = (function () {

  /**
   * PDF 추출 텍스트를 Gemini에 보내 교정 결과를 받습니다.
   * @param {string} fileName - 원본 파일명
   * @param {string} extractedText - 추출된 텍스트
   * @param {string} apiKey - Gemini API Key
   * @param {string} model - 모델 ID
   * @returns {Promise<string>} 교정 결과 마크다운
   */
  var MAX_RETRIES = 3;
  var RETRY_DELAYS = [3000, 6000, 12000]; // 3초, 6초, 12초

  async function proofread(fileName, extractedText, apiKey, model) {
    if (!apiKey) {
      throw new Error('API Key가 설정되지 않았습니다.');
    }
    if (!model) {
      throw new Error('모델이 선택되지 않았습니다.');
    }

    var url = APP_CONFIG.API_BASE_URL + '/models/' + model + ':generateContent?key=' + apiKey;

    var body = {
      system_instruction: {
        parts: [{ text: APP_CONFIG.SYSTEM_INSTRUCTION }]
      },
      contents: [{
        parts: [{
          text: '다음 PDF 추출 텍스트를 검토해 주세요.\n파일명: ' + fileName + '\n\n추출 내용:\n' + extractedText
        }]
      }],
      generationConfig: {
        temperature: APP_CONFIG.TEMPERATURE
      }
    };

    return _fetchWithRetry(url, body, model, 0);
  }

  async function _fetchWithRetry(url, body, model, attempt) {
    var response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('네트워크 오류: Gemini API에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
    }

    if (!response.ok) {
      var errorData;
      try {
        errorData = await response.json();
      } catch (_) {
        throw new Error('API 오류 (HTTP ' + response.status + '): ' + response.statusText);
      }

      var msg = (errorData.error && errorData.error.message) || response.statusText;

      // 429(한도 초과) 또는 503(서버 과부하)는 자동 재시도
      if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
        var delay = RETRY_DELAYS[attempt] || 12000;
        console.log('API ' + response.status + ', ' + (delay / 1000) + '초 후 재시도 (' + (attempt + 1) + '/' + MAX_RETRIES + ')');
        await new Promise(function (r) { setTimeout(r, delay); });
        return _fetchWithRetry(url, body, model, attempt + 1);
      }

      if (response.status === 400) {
        throw new Error('잘못된 요청: ' + msg);
      } else if (response.status === 403) {
        throw new Error('API Key가 유효하지 않거나 권한이 없습니다. 키를 확인해 주세요.');
      } else if (response.status === 404) {
        throw new Error('모델을 찾을 수 없습니다: "' + model + '". 모델 ID를 확인해 주세요.');
      } else if (response.status === 429) {
        throw new Error('API 요청 한도 초과. 잠시 후 다시 시도해 주세요.');
      } else if (response.status === 503) {
        throw new Error('서버 과부하 (503): 현재 모델 수요가 많습니다. 다른 모델을 선택하거나 잠시 후 다시 시도해 주세요.');
      } else {
        throw new Error('API 오류 (' + response.status + '): ' + msg);
      }
    }

    var data = await response.json();

    if (!data.candidates || !data.candidates[0] ||
        !data.candidates[0].content || !data.candidates[0].content.parts ||
        !data.candidates[0].content.parts[0]) {
      throw new Error('AI 분석 결과를 생성할 수 없습니다. 다시 시도해 주세요.');
    }

    return data.candidates[0].content.parts[0].text || '분석 결과를 생성할 수 없습니다.';
  }

  return { proofread: proofread };
})();
