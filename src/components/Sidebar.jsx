import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Video, Settings, LogOut, Mic, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
    const { logout } = useAuth();
    const navItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/' },
        { icon: <Video size={20} />, label: 'Meetings', path: '/meetings' },
        { icon: <Bell size={20} />, label: 'Notifications', path: '/notifications' },
        { icon: <Settings size={20} />, label: 'Settings', path: '/settings' },
    ];

    return (
        <div className="sidebar" style={{
            width: '260px',
            height: '100vh',
            backgroundColor: 'var(--color-surface)',
            borderRight: '1px solid #334155',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            position: 'fixed',
            left: 0,
            top: 0
        }}>
            <div className="logo-container" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '3rem',
                paddingLeft: '0.5rem'
            }}>
                <div style={{
                    padding: '0.5rem',
                    backgroundColor: 'var(--color-primary)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <Mic size={24} color="#fff" />
                </div>
                <h2 style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    color: 'var(--color-text)'
                }}>SmartMeet</h2>
            </div>

            <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            isActive ? 'nav-link active' : 'nav-link'
                        }
                        style={({ isActive }) => ({
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between', // Changed to space-between
                            padding: '0.75rem 1rem',
                            borderRadius: '8px',
                            color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                            backgroundColor: isActive ? 'rgba(129, 140, 248, 0.1)' : 'transparent',
                            textDecoration: 'none',
                            transition: 'all 0.2s ease',
                            fontWeight: 500
                        })}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {item.icon}
                            <span>{item.label}</span>
                        </div>
                        {item.badge && (
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: '#ef4444',
                                display: 'inline-block'
                            }}></div>
                        )}
                    </NavLink>
                ))}
            </nav>

            <div style={{ borderTop: '1px solid #334155', paddingTop: '1rem' }}>
                <button
                    onClick={logout}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        width: '100%',
                        padding: '0.75rem 1rem',
                        backgroundColor: 'transparent',
                        color: 'var(--color-text-secondary)',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left'
                    }}>
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
