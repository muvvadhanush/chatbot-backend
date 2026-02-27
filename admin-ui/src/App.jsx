import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './pages/Admin';
import Login from './pages/Login';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/login" element={<Login />} />
        {/* Default route redirects to login or admin depending on auth state.
            For now, we redirect strictly to /admin and let the script handle it, 
            or default to login */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
