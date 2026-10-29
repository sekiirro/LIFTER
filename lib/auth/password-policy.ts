/** Shared F11/F4 policy. Count the original Unicode code points; never normalize. */
export function validatePassword(password: string): {
  valid: boolean;
  message?: { en: string; ar: string };
} {
  const valid =
    !password.includes('\0') &&
    Array.from(password).length >= 8 &&
    new TextEncoder().encode(password).length <= 72 &&
    /\p{Nd}/u.test(password) &&
    /[^\p{L}\p{Nd}\p{Z}\p{C}\s]/u.test(password);

  return valid
    ? { valid: true }
    : {
        valid: false,
        message: {
          en: 'Use at least 8 characters, including a digit and a printable symbol, with at most 72 UTF-8 bytes and no NUL character.',
          ar: 'استخدم 8 أحرف على الأقل، تتضمن رقمًا ورمزًا قابلًا للطباعة، بحد أقصى 72 بايت بترميز UTF-8 ومن دون محرف NUL.',
        },
      };
}
