import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Download, CheckCircle, FileText, MessageSquare } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import ReactMarkdown from 'react-markdown';


const MeetingDetail = () => {
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState('summary');
    const [meetingData, setMeetingData] = useState(null);
    const [actionItems, setActionItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        const fetchMeeting = async () => {
            try {
                const docRef = doc(db, "meetings", id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setMeetingData({ id: docSnap.id, ...docSnap.data() });
                } else {
                    throw new Error("Meeting not found");
                }
            } catch (err) {
                console.error('Error loading meeting:', err);
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        const fetchActionItems = async () => {
            if (!user) return;
            try {
                let q;
                if (user.role === 'Manager') {
                    q = query(collection(db, "action_items"), where("meeting_id", "==", id));
                } else {
                    q = query(collection(db, "action_items"),
                        where("meeting_id", "==", id),
                        where("assignee_email", "==", user.email)
                    );
                }
                const querySnapshot = await getDocs(q);
                const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setActionItems(items);
            } catch (err) {
                console.error('Error loading action items:', err);
            }
        };

        if (id) {
            fetchMeeting();
            fetchActionItems();
        }
    }, [id]);

    const handleDownload = (meeting) => {
        const element = document.createElement("a");
        const file = new Blob([`Title: ${meeting.title}\nDate: ${meeting.date}\n\nSummary:\n${meeting.summary}\n\nTranscript:\n${meeting.transcript}`], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `${meeting.title.replace(/\s+/g, '_')}_summary.txt`;
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
    };

    if (loading) return <div style={{ padding: '2rem', color: 'white' }}>Loading meeting details...</div>;
    if (error || !meetingData) return (
        <div style={{ padding: '2rem', color: 'white' }}>
            <h2>Meeting not found</h2>
            <p>You may not have access to this meeting or it does not exist.</p>
            <Link to="/" style={{ color: 'var(--color-primary)' }}>Return to Dashboard</Link>
        </div>
    );

    return (
        <div>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', color: 'var(--color-text-secondary)' }}>
                <ArrowLeft size={18} /> Back to Dashboard
            </Link>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ margin: '0 0 0.5rem 0' }}>{meetingData.title}</h1>
                    <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--color-text-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calendar size={16} /> {meetingData.date}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={16} /> 45 min</span>
                    </div>
                </div>
                <button
                    onClick={() => handleDownload(meetingData)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        padding: '0.75rem 1.25rem',
                        backgroundColor: 'var(--color-primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600
                    }}
                >
                    <Download size={18} /> Download Summary
                </button>
            </div>

            <div className="card" style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: '12px',
                border: '1px solid #334155',
                overflow: 'hidden'
            }}>
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #334155' }}>
                    {[
                        { id: 'summary', label: 'Summary', icon: <FileText size={18} /> },
                        { id: 'transcript', label: 'Transcript', icon: <MessageSquare size={18} /> },
                        { id: 'actions', label: 'Action Items', icon: <CheckCircle size={18} /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1,
                                borderRadius: 0,
                                backgroundColor: activeTab === tab.id ? 'rgba(129, 140, 248, 0.1)' : 'transparent',
                                borderTopWidth: 0,
                                borderLeftWidth: 0,
                                borderRightWidth: 0,
                                borderBottomWidth: '2px',
                                borderBottomStyle: 'solid',
                                borderBottomColor: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
                                color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.75rem',
                                padding: '1rem',
                                outline: 'none'
                            }}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: '2rem' }}>
                    {activeTab === 'summary' && (
                        <div>
                            <div className="markdown-content" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                                <ReactMarkdown>
                                    {meetingData.summary || "No summary available for this meeting."}
                                </ReactMarkdown>
                            </div>

                            {meetingData.participant_list && meetingData.participant_list.length > 0 && (
                                <>
                                    <h3 style={{ marginTop: '2rem', color: 'var(--color-primary)' }}>Participants ({meetingData.participant_list.length})</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {meetingData.participant_list.map((p, idx) => (
                                            <span key={idx} style={{
                                                padding: '0.25rem 0.75rem',
                                                backgroundColor: 'rgba(129, 140, 248, 0.1)',
                                                border: '1px solid rgba(129, 140, 248, 0.2)',
                                                borderRadius: '9999px',
                                                fontSize: '0.875rem'
                                            }}>{p}</span>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}


                    {activeTab === 'transcript' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {meetingData.segments && meetingData.segments.length > 0 ? (
                                meetingData.segments.map((seg, idx) => (
                                    <div key={idx} style={{ borderLeft: '3px solid var(--color-primary)', paddingLeft: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{seg.speaker}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{seg.time}</span>
                                        </div>
                                        <p style={{ color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>{seg.text}</p>
                                    </div>
                                ))
                            ) : (
                                <p style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{meetingData.transcript}</p>
                            )}
                        </div>
                    )}

                    {activeTab === 'actions' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {actionItems.length > 0 ? (
                                actionItems.map((item) => (
                                    <div key={item.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        padding: '1rem',
                                        backgroundColor: 'rgba(0,0,0,0.2)',
                                        borderRadius: '8px',
                                        border: '1px solid #334155'
                                    }}>
                                        <div style={{
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: '4px',
                                            border: '2px solid var(--color-text-secondary)',
                                            backgroundColor: item.status === 'completed' ? 'var(--color-primary)' : 'transparent',
                                            cursor: 'pointer'
                                        }}></div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500, color: 'white' }}>{item.description}</div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                                                Assigned to <span style={{ color: 'var(--color-primary)' }}>{item.assignee_name || item.assignee_email}</span> • Due {item.due_text || (item.due_date ? new Date(item.due_date).toLocaleDateString() : 'N/A')}
                                            </div>
                                        </div>
                                        <div style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            backgroundColor: item.status === 'pending' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                            color: item.status === 'pending' ? '#f59e0b' : '#10b981'
                                        }}>
                                            {item.status.toUpperCase()}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                    No action items found for this meeting.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MeetingDetail;
