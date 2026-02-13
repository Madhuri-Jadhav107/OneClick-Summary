import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ArrowRight, TrendingUp, Users, Download } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, getDoc, doc, orderBy, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
    const [searchParams] = useSearchParams();
    const [recentMeetings, setRecentMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState([
        { label: 'Meetings this week', value: '0', icon: <Calendar color="#818cf8" />, change: '+0%' },
        { label: 'Action Items', value: '12', icon: <TrendingUp color="#10b981" />, change: '-5%' },
        { label: 'Total Participants', value: '8', icon: <Users color="#f59e0b" />, change: '+12%' },
    ]);
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            fetchMeetings();
        }
    }, [user]);

    const fetchMeetings = async () => {
        try {
            let q;
            console.log("🔍 Fetching meetings for:", { uid: user.uid, role: user.role, companyId: user.company_id });
            if (user.role === 'Manager' && user.company_id) {
                // Manager sees all meetings in the company
                console.log("🏢 Querying as Manager for company:", user.company_id);
                q = query(
                    collection(db, "meetings"),
                    where("company_id", "==", user.company_id)
                );
            } else {
                // User only sees their own meetings
                console.log("👤 Querying as User for UID:", user.uid);
                q = query(
                    collection(db, "meetings"),
                    where("user_id", "==", user.uid)
                );
            }

            const querySnapshot = await getDocs(q);
            const meetings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`📊 Found ${meetings.length} meetings for this user.`);

            meetings.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

            setRecentMeetings(meetings);

            // For action items count in stats, managers see all, users see theirs
            let actionsQ;
            if (user.role === 'Manager') {
                actionsQ = query(collection(db, "action_items"), where("company_id", "==", user.company_id));
            } else {
                actionsQ = query(collection(db, "action_items"), where("assignee_email", "==", user.email));
            }
            const actionsSnapshot = await getDocs(actionsQ);

            const totalParticipants = meetings.reduce((sum, m) => sum + (m.participants || 0), 0);

            setStats(prev => [
                { ...prev[0], value: meetings.length.toString() },
                { ...prev[1], value: actionsSnapshot.size.toString() },
                { ...prev[2], value: totalParticipants.toString() }
            ]);
        } catch (error) {
            console.error('Error fetching meetings:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleNewMeeting = async () => {
            if (searchParams.get('new_meeting') === 'true' && user) {
                console.log("👀 New meeting sync detected in URL");
                const transcript = decodeURIComponent(searchParams.get('transcript') || "");
                const summary = decodeURIComponent(searchParams.get('summary') || "");
                const actionItemsRaw = searchParams.get('action_items');
                const participantsRaw = searchParams.get('participants');
                const segmentsRaw = searchParams.get('segments');
                const urlMeetingId = searchParams.get('meeting_id');

                let actionItems = [];
                let participants = [];
                let segments = [];
                try {
                    if (actionItemsRaw) actionItems = JSON.parse(decodeURIComponent(actionItemsRaw));
                    if (participantsRaw) participants = JSON.parse(decodeURIComponent(participantsRaw));
                    if (segmentsRaw) segments = JSON.parse(decodeURIComponent(segmentsRaw));
                    console.log("📦 Parsed components:", { actionItems: actionItems.length, participants: participants.length });
                } catch (e) {
                    console.error("❌ Failed to parse meeting components:", e);
                }

                try {
                    console.log("🔄 Fetching user profile for sync...");
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    const profile = userDoc.exists() ? userDoc.data() : null;

                    if (!profile) {
                        console.warn("⚠️ User profile not found in Firestore. Sync aborted.");
                        alert("Your user profile is missing from the database. Please try logging out and signing up again.");
                        return;
                    }

                    const companyId = profile.company_id || "default_company";

                    // NEW: Fetch existing meeting to preserve summary if it already exists
                    let existingMeeting = null;
                    if (urlMeetingId) {
                        try {
                            const eDoc = await getDoc(doc(db, "meetings", urlMeetingId));
                            if (eDoc.exists()) existingMeeting = eDoc.data();
                        } catch (e) {
                            console.warn("Could not fetch existing meeting for fallback:", e);
                        }
                    }

                    console.log("✅ Profile found. Company ID:", companyId);

                    // Resolve participants to UIDs
                    console.log("👥 Resolving participants...");
                    let participantUids = [];
                    for (const pName of participants) {
                        try {
                            const usersRef = collection(db, "users");
                            const q = query(usersRef, where("company_id", "==", companyId), where("fullName", "==", pName));
                            const userSnapshot = await getDocs(q);
                            if (!userSnapshot.empty) {
                                participantUids.push({ name: pName, uid: userSnapshot.docs[0].id });
                            }
                        } catch (e) {
                            console.warn(`Could not resolve participant ${pName}:`, e);
                        }
                    }

                    const newMeeting = {
                        title: `Meeting: ${urlMeetingId || 'Session'}`,
                        date: existingMeeting?.date || new Date().toISOString(),
                        duration: existingMeeting?.duration || 'Captured',
                        participants: (participants.length || existingMeeting?.participants || 1),
                        participant_list: participants.length > 0 ? participants : (existingMeeting?.participant_list || []),
                        participant_uids: participantUids.length > 0 ? participantUids : (existingMeeting?.participant_uids || []),
                        status: 'Processed',
                        transcript: transcript || existingMeeting?.transcript || "",
                        segments: segments.length > 0 ? segments : (existingMeeting?.segments || []),
                        summary: summary && !summary.includes("Waiting for enough content") && !summary.includes("Summary failed") ? summary : (existingMeeting?.summary || summary),
                        company_id: companyId,
                        user_id: user.uid,
                        created_at: existingMeeting?.created_at || new Date().toISOString()
                    };

                    console.log("💾 Saving meeting to Firestore...");
                    let meetingRef;
                    if (urlMeetingId) {
                        meetingRef = doc(db, "meetings", urlMeetingId);
                        await setDoc(meetingRef, newMeeting);
                    } else {
                        meetingRef = await addDoc(collection(db, "meetings"), newMeeting);
                    }
                    const mId = urlMeetingId || meetingRef.id;
                    console.log("✅ Meeting saved successfully with ID:", mId);

                    // Resolve assignees and create notifications
                    console.log("📝 Processing action items and notifications...");
                    for (const item of actionItems) {
                        const taskDesc = item.task || (typeof item === 'string' ? item : "");
                        if (!taskDesc) continue;

                        const assigneeName = item.assigned_to_name || "Unassigned";
                        const dueText = item.due_text || "Soon";

                        let assignedToUserId = item.assigned_to_user_id || null;
                        let assigneeEmail = "";

                        // Resolve name to UID
                        const matchingParticipant = participantUids.find(p => p.name === assigneeName);
                        if (matchingParticipant) {
                            assignedToUserId = matchingParticipant.uid;
                            const uDoc = await getDoc(doc(db, "users", assignedToUserId));
                            if (uDoc.exists()) assigneeEmail = uDoc.data().email;
                        } else if (assigneeName !== "Unassigned") {
                            const usersRef = collection(db, "users");
                            const q = query(usersRef, where("company_id", "==", companyId), where("fullName", "==", assigneeName));
                            const userSnapshot = await getDocs(q);
                            if (!userSnapshot.empty) {
                                assignedToUserId = userSnapshot.docs[0].id;
                                assigneeEmail = userSnapshot.docs[0].data().email || "";
                            }
                        }

                        const actionItem = {
                            meeting_id: mId,
                            company_id: companyId,
                            description: taskDesc,
                            assignee_name: assigneeName,
                            assignee_user_id: assignedToUserId,
                            assignee_email: assigneeEmail || (assignedToUserId === user.uid ? user.email : ""),
                            due_date: item.due_date || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                            due_text: dueText,
                            status: 'pending',
                            created_at: new Date().toISOString()
                        };
                        const actionItemRef = await addDoc(collection(db, "action_items"), actionItem);

                        const notification = {
                            user_id: assignedToUserId || user.uid,
                            action_item_id: actionItemRef.id,
                            message: `${assigneeName}: ${taskDesc} (Due: ${dueText})`,
                            type: 'reminder',
                            read: false,
                            created_at: new Date().toISOString(),
                            meeting_id: mId,
                            automated: true
                        };
                        await addDoc(collection(db, "notifications"), notification);
                    }

                    console.log("🏁 Sync complete. Clearing URL params and fetching fresh list...");
                    window.history.replaceState({}, document.title, window.location.pathname);
                    fetchMeetings();
                } catch (error) {
                    console.error('❌ Error saving meeting:', error);
                    alert("Critical: Failed to save meeting data. " + error.message);
                }
            }
        };
        handleNewMeeting();
    }, [searchParams, user]);

    const handleDownload = (meeting) => {
        const element = document.createElement("a");
        const file = new Blob([`Title: ${meeting.title}\nDate: ${meeting.date}\n\nSummary:\n${meeting.summary}\n\nTranscript:\n${meeting.transcript}`], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `${meeting.title.replace(/\s+/g, '_')}_summary.txt`;
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
    };

    return (
        <div>
            <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Dashboard Overview</h1>

            {/* Stats Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1.5rem',
                marginBottom: '3rem'
            }}>
                {stats.map((stat, i) => (
                    <div key={i} className="card" style={{
                        backgroundColor: 'var(--color-surface)',
                        padding: '1.5rem',
                        borderRadius: '12px',
                        border: '1px solid #334155'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{stat.label}</span>
                            {stat.icon}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 600, lineHeight: 1 }}>{stat.value}</span>
                            <span style={{
                                fontSize: '0.875rem',
                                color: stat.change.startsWith('+') ? '#10b981' : '#ef4444',
                                marginBottom: '0.25rem'
                            }}>
                                {stat.change}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent Meetings */}
            <div className="card" style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: '12px',
                border: '1px solid #334155',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Recent Meetings</h2>
                    <Link to="/meetings" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        View all <ArrowRight size={16} />
                    </Link>
                </div>

                <div>
                    {recentMeetings.map((meeting) => (
                        <div key={meeting.id} style={{
                            padding: '1rem 1.5rem',
                            borderBottom: '1px solid #1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'background-color 0.2s'
                        }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>{meeting.title}</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Calendar size={14} /> {meeting.date.split('T')[0]}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={14} /> {meeting.duration}</span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                                    <div>MID: {meeting.id}</div>
                                    <div>UID: {meeting.user_id}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                                <span style={{
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    backgroundColor: meeting.status === 'Processed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    color: meeting.status === 'Processed' ? '#10b981' : '#f59e0b'
                                }}>
                                    {meeting.status}
                                </span>

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => handleDownload(meeting)}
                                        style={{ padding: '0.5rem', cursor: 'pointer', background: 'none', border: 'none', color: 'white' }}
                                        title="Download Summary"
                                    >
                                        <Download size={18} />
                                    </button>
                                    <Link to={`/meetings/${meeting.id}`}>
                                        <button style={{ padding: '0.5rem', cursor: 'pointer', background: 'none', border: 'none', color: 'white' }}>
                                            <ArrowRight size={18} />
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                    {recentMeetings.length === 0 && (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                            No meetings found. Start recording or create a new meeting.
                        </div>
                    )}
                </div>
            </div>
        </div>

    );
};

export default Dashboard;
