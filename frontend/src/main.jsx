import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AdminLogin from './components/AdminLogin.jsx'
import AdminPanel from './components/AdminPanel.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/panel" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
