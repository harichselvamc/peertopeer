// src/App.jsx
import React, { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import {
  ref,
  set,
  push,
  onValue,
  onChildAdded,
  remove,
  onDisconnect,
} from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

const STUN_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [localMsg, setLocalMsg] = useState('');
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState({});
  const [connected, setConnected] = useState(false); // datachannel open
  const [inRoom, setInRoom] = useState(false);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const roomRef = useRef(null);
  const localId = useRef(uuidv4());
  const name = useRef(`me-${localId.current.slice(0, 6)}`);

  // ref to chat box to auto-scroll
  const chatBoxRef = useRef(null);

  // cleanup on component unmount
  useEffect(() => {
    const handleUnload = async () => {
      if (roomRef.current) {
        try { await remove(ref(db, `rooms/${roomRef.current.key}/participants/${localId.current}`)); } catch (e) { /* ignore */ }
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (pcRef.current) pcRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // scroll to bottom when messages change
  useEffect(() => {
    const box = chatBoxRef.current;
    if (box) {
      // small timeout to let DOM update
      setTimeout(() => {
        box.scrollTop = box.scrollHeight;
      }, 30);
    }
  }, [messages]);

  // helper: add participant presence
  async function addPresence(rId) {
    const pRef = ref(db, `rooms/${rId}/participants/${localId.current}`);
    await set(pRef, { id: localId.current, name: name.current, joinedAt: Date.now() });
    try {
      onDisconnect(pRef).remove().catch(() => {});
    } catch (e) {
      // ignore
    }
  }

  // subscribe to participants list for live count
  function watchParticipants(rId) {
    const participantsRef = ref(db, `rooms/${rId}/participants`);
    onValue(participantsRef, (snap) => {
      const val = snap.val() || {};
      setParticipants(val);
    });
  }

  async function createRoom() {
    const rId = Math.random().toString(36).slice(2, 9);
    setRoomId(rId);
    roomRef.current = ref(db, `rooms/${rId}`);
    setInRoom(true);

    await addPresence(rId);
    watchParticipants(rId);

    const pc = new RTCPeerConnection(STUN_SERVERS);
    pcRef.current = pc;

    const dc = pc.createDataChannel('chat');
    dcRef.current = dc;
    setupDataChannel(dc);

    pc.onicecandidate = async (evt) => {
      if (!evt.candidate) return;
      const cRef = push(ref(db, `rooms/${rId}/callerCandidates`));
      await set(cRef, evt.candidate.toJSON());
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await set(ref(db, `rooms/${rId}/offer`), { sdp: offer.sdp, type: offer.type });

    onValue(ref(db, `rooms/${rId}/answer`), async (snap) => {
      const val = snap.val();
      if (!val || !val.sdp) return;
      const answerDesc = { type: val.type, sdp: val.sdp };
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
      } catch (e) {
        console.warn('setRemoteDescription failed', e);
      }
    });

    onChildAdded(ref(db, `rooms/${rId}/calleeCandidates`), (snap) => {
      const c = snap.val();
      if (c) pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    });

    alert(`Room created — share this id with your friend: ${rId}`);
  }

  async function joinRoom(rId) {
    if (!rId) return alert('Enter room id');
    setRoomId(rId);
    roomRef.current = ref(db, `rooms/${rId}`);
    setInRoom(true);

    await addPresence(rId);
    watchParticipants(rId);

    const pc = new RTCPeerConnection(STUN_SERVERS);
    pcRef.current = pc;

    pc.ondatachannel = (evt) => {
      dcRef.current = evt.channel;
      setupDataChannel(evt.channel);
    };

    pc.onicecandidate = async (evt) => {
      if (!evt.candidate) return;
      const cRef = push(ref(db, `rooms/${rId}/calleeCandidates`));
      await set(cRef, evt.candidate.toJSON());
    };

    onValue(ref(db, `rooms/${rId}/offer`), async (snap) => {
      const offer = snap.val();
      if (!offer || !offer.sdp) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: offer.type, sdp: offer.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await set(ref(db, `rooms/${rId}/answer`), { sdp: answer.sdp, type: answer.type });
      } catch (e) {
        console.warn('Error handling offer -> answer', e);
      }
    });

    onChildAdded(ref(db, `rooms/${rId}/callerCandidates`), (snap) => {
      const c = snap.val();
      if (c) pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    });
  }

  function setupDataChannel(dc) {
    dc.onopen = () => {
      console.log('DataChannel open');
      setConnected(true);
    };
    dc.onclose = () => {
      console.log('DataChannel closed');
      setConnected(false);
    };
    dc.onmessage = (evt) => {
      setMessages(prev => [...prev, { from: 'peer', text: evt.data, at: Date.now() }]);
    };
  }

  function sendMessage() {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      return alert('Data channel not open yet');
    }
    dcRef.current.send(localMsg);
    setMessages(prev => [...prev, { from: 'me', text: localMsg, at: Date.now() }]);
    setLocalMsg('');
  }

  async function leaveRoom() {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (e) { /* ignore */ }
    }
    pcRef.current = null;
    dcRef.current = null;
    setConnected(false);
    setInRoom(false);
    setMessages([]);
    setParticipants({});
    const r = roomRef.current;
    if (r) {
      try {
        await remove(ref(db, `rooms/${r.key}/participants/${localId.current}`));
      } catch (e) { /* ignore */ }
      try {
        const participantsRef = ref(db, `rooms/${r.key}/participants`);
        onValue(participantsRef, async (snap) => {
          const ps = snap.val() || {};
          if (Object.keys(ps).length === 0) {
            try { await remove(ref(db, `rooms/${r.key}`)); } catch (e) { /* ignore */ }
          }
        }, { onlyOnce: true });
      } catch (e) { /* ignore */ }
    }
    roomRef.current = null;
    setRoomId('');
  }

  // small helpers for UI
  const participantsCount = Object.keys(participants).length;

  // improved styles (explicit contrast)
  const styles = {
    container: { padding: 20, maxWidth: 900, margin: '20px auto', fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' },
    header: { marginTop: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 },
    controls: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 },
    chatBox: {
      height: 360,
      overflowY: 'auto',
      border: '1px solid #e6e6e9',
      padding: 12,
      borderRadius: 12,
      background: '#fafafa',
      boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.02)',
    },
    messageRow: { margin: '6px 0', display: 'flex', flexDirection: 'column', gap: 6 },
    bubbleMe: {
      alignSelf: 'flex-end',
      maxWidth: '78%',
      padding: '8px 12px',
      borderRadius: '14px 14px 4px 14px',
      background: '#1769aa', // strong blue
      color: '#fff', // explicit white text
      wordBreak: 'break-word',
      boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
    },
    bubblePeer: {
      alignSelf: 'flex-start',
      maxWidth: '78%',
      padding: '8px 12px',
      borderRadius: '14px 14px 14px 4px',
      background: '#f1f3f5', // light grey
      color: '#111', // explicit dark text
      wordBreak: 'break-word',
      boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
    },
    metaSmall: { fontSize: 12, color: '#6b6b6b', opacity: 0.9 },
    participantBox: { border: '1px solid #eee', padding: 12, borderRadius: 8, background: '#ffffff' },
    smallMuted: { fontSize: 12, color: '#666' },
    badge: (bg) => ({ display: 'inline-block', padding: '4px 8px', borderRadius: 999, fontSize: 12, background: bg, color: '#fff' }),
    inputRow: { display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' },
    leftFlex: { flex: 1 },
    input: { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', outline: 'none' },
    sendBtn: (disabled) => ({
      padding: '8px 12px',
      borderRadius: 8,
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? '#cfd8dc' : '#1769aa',
      color: disabled ? '#6b6b6b' : '#fff',
    }),
    controlBtn: { padding: '8px 10px', borderRadius: 8 },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>P2P Chat — WebRTC + Firebase signalling</h2>
        <small style={{ color: '#666' }}>simple Weekend Project</small>
      </div>

      <div style={styles.controls}>
        <button onClick={createRoom} disabled={inRoom} style={styles.controlBtn}>Create room</button>

        <input
          placeholder="room id"
          value={roomId}
          onChange={e => setRoomId(e.target.value)}
          style={{ padding: '6px 8px', width: 220, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <button onClick={() => joinRoom(roomId)} disabled={inRoom} style={{ ...styles.controlBtn, marginLeft: 4 }}>Join room</button>
        <button onClick={leaveRoom} disabled={!inRoom} style={{ ...styles.controlBtn, marginLeft: 4 }}>Leave</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div title="Data channel status">
            <span style={styles.badge(connected ? '#2b9348' : '#9e9e9e')}>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div title="Number of participants">
            <span style={styles.badge('#1769aa')}>Users: {participantsCount}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 12 }}>
        <div>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <b>Chat</b>
              <div style={{ fontSize: 12, color: '#888' }}>room: <code>{roomId || '-'}</code></div>
            </div>
            <div style={styles.smallMuted}>{connected ? 'Data channel open' : 'Waiting for peer...'}</div>
          </div>

          <div style={styles.chatBox} ref={chatBoxRef} aria-live="polite">
            {messages.length === 0 && <div style={styles.smallMuted}>No messages yet — say hi!</div>}
            {messages.map((m, i) => (
              <div key={i} style={styles.messageRow}>
                <div style={{ display: 'flex', justifyContent: m.from === 'me' ? 'flex-end' : 'flex-start' }}>
                  <div style={m.from === 'me' ? styles.bubbleMe : styles.bubblePeer}>
                    {m.text}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: m.from === 'me' ? 'flex-end' : 'flex-start' }}>
                  <small style={styles.metaSmall}>
                    {m.from} • {new Date(m.at || Date.now()).toLocaleTimeString()}
                  </small>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.inputRow}>
            <input
              value={localMsg}
              onChange={e => setLocalMsg(e.target.value)}
              style={styles.input}
              placeholder={connected ? "Type a message and press Send" : "Waiting for peer..."}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              disabled={!inRoom}
            />
            <button
              onClick={sendMessage}
              disabled={!connected || !localMsg.trim()}
              style={styles.sendBtn(!connected || !localMsg.trim())}
            >
              Send
            </button>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <b>Participants</b>
            <small style={styles.smallMuted}>{participantsCount} online</small>
          </div>

          <div style={styles.participantBox}>
            {participantsCount === 0 && <div style={styles.smallMuted}>No one here yet</div>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {Object.values(participants).map((p) => (
                <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #f0f0f0' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{new Date(p.joinedAt).toLocaleTimeString()}</div>
                  </div>
                  <div style={{ alignSelf: 'center' }}>
                    <span style={{ fontSize: 12, color: '#888' }}>{p.id === localId.current ? 'you' : 'peer'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
            <div>Room ID: <code>{roomId || '-'}</code></div>
          </div>
        </div>
      </div>
    </div>
  );
}
