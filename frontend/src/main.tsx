import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AdminLayout } from './components/AdminLayout'
import { PrivateRoute } from './components/PrivateRoute'
import { AdminMenuPage } from './pages/AdminMenuPage'
import { Login } from './pages/Login'
import MenuPage from './pages/MenuPage.tsx'
import { Register } from './pages/Register'
import { Tables } from './pages/Tables'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/menu/:slug" element={<MenuPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<PrivateRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<div>Заказы</div>} />
            <Route path="menu" element={<AdminMenuPage />} />
            <Route path="tables" element={<Tables />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
