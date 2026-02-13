import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, Clock, X, Bell } from 'lucide-react';

const TaskPopup = () => {
    const [currentNotif, setCurrentNotif] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;

        // Listen for new unread notifications for this user
        const q = query(
            collection(db, "notifications"),
            where("user_id", "==", user.uid),
            where("read", "==", false),
            where("type", "==", "reminder")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                // Show the most recent unread notification
                const doc = snapshot.docs[0];
                setCurrentNotif({ id: doc.id, ...doc.data() });
            } else {
                setCurrentNotif(null);
            }
        });

        return () => unsubscribe();
    }, [user]);

    const handleAction = async (status) => {
        if (!currentNotif) return;

        try {
            const batch = writeBatch(db);

            // 1. Mark notification as read
            const notifRef = doc(db, "notifications", currentNotif.id);
            batch.update(notifRef, { read: true });

            // 2. Update action item status if linked
            if (currentNotif.action_item_id) {
                const actionRef = doc(db, "action_items", currentNotif.action_item_id);
                // Status is 'completed' or stays 'pending' but technically 'ongoing' is just 'pending' in our DB
                batch.update(actionRef, { status: status === 'completed' ? 'completed' : 'pending' });
            }

            await batch.commit();
            setCurrentNotif(null);
        } catch (error) {
            console.error("Error updating task status:", error);
        }
    };

    if (!currentNotif) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '360px',
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            backdropFilter: 'blur(12px)',
            borderRadius: '16px',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            padding: '1.5rem',
            zIndex: 9999,
            animation: 'slideIn 0.3s ease-out',
            color: 'white'
        }}>
            <style>
                {`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                `}
            </style>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ padding: '0.5rem', backgroundColor: 'var(--color-primary)', borderRadius: '8px' }}>
                    <Bell size={18} color="white" />
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', letterSpacing: '0.05em', color: 'var(--color-primary)' }}>NEW TASK ASSIGNED</span>
                <button
                    onClick={() => handleAction('ongoing')}
                    style={{ marginLeft: 'auto', backgroundColor: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                    <X size={18} />
                </button>
            </div>

            <p style={{ margin: '0 0 1.5rem 0', fontSize: '1rem', lineHeight: '1.5', fontWeight: 500 }}>
                {currentNotif.message.replace('Meeting Task Assigned: ', '')}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                    onClick={() => handleAction('completed')}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    <CheckCircle size={16} /> Yes, Completed
                </button>
                <button
                    onClick={() => handleAction('ongoing')}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        backgroundColor: 'rgba(148, 163, 184, 0.1)',
                        color: '#f8fafc',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    <Clock size={16} /> Ongoing
                </button>
            </div>
        </div>
    );
};

export default TaskPopup;
