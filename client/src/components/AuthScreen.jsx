import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "../firebase";

export default function AuthScreen({ configError = false, missingConfig = [] }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (configError) {
      setError(
        `Регистрация временно недоступна. Добавьте в Render: ${missingConfig.join(", ")}.`
      );
      return;
    }
    setLoading(true);
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name || email.split("@")[0] });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(translateError(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-mark">
          <div className="brand-glyph">N</div>
          <div className="brand-name">Nexa</div>
        </div>

        <h1 className="auth-title">
          {mode === "login" ? "С возвращением" : "Создать аккаунт"}
        </h1>
        <p className="auth-subtitle">
          {mode === "login"
            ? "Войдите, чтобы продолжить переписку."
            : "Это займёт меньше минуты."}
        </p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="name">Имя</label>
              <input
                id="name"
                type="text"
                placeholder="Как вас видят другие"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              placeholder="Минимум 6 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" ? (
            <>
              Нет аккаунта?
              <button onClick={() => setMode("register")}>Создать</button>
            </>
          ) : (
            <>
              Уже есть аккаунт?
              <button onClick={() => setMode("login")}>Войти</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function translateError(code) {
  const map = {
    "auth/email-already-in-use": "Этот email уже зарегистрирован.",
    "auth/invalid-email": "Некорректный email.",
    "auth/weak-password": "Пароль слишком простой (минимум 6 символов).",
    "auth/user-not-found": "Пользователь не найден.",
    "auth/wrong-password": "Неверный пароль.",
    "auth/invalid-credential": "Неверный email или пароль.",
  };
  return map[code] || "Что-то пошло не так. Попробуйте ещё раз.";
}
