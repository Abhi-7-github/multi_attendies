import { useState, useEffect } from 'react'
import PresenceXPage from './pages/PresenceXPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import AdminLogin from './pages/AdminLogin.jsx'
import './App.css'

function App() {
  const [route, setRoute] = useState(window.location.pathname)
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || null)

  useEffect(() => {
    const handlePopState = () => {
      setRoute(window.location.pathname)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const navigateTo = (path) => {
    window.history.pushState({}, '', path)
    setRoute(path)
  }

  const handleAdminLogin = (key) => {
    // Here you could validate the key against the backend
    // For now, we store it locally (in production, use a proper auth token)
    localStorage.setItem('adminKey', key)
    setAdminKey(key)
  }

  const handleAdminLogout = () => {
    localStorage.removeItem('adminKey')
    setAdminKey(null)
    navigateTo('/')
  }

  if (route === '/hero/master') {
    if (!adminKey) {
      return <AdminLogin onLogin={handleAdminLogin} />
    }
    return <AdminPage onLogout={handleAdminLogout} />
  }

  return (
    <div>
      <PresenceXPage />
    </div>
  )
}

export default App
