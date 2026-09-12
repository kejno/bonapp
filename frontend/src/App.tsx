import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { PrivateRoute } from './components/PrivateRoute';
import { Login } from './pages/Login';
import { MenuPage } from './pages/MenuPage';
import { Register } from './pages/Register';
import { Tables } from './pages/Tables';

function App() {
  return (
<<<<<<< HEAD
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<PrivateRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="orders" replace />} />
          <Route path="orders" element={<div>Заказы</div>} />
          <Route path="menu" element={<div>Меню</div>} />
          <Route path="tables" element={<Tables />} />
=======
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<PrivateRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<div>Заказы</div>} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="tables" element={<Tables />} />
          </Route>
>>>>>>> origin/main
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
