import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

import AddMovie from "./pages/AddMovie";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Compare from "./pages/Compare";
import Ranking from "./pages/Ranking";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import MyMovies from "./pages/MyMovies";
import MovieInfo from "./pages/MovieInfo";
import PersonInfo from "./pages/PersonInfo";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  // Function to update onboarding status
  const updateOnboardingStatus = (status: boolean) => {
    setOnboardingComplete(status);
  };

  // Fetch auth session and user
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      setUser(user);

      if (user) {
        const { data, error } = await supabase
          .from("users")
          .select("onboarding_complete")
          .eq("id", user.id)
          .single();

        if (!error && data) {
          setOnboardingComplete(data.onboarding_complete);
        } else {
          console.error("Failed to fetch onboarding status:", error);
        }
      }

      setLoading(false);
    };

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase
          .from("users")
          .select("onboarding_complete")
          .eq("id", session.user.id)
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              setOnboardingComplete(data.onboarding_complete);
            }
          });
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading || (user && onboardingComplete === null)) {
    return <p className="p-6">Loading...</p>;
  }

  const ProtectedRoute = ({ element }: { element: React.JSX.Element }) =>
    user ? (
      onboardingComplete ? element : <Navigate to="/onboarding" replace />
    ) : (
      <Navigate to="/login" replace />
    );

  return (
    <Router>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
        <Route element={<Layout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onboarding" element={
            user ? (
              onboardingComplete ? 
                <Navigate to="/dashboard" replace /> : 
                <Onboarding onOnboardingComplete={updateOnboardingStatus} />
            ) : (
              <Navigate to="/login" replace />
            )
          } />
          <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
          <Route path="/add" element={<ProtectedRoute element={<AddMovie />} />} />
          <Route path="/compare" element={<ProtectedRoute element={<Compare />} />} />
          <Route path="/ranking" element={<ProtectedRoute element={<Ranking />} />} />
          <Route path="/movie/:movieId" element={<ProtectedRoute element={<MovieInfo />} />} />
          <Route path="/person/:personId" element={<ProtectedRoute element={<PersonInfo />} />} />
          <Route path="/profile" element={<ProtectedRoute element={<Profile />} />} />
          <Route path="/my-movies" element={<ProtectedRoute element={<MyMovies />} />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
