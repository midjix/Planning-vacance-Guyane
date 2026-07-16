import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AdminLogin from './components/AdminLogin.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import ActivityPhotos from './components/ActivityPhotos.jsx'
import InviteRegister from './components/InviteRegister.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/panel" element={<AdminPanel />} />
        <Route path="/activity/:id" element={<ActivityPhotos />} />
        <Route path="/invite/:token" element={<InviteRegister />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
