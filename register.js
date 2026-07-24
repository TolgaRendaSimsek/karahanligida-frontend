document.addEventListener('DOMContentLoaded', () => {
  // Toggle sections
  const registerSection = document.getElementById('registerSection');
  const loginSection = document.getElementById('loginSection');
  const toLoginLink = document.getElementById('toLoginLink');
  const toRegisterLink = document.getElementById('toRegisterLink');

  // Forms
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');

  // Success Modal & Toast
  const successModal = document.getElementById('successModal');
  const successGoBtn = document.getElementById('successGoBtn');
  const toast = document.getElementById('registerToast');

  // Password Toggles
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const loginPasswordInput = document.getElementById('loginPassword');
  const toggleLoginPasswordBtn = document.getElementById('toggleLoginPasswordBtn');

  // Phone input
  const phoneInput = document.getElementById('phone');

  // --- 1. Form Toggles ---
  toLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerSection.style.display = 'none';
    loginSection.style.display = 'block';
    clearAllErrors();
  });

  toRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginSection.style.display = 'none';
    registerSection.style.display = 'block';
    clearAllErrors();
  });

  // --- 2. Password Visibility Toggles ---
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.textContent = isPassword ? '🙈' : '👁';
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster');
    });
  }

  if (toggleLoginPasswordBtn) {
    toggleLoginPasswordBtn.addEventListener('click', () => {
      const isPassword = loginPasswordInput.type === 'password';
      loginPasswordInput.type = isPassword ? 'text' : 'password';
      toggleLoginPasswordBtn.textContent = isPassword ? '🙈' : '👁';
      toggleLoginPasswordBtn.setAttribute('aria-label', isPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster');
    });
  }

  // --- 3. Phone Number Formatting (0 (5XX) XXX XX XX) ---
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      let input = e.target.value.replace(/\D/g, '');
      if (input.startsWith('0')) {
        input = input.substring(1);
      }
      input = input.substring(0, 10);

      let formatted = '';
      if (input.length > 0) {
        formatted += '0 (' + input.substring(0, 3);
      }
      if (input.length >= 4) {
        formatted += ') ' + input.substring(3, 6);
      }
      if (input.length >= 7) {
        formatted += ' ' + input.substring(6, 8);
      }
      if (input.length >= 9) {
        formatted += ' ' + input.substring(8, 10);
      }

      e.target.value = formatted;
    });
  }

  // --- 4. Validation Error Helpers ---
  function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const container = field.closest('.form-field');
    const errorEl = document.getElementById(`${fieldId}Error`);
    
    if (container && errorEl) {
      container.classList.add('has-error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  function clearError(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const container = field.closest('.form-field');
    const errorEl = document.getElementById(`${fieldId}Error`);
    
    if (container && errorEl) {
      container.classList.remove('has-error');
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  function clearAllErrors() {
    const errorMsgs = document.querySelectorAll('.field-error-msg');
    errorMsgs.forEach(el => {
      el.textContent = '';
      el.style.display = 'none';
    });
    const fields = document.querySelectorAll('.form-field');
    fields.forEach(el => el.classList.remove('has-error'));
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // Clear errors on input/change
  document.querySelectorAll('input, select').forEach(input => {
    input.addEventListener('input', () => clearError(input.id));
    input.addEventListener('change', () => clearError(input.id));
  });

  // --- 5. Registration Submit Handler ---
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAllErrors();

    let isValid = true;

    // Validate Full Name
    const fullName = document.getElementById('fullName').value.trim();
    if (!fullName) {
      showError('fullName', 'Ad Soyad alanı zorunludur.');
      isValid = false;
    } else if (fullName.length < 3) {
      showError('fullName', 'Ad Soyad en az 3 karakter olmalıdır.');
      isValid = false;
    }

    // Validate Email
    const email = document.getElementById('email').value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      showError('email', 'E-posta adresi zorunludur.');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('email', 'Geçerli bir e-posta adresi girin.');
      isValid = false;
    }

    // Validate Phone
    const phone = phoneInput.value.trim();
    const digitsOnly = phone.replace(/\D/g, '');
    if (!phone) {
      showError('phone', 'Telefon numarası zorunludur.');
      isValid = false;
    } else if (digitsOnly.length < 11) {
      showError('phone', 'Geçerli bir telefon numarası girin.');
      isValid = false;
    }

    // Validate Business Type
    const businessType = document.getElementById('businessType').value;
    if (!businessType) {
      showError('businessType', 'İşletme türünü seçmelisiniz.');
      isValid = false;
    }

    // Validate Password
    const password = passwordInput.value;
    if (!password) {
      showError('password', 'Şifre alanı zorunludur.');
      isValid = false;
    } else if (password.length < 6) {
      showError('password', 'Şifre en az 6 karakter olmalıdır.');
      isValid = false;
    }

    // Validate Confirm Password
    const passwordConfirm = document.getElementById('passwordConfirm').value;
    if (!passwordConfirm) {
      showError('passwordConfirm', 'Şifre tekrarı zorunludur.');
      isValid = false;
    } else if (password !== passwordConfirm) {
      showError('passwordConfirm', 'Şifreler uyuşmuyor.');
      isValid = false;
    }

    // Validate Terms & Conditions Checkbox
    const termsCheck = document.getElementById('termsCheck');
    if (!termsCheck.checked) {
      showError('termsCheck', 'Koşulları ve KVKK metnini onaylamalısınız.');
      isValid = false;
    }

    if (isValid) {
      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Kaydediliyor...';

      const companyName = document.getElementById('companyName').value.trim();

      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, phone, companyName, businessType })
      })
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kaydı Tamamla';
        
        if (status === 201) {
          localStorage.setItem('karahanliUser', JSON.stringify(data.user));
          successModal.removeAttribute('hidden');
          window.redirectTimer = setTimeout(() => {
            window.location.href = 'account.html';
          }, 3200);
        } else {
          showToast(data.message || 'Kayıt sırasında bir hata oluştu.');
        }
      })
      .catch(err => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kaydı Tamamla';
        showToast('Sunucu ile iletişim kurulamadı.');
      });
    }
  });

  // Success Go Btn click
  successGoBtn.addEventListener('click', () => {
    clearTimeout(window.redirectTimer);
    window.location.href = 'account.html';
  });

  // --- 6. Login Submit Handler ---
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAllErrors();

    let isValid = true;
    const loginEmail = document.getElementById('loginEmail').value.trim();
    const loginPassword = loginPasswordInput.value;

    if (!loginEmail) {
      showError('loginEmail', 'E-posta adresi zorunludur.');
      isValid = false;
    }

    if (!loginPassword) {
      showError('loginPassword', 'Şifre zorunludur.');
      isValid = false;
    }

    if (isValid) {
      const submitBtn = document.getElementById('loginSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Giriş Yapılıyor...';

      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      })
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Giriş Yap';
        
        if (status === 200) {
          localStorage.setItem('karahanliUser', JSON.stringify(data.user));
          showToast('Giriş başarılı. Yönlendiriliyorsunuz...');
          setTimeout(() => {
            if (data.user.role === 'admin') {
              window.location.href = 'admin.html';
            } else {
              window.location.href = 'account.html';
            }
          }, 1000);
        } else {
          showToast(data.message || 'E-posta veya şifre hatalı.');
        }
      })
      .catch(err => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Giriş Yap';
        showToast('Sunucu ile iletişim kurulamadı.');
      });
    }
  });
});
