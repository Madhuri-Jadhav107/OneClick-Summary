import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mic, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();
    const { login, googleSignIn } = useAuth();
    const location = useLocation();
    const from = location.state?.from?.pathname || "/";
    const fromSearch = location.state?.from?.search || "";

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            await login(email, password);
            navigate(`${from}${fromSearch}`);
        } catch (error) {
            console.error('Login error:', error);
            alert(error.message); // Simple error handling for now
        }
    };

    const handleGoogleSignIn = async () => {
        try {
            await googleSignIn();
            navigate(`${from}${fromSearch}`);
        } catch (error) {
            console.error('Google Sign In error:', error);
            alert(error.message);
        }
    };

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%)'
        }}>
            <div className="card" style={{
                width: '100%',
                maxWidth: '400px',
                padding: '2.5rem',
                backgroundColor: 'rgba(30, 41, 59, 0.7)',
                backdropFilter: 'blur(12px)',
                borderRadius: '16px',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    marginBottom: '2rem'
                }}>
                    <div style={{
                        padding: '1rem',
                        backgroundColor: 'var(--color-primary)',
                        borderRadius: '12px',
                        marginBottom: '1.5rem',
                        boxShadow: '0 10px 15px -3px rgba(129, 140, 248, 0.3)'
                    }}>
                        <Mic size={32} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: '1.75rem', margin: '0 0 0.5rem 0' }}>Welcome back</h1>
                    <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Sign in to access your meeting intelligence</p>
                </div>

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                        <label htmlFor="email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Email</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            autoComplete="email"
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid #334155',
                                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                color: 'white',
                                fontSize: '1rem',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div>
                        <label htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Password</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid #334155',
                                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                color: 'white',
                                fontSize: '1rem',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <button type="submit" style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.875rem',
                        fontSize: '1rem'
                    }}>
                        Sign In <ArrowRight size={18} />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 0.5rem' }}>
                        <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(148, 163, 184, 0.2)' }}></div>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Or</span>
                        <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(148, 163, 184, 0.2)' }}></div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            padding: '0.875rem',
                            fontSize: '1rem',
                            backgroundColor: 'white',
                            color: '#1e293b',
                            border: '1px solid #e2e8f0'
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M23.52 12.29C23.52 11.43 23.47 10.51 23.3 9.61H12V14.26H18.47C18.18 15.67 17.32 16.92 16.03 17.76V20.69H19.96C22.25 18.59 23.52 15.51 23.52 12.29Z" fill="#4285F4" />
                            <path d="M12 24C15.24 24 17.96 22.92 19.96 21.09L16.03 17.76C14.95 18.5 13.59 18.93 12 18.93C8.87 18.93 6.22 16.81 5.27 13.97H1.19V17.14C3.17 21.08 7.23 24 12 24Z" fill="#34A853" />
                            <path d="M5.27 13.97C5.03 13.11 4.9 12.2 4.9 11.26C4.9 10.33 5.03 9.42 5.27 8.56V5.39H1.19C0.43 6.91 0 8.65 0 11.26C0 13.88 0.43 15.61 1.19 17.14L5.27 13.97Z" fill="#FBBC05" />
                            <path d="M12 3.58C13.76 3.58 15.34 4.19 16.58 5.37L19.23 2.72C17.38 1 14.88 0 12 0C7.23 0 3.17 2.92 1.19 6.86L5.27 10.03C6.22 7.19 8.87 3.58 12 3.58Z" fill="#EA4335" />
                        </svg>
                        Sign in with Google
                    </button>
                </form>

                <p style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    Don't have an account? <Link to="/signup">Create an account</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
