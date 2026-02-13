import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TaskPopup from '../components/TaskPopup';

const DashboardLayout = () => {
    return (
        <div style={{ display: 'flex' }}>
            <Sidebar />
            <TaskPopup />
            <main style={{
                marginLeft: '260px',
                flex: 1,
                minHeight: '100vh',
                padding: '2rem',
                backgroundColor: 'var(--color-bg)'
            }}>
                <Outlet />
            </main>
        </div>
    );
};

export default DashboardLayout;
