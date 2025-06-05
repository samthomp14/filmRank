import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import type { User } from '@supabase/supabase-js';
import AddMovie from "./pages/AddMovie";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Compare from "./pages/Compare";
import Ranking from "./pages/Ranking";
import Dashboard from "./pages/Dashboard";
import Layout from "./components/Layout";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" replace />} />
          <Route path="/add" element={user ? <AddMovie /> : <Navigate to="/login" replace />} />
          <Route path="/compare" element={user ? <Compare /> : <Navigate to="/login" replace />} />
          <Route path="/ranking" element={user ? <Ranking /> : <Navigate to="/login" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
