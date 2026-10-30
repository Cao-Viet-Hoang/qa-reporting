import { h } from '../core/dom.js';
import { accessService } from '../services/access-service.js';
import { icon } from '../ui/icons.js';

export function renderLogin({ onUnlocked }) {
  const configured = accessService.isConfigured();
  const showDemo = !configured || new URLSearchParams(location.search).has('demo');

  const input = h('input', {
    class: 'login__input',
    id: 'access-key',
    type: 'password',
    autocomplete: 'current-password',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'Mật khẩu',
    'aria-describedby': 'access-error',
    disabled: !configured,
  });
  const reveal = h('button', { class: 'login__reveal', type: 'button', 'aria-label': 'Hiện mật khẩu', 'aria-pressed': 'false' }, icon('eye', { size: 18 }));
  const submit = h('button', { class: 'btn btn--primary btn--lg login__submit', type: 'submit', disabled: !configured },
    h('span', { class: 'btn__label' }, 'Truy cập'));
  const error = h('p', { class: 'login__error', id: 'access-error', role: 'alert' });

  const form = h('form', { class: 'login__form', novalidate: true },
    h('label', { class: 'sr-only', for: 'access-key' }, 'Mật khẩu'),
    h('div', { class: 'login__field' }, icon('lock', { size: 18, cls: 'login__lock' }), input, reveal),
    error,
    submit,
  );

  const root = h('div', { class: 'login' },
    h('div', { class: 'login__panel' },
      h('h1', { class: 'login__title' }, 'Báo cáo QC'),
      h('p', { class: 'login__lede' }, 'Kiểm soát chất lượng theo ngày'),
      form,
      !configured && h('div', { class: 'notice notice--warn login__notice' },
        icon('info', { size: 16 }),
        h('div', null,
          h('strong', null, 'Chưa cấu hình Firebase. '),
          'Điền thông tin project vào ', h('code', null, 'js/config/firebase-config.js'), ' (xem README).')),
      showDemo && h('button', { class: 'login__demo', type: 'button', onClick: () => { accessService.enterDemo(); onUnlocked(); } },
        'Xem bản demo với dữ liệu mẫu'),
      showDemo && h('p', { class: 'login__demo-hint' }, 'Dữ liệu demo chỉ lưu trên trình duyệt này.'),
    ),
  );

  function setError(message) {
    error.textContent = message || '';
    root.classList.toggle('has-error', Boolean(message));
  }

  reveal.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(show));
    reveal.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    reveal.replaceChildren(icon(show ? 'eyeOff' : 'eye', { size: 18 }));
    input.focus();
  });
  input.addEventListener('input', () => setError(''));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.value.trim()) { setError('Nhập mật khẩu để tiếp tục'); input.focus(); return; }
    submit.classList.add('is-loading');
    submit.disabled = true;
    input.readOnly = true;
    setError('');
    try {
      await accessService.unlock(input.value);
      onUnlocked();
    } catch (err) {
      setError(err.message);
      root.querySelector('.login__field').animate?.(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
        { duration: 260, easing: 'ease-out' },
      );
      input.readOnly = false;
      input.select();
    } finally {
      submit.classList.remove('is-loading');
      submit.disabled = false;
    }
  });

  requestAnimationFrame(() => configured && input.focus());
  return root;
}
