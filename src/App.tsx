import { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { VideoCameraIcon, VideoCameraSlashIcon, MicrophoneIcon, PhoneXMarkIcon } from '@heroicons/react/24/solid';

function App() {
  const [peerId, setPeerId] = useState('');
  const [remotePeerId, setRemotePeerId] = useState('');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  
  const currentUserVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerInstance = useRef<Peer>();

  useEffect(() => {
    const peer = new Peer();
    
    peer.on('open', (id) => {
      setPeerId(id);
    });

    peer.on('call', (call) => {
      const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

      getUserMedia({ video: true, audio: true }, (mediaStream) => {
        currentUserVideoRef.current!.srcObject = mediaStream;
        currentUserVideoRef.current!.play();
        call.answer(mediaStream);
        call.on('stream', function(remoteStream) {
          remoteVideoRef.current!.srcObject = remoteStream;
          remoteVideoRef.current!.play();
        });
      });
    });

    peerInstance.current = peer;
  }, []);

  const call = (remotePeerId: string) => {
    const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

    getUserMedia({ video: true, audio: true }, (mediaStream) => {
      currentUserVideoRef.current!.srcObject = mediaStream;
      currentUserVideoRef.current!.play();

      const call = peerInstance.current!.call(remotePeerId, mediaStream);

      call.on('stream', (remoteStream) => {
        remoteVideoRef.current!.srcObject = remoteStream;
        remoteVideoRef.current!.play();
      });
    });
  };

  const toggleVideo = () => {
    const stream = currentUserVideoRef.current?.srcObject as MediaStream;
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleAudio = () => {
    const stream = currentUserVideoRef.current?.srcObject as MediaStream;
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const endCall = () => {
    const stream = currentUserVideoRef.current?.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (peerInstance.current) {
      peerInstance.current.destroy();
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h1 className="text-2xl font-bold mb-4">WebRTC Video Chat</h1>
          <p className="mb-2">Your ID: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{peerId}</span></p>
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={remotePeerId}
              onChange={e => setRemotePeerId(e.target.value)}
              placeholder="Enter Peer ID to call"
              className="flex-1 border rounded px-3 py-2"
            />
            <button
              onClick={() => call(remotePeerId)}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Call
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="relative">
            <video ref={currentUserVideoRef} className="w-full rounded-lg shadow-lg" />
            <p className="mt-2 text-center">Your Video</p>
          </div>
          <div className="relative">
            <video ref={remoteVideoRef} className="w-full rounded-lg shadow-lg" />
            <p className="mt-2 text-center">Remote Video</p>
          </div>
        </div>

        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4 bg-white rounded-full shadow-lg p-4">
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full ${isVideoEnabled ? 'bg-gray-200' : 'bg-red-500 text-white'}`}
          >
            {isVideoEnabled ? (
              <VideoCameraIcon className="w-6 h-6" />
            ) : (
              <VideoCameraSlashIcon className="w-6 h-6" />
            )}
          </button>
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full ${isAudioEnabled ? 'bg-gray-200' : 'bg-red-500 text-white'}`}
          >
            <MicrophoneIcon className="w-6 h-6" />
          </button>
          <button
            onClick={endCall}
            className="p-3 rounded-full bg-red-500 text-white"
          >
            <PhoneXMarkIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;