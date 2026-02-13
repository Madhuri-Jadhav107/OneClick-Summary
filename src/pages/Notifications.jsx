import React, { useState, useEffect } from 'react';
import { Bell, Clock } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            fetchNotifications();
        }
    }, [user]);

    const fetchNotifications = async () => {
        try {
            const q = query(
                collection(db, "notifications"),
                where("user_id", "==", user.uid)
            );
            const querySnapshot = await getDocs(q);
            const notifs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort by date desc
            notifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setNotifications(notifs);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (notif, status) => {
        try {
            const batch = writeBatch(db);
            const notifRef = doc(db, "notifications", notif.id);
            batch.update(notifRef, { read: true });

            if (notif.action_item_id) {
                const actionRef = doc(db, "action_items", notif.action_item_id);
                batch.update(actionRef, { status: status === 'completed' ? 'completed' : 'pending' });
            }

            await batch.commit();
            fetchNotifications();
        } catch (error) {
            console.error("Error updating notification status:", error);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <Bell size={32} color="var(--color-primary)" />
                <h1 style={{ fontSize: '2rem', margin: 0 }}>Notifications</h1>
            </div>

            <div className="card" style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: '12px',
                border: '1px solid #334155',
                overflow: 'hidden',
                maxWidth: '800px'
            }}>
                <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading...</div>
                    ) : notifications.length > 0 ? (
                        notifications.map((notif) => (
                            <div key={notif.id} style={{
                                padding: '1.5rem',
                                borderBottom: '1px solid #1e293b',
                                backgroundColor: notif.read ? 'transparent' : 'rgba(99, 102, 241, 0.05)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem'
                            }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    <div style={{ marginTop: '0.25rem' }}>
                                        <Bell size={20} color="var(--color-primary)" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '1rem', marginBottom: '0.5rem', lineHeight: '1.5', fontWeight: notif.read ? 400 : 600 }}>
                                            {notif.message}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                            {new Date(notif.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                {!notif.read && notif.action_item_id && (
                                    <div style={{ display: 'flex', gap: '0.75rem', marginLeft: '30px' }}>
                                        <button
                                            onClick={() => handleAction(notif, 'completed')}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                backgroundColor: '#10b981',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Yes, Completed
                                        </button>
                                        <button
                                            onClick={() => handleAction(notif, 'ongoing')}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                backgroundColor: 'rgba(148, 163, 184, 0.1)',
                                                color: 'white',
                                                border: '1px solid #334155',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Ongoing
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                            <div style={{ marginBottom: '1rem' }}><Bell size={48} color="#334155" /></div>
                            <p style={{ margin: 0, fontSize: '1.1rem' }}>No new notifications</p>
                            <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>We'll notify you when action items are detected.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Notifications;
