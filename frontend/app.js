const form = document.querySelector('#upload-form');
const submitButton = document.querySelector('#submit-button');
const statusMessage = document.querySelector('#status-message');
const loadingPanel = document.querySelector('#loading-panel');
const uploadIds = ['source-template', 'target-template', 'source-document'];
const maxFileSize = 50 * 1024 * 1024;

function setStatus(message, state) {
  statusMessage.textContent = message;
  statusMessage.dataset.state = state;
  statusMessage.hidden = false;
}

function updateFileLabel(input) {
  const nameElement = document.querySelector(`[data-file-name="${input.id}"]`);
  const file = input.files?.[0];
  nameElement.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Chưa chọn file';
  nameElement.classList.toggle('has-file', Boolean(file));
}

for (const inputId of uploadIds) {
  const input = document.getElementById(inputId);
  const dropzone = document.querySelector(`[data-dropzone="${inputId}"]`);
  input.addEventListener('change', () => updateFileLabel(input));

  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
    });
  }
  dropzone.addEventListener('drop', (event) => {
    const [file] = event.dataTransfer.files;
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const inputs = uploadIds.map((id) => document.getElementById(id));
  const [sourceTemplate, targetTemplate, sourceDocument] = inputs;
  if (!sourceDocument.files?.length) {
    setStatus('Vui lòng chọn tài liệu nguồn cần dịch.', 'error');
    sourceDocument.closest('.dropzone').focus();
    return;
  }
  if (Boolean(sourceTemplate.files?.length) !== Boolean(targetTemplate.files?.length)) {
    setStatus('Hãy tải cả Template Structure và Template language, hoặc bỏ trống cả hai để dùng mapping JSON đã lưu.', 'error');
    return;
  }

  const selectedInputs = inputs.filter((input) => input.files?.length);
  const oversized = selectedInputs.find((input) => input.files[0].size > maxFileSize);
  if (oversized) {
    setStatus(`File "${oversized.files[0].name}" vượt quá giới hạn 50 MB.`, 'error');
    return;
  }
  const wrongType = selectedInputs.find((input) => !input.files[0].name.toLowerCase().endsWith('.docx'));
  if (wrongType) {
    setStatus(`File "${wrongType.files[0].name}" không có định dạng DOCX.`, 'error');
    return;
  }

  const payload = new FormData();
  if (sourceTemplate.files.length) {
    payload.append('source_template', sourceTemplate.files[0]);
    payload.append('target_template', targetTemplate.files[0]);
  }
  payload.append('source_document', sourceDocument.files[0]);
  payload.append('debug_mode', document.getElementById('debug-mode').checked ? 'true' : 'false');
  submitButton.disabled = true;
  submitButton.querySelector('span:first-child').textContent = 'Đang xử lý...';
  loadingPanel.hidden = false;
  const usesTemplates = sourceTemplate.files.length > 0;
  const loadingDetail = document.getElementById('loading-detail');
  loadingDetail.textContent = usesTemplates
    ? 'Đang đối chiếu template và tạo tài liệu dịch.'
    : 'Đang dùng mapping JSON đã lưu và dịch các đoạn chưa khớp bằng AI.';
  setStatus(loadingDetail.textContent, 'loading');

  try {
    const translatedFile = await new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/translate');
      request.responseType = 'blob';
      request.onload = async () => {
        if (request.status < 200 || request.status >= 300) {
          let message = 'Không xử lý được tài liệu.';
          try {
            const errorPayload = JSON.parse(await request.response.text());
            message = errorPayload.detail || message;
          } catch {
            // Keep the generic error when the server did not return JSON.
          }
          reject(new Error(message));
          return;
        }
        resolve(request.response);
      };
      request.onerror = () => reject(new Error('Không thể kết nối tới máy chủ xử lý.'));
      request.onabort = () => reject(new Error('Yêu cầu xử lý đã bị hủy.'));
      request.send(payload);
    });
    const sourceName = sourceDocument.files[0].name.replace(/\.docx$/i, '');
    const downloadName = `${sourceName}_translated.docx`;
    const objectUrl = URL.createObjectURL(translatedFile);
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = downloadName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(objectUrl);
    setStatus(`Đã tạo xong ${downloadName}. Tệp đã được tải xuống.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Có lỗi khi xử lý tài liệu.', 'error');
  } finally {
    loadingPanel.hidden = true;
    submitButton.disabled = false;
    submitButton.querySelector('span:first-child').textContent = 'Dịch tài liệu';
    loadingDetail.textContent = 'Đang đối chiếu template và tạo bản dịch.';
  }
});
