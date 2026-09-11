import type { CSSProperties, FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/axios';

const containerStyle: CSSProperties = {
  maxWidth: 400,
  margin: '80px auto',
  textAlign: 'left',
};

const fieldStyle: CSSProperties = { marginBottom: 12 };

export function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<{ accessToken: string }>('/auth/register', {
        name,
        email,
        password,
      });
      localStorage.setItem('token', data.accessToken);
      navigate('/admin/orders');
    } catch {
      setError('Ошибка регистрации. Проверьте данные и попробуйте снова.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h1>Регистрация</h1>
      <form onSubmit={handleSubmit}>
        <div style={fieldStyle}>
          <label>
            Название заведения
            <br />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        </div>
        <div style={fieldStyle}>
          <label>
            Email
            <br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        </div>
        <div style={fieldStyle}>
          <label>
            Пароль
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Регистрация...' : 'Зарегистрироваться'}</button>
      </form>
      <p>
        <Link to="/login">Уже есть аккаунт? Войти</Link>
      </p>
    </div>
  );
}
