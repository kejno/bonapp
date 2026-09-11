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

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post<{ accessToken: string }>('/auth/login', { email, password });
      localStorage.setItem('token', data.accessToken);
      navigate('/admin/orders');
    } catch {
      setError('Неверный email или пароль');
    }
  }

  return (
    <div style={containerStyle}>
      <h1>Вход</h1>
      <form onSubmit={handleSubmit}>
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
        <button type="submit">Войти</button>
      </form>
      <p>
        <Link to="/register">Зарегистрироваться</Link>
      </p>
    </div>
  );
}
