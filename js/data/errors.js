// Normalizes Firestore / network / app errors into user-facing Vietnamese messages.

export class AppError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

const MESSAGES = {
  'offline': 'Không có kết nối mạng. Dữ liệu vẫn được giữ trên máy này.',
  'timeout': 'Máy chủ chưa xác nhận lưu. Dữ liệu vẫn được giữ trên máy này — hãy thử lại.',
  'unavailable': 'Không kết nối được tới Firestore. Kiểm tra mạng và thử lại.',
  'permission-denied': 'Firestore từ chối truy cập. Kiểm tra Firestore Rules (xem README).',
  'unauthenticated': 'Firestore từ chối truy cập. Kiểm tra Firestore Rules (xem README).',
  'resource-exhausted': 'Đã vượt hạn mức miễn phí của Firestore trong ngày. Thử lại sau.',
  'invalid-argument': 'Dữ liệu gửi lên không hợp lệ.',
  'not-found': 'Không tìm thấy dữ liệu — có thể đã bị xoá.',
  'deadline-exceeded': 'Máy chủ phản hồi quá lâu. Hãy thử lại.',
  'invalid-key': 'Mật khẩu không đúng',
  'config-missing': 'Chưa cấu hình Firebase project (xem README).',
  'project-not-found': 'Không tìm thấy Firestore database của project đã cấu hình.',
  'image-too-large': 'Ảnh quá lớn kể cả sau khi nén.',
  'image-decode': 'Không đọc được ảnh này.',
  'storage-full': 'Bộ nhớ trình duyệt đã đầy, không lưu được trên máy.',
};

export function toAppError(err) {
  if (err instanceof AppError) return err;
  const code = String(err?.code || '').replace(/^firestore\//, '');
  if (MESSAGES[code]) return new AppError(code, MESSAGES[code], err);
  if (err?.name === 'QuotaExceededError') return new AppError('storage-full', MESSAGES['storage-full'], err);
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return new AppError('unavailable', MESSAGES.unavailable, err);
  return new AppError('unknown', err?.message ? `Có lỗi xảy ra: ${err.message}` : 'Có lỗi xảy ra.', err);
}

export function errorMessage(err) {
  return toAppError(err).message;
}

export function appError(code, extra) {
  return new AppError(code, MESSAGES[code] || extra || code);
}
